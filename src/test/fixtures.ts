import { vi } from 'vitest';

/** Um perfil no formato de /api/v1/friendships/.../following|followers/ (dados fictícios). */
export function igUser(pk: number, username = `perfil${pk}`) {
  return {
    pk: String(pk),
    pk_id: String(pk),
    id: String(pk),
    strong_id__: String(pk),
    fbid_v2: `1784${pk}`,
    username,
    full_name: `Perfil ${pk}`,
    profile_pic_url: `https://instagram.fxxx1-1.fna.fbcdn.net/v/t51/${pk}.jpg`,
    profile_pic_id: `${pk}_1`,
    is_private: false,
    is_verified: false,
    is_favorite: false,
    has_anonymous_profile_picture: false,
    latest_reel_media: 0,
    third_party_downloads_enabled: 0,
    account_badges: [],
  };
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export const html = (status = 200): Response =>
  new Response('<!DOCTYPE html><html><body>login</body></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

/** Um fetch falso que devolve as respostas na ordem e falha se pedirem uma a mais. */
export function queueFetch(...responses: Response[]) {
  return vi.fn(async (_input: string, _init: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('queueFetch: requisição a mais');
    return next;
  });
}
