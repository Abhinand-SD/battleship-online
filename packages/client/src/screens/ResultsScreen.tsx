import type { GameSnapshot } from '@battleship/shared';
import { PageShell } from '../components/ui/PageShell';
import { Panel } from '../components/ui/Panel';
import { Collapsible } from '../components/battle/Collapsible';
import { EnemyBoard } from '../components/battle/EnemyBoard';
import { MyBoard } from '../components/battle/MyBoard';
import { RematchPanel } from '../components/battle/RematchPanel';
import { ResultHero } from '../components/battle/ResultHero';
import { StatsTable } from '../components/battle/StatsTable';
import { opponentName } from '../components/battle/battleModel';
import { DESKTOP_QUERY, useMediaQuery } from '../components/battle/useMediaQuery';

/** FINISHED: outcome, statistics, the final boards and the rematch / exit actions. */
export default function ResultsScreen({ game }: { game: GameSnapshot }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const result = game.result;
  const name = opponentName(game);

  return (
    <PageShell width="lg" className="space-y-5">
      <ResultHero game={game} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {result ? (
          <StatsTable result={result} opponentName={name} />
        ) : (
          <Panel title="Match statistics">
            <p className="text-sm text-ink-muted">No statistics were recorded for this match.</p>
          </Panel>
        )}
        <RematchPanel game={game} />
      </div>

      <Collapsible title="Review boards" summary="Final positions" defaultOpen={desktop} testId="review-boards">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Enemy waters</h3>
            <EnemyBoard board={game.enemyBoard} interactive={false} ariaLabel="Enemy waters (final)" />
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">My fleet</h3>
            <MyBoard board={game.myBoard} ariaLabel="My fleet (final)" />
          </div>
        </div>
      </Collapsible>
    </PageShell>
  );
}
