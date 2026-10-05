import { normalizeProfile } from './core';
import { IgError } from './errors';
import type { Profile } from './types';

/** Único caminho de rede da extensão: GET same-origin, só para as rotas abaixo. */
export const IG_APP_ID = '936619743392459';
export const RETRY_WAIT_MS = 60_000;

const ALLOWED_ROUTES = [
  /^\/api\/v1\/accounts\/edit\/web_form_data\/$/,
  /^\/api\/v1\/friendships\/\d+\/(?:following|followers)\/$/,
];

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface IgDeps {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export interface ListCallbacks {
  onPage: (read: number) => void;
  onWait: (seconds: number) => void;
}

export async function igGet(
  deps: IgDeps,
  path: string,
  params: Record<string, string> = {},
  onWait: (seconds: number) => void = () => undefined,
): Promise<Record<string, unknown>> {
  if (!ALLOWED_ROUTES.some((route) => route.test(path))) throw new Error(`igGet: rota fora da lista: ${path}`);
  const query = new URLSearchParams(params).toString();
  const url = query ? `${path}?${query}` : path;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'X-IG-App-ID': IG_APP_ID, 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch (error) {
      throw new IgError('network', String(error));
    }
    const text = await res.text();

    if (res.status === 429 || (!res.ok && /wait a few minutes/i.test(text))) {
      if (attempt === 0) {
        onWait(RETRY_WAIT_MS / 1000);
        await deps.sleep(RETRY_WAIT_MS);
        continue;
      }
      throw new IgError('rate-limited', `HTTP ${res.status}`);
    }
    if (res.status === 401 || res.status === 403) throw new IgError('session', `HTTP ${res.status}`);
    if ((res.headers.get('content-type') ?? '').includes('text/html') || /^\s*</.test(text)) {
      throw new IgError('session', `HTTP ${res.status}, resposta em HTML`);
    }
    let body: unknown;
    let parsed = true;
    try {
      body = JSON.parse(text);
    } catch {
      parsed = false;
    }
    const obj = parsed && body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    if (obj && asksForSession(obj)) throw new IgError('session', `HTTP ${res.status}, ${String(obj.message ?? 'require_login')}`);
    if (!res.ok) throw new IgError('network', `HTTP ${res.status}`);
    if (!parsed) throw new IgError('format', 'resposta não é JSON');
    if (!obj) throw new IgError('format', 'JSON não é objeto');
    return obj;
  }
}

/** Login vencido, checkpoint ou challenge: quem usa precisa resolver no próprio instagram.com. */
function asksForSession(body: Record<string, unknown>): boolean {
  if (body.require_login === true) return true;
  return [body.message, body.error_type].some(
    (field) => typeof field === 'string' && /^(?:checkpoint_required|challenge_required|login_required)$/.test(field),
  );
}

/** Fotos só do CDN de imagens do Instagram, em https, sem cookies. */
function isInstagramImage(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && /(?:^|\.)(?:fbcdn\.net|cdninstagram\.com)$/.test(hostname);
  } catch {
    return false;
  }
}

export async function igImage(deps: Pick<IgDeps, 'fetch'>, url: string): Promise<Blob> {
  if (!isInstagramImage(url)) throw new Error('igImage: host fora da lista');
  let res: Response;
  try {
    res = await deps.fetch(url, { method: 'GET', credentials: 'omit', mode: 'cors' });
  } catch (error) {
    throw new IgError('network', String(error));
  }
  if (!res.ok) throw new IgError('network', `HTTP ${res.status}`);
  return res.blob();
}

export const pauseMs = (deps: Pick<IgDeps, 'random'>): number => 1000 + Math.floor(deps.random() * 1000);

export async function readViewerUsername(deps: IgDeps): Promise<string> {
  const body = await igGet(deps, '/api/v1/accounts/edit/web_form_data/');
  const form = body.form_data as Record<string, unknown> | undefined;
  if (!form || typeof form.username !== 'string' || !form.username) {
    throw new IgError('format', 'web_form_data sem username');
  }
  return form.username;
}

async function readList(
  deps: IgDeps,
  path: string,
  base: Record<string, string>,
  label: string,
  cb: ListCallbacks,
): Promise<Profile[]> {
  const profiles: Profile[] = [];
  const seenPks = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (;;) {
    const body = await igGet(deps, path, cursor ? { ...base, max_id: cursor } : base, cb.onWait);
    if (!Array.isArray(body.users)) throw new IgError('format', 'resposta sem a lista users');
    const page = body.users.map((raw: unknown) => normalizeProfile(raw));
    for (const profile of page) {
      if (seenPks.has(profile.pk)) continue;
      seenPks.add(profile.pk);
      profiles.push(profile);
    }
    cb.onPage(profiles.length);

    const raw = body.next_max_id;
    const next = raw === undefined || raw === null || raw === '' ? null : String(raw);
    const incomplete = () => new IgError('incomplete', `${label}, ${profiles.length} lidos`);
    if (next === null) {
      if (body.has_more !== false) throw incomplete();
      return profiles;
    }
    if (page.length === 0 || seenCursors.has(next)) throw incomplete();
    seenCursors.add(next);
    cursor = next;
    await deps.sleep(pauseMs(deps));
  }
}

export function readFollowing(deps: IgDeps, viewerPk: string, cb: ListCallbacks): Promise<Profile[]> {
  return readList(deps, `/api/v1/friendships/${viewerPk}/following/`, { count: '200', order: 'date_followed_latest' }, 'seguindo', cb);
}

export function readFollowers(deps: IgDeps, viewerPk: string, cb: ListCallbacks): Promise<Profile[]> {
  return readList(deps, `/api/v1/friendships/${viewerPk}/followers/`, { count: '200', search_surface: 'follow_list_page' }, 'seguidores', cb);
}
