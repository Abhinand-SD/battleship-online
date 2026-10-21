import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { BarChart3, LogIn, Settings, ShieldCheck, UserPlus } from 'lucide-react';
import { DISPLAY_NAME_MAX } from '@battleship/shared';
import { api } from '../lib/api';
import { Avatar } from '../lib/avatars';
import { reconnectSocket } from '../lib/socket';
import { toast, useStore } from '../lib/store';
import { cn } from '../lib/utils';
import { PageShell } from '../components/ui/PageShell';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/profile/PasswordInput';
import {
  extractFieldErrors,
  NO_ERRORS,
  normalizeUsername,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  validateDisplayName,
  validatePassword,
  validateUsername,
  type FieldErrors,
} from '../components/menu/validation';

type Tab = 'register' | 'login';

function FormError({ message }: { message: string | null }) {
  return (
    <div aria-live="polite">
      {message && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {message}
        </p>
      )}
    </div>
  );
}

function RegisterForm() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  const clearField = (field: string) => {
    if (errors.fields[field] || errors.form) setErrors((e) => ({ form: null, fields: { ...e.fields, [field]: '' } }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const fields: Record<string, string> = {};
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    const displayNameError = validateDisplayName(displayName, { optional: true });
    if (usernameError) fields['username'] = usernameError;
    if (passwordError) fields['password'] = passwordError;
    else if (confirm !== password) fields['confirm'] = 'Passwords don’t match.';
    if (displayNameError) fields['displayName'] = displayNameError;
    if (Object.keys(fields).length > 0) {
      setErrors({ form: null, fields });
      return;
    }
    setErrors(NO_ERRORS);
    setSubmitting(true);
    try {
      const trimmedName = displayName.trim();
      const res = await api.register({
        username: normalizeUsername(username),
        password,
        ...(trimmedName ? { displayName: trimmedName } : {}),
      });
      useStore.getState().setAuth(res.token, res.user);
      reconnectSocket();
      toast('success', 'Account created', `Welcome aboard, ${res.user.displayName}!`);
      navigate('/play');
    } catch (err) {
      setErrors(extractFieldErrors(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label="Create account" data-testid="register-form">
      <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft/50 px-3 py-2.5 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-ink-muted">
          Registering upgrades your current guest profile{user ? <> (<span className="text-ink">{user.displayName}</span>)</> : null} — your rating, match history and
          achievements come with you.
        </p>
      </div>

      <Input
        name="username"
        label="Username"
        value={username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={USERNAME_MAX}
        onChange={(e) => {
          setUsername(e.target.value);
          clearField('username');
        }}
        error={errors.fields['username'] || undefined}
        hint={`${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers, underscores. Used to sign in.`}
        aria-invalid={Boolean(errors.fields['username'])}
        disabled={submitting}
      />
      <PasswordInput
        name="password"
        label="Password"
        value={password}
        autoComplete="new-password"
        onChange={(e) => {
          setPassword(e.target.value);
          clearField('password');
        }}
        error={errors.fields['password'] || undefined}
        hint={`At least ${PASSWORD_MIN} characters.`}
        aria-invalid={Boolean(errors.fields['password'])}
        disabled={submitting}
      />
      <PasswordInput
        name="confirm"
        label="Confirm password"
        value={confirm}
        autoComplete="new-password"
        onChange={(e) => {
          setConfirm(e.target.value);
          clearField('confirm');
        }}
        error={errors.fields['confirm'] || undefined}
        aria-invalid={Boolean(errors.fields['confirm'])}
        disabled={submitting}
      />
      <Input
        name="displayName"
        label="Display name (optional)"
        value={displayName}
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        placeholder={user?.displayName ?? 'Captain'}
        onChange={(e) => {
          setDisplayName(e.target.value);
          clearField('displayName');
        }}
        error={errors.fields['displayName'] || undefined}
        hint="Leave empty to keep your current name."
        aria-invalid={Boolean(errors.fields['displayName'])}
        disabled={submitting}
      />

      <FormError message={errors.form} />

      <Button type="submit" size="lg" fullWidth icon={<UserPlus className="h-4 w-4" />} loading={submitting}>
        Create account
      </Button>
    </form>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const fields: Record<string, string> = {};
    const usernameError = validateUsername(username);
    if (usernameError) fields['username'] = usernameError;
    if (password.length === 0) fields['password'] = 'Enter your password.';
    if (Object.keys(fields).length > 0) {
      setErrors({ form: null, fields });
      return;
    }
    setErrors(NO_ERRORS);
    setSubmitting(true);
    try {
      const res = await api.login({ username: normalizeUsername(username), password });
      useStore.getState().setAuth(res.token, res.user);
      reconnectSocket();
      toast('success', 'Signed in', `Welcome back, ${res.user.displayName}!`);
      navigate('/play');
    } catch (err) {
      setErrors(extractFieldErrors(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label="Sign in" data-testid="login-form">
      <p className="text-sm text-ink-muted">Signing in replaces the guest profile on this device with your account.</p>
      <Input
        name="username"
        label="Username"
        value={username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(e) => {
          setUsername(e.target.value);
          if (errors.fields['username'] || errors.form) setErrors(NO_ERRORS);
        }}
        error={errors.fields['username'] || undefined}
        aria-invalid={Boolean(errors.fields['username'])}
        disabled={submitting}
      />
      <PasswordInput
        name="password"
        label="Password"
        value={password}
        autoComplete="current-password"
        onChange={(e) => {
          setPassword(e.target.value);
          if (errors.fields['password'] || errors.form) setErrors(NO_ERRORS);
        }}
        error={errors.fields['password'] || undefined}
        aria-invalid={Boolean(errors.fields['password'])}
        disabled={submitting}
      />

      <FormError message={errors.form} />

      <Button type="submit" size="lg" fullWidth icon={<LogIn className="h-4 w-4" />} loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}

function SignedInPanel() {
  const user = useStore((s) => s.user);
  if (!user) return null;
  return (
    <Panel strong className="flex flex-col items-center gap-4 text-center" data-testid="signed-in-panel">
      <Avatar id={user.avatar} size={72} ring />
      <div>
        <p className="font-display text-xl font-bold">You’re signed in as @{user.username}</p>
        <p className="mt-1 text-sm text-ink-muted">Your stats are saved to your account. Sign out from Settings to switch accounts.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/settings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-accent-soft/40 px-4 text-sm font-medium hover:bg-accent-soft">
          <Settings className="h-4 w-4" aria-hidden />
          Settings
        </Link>
        <Link to="/stats" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-accent-soft/40 px-4 text-sm font-medium hover:bg-accent-soft">
          <BarChart3 className="h-4 w-4" aria-hidden />
          Your stats
        </Link>
      </div>
    </Panel>
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'register', label: 'Create account' },
  { id: 'login', label: 'Sign in' },
];

export default function AccountScreen() {
  const user = useStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('register');
  const tabsId = useId();
  const registered = user !== null && !user.isGuest;

  return (
    <PageShell back="/play" title="Account" width="md">
      <div className="mx-auto w-full max-w-lg animate-fade-up">
        <h1 className="mb-1 font-display text-2xl font-bold">Account</h1>
        <p className="mb-5 text-sm text-ink-muted">Keep your rating, history and achievements on every device.</p>

        {registered ? (
          <SignedInPanel />
        ) : (
          <Panel padded={false} className="overflow-hidden">
            <div role="tablist" aria-label="Account" className="grid grid-cols-2 border-b border-line">
              {TABS.map((t) => {
                const selected = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`${tabsId}-tab-${t.id}`}
                    aria-selected={selected}
                    aria-controls={`${tabsId}-panel-${t.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        const next = t.id === 'register' ? 'login' : 'register';
                        setTab(next);
                        document.getElementById(`${tabsId}-tab-${next}`)?.focus();
                      }
                    }}
                    className={cn(
                      'relative py-3 text-sm font-semibold transition-colors',
                      selected ? 'text-accent' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {t.label}
                    {selected && <span aria-hidden className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-accent shadow-glow" />}
                  </button>
                );
              })}
            </div>
            <div role="tabpanel" id={`${tabsId}-panel-${tab}`} aria-labelledby={`${tabsId}-tab-${tab}`} className="p-4 sm:p-5">
              {tab === 'register' ? <RegisterForm /> : <LoginForm />}
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
