import { mergeSpecials, type SpecialsFile } from './specialsFile';
import type { Thumbs } from './thumbs';
import type { Profile, Reading, Specials } from './types';

export const LAST_VIEWER_KEY = 'lastViewerPk';

type Field = 'lastReading' | 'specials' | 'seen' | 'cooldownUntil' | 'thumbs';

export const accountKey = (viewerPk: string, field: Field): string => `accounts.${viewerPk}.${field}`;

export interface AccountData {
  reading: Reading | null;
  specials: Specials;
  seen: string[];
  cooldownUntil: number;
  thumbs: Thumbs;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  const got = await chrome.storage.local.get(key);
  return (got[key] as T | undefined) ?? fallback;
}

// Leitura-modifica-grava em fila, para dois cliques seguidos não se atropelarem.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export async function loadAccount(viewerPk: string): Promise<AccountData> {
  const keys = (['lastReading', 'specials', 'seen', 'cooldownUntil', 'thumbs'] as const).map((field) => accountKey(viewerPk, field));
  const got = await chrome.storage.local.get(keys);
  return {
    reading: (got[accountKey(viewerPk, 'lastReading')] as Reading | undefined) ?? null,
    specials: (got[accountKey(viewerPk, 'specials')] as Specials | undefined) ?? {},
    seen: (got[accountKey(viewerPk, 'seen')] as string[] | undefined) ?? [],
    cooldownUntil: (got[accountKey(viewerPk, 'cooldownUntil')] as number | undefined) ?? 0,
    thumbs: (got[accountKey(viewerPk, 'thumbs')] as Thumbs | undefined) ?? {},
  };
}

export async function saveReading(viewerPk: string, reading: Reading): Promise<void> {
  await chrome.storage.local.set({
    [accountKey(viewerPk, 'lastReading')]: reading,
    [accountKey(viewerPk, 'seen')]: [],
    [LAST_VIEWER_KEY]: viewerPk,
  });
}

export function loadThumbs(viewerPk: string): Promise<Thumbs> {
  return read<Thumbs>(accountKey(viewerPk, 'thumbs'), {});
}

export async function saveThumbs(viewerPk: string, thumbs: Thumbs): Promise<void> {
  await chrome.storage.local.set({ [accountKey(viewerPk, 'thumbs')]: thumbs });
}

export function getLastViewerPk(): Promise<string | null> {
  return read<string | null>(LAST_VIEWER_KEY, null);
}

export function getCooldown(viewerPk: string): Promise<number> {
  return read(accountKey(viewerPk, 'cooldownUntil'), 0);
}

export async function setCooldown(viewerPk: string, until: number): Promise<void> {
  await chrome.storage.local.set({ [accountKey(viewerPk, 'cooldownUntil')]: until });
}

export function toggleSpecial(
  viewerPk: string,
  profile: Pick<Profile, 'pk' | 'username' | 'fullName'>,
  now: number,
): Promise<boolean> {
  return serial(async () => {
    const key = accountKey(viewerPk, 'specials');
    const specials = await read<Specials>(key, {});
    const starred = !(profile.pk in specials);
    if (starred) specials[profile.pk] = { username: profile.username, fullName: profile.fullName, starredAt: now };
    else delete specials[profile.pk];
    await chrome.storage.local.set({ [key]: specials });
    return starred;
  });
}

export function markSeen(viewerPk: string, pk: string): Promise<void> {
  return serial(async () => {
    const key = accountKey(viewerPk, 'seen');
    const seen = await read<string[]>(key, []);
    if (!seen.includes(pk)) await chrome.storage.local.set({ [key]: [...seen, pk] });
  });
}

export function importSpecials(viewerPk: string, file: SpecialsFile): Promise<{ added: number; existing: number }> {
  return serial(async () => {
    const key = accountKey(viewerPk, 'specials');
    const { merged, added, existing } = mergeSpecials(await read<Specials>(key, {}), file.specials);
    await chrome.storage.local.set({ [key]: merged });
    return { added, existing };
  });
}
