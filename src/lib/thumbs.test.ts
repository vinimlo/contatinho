// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fillThumbs, photoKey, thumbTargets, type Thumbs } from './thumbs';
import type { Profile, Reading } from './types';

const prof = (pk: string, picUrl = `https://x.fbcdn.net/${pk}.jpg`, picId: string | undefined = `p${pk}`): Profile => ({
  pk, username: `u${pk}`, fullName: '', picUrl, ...(picId ? { picId } : {}), isVerified: false, isPrivate: false,
});

describe('photoKey', () => {
  it('usa o id da foto e, sem ele, o caminho da URL sem a assinatura', () => {
    expect(photoKey(prof('1'))).toBe('p1');
    expect(photoKey(prof('2', 'https://x.fbcdn.net/v/2.jpg?oh=abc&oe=1', ''))).toBe('/v/2.jpg');
  });
});

describe('thumbTargets', () => {
  it('quem não te segue mais as especiais que você segue, só quem tem foto', () => {
    const reading: Reading = { at: 0, username: 'eu', following: [prof('1'), prof('2'), prof('3'), prof('4', '')], followerPks: ['2', '3'] };
    const specials = { '3': { username: 'u3', fullName: '', starredAt: 1 }, '9': { username: 'u9', fullName: '', starredAt: 2 } };
    expect(thumbTargets(reading, specials).map((p) => p.pk)).toEqual(['1', '3']);
  });
});

describe('fillThumbs', () => {
  function setup(targets: Profile[], existing: Thumbs = {}, failing: string[] = []) {
    const saves: Thumbs[] = [];
    let active = 0;
    let peak = 0;
    const opts = {
      targets,
      existing,
      fetchImage: vi.fn(async (url: string) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
        if (failing.some((f) => url.includes(f))) throw new Error('404');
        return new Blob([url]);
      }),
      encode: vi.fn(async (blob: Blob) => `data:${await blob.text()}`),
      save: vi.fn(async (thumbs: Thumbs) => { saves.push(structuredClone(thumbs)); }),
      onProgress: vi.fn(),
    };
    return { opts, saves, peak: () => peak };
  }

  it('baixa só o que falta, reaproveita foto igual e descarta quem saiu', async () => {
    const existing: Thumbs = {
      '1': { key: 'p1', data: 'velha1' },
      '2': { key: 'outra-foto', data: 'velha2' },
      '9': { key: 'p9', data: 'saiu-da-lista' },
    };
    const s = setup([prof('1'), prof('2'), prof('3')], existing);
    const result = await fillThumbs(s.opts);
    expect(s.opts.fetchImage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      '1': { key: 'p1', data: 'velha1' },
      '2': { key: 'p2', data: 'data:https://x.fbcdn.net/2.jpg' },
      '3': { key: 'p3', data: 'data:https://x.fbcdn.net/3.jpg' },
    });
    expect(s.saves.at(-1)).toEqual(result);
  });

  it('no máximo 4 downloads ao mesmo tempo', async () => {
    const s = setup(Array.from({ length: 10 }, (_, i) => prof(String(i + 1))));
    await fillThumbs(s.opts);
    expect(s.opts.fetchImage).toHaveBeenCalledTimes(10);
    expect(s.peak()).toBeLessThanOrEqual(4);
  });

  it('foto que falha fica de fora e o resto segue', async () => {
    const s = setup([prof('1'), prof('2'), prof('3')], {}, ['/2.jpg']);
    expect(Object.keys(await fillThumbs(s.opts)).sort()).toEqual(['1', '3']);
  });

  it('grava em lotes e avisa o progresso até o fim', async () => {
    const s = setup(Array.from({ length: 30 }, (_, i) => prof(String(i + 1))));
    await fillThumbs(s.opts);
    expect(s.saves.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(s.saves.at(-1)!)).toHaveLength(30);
    expect(s.opts.onProgress).toHaveBeenLastCalledWith(30, 30);
  });

  it('nada para baixar ainda grava a limpeza e avisa 0 de 0', async () => {
    const s = setup([prof('1')], { '1': { key: 'p1', data: 'ok' }, '7': { key: 'p7', data: 'saiu' } });
    expect(await fillThumbs(s.opts)).toEqual({ '1': { key: 'p1', data: 'ok' } });
    expect(s.opts.fetchImage).not.toHaveBeenCalled();
    expect(s.saves.at(-1)).toEqual({ '1': { key: 'p1', data: 'ok' } });
    expect(s.opts.onProgress).toHaveBeenLastCalledWith(0, 0);
  });
});
