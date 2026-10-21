import { useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { Bot, Brain, Check, Crosshair, Dices, Play, type LucideIcon } from 'lucide-react';
import type { AiDifficulty } from '@battleship/shared';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { revealIn } from './motion';
import type { MenuPending } from './useMenuActions';

export interface PracticeCardProps {
  open: boolean;
  pending: MenuPending | null;
  canStart: boolean;
  blockedReason: string | null;
  onOpen: () => void;
  onClose: () => void;
  onStart: (difficulty: AiDifficulty) => void;
}

interface DifficultyOption {
  id: AiDifficulty;
  label: string;
  summary: string;
  detail: string;
  icon: LucideIcon;
}

export const DIFFICULTIES: readonly DifficultyOption[] = [
  { id: 'easy', label: 'Easy', summary: 'Random fire', detail: 'Fires at random cells and never follows up on hits. Ideal for learning the ropes.', icon: Dices },
  {
    id: 'medium',
    label: 'Medium',
    summary: 'Hunt & target',
    detail: 'Scans the board with a checkerboard pattern, then hunts around every hit until the ship goes down.',
    icon: Crosshair,
  },
  {
    id: 'hard',
    label: 'Hard',
    summary: 'Probability targeting',
    detail: 'Recomputes the most likely ship positions every turn. Beat it to unlock the Admiral achievement.',
    icon: Brain,
  },
];

const DEFAULT_DIFFICULTY: AiDifficulty = 'medium';

/** Practice card: a button that reveals an inline difficulty picker (radio group) and a start button. */
export function PracticeCard({ open, pending, canStart, blockedReason, onOpen, onClose, onStart }: PracticeCardProps) {
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_DIFFICULTY);
  const busy = pending !== null;
  const selected = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1]!;

  const onGroupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = DIFFICULTIES.findIndex((d) => d.id === difficulty);
    let next = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % DIFFICULTIES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
    else return;
    e.preventDefault();
    const option = DIFFICULTIES[next]!;
    setDifficulty(option.id);
    const el = e.currentTarget.querySelector<HTMLButtonElement>(`[data-testid="practice-difficulty-${option.id}"]`);
    el?.focus();
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" aria-hidden />
          Practice vs AI
        </span>
      }
      subtitle="Sharpen your aim against the computer. Three difficulties, no rating at stake."
      className="flex flex-col"
      data-testid="card-practice"
    >
      <div className="flex flex-1 flex-col gap-4">
        {!open ? (
          <>
            <ul className="flex flex-wrap gap-1.5" aria-label="Available difficulties">
              {DIFFICULTIES.map((d) => (
                <li key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-2.5 py-1 text-xs text-ink-muted">
                  <d.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                  <span className="font-semibold text-ink">{d.label}</span> · {d.summary}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-2">
              <Button
                size="lg"
                fullWidth
                variant="secondary"
                icon={<Bot className="h-5 w-5" aria-hidden />}
                disabled={!canStart || busy}
                onClick={onOpen}
                aria-expanded={false}
                aria-controls="practice-difficulty-picker"
                data-testid="menu-practice"
              >
                Practice vs AI
              </Button>
              {!canStart && blockedReason && (
                <p className="text-center text-xs text-ink-dim" role="note">
                  {blockedReason}
                </p>
              )}
            </div>
          </>
        ) : (
          <motion.div {...revealIn} id="practice-difficulty-picker" className="flex flex-1 flex-col gap-3" data-testid="practice-picker">
            <div role="radiogroup" aria-label="AI difficulty" className="flex flex-col gap-2" onKeyDown={onGroupKeyDown}>
              {DIFFICULTIES.map((d) => {
                const active = d.id === difficulty;
                return (
                  <Button
                    key={d.id}
                    role="radio"
                    aria-checked={active}
                    variant={active ? 'secondary' : 'subtle'}
                    size="lg"
                    fullWidth
                    sound={false}
                    icon={active ? <Check className="h-4 w-4 text-accent" aria-hidden /> : <d.icon className="h-4 w-4 text-ink-muted" aria-hidden />}
                    onClick={() => setDifficulty(d.id)}
                    data-testid={`practice-difficulty-${d.id}`}
                    data-selected={active ? 'true' : undefined}
                  >
                    <span className="flex w-full min-w-0 items-center justify-between gap-3">
                      <span className="font-semibold">{d.label}</span>
                      <span className="truncate text-xs font-normal text-ink-muted">{d.summary}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-ink-muted" aria-live="polite">
              <span className="font-semibold text-ink">{selected.label}:</span> {selected.detail}
            </p>
            <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={onClose} disabled={pending === 'practice'} className="sm:w-28">
                Back
              </Button>
              <Button
                size="md"
                className="flex-1"
                icon={<Play className="h-4 w-4" aria-hidden />}
                loading={pending === 'practice'}
                disabled={!canStart || (busy && pending !== 'practice')}
                onClick={() => onStart(difficulty)}
                data-testid="practice-start"
              >
                Start practice · {selected.label}
              </Button>
            </div>
            {!canStart && blockedReason && (
              <p className="text-center text-xs text-ink-dim" role="note">
                {blockedReason}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </Panel>
  );
}
