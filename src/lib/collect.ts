import { IgError } from './errors';
import { igImage, pauseMs, readFollowers, readFollowing, readViewerUsername, type IgDeps, type ListCallbacks } from './ig';
import { fillThumbs, thumbTargets, type Thumbs } from './thumbs';
import type { CollectResult, ProgressMessage, Reading, Specials, StartResult } from './types';

export const COOLDOWN_MS = 5 * 60 * 1000;
/** Depois de um 429 o Instagram costuma pedir mais tempo; insistir antes alonga a pausa. */
export const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

export interface CollectorDeps extends IgDeps {
  cookie: () => string;
  now: () => number;
  saveReading: (viewerPk: string, reading: Reading) => Promise<void>;
  cooldownUntil: (viewerPk: string) => Promise<number>;
  setCooldown: (viewerPk: string, until: number) => Promise<void>;
  progress: (message: ProgressMessage) => void;
  done: (result: CollectResult) => void;
  /** Fotos depois da leitura (opcional): sem isso, nada além das listas é baixado. */
  thumbs?: {
    load: (viewerPk: string) => Promise<Thumbs>;
    save: (viewerPk: string, thumbs: Thumbs) => Promise<void>;
    specials: (viewerPk: string) => Promise<Specials>;
    encode: (blob: Blob) => Promise<string>;
    progress: (done: number, total: number) => void;
  };
}

export function viewerPkFromCookie(cookie: string): string | null {
  const match = /(?:^|;\s*)ds_user_id=(\d+)/.exec(cookie);
  return match ? match[1] : null;
}

export function createCollector(deps: CollectorDeps) {
  let running = false;

  function callbacks(phase: ProgressMessage['phase']): ListCallbacks {
    let read = 0;
    return {
      onPage: (n) => {
        read = n;
        deps.progress({ type: 'progress', phase, read });
      },
      onWait: (seconds) => deps.progress({ type: 'progress', phase, read, waitingSeconds: seconds }),
    };
  }

  let lastReading: Reading | null = null;

  async function run(viewerPk: string): Promise<CollectResult> {
    let result: CollectResult;
    lastReading = null;
    try {
      const username = await readViewerUsername(deps);
      const following = await readFollowing(deps, viewerPk, callbacks('following'));
      await deps.sleep(pauseMs(deps));
      const followers = await readFollowers(deps, viewerPk, callbacks('followers'));
      const reading: Reading = { at: deps.now(), username, following, followerPks: followers.map((p) => p.pk) };
      await deps.saveReading(viewerPk, reading);
      lastReading = reading;
      result = { ok: true, viewerPk };
    } catch (error) {
      result = error instanceof IgError
        ? { ok: false, code: error.code, detail: error.detail }
        : { ok: false, code: 'format', detail: String(error) };
    }
    const wait = !result.ok && result.code === 'rate-limited' ? RATE_LIMIT_COOLDOWN_MS : COOLDOWN_MS;
    try {
      await deps.setCooldown(viewerPk, deps.now() + wait);
    } catch {
      // Sem storage não há trava; a leitura em si já terminou.
    }
    return result;
  }

  async function photos(viewerPk: string, reading: Reading): Promise<void> {
    const thumbs = deps.thumbs;
    if (!thumbs) return;
    try {
      await fillThumbs({
        targets: thumbTargets(reading, await thumbs.specials(viewerPk)),
        existing: await thumbs.load(viewerPk),
        fetchImage: (url) => igImage(deps, url),
        encode: thumbs.encode,
        save: (next) => thumbs.save(viewerPk, next),
        onProgress: thumbs.progress,
      });
    } catch {
      // Fotos são extra: falhar aqui não desfaz a leitura.
    }
  }

  return {
    isRunning: (): boolean => running,

    async start(): Promise<StartResult> {
      if (running) return { ok: false, code: 'busy' };
      const viewerPk = viewerPkFromCookie(deps.cookie());
      if (!viewerPk) return { ok: false, code: 'not-logged-in' };
      running = true;
      let until = 0;
      try {
        until = await deps.cooldownUntil(viewerPk);
      } catch {
        until = 0;
      }
      if (deps.now() < until) {
        running = false;
        return { ok: false, code: 'cooldown' };
      }
      // Arma a trava já no começo: uma leitura que morrer no meio (aba recarregada no 429)
      // ou uma segunda aba não começam outra leitura antes de 5 minutos.
      try {
        await deps.setCooldown(viewerPk, deps.now() + COOLDOWN_MS);
      } catch {
        // Sem storage não há trava.
      }
      void run(viewerPk).then(async (result) => {
        // O painel é liberado já com a lista; as fotos chegam depois, sem travar nada.
        deps.done(result);
        if (result.ok && lastReading) await photos(viewerPk, lastReading);
        running = false;
      });
      return { ok: true };
    },
  };
}
