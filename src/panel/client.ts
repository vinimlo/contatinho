import type { StartResult } from '../lib/types';

const INSTAGRAM_HOME = 'https://www.instagram.com/';

export interface WhoAmI {
  viewerPk: string | null;
  running: boolean;
}

export function isInstagramUrl(url: string | undefined): boolean {
  return !!url && url.startsWith(INSTAGRAM_HOME);
}

export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

export async function whoami(tabId: number): Promise<WhoAmI | null> {
  try {
    return ((await chrome.tabs.sendMessage(tabId, { type: 'whoami' })) as WhoAmI | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function requestCollect(tabId: number): Promise<StartResult> {
  try {
    const result = (await chrome.tabs.sendMessage(tabId, { type: 'collect' })) as StartResult | undefined;
    return result ?? { ok: false, code: 'no-content-script' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: /Receiving end does not exist/i.test(message) ? 'no-content-script' : 'interrupted' };
  }
}

export function profileUrl(username: string): string {
  return `${INSTAGRAM_HOME}${encodeURIComponent(username)}/`;
}

export async function openProfile(tabId: number, username: string): Promise<void> {
  await chrome.tabs.update(tabId, { url: profileUrl(username) });
}

/** Fora do Instagram, abre numa aba nova: nunca troca o site que está na aba ativa. */
export async function openProfileInNewTab(username: string): Promise<void> {
  await chrome.tabs.create({ url: profileUrl(username) });
}

export async function openInstagram(): Promise<void> {
  await chrome.tabs.create({ url: INSTAGRAM_HOME });
}
