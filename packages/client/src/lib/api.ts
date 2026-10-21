import type {
  ApiError,
  AuthResponse,
  LeaderboardEntry,
  MatchSummary,
  PlayerStats,
  UserProfile,
} from '@battleship/shared';
import { useStore } from './store';

export const SERVER_URL: string = (import.meta.env['VITE_SERVER_URL'] as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiRequestError extends Error {
  code: ApiError['code'];
  status: number;
  details?: unknown;
  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

async function request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = useStore.getState().token;
  if (opts.auth !== false && token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
    });
  } catch {
    throw new ApiRequestError(0, { code: 'INTERNAL', message: 'Network error. Check your connection.' });
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: ApiError } | null)?.error ?? {
      code: 'INTERNAL' as const,
      message: res.statusText || 'Request failed',
    };
    throw new ApiRequestError(res.status, err);
  }
  return data as T;
}

export const api = {
  guest: (displayName?: string) => request<AuthResponse>('POST', '/auth/guest', displayName ? { displayName } : {}, { auth: false }),
  register: (input: { username: string; password: string; displayName?: string }) =>
    request<AuthResponse>('POST', '/auth/register', input),
  login: (input: { username: string; password: string }) => request<AuthResponse>('POST', '/auth/login', input, { auth: false }),
  me: () => request<{ user: UserProfile }>('GET', '/me'),
  updateMe: (patch: { displayName?: string; avatar?: string }) => request<{ user: UserProfile }>('PATCH', '/me', patch),
  myStats: () => request<{ stats: PlayerStats; rank: number | null }>('GET', '/stats/me'),
  user: (id: string) => request<{ user: UserProfile; stats: PlayerStats }>('GET', `/users/${encodeURIComponent(id)}`),
  leaderboard: (limit = 20, offset = 0) =>
    request<{ entries: LeaderboardEntry[] }>('GET', `/leaderboard?limit=${limit}&offset=${offset}`, undefined, { auth: false }),
  myMatches: (limit = 20) => request<{ matches: MatchSummary[] }>('GET', `/matches/me?limit=${limit}`),
  health: () => request<{ status: string; store: string; db: boolean; runtime?: { onlineUsers: number; activeGames: number; queueLength: number } }>(
    'GET',
    '/health',
    undefined,
    { auth: false },
  ),
  online: () => request<{ onlineUsers: number; activeGames: number; queueLength: number; connectedSockets: number }>('GET', '/stats/online', undefined, { auth: false }),
};
