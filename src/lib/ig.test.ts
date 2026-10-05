// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { igUser, html, json, queueFetch } from '../test/fixtures';
import { IgError } from './errors';
import { igGet, igImage, pauseMs, readFollowers, readFollowing, readViewerUsername, RETRY_WAIT_MS, type IgDeps } from './ig';

function deps(fetch: IgDeps['fetch']): IgDeps & { sleep: ReturnType<typeof vi.fn> } {
  return { fetch, sleep: vi.fn(async () => undefined), random: () => 0.5 };
}
const cb = () => ({ onPage: vi.fn(), onWait: vi.fn() });

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof IgError) return error.code;
    throw error;
  }
  throw new Error('esperava erro');
}

describe('igGet', () => {
  it('faz GET same-origin com os cabeçalhos do web app', async () => {
    const fetch = queueFetch(json({ form_data: { username: 'eu' } }));
    await igGet(deps(fetch), '/api/v1/accounts/edit/web_form_data/');
    expect(fetch).toHaveBeenCalledWith('/api/v1/accounts/edit/web_form_data/', {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest' },
    });
  });

  it('recusa rota fora da lista antes de chamar a rede', async () => {
    const fetch = queueFetch();
    await expect(igGet(deps(fetch), '/api/v1/friendships/destroy/123/')).rejects.toThrow(/rota fora da lista/);
    await expect(igGet(deps(fetch), '/api/v1/users/123/info/')).rejects.toThrow(/rota fora da lista/);
    await expect(igGet(deps(fetch), '/api/v1/friendships/abc/following/')).rejects.toThrow(/rota fora da lista/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('429 espera 60 s, avisa e tenta uma vez', async () => {
    const d = deps(queueFetch(json({ message: 'Please wait a few minutes before you try again.' }, 429), json({ ok: 1 })));
    const onWait = vi.fn();
    await expect(igGet(d, '/api/v1/accounts/edit/web_form_data/', {}, onWait)).resolves.toEqual({ ok: 1 });
    expect(onWait).toHaveBeenCalledWith(60);
    expect(d.sleep).toHaveBeenCalledWith(RETRY_WAIT_MS);
  });

  it('dois 429 seguidos param a leitura', async () => {
    const d = deps(queueFetch(json({}, 429), html(429)));
    expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('rate-limited');
  });

  it('"wait a few minutes" com status de erro conta como 429', async () => {
    const d = deps(queueFetch(
      json({ message: 'Please wait a few minutes before you try again.', status: 'fail' }, 400),
      json({ message: 'Please wait a few minutes before you try again.', status: 'fail' }, 400),
    ));
    expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('rate-limited');
  });

  it('HTML com 200 é sessão expirada ou verificação', async () => {
    expect(await codeOf(igGet(deps(queueFetch(html(200))), '/api/v1/accounts/edit/web_form_data/'))).toBe('session');
  });

  it('401 é sessão', async () => {
    const d = deps(queueFetch(json({ message: 'login_required', status: 'fail' }, 401)));
    expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('session');
  });

  it('checkpoint, challenge ou login exigido com 400 é sessão, não rede', async () => {
    for (const message of ['checkpoint_required', 'challenge_required', 'login_required']) {
      const d = deps(queueFetch(json({ message, status: 'fail' }, 400)));
      expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('session');
    }
  });

  it('require_login com status de erro é sessão', async () => {
    const d = deps(queueFetch(json({ require_login: true, status: 'fail' }, 400)));
    expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('session');
  });

  it('outro 400 continua sendo rede', async () => {
    const d = deps(queueFetch(json({ message: 'outra coisa', status: 'fail' }, 400)));
    expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('network');
  });

  it('JSON quebrado é formato', async () => {
    const broken = new Response('{"users": [', { status: 200, headers: { 'content-type': 'application/json' } });
    expect(await codeOf(igGet(deps(queueFetch(broken)), '/api/v1/accounts/edit/web_form_data/'))).toBe('format');
  });

  it('falha de rede vira network', async () => {
    const d = deps(vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await codeOf(igGet(d, '/api/v1/accounts/edit/web_form_data/'))).toBe('network');
  });
});

describe('igImage', () => {
  it('baixa a foto do CDN com GET, sem cookies', async () => {
    const fetch = vi.fn(async () => new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 }));
    const url = 'https://instagram.fssa2-1.fna.fbcdn.net/v/t51/1.jpg?oh=1';
    expect((await igImage(deps(fetch), url)).size).toBe(1);
    expect(fetch).toHaveBeenCalledWith(url, { method: 'GET', credentials: 'omit', mode: 'cors' });
  });

  it('recusa host fora do CDN de imagens do Instagram', async () => {
    const fetch = queueFetch();
    for (const url of [
      'https://evil.example/a.jpg',
      'http://x.fbcdn.net/a.jpg',
      'https://fbcdn.net.evil.example/a.jpg',
      'https://www.instagram.com/api/v1/friendships/destroy/1/',
      'nao é url',
    ]) {
      await expect(igImage(deps(fetch), url)).rejects.toThrow(/fora da lista/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resposta de erro vira rede', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 404 }));
    expect(await codeOf(igImage(deps(fetch), 'https://scontent.cdninstagram.com/a.jpg'))).toBe('network');
  });
});

describe('readViewerUsername', () => {
  it('lê o @ do formulário de edição', async () => {
    expect(await readViewerUsername(deps(queueFetch(json({ form_data: { username: 'eu' } }))))).toBe('eu');
  });

  it('sem username é formato', async () => {
    expect(await codeOf(readViewerUsername(deps(queueFetch(json({ form_data: {} })))))).toBe('format');
  });
});

describe('readFollowing', () => {
  it('pede ordenado por data e aceita a lista inteira numa página', async () => {
    const fetch = queueFetch(json({ users: [igUser(1), igUser(2)], has_more: false, page_size: 200, status: 'ok' }));
    const c = cb();
    const list = await readFollowing(deps(fetch), '42', c);
    expect(list.map((p) => p.pk)).toEqual(['1', '2']);
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/friendships/42/following/?count=200&order=date_followed_latest');
    expect(c.onPage).toHaveBeenLastCalledWith(2);
  });
});

describe('readFollowers', () => {
  it('pagina pelo cursor com pausa de 1 a 2 s', async () => {
    const fetch = queueFetch(
      json({ users: [igUser(1), igUser(2)], next_max_id: 'QVFE1', has_more: true }),
      json({ users: [igUser(3)], next_max_id: 'QVFE2', has_more: true }),
      json({ users: [igUser(4)], has_more: false }),
    );
    const d = deps(fetch);
    const list = await readFollowers(d, '42', cb());
    expect(list.map((p) => p.pk)).toEqual(['1', '2', '3', '4']);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/friendships/42/followers/?count=200&search_surface=follow_list_page',
      '/api/v1/friendships/42/followers/?count=200&search_surface=follow_list_page&max_id=QVFE1',
      '/api/v1/friendships/42/followers/?count=200&search_surface=follow_list_page&max_id=QVFE2',
    ]);
    expect(d.sleep).toHaveBeenCalledTimes(2);
    for (const [ms] of d.sleep.mock.calls) {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThan(2000);
    }
  });

  it('pk repetido entre páginas conta uma vez', async () => {
    const fetch = queueFetch(
      json({ users: [igUser(1), igUser(2)], next_max_id: 'A', has_more: true }),
      json({ users: [igUser(2), igUser(3)], has_more: false }),
    );
    expect((await readFollowers(deps(fetch), '42', cb())).map((p) => p.pk)).toEqual(['1', '2', '3']);
  });

  it('página vazia com cursor é lista incompleta', async () => {
    const fetch = queueFetch(
      json({ users: [igUser(1)], next_max_id: 'A', has_more: true }),
      json({ users: [], next_max_id: 'B', has_more: true }),
    );
    const error = await readFollowers(deps(fetch), '42', cb()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IgError);
    expect((error as IgError).code).toBe('incomplete');
    expect((error as IgError).detail).toBe('seguidores, 1 lidos');
  });

  it('cursor repetido é lista incompleta', async () => {
    const fetch = queueFetch(
      json({ users: [igUser(1)], next_max_id: 'A', has_more: true }),
      json({ users: [igUser(2)], next_max_id: 'A', has_more: true }),
    );
    expect(await codeOf(readFollowers(deps(fetch), '42', cb()))).toBe('incomplete');
  });

  it('has_more sem cursor é lista incompleta', async () => {
    const fetch = queueFetch(json({ users: [igUser(1)], has_more: true }));
    expect(await codeOf(readFollowers(deps(fetch), '42', cb()))).toBe('incomplete');
  });

  it('fim sem has_more falso é lista incompleta', async () => {
    const fetch = queueFetch(json({ users: [igUser(1)] }));
    expect(await codeOf(readFollowers(deps(fetch), '42', cb()))).toBe('incomplete');
  });

  it('resposta sem users é formato', async () => {
    expect(await codeOf(readFollowers(deps(queueFetch(json({ status: 'ok' }))), '42', cb()))).toBe('format');
  });
});

describe('pauseMs', () => {
  it('fica entre 1000 e 1999 ms', () => {
    expect(pauseMs({ random: () => 0 })).toBe(1000);
    expect(pauseMs({ random: () => 0.9999 })).toBe(1999);
  });
});

describe('só leitura por construção', () => {
  it('nenhum arquivo de src fora do ig.ts abre canal de rede', () => {
    const sources = import.meta.glob('/src/**/*.{ts,svelte}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts') && !path.startsWith('/src/test/') && path !== '/src/lib/ig.ts')
      .filter(([, code]) => /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/.test(code))
      .map(([path]) => path);
    expect(Object.keys(sources)).toContain('/src/lib/ig.ts');
    expect(offenders).toEqual([]);
  });
});
