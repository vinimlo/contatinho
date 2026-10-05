import { nonFollowers } from './core';
import type { Profile, Reading, Specials } from './types';

/** Miniatura guardada de uma conta: `key` identifica a foto, `data` é a imagem em data URL. */
export interface Thumb {
  key: string;
  data: string;
}

export type Thumbs = Record<string, Thumb>;

const CONCURRENCY = 4;
const SAVE_EVERY = 25;

/** Identidade da foto: o id estável do Instagram ou, sem ele, o caminho da URL sem a assinatura. */
export function photoKey(profile: Profile): string {
  if (profile.picId) return profile.picId;
  try {
    return new URL(profile.picUrl).pathname;
  } catch {
    return profile.picUrl;
  }
}

/** Contas cujas fotos o painel mostra: quem não te segue e as especiais que você segue. */
export function thumbTargets(reading: Reading, specials: Specials): Profile[] {
  const shown = new Set(nonFollowers(reading, {}).map((p) => p.pk));
  return reading.following.filter((p) => p.picUrl && (shown.has(p.pk) || p.pk in specials));
}

export interface FillOptions {
  targets: Profile[];
  existing: Thumbs;
  fetchImage: (url: string) => Promise<Blob>;
  encode: (blob: Blob) => Promise<string>;
  save: (thumbs: Thumbs) => Promise<void>;
  onProgress: (done: number, total: number) => void;
}

/**
 * Baixa só o que falta (foto nova ou trocada), reaproveita o resto e descarta quem saiu da lista.
 * Foto que falha fica de fora: a linha mostra as iniciais.
 */
export async function fillThumbs({ targets, existing, fetchImage, encode, save, onProgress }: FillOptions): Promise<Thumbs> {
  const thumbs: Thumbs = {};
  const todo: Profile[] = [];
  for (const profile of targets) {
    const kept = existing[profile.pk];
    if (kept && kept.key === photoKey(profile)) thumbs[profile.pk] = kept;
    else todo.push(profile);
  }

  let done = 0;
  let sinceSave = 0;
  onProgress(0, todo.length);
  const queue = [...todo];
  async function worker(): Promise<void> {
    for (let profile = queue.shift(); profile; profile = queue.shift()) {
      try {
        thumbs[profile.pk] = { key: photoKey(profile), data: await encode(await fetchImage(profile.picUrl)) };
      } catch {
        // Sem miniatura: a linha mostra as iniciais.
      }
      done++;
      onProgress(done, todo.length);
      if (++sinceSave >= SAVE_EVERY) {
        sinceSave = 0;
        await save({ ...thumbs });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  await save(thumbs);
  return thumbs;
}
