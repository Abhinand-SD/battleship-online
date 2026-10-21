import { useCallback, useMemo, useReducer } from 'react';
import {
  BOARD_SIZE,
  SHIP_SPECS,
  SHIP_TYPES,
  canPlace,
  isInsideBoard,
  placeShip,
  randomFleet,
  rotate as flipOrientation,
  rotateShip,
  shipCells,
  validateFleet,
  type Coord,
  type Fleet,
  type FleetValidation,
  type Orientation,
  type ShipPlacement,
  type ShipType,
} from '@battleship/shared';

/**
 * Pure placement model for the "Deploy your fleet" screen.
 *
 * Everything in this file is DOM-free so it can be unit tested without React. The reducer owns:
 *  - `placed`      the draft fleet (0..5 ships; an empty draft is allowed locally, only `confirm` needs a full one)
 *  - `selected`    the ship a tap/click picked (tray or board); taps on the board move/place it
 *  - `orientation` the orientation used for the next tap placement (mirrors the selected placed ship)
 *  - `hover`       the board cell under the pointer (desktop preview for tap-to-place)
 *  - `drag`        an in-progress pointer drag (from the board or from the tray)
 *  - `feedback`    the last accepted/rejected action, for sounds and the red "doesn't fit" flash
 *
 * Drag semantics: the ghost follows the pointer offset by the grabbed cell index (so the ship does not jump under
 * the finger) and is clamped inside the board, so near an edge the ship "sticks" to the wall instead of leaving the
 * grid. Tap placement is strict: the tapped cell becomes the anchor, and anything that would leave the board or
 * overlap another ship is rejected with feedback.
 */

export type DragSource = 'board' | 'tray';

export interface DragState {
  type: ShipType;
  source: DragSource;
  /** Index (0..size-1) along the hull of the cell the user grabbed. The ghost anchor is `pointer - grabIndex`. */
  grabIndex: number;
  /** Orientation of the ghost (can be flipped mid-drag with R). */
  orientation: Orientation;
  /** Placement before the drag started (board drags only) — the ship snaps back to it on an invalid drop. */
  origin: ShipPlacement | null;
  /** Board cell under the pointer when the drag started (null when it started in the tray). */
  start: Coord | null;
  /** Board cell currently under the pointer, or null while outside the board. */
  pointer: Coord | null;
  /** True once the pointer has entered a different cell than `start`; a drag that never moved is a tap. */
  moved: boolean;
}

export type FeedbackKind = 'placed' | 'rejected';

export interface Feedback {
  /** Monotonic counter so the UI can react to consecutive identical feedback. */
  seq: number;
  kind: FeedbackKind;
  ship: ShipType | null;
  /** Cells affected (in-board only). For rejections these are flashed red. */
  cells: Coord[];
}

export interface PlacementState {
  placed: Fleet;
  selected: ShipType | null;
  orientation: Orientation;
  hover: Coord | null;
  drag: DragState | null;
  feedback: Feedback | null;
}

export type PlacementAction =
  | { type: 'select'; ship: ShipType | null }
  | { type: 'hover'; cell: Coord | null }
  | { type: 'placeAt'; cell: Coord }
  /** Rotates `ship` (double-click), else the selected placed ship, else toggles the orientation for the next placement. */
  | { type: 'rotate'; ship?: ShipType }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'randomize'; fleet: Fleet }
  | { type: 'reset' }
  | { type: 'beginDrag'; ship: ShipType; pointer: Coord | null; grabIndex?: number }
  | { type: 'dragTo'; cell: Coord | null }
  | { type: 'endDrag' }
  | { type: 'cancelDrag' };

export interface Ghost {
  placement: ShipPlacement;
  valid: boolean;
  /** In-board cells covered by the ghost. */
  cells: Coord[];
  source: 'drag' | 'hover';
}

// ---------------------------------------------------------------------------------------------
// Helpers (exported for tests and for the components)
// ---------------------------------------------------------------------------------------------

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sameCoord(a: Coord | null, b: Coord | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

export function findShip(fleet: Fleet, type: ShipType): ShipPlacement | undefined {
  return fleet.find((s) => s.type === type);
}

export function isPlaced(fleet: Fleet, type: ShipType): boolean {
  return fleet.some((s) => s.type === type);
}

/** Ship types not yet on the board, in fleet order. */
export function unplacedShips(fleet: Fleet): ShipType[] {
  return SHIP_TYPES.filter((t) => !isPlaced(fleet, t));
}

/** The next ship to place after `after` (wrapping), or null when every ship is on the board. */
export function nextUnplaced(fleet: Fleet, after: ShipType | null): ShipType | null {
  const missing = unplacedShips(fleet);
  if (missing.length === 0) return null;
  if (!after) return missing[0] ?? null;
  const start = SHIP_TYPES.indexOf(after);
  for (let i = 1; i <= SHIP_TYPES.length; i++) {
    const candidate = SHIP_TYPES[(start + i) % SHIP_TYPES.length];
    if (candidate && missing.includes(candidate)) return candidate;
  }
  return missing[0] ?? null;
}

/** Index along the hull (0..size-1) closest to `cell` — the cell the user grabbed. */
export function grabIndexFor(ship: ShipPlacement, cell: Coord): number {
  const size = SHIP_SPECS[ship.type].size;
  const delta = ship.orientation === 'horizontal' ? cell.x - ship.x : cell.y - ship.y;
  return clamp(delta, 0, size - 1);
}

/** Anchor so that the hull cell `grabIndex` sits under `pointer`. */
export function anchorFromPointer(pointer: Coord, grabIndex: number, orientation: Orientation): Coord {
  return orientation === 'horizontal' ? { x: pointer.x - grabIndex, y: pointer.y } : { x: pointer.x, y: pointer.y - grabIndex };
}

/** Shifts an anchor so a ship of `size` fits entirely inside the board. */
export function clampAnchor(anchor: Coord, size: number, orientation: Orientation): Coord {
  const maxX = orientation === 'horizontal' ? BOARD_SIZE - size : BOARD_SIZE - 1;
  const maxY = orientation === 'vertical' ? BOARD_SIZE - size : BOARD_SIZE - 1;
  return { x: clamp(anchor.x, 0, maxX), y: clamp(anchor.y, 0, maxY) };
}

/** Where `rotateShip` would put the ship (anchor fixed, shifted inside the board). Used for rejection feedback. */
export function rotatedCandidate(ship: ShipPlacement): ShipPlacement {
  const size = SHIP_SPECS[ship.type].size;
  const orientation = flipOrientation(ship.orientation);
  const anchor = clampAnchor({ x: ship.x, y: ship.y }, size, orientation);
  return { ...ship, ...anchor, orientation };
}

/** The ghost for an in-progress drag, or null while the pointer is off the board. */
export function ghostForDrag(placed: Fleet, drag: DragState): Ghost | null {
  if (!drag.pointer) return null;
  const size = SHIP_SPECS[drag.type].size;
  const anchor = clampAnchor(anchorFromPointer(drag.pointer, drag.grabIndex, drag.orientation), size, drag.orientation);
  const placement: ShipPlacement = { type: drag.type, x: anchor.x, y: anchor.y, orientation: drag.orientation };
  return { placement, valid: canPlace(placed, placement), cells: shipCells(placement), source: 'drag' };
}

/** Preview for tap-to-place: strict anchor at the hovered cell (out-of-board cells are clipped, validity is false). */
export function ghostForHover(state: PlacementState): Ghost | null {
  if (!state.selected || !state.hover) return null;
  const own = findShip(state.placed, state.selected);
  if (own && shipCells(own).some((c) => sameCoord(c, state.hover))) return null;
  const placement: ShipPlacement = { type: state.selected, x: state.hover.x, y: state.hover.y, orientation: state.orientation };
  return { placement, valid: canPlace(state.placed, placement), cells: shipCells(placement).filter(isInsideBoard), source: 'hover' };
}

export function deriveGhost(state: PlacementState): Ghost | null {
  if (state.drag) return ghostForDrag(state.placed, state.drag);
  return ghostForHover(state);
}

/** The fleet can be confirmed only when it is complete and legal. */
export function canConfirm(state: Pick<PlacementState, 'placed'>): boolean {
  return validateFleet(state.placed).ok;
}

// ---------------------------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------------------------

export function initialPlacementState(fleet: Fleet = []): PlacementState {
  return { placed: fleet, selected: null, orientation: 'horizontal', hover: null, drag: null, feedback: null };
}

function feedback(state: PlacementState, kind: FeedbackKind, placement: ShipPlacement | null): Feedback {
  return {
    seq: (state.feedback?.seq ?? 0) + 1,
    kind,
    ship: placement?.type ?? null,
    cells: placement ? shipCells(placement).filter(isInsideBoard) : [],
  };
}

function reject(state: PlacementState, placement: ShipPlacement): PlacementState {
  return { ...state, feedback: feedback(state, 'rejected', placement) };
}

export function placementReducer(state: PlacementState, action: PlacementAction): PlacementState {
  switch (action.type) {
    case 'select': {
      if (action.ship === null || action.ship === state.selected) return { ...state, selected: null, hover: null };
      const ship = findShip(state.placed, action.ship);
      return { ...state, selected: action.ship, orientation: ship ? ship.orientation : state.orientation, hover: null };
    }

    case 'hover': {
      if (state.drag || sameCoord(state.hover, action.cell)) return state;
      return { ...state, hover: action.cell };
    }

    case 'placeAt': {
      if (!state.selected) return state;
      const placement: ShipPlacement = { type: state.selected, x: action.cell.x, y: action.cell.y, orientation: state.orientation };
      const next = placeShip(state.placed, placement);
      if (!next) return reject(state, placement);
      const wasPlaced = isPlaced(state.placed, state.selected);
      return {
        ...state,
        placed: next,
        selected: wasPlaced ? state.selected : nextUnplaced(next, state.selected),
        hover: null,
        feedback: feedback(state, 'placed', placement),
      };
    }

    case 'rotate': {
      if (state.drag) return { ...state, drag: { ...state.drag, orientation: flipOrientation(state.drag.orientation) } };
      const target = action.ship ?? state.selected;
      const ship = target ? findShip(state.placed, target) : undefined;
      if (!ship) return { ...state, orientation: flipOrientation(state.orientation) };
      const next = rotateShip(state.placed, ship.type);
      if (!next) return reject(state, rotatedCandidate(ship));
      const rotated = findShip(next, ship.type) ?? rotatedCandidate(ship);
      return { ...state, placed: next, selected: ship.type, orientation: rotated.orientation, feedback: feedback(state, 'placed', rotated) };
    }

    case 'nudge': {
      const ship = state.selected ? findShip(state.placed, state.selected) : undefined;
      if (!ship) return state;
      const candidate: ShipPlacement = { ...ship, x: ship.x + action.dx, y: ship.y + action.dy };
      const next = placeShip(state.placed, candidate);
      if (!next) return reject(state, candidate);
      return { ...state, placed: next, feedback: feedback(state, 'placed', candidate) };
    }

    case 'randomize':
      return { ...state, placed: action.fleet, selected: null, hover: null, drag: null, feedback: feedback(state, 'placed', null) };

    case 'reset':
      return { ...state, placed: [], selected: null, hover: null, drag: null };

    case 'beginDrag': {
      if (state.drag) return state;
      const ship = findShip(state.placed, action.ship);
      const size = SHIP_SPECS[action.ship].size;
      const orientation = ship ? ship.orientation : state.orientation;
      const grabIndex = ship && action.pointer ? grabIndexFor(ship, action.pointer) : clamp(Math.floor(action.grabIndex ?? 0), 0, size - 1);
      return {
        ...state,
        hover: null,
        drag: {
          type: action.ship,
          source: ship ? 'board' : 'tray',
          grabIndex,
          orientation,
          origin: ship ?? null,
          start: action.pointer,
          pointer: action.pointer,
          moved: false,
        },
      };
    }

    case 'dragTo': {
      if (!state.drag) return state;
      const moved = state.drag.moved || !sameCoord(action.cell, state.drag.start);
      if (sameCoord(action.cell, state.drag.pointer) && moved === state.drag.moved) return state;
      return { ...state, drag: { ...state.drag, pointer: action.cell, moved } };
    }

    case 'endDrag': {
      const drag = state.drag;
      if (!drag) return state;
      const base: PlacementState = { ...state, drag: null };
      if (!drag.moved) return base; // a tap: selection is handled by the click that follows
      const ghost = ghostForDrag(state.placed, drag);
      if (!ghost) return base; // dropped outside the board: snap back / stay in the tray
      const next = placeShip(state.placed, ghost.placement);
      if (!next) return reject(base, ghost.placement);
      return { ...base, placed: next, feedback: feedback(state, 'placed', ghost.placement) };
    }

    case 'cancelDrag':
      return state.drag ? { ...state, drag: null } : state;

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------------------------

export interface PlacementActions {
  select(ship: ShipType | null): void;
  hover(cell: Coord | null): void;
  placeAt(x: number, y: number): void;
  rotate(ship?: ShipType): void;
  nudge(dx: number, dy: number): void;
  randomize(): void;
  reset(): void;
  beginDrag(ship: ShipType, pointer: Coord | null, grabIndex?: number): void;
  dragTo(cell: Coord | null): void;
  endDrag(): void;
  cancelDrag(): void;
}

export interface PlacementModel {
  placed: Fleet;
  selected: ShipType | null;
  /** The selected ship's placement when it is on the board. */
  selectedPlacement: ShipPlacement | null;
  orientation: Orientation;
  hover: Coord | null;
  drag: DragState | null;
  ghost: Ghost | null;
  feedback: Feedback | null;
  unplaced: ShipType[];
  placedCount: number;
  validation: FleetValidation;
  canConfirm: boolean;
  actions: PlacementActions;
}

/** React binding for the placement reducer. `initialFleet` is read once (keep it in the store yourself). */
export function usePlacement(initialFleet: Fleet, rng: () => number = Math.random): PlacementModel {
  const [state, dispatch] = useReducer(placementReducer, initialFleet, initialPlacementState);

  const randomize = useCallback(() => dispatch({ type: 'randomize', fleet: randomFleet(rng) }), [rng]);

  const actions = useMemo<PlacementActions>(
    () => ({
      select: (ship) => dispatch({ type: 'select', ship }),
      hover: (cell) => dispatch({ type: 'hover', cell }),
      placeAt: (x, y) => dispatch({ type: 'placeAt', cell: { x, y } }),
      rotate: (ship) => dispatch(ship ? { type: 'rotate', ship } : { type: 'rotate' }),
      nudge: (dx, dy) => dispatch({ type: 'nudge', dx, dy }),
      randomize,
      reset: () => dispatch({ type: 'reset' }),
      beginDrag: (ship, pointer, grabIndex) =>
        dispatch(grabIndex === undefined ? { type: 'beginDrag', ship, pointer } : { type: 'beginDrag', ship, pointer, grabIndex }),
      dragTo: (cell) => dispatch({ type: 'dragTo', cell }),
      endDrag: () => dispatch({ type: 'endDrag' }),
      cancelDrag: () => dispatch({ type: 'cancelDrag' }),
    }),
    [randomize],
  );

  const ghost = useMemo(() => deriveGhost(state), [state]);
  const validation = useMemo(() => validateFleet(state.placed), [state.placed]);
  const unplaced = useMemo(() => unplacedShips(state.placed), [state.placed]);
  const selectedPlacement = state.selected ? (findShip(state.placed, state.selected) ?? null) : null;

  return {
    placed: state.placed,
    selected: state.selected,
    selectedPlacement,
    orientation: state.orientation,
    hover: state.hover,
    drag: state.drag,
    ghost,
    feedback: state.feedback,
    unplaced,
    placedCount: state.placed.length,
    validation,
    canConfirm: validation.ok,
    actions,
  };
}
