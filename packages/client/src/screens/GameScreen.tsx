import { Navigate } from 'react-router';
import { useStore } from '../lib/store';
import LobbyScreen from './LobbyScreen';
import PlacementScreen from './PlacementScreen';
import BattleScreen from './BattleScreen';
import ResultsScreen from './ResultsScreen';

/** Phase-driven game container: the server snapshot decides which screen is shown. */
export default function GameScreen() {
  const game = useStore((s) => s.game);
  if (!game) return <Navigate to="/play" replace />;
  switch (game.phase) {
    case 'WAITING':
      return <LobbyScreen game={game} />;
    case 'PLACING_SHIPS':
      return <PlacementScreen game={game} />;
    case 'READY':
    case 'IN_BATTLE':
      return <BattleScreen game={game} />;
    case 'FINISHED':
      return <ResultsScreen game={game} />;
    default:
      return <Navigate to="/play" replace />;
  }
}
