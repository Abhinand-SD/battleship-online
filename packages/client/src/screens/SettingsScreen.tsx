import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, Info, LogOut, Save, Trophy, UserPlus, Volume2, VolumeX } from 'lucide-react';
import { AVATAR_IDS, DISPLAY_NAME_MAX, type AvatarId } from '@battleship/shared';
import { api } from '../lib/api';
import { Avatar, AVATAR_LABELS, isAvatarId } from '../lib/avatars';
import { playSound, unlockAudio } from '../lib/audio';
import { reconnectSocket } from '../lib/socket';
import { toast, useStore } from '../lib/store';
import { cn } from '../lib/utils';
import { PageShell } from '../components/ui/PageShell';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Toggle } from '../components/profile/Toggle';
import { extractFieldErrors, NO_ERRORS, validateDisplayName, type FieldErrors } from '../components/menu/validation';
import { messageOf } from '../components/menu/errors';

const APP_VERSION = '1.0.0';

function ProfileSection() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(user && isAvatarId(user.avatar) ? user.avatar : 'anchor');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);

  // Keep the form in sync when the profile changes elsewhere (socket session sync, sign-in).
  const savedName = user?.displayName;
  const savedAvatar = user?.avatar;
  useEffect(() => {
    if (savedName === undefined || savedAvatar === undefined) return;
    setDisplayName(savedName);
    setAvatar(isAvatarId(savedAvatar) ? savedAvatar : 'anchor');
  }, [savedName, savedAvatar]);

  const dirty = user ? displayName.trim() !== user.displayName || avatar !== user.avatar : false;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    const nameError = validateDisplayName(displayName);
    if (nameError) {
      setErrors({ form: null, fields: { displayName: nameError } });
      return;
    }
    setErrors(NO_ERRORS);
    setSaving(true);
    try {
      const patch: { displayName?: string; avatar?: string } = {};
      const trimmed = displayName.trim();
      if (trimmed !== user.displayName) patch.displayName = trimmed;
      if (avatar !== user.avatar) patch.avatar = avatar;
      const res = await api.updateMe(patch);
      setUser(res.user);
      toast('success', 'Profile saved');
    } catch (err) {
      setErrors(extractFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Profile" subtitle="How other captains see you.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Input
          name="displayName"
          label="Display name"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="nickname"
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (errors.fields['displayName']) setErrors(NO_ERRORS);
          }}
          error={errors.fields['displayName']}
          hint={`${displayName.trim().length}/${DISPLAY_NAME_MAX} characters`}
          aria-invalid={Boolean(errors.fields['displayName'])}
        />

        <fieldset>
          <legend className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Avatar</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Avatar">
            {AVATAR_IDS.map((id) => {
              const selected = id === avatar;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={AVATAR_LABELS[id]}
                  title={AVATAR_LABELS[id]}
                  data-testid={`avatar-${id}`}
                  onClick={() => {
                    unlockAudio();
                    playSound('click');
                    setAvatar(id);
                  }}
                  className={cn(
                    'relative flex aspect-square items-center justify-center rounded-2xl border transition-all',
                    selected ? 'border-accent/70 bg-accent-soft shadow-glow' : 'border-line bg-white/[0.02] hover:border-accent/40 hover:bg-white/5',
                  )}
                >
                  <Avatar id={id} size={44} ring={selected} />
                  {selected && (
                    <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-ocean-950" aria-hidden>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {errors.fields['avatar'] && <p className="mt-1.5 text-xs text-rose-300">{errors.fields['avatar']}</p>}
        </fieldset>

        <div aria-live="polite">
          {errors.form && (
            <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {errors.form}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          {dirty && !saving && <span className="text-xs text-ink-muted">Unsaved changes</span>}
          <Button type="submit" icon={<Save className="h-4 w-4" />} loading={saving} disabled={!user || !dirty}>
            Save profile
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function AudioSection() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const volumePercent = Math.round(settings.volume * 100);

  const previewVolume = () => {
    if (!settings.sound) return;
    unlockAudio();
    playSound('click');
  };

  return (
    <Panel title="Audio" subtitle="Synthesised effects for shots, turns and results.">
      <div className="divide-y divide-line/60">
        <Toggle
          label="Sound effects"
          description="Play sounds for hits, misses, sunk ships and your turn."
          checked={settings.sound}
          onChange={(sound) => updateSettings({ sound })}
          data-testid="toggle-sound"
        />
        <div className="py-3">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="volume" className="text-sm font-medium text-ink">
              Volume
            </label>
            <span className="font-mono text-xs tabular-nums text-ink-muted" aria-hidden>
              {volumePercent}%
            </span>
          </div>
          <div className={cn('mt-2 flex items-center gap-3', !settings.sound && 'opacity-50')}>
            {settings.sound && volumePercent > 0 ? <Volume2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden /> : <VolumeX className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />}
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={volumePercent}
              disabled={!settings.sound}
              onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })}
              onPointerUp={previewVolume}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) previewVolume();
              }}
              aria-valuetext={`${volumePercent}%`}
              className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-dim">A test sound plays when you release the slider.</p>
        </div>
      </div>
    </Panel>
  );
}

function GameplaySection() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <Panel title="Gameplay" subtitle="Input and motion preferences.">
      <div className="divide-y divide-line/60">
        <Toggle
          label="Confirm shots on touch screens"
          description="First tap aims, second tap fires. Prevents mis-taps on small screens."
          checked={settings.confirmShots}
          onChange={(confirmShots) => updateSettings({ confirmShots })}
          data-testid="toggle-confirm-shots"
        />
        <Toggle
          label="Reduce motion"
          description="Tone down animations, ripples and the radar backdrop."
          checked={settings.reducedMotion}
          onChange={(reducedMotion) => updateSettings({ reducedMotion })}
          data-testid="toggle-reduced-motion"
        />
      </div>
    </Panel>
  );
}

function AccountSection() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const store = useStore.getState();
    // Leave the settings route first: clearing auth drops the app into its boot gate (which unmounts
    // this screen) until the fresh guest session is ready, and navigate() is a no-op after unmount.
    navigate('/play');
    store.clearAuth();
    try {
      const res = await api.guest();
      store.setAuth(res.token, res.user);
      reconnectSocket();
      toast('success', 'Signed out', 'You’re now playing as a guest.');
    } catch (err) {
      // The token is already gone; tell the user and let App's bootstrap recover on reload.
      store.setAuthStatus('error', messageOf(err));
      toast('error', 'Signed out, but couldn’t start a guest session', messageOf(err));
      setSigningOut(false);
    }
  };

  if (!user) return null;

  return (
    <Panel title="Account">
      {user.isGuest ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Badge tone="warning" className="mt-0.5">
              Guest
            </Badge>
            <p className="text-sm text-ink-muted">You’re playing as a guest. Create an account to keep your stats across devices and browsers.</p>
          </div>
          <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => navigate('/account')} className="shrink-0">
            Create account / Sign in
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar id={user.avatar} size={40} />
            <div>
              <p className="text-sm font-semibold">{user.displayName}</p>
              <p className="font-mono text-xs text-ink-muted">@{user.username}</p>
            </div>
          </div>
          <Button variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmOpen(true)} className="shrink-0">
            Sign out
          </Button>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => !signingOut && setConfirmOpen(false)}
        locked={signingOut}
        title="Sign out?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={signingOut}>
              Cancel
            </Button>
            <Button variant="danger" onClick={signOut} loading={signingOut} data-testid="confirm-sign-out">
              Sign out
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          You’ll continue as a new guest on this device. Your account, rating and history stay safe — sign back in any time.
        </p>
      </Modal>
    </Panel>
  );
}

function AboutSection() {
  return (
    <Panel title="About">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Version</dt>
        <dd className="font-mono">Battleship Online v{APP_VERSION}</dd>
        <dt className="text-ink-muted">Built with</dt>
        <dd>React, Vite, Tailwind CSS, Motion and Socket.IO. Sounds are synthesised in the browser — no audio files.</dd>
        <dt className="text-ink-muted">Fair play</dt>
        <dd>Every shot is validated by the server; ship positions are never sent to your opponent until they are sunk.</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to="/leaderboard" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <Trophy className="h-4 w-4" aria-hidden />
          View the leaderboard
        </Link>
        <Link to="/stats" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <Info className="h-4 w-4" aria-hidden />
          Your stats
        </Link>
      </div>
    </Panel>
  );
}

export default function SettingsScreen() {
  return (
    <PageShell back="/play" title="Settings" width="md">
      <h1 className="mb-5 font-display text-2xl font-bold">Settings</h1>
      <div className="flex flex-col gap-5 animate-fade-up">
        <ProfileSection />
        <AudioSection />
        <GameplaySection />
        <AccountSection />
        <AboutSection />
      </div>
    </PageShell>
  );
}
