import { create } from 'zustand';
import { randomFleet, type Fleet, type GameEvent, type GameSnapshot, type QueueStatus, type UserProfile } from '@battleship/shared';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'unauthorized';
export type AuthStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'warning';
  title: string;
  message?: string;
  ttl: number;
}

export interface Settings {
  sound: boolean;
  volume: number; // 0..1
  reducedMotion: boolean;
  /** On touch devices: first tap aims, second tap fires. */
  confirmShots: boolean;
}

const SETTINGS_KEY = 'battleship.settings';
const TOKEN_KEY = 'battleship.token';
const DRAFT_KEY = 'battleship.draftFleet';

const defaultSettings: Settings = { sound: true, volume: 0.6, reducedMotion: false, confirmShots: true };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function loadDraft(): Fleet {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Fleet;
      if (Array.isArray(parsed) && parsed.length === 5) return parsed;
    }
  } catch {
    /* ignore */
  }
  return randomFleet();
}

export interface AppState {
  token: string | null;
  user: UserProfile | null;
  authStatus: AuthStatus;
  authError: string | null;

  connection: ConnectionStatus;
  /** serverTime - Date.now(); add to Date.now() to approximate the server clock. */
  serverOffset: number;

  game: GameSnapshot | null;
  queue: QueueStatus;
  /** Most recent game event (animations/sounds). `eventSeq` increments on every event. */
  lastEvent: GameEvent | null;
  eventSeq: number;

  /** Local ship placement draft, kept across lobby -> placement. */
  draftFleet: Fleet;

  settings: Settings;
  toasts: Toast[];

  setAuth(token: string, user: UserProfile): void;
  setUser(user: UserProfile): void;
  setAuthStatus(status: AuthStatus, error?: string | null): void;
  clearAuth(): void;

  setConnection(status: ConnectionStatus): void;
  setServerTime(serverTime: number): void;

  setGame(game: GameSnapshot | null): void;
  setQueue(queue: QueueStatus): void;
  pushEvent(event: GameEvent): void;

  setDraftFleet(fleet: Fleet): void;

  updateSettings(patch: Partial<Settings>): void;

  addToast(toast: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }): number;
  dismissToast(id: number): void;
}

let toastSeq = 1;

export const useStore = create<AppState>((set) => ({
  token: loadToken(),
  user: null,
  authStatus: 'idle',
  authError: null,

  connection: 'idle',
  serverOffset: 0,

  game: null,
  queue: { inQueue: false, since: null, searching: 0 },
  lastEvent: null,
  eventSeq: 0,

  draftFleet: loadDraft(),

  settings: loadSettings(),
  toasts: [],

  setAuth: (token, user) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    set({ token, user, authStatus: 'ready', authError: null });
  },
  setUser: (user) => set({ user }),
  setAuthStatus: (authStatus, authError = null) => set({ authStatus, authError }),
  clearAuth: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    set({ token: null, user: null, authStatus: 'idle', game: null, queue: { inQueue: false, since: null, searching: 0 } });
  },

  setConnection: (connection) => set({ connection }),
  setServerTime: (serverTime) => set({ serverOffset: serverTime - Date.now() }),

  setGame: (game) => set({ game }),
  setQueue: (queue) => set({ queue }),
  pushEvent: (event) => set((s) => ({ lastEvent: event, eventSeq: s.eventSeq + 1 })),

  setDraftFleet: (draftFleet) => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftFleet));
    } catch {
      /* ignore */
    }
    set({ draftFleet });
  },

  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* ignore */
      }
      return { settings };
    }),

  addToast: (toast) => {
    const id = toastSeq++;
    const ttl = toast.ttl ?? (toast.kind === 'error' ? 6000 : 3500);
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id, ttl }] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience: current approximate server time in epoch ms. */
export function serverNow(): number {
  return Date.now() + useStore.getState().serverOffset;
}

export function toast(kind: Toast['kind'], title: string, message?: string): void {
  useStore.getState().addToast({ kind, title, message });
}
