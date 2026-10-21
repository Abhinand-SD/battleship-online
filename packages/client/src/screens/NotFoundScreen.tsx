import { Link } from 'react-router';
import { PageShell } from '../components/ui/PageShell';

export default function NotFoundScreen() {
  return (
    <PageShell width="md">
      <div className="py-24 text-center">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Lost at sea</h1>
        <p className="mt-2 text-ink-muted">That page isn’t on our charts.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl border border-line px-4 py-2 text-sm hover:border-accent/60">
          Back to port
        </Link>
      </div>
    </PageShell>
  );
}
