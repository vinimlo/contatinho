// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { igUser, json, queueFetch } from '../test/fixtures';
import { COOLDOWN_MS, createCollector, RATE_LIMIT_COOLDOWN_MS, viewerPkFromCookie, type CollectorDeps } from './collect';
import type { CollectResult } from './types';

const NOW = 1_000_000;

function setup(fetch: CollectorDeps['fetch'], overrides: Partial<CollectorDeps> = {}) {
  let resolveDone!: (result: CollectResult) => void;
  const finished = new Promise<CollectResult>((resolve) => (resolveDone = resolve));
  const deps: CollectorDeps = {
    fetch,
    sleep: vi.fn(async () => undefined),
    random: () => 0,
    cookie: () => 'csrftoken=abc; ds_user_id=42; wd=1x1',
    now: () => NOW,
    saveReading: vi.fn(async () => undefined),
    cooldownUntil: vi.fn(async () => 0),
    setCooldown: vi.fn(async () => undefined),
    progress: vi.fn(),
    done: vi.fn((result: CollectResult) => resolveDone(result)),
    ...overrides,
  };
  return { deps, finished, collector: createCollector(deps) };
}

const okResponses = () => [
  json({ form_data: { username: 'eu' } }),
  json({ users: [igUser(1), igUser(2), igUser(3)], has_more: false }),
  json({ users: [igUser(2)], next_max_id: 'A', has_more: true }),
  json({ users: [igUser(9)], has_more: false }),
];

describe('viewerPkFromCookie', () => {
  it('lê o ds_user_id', () => {
    expect(viewerPkFromCookie('a=1; ds_user_id=295; b=2')).toBe('295');
    expect(viewerPkFromCookie('ds_user_id=7')).toBe('7');
    expect(viewerPkFromCookie('csrftoken=x')).toBeNull();
  });
});

describe('createCollector', () => {
  it('lê as duas listas, grava a leitura e arma a trava', async () => {
    const { deps, finished, collector } = setup(queueFetch(...okResponses()));
    expect(await collector.start()).toEqual({ ok: true });
    expect(await finished).toEqual({ ok: true, viewerPk: '42' });
    expect(deps.saveReading).toHaveBeenCalledWith('42', {
      at: NOW,
      username: 'eu',
      following: [expect.objectContaining({ pk: '1' }), expect.objectContaining({ pk: '2' }), expect.objectContaining({ pk: '3' })],
      followerPks: ['2', '9'],
    });
    expect(deps.setCooldown).toHaveBeenCalledWith('42', NOW + COOLDOWN_MS);
    expect(deps.progress).toHaveBeenCalledWith({ type: 'progress', phase: 'following', read: 3 });
    expect(deps.progress).toHaveBeenLastCalledWith({ type: 'progress', phase: 'followers', read: 2 });
    // A leitura só termina depois da fase de fotos (aqui sem fotos), para outra não começar no meio.
    await vi.waitFor(() => expect(collector.isRunning()).toBe(false));
  });

  it('sem sessão não faz rede', async () => {
    const fetch = queueFetch();
    const { collector } = setup(fetch, { cookie: () => 'csrftoken=x' });
    expect(await collector.start()).toEqual({ ok: false, code: 'not-logged-in' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('respeita a trava de 5 minutos', async () => {
    const fetch = queueFetch();
    const { collector } = setup(fetch, { cooldownUntil: vi.fn(async () => NOW + 1) });
    expect(await collector.start()).toEqual({ ok: false, code: 'cooldown' });
    expect(fetch).not.toHaveBeenCalled();
    expect(collector.isRunning()).toBe(false);
  });

  it('arma a trava no início, antes da rede responder: outra aba não começa outra leitura', async () => {
    let until = 0;
    const shared = {
      cooldownUntil: vi.fn(async () => until),
      setCooldown: vi.fn(async (_pk: string, next: number) => { until = next; }),
    };
    const pending = vi.fn(() => new Promise<Response>(() => undefined));
    const tabA = setup(pending, shared).collector;
    const tabB = setup(pending, shared).collector;
    expect(await tabA.start()).toEqual({ ok: true });
    expect(shared.setCooldown).toHaveBeenCalledWith('42', NOW + COOLDOWN_MS);
    expect(await tabB.start()).toEqual({ ok: false, code: 'cooldown' });
  });

  it('uma leitura por vez', async () => {
    const { finished, collector } = setup(queueFetch(...okResponses()));
    const first = collector.start();
    expect(await collector.start()).toEqual({ ok: false, code: 'busy' });
    expect(await first).toEqual({ ok: true });
    await finished;
  });

  it('429 duas vezes nos seguidores: nada é gravado, a trava é armada', async () => {
    const { deps, finished, collector } = setup(queueFetch(
      json({ form_data: { username: 'eu' } }),
      json({ users: [igUser(1)], has_more: false }),
      json({}, 429),
      json({}, 429),
    ));
    await collector.start();
    expect(await finished).toEqual({ ok: false, code: 'rate-limited', detail: 'HTTP 429' });
    expect(deps.saveReading).not.toHaveBeenCalled();
    expect(deps.setCooldown).toHaveBeenCalledWith('42', NOW + COOLDOWN_MS);
    expect(deps.progress).toHaveBeenCalledWith({ type: 'progress', phase: 'followers', read: 0, waitingSeconds: 60 });
  });

  it('depois de um 429 a trava é de 15 minutos', async () => {
    const { deps, finished, collector } = setup(queueFetch(json({}, 429), json({}, 429)));
    await collector.start();
    expect(await finished).toMatchObject({ ok: false, code: 'rate-limited' });
    expect(RATE_LIMIT_COOLDOWN_MS).toBe(15 * 60 * 1000);
    expect(deps.setCooldown).toHaveBeenLastCalledWith('42', NOW + RATE_LIMIT_COOLDOWN_MS);
  });

  it('depois da leitura gravada e avisada, baixa as fotos de quem não te segue', async () => {
    const order: string[] = [];
    const thumbs = {
      load: vi.fn(async () => ({})),
      specials: vi.fn(async () => ({})),
      encode: vi.fn(async () => 'data:x'),
      save: vi.fn(async () => { order.push('save'); }),
      progress: vi.fn(),
    };
    const image = () => new Response(new Blob(['img'], { type: 'image/jpeg' }), { status: 200 });
    const { finished, collector } = setup(queueFetch(...okResponses(), image(), image()), {
      thumbs,
      done: (result: CollectResult) => { order.push('done'); resolveFinished(result); },
    });
    let resolveFinished!: (result: CollectResult) => void;
    const done = new Promise<CollectResult>((resolve) => (resolveFinished = resolve));
    await collector.start();
    expect(await done).toEqual({ ok: true, viewerPk: '42' });
    await vi.waitFor(() => expect(collector.isRunning()).toBe(false));
    expect(order[0]).toBe('done');
    expect(thumbs.save).toHaveBeenLastCalledWith('42', { '1': { key: '1_1', data: 'data:x' }, '3': { key: '3_1', data: 'data:x' } });
    expect(thumbs.progress).toHaveBeenLastCalledWith(2, 2);
    void finished;
  });

  it('leitura que falhou não baixa fotos', async () => {
    const thumbs = { load: vi.fn(async () => ({})), specials: vi.fn(async () => ({})), encode: vi.fn(), save: vi.fn(), progress: vi.fn() };
    const { finished, collector } = setup(queueFetch(json({}, 429), json({}, 429)), { thumbs });
    await collector.start();
    await finished;
    await vi.waitFor(() => expect(collector.isRunning()).toBe(false));
    expect(thumbs.load).not.toHaveBeenCalled();
  });

  it('erro inesperado vira formato com detalhe', async () => {
    const { finished, collector } = setup(queueFetch(...okResponses()), {
      saveReading: vi.fn(async () => { throw new TypeError('boom'); }),
    });
    await collector.start();
    expect(await finished).toEqual({ ok: false, code: 'format', detail: 'TypeError: boom' });
  });
});
