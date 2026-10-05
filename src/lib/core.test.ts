// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchesQuery, nonFollowers, normalizeProfile, specialsView, splitVerified } from './core';
import { IgError } from './errors';
import type { Profile, Reading } from './types';

const p = (pk: string, username: string, fullName = ''): Profile => ({
  pk, username, fullName, picUrl: '', isVerified: false, isPrivate: false,
});

const reading = (following: Profile[], followerPks: string[]): Reading => ({
  at: 0, username: 'eu', following, followerPks,
});

describe('nonFollowers', () => {
  it('tira quem segue de volta e as especiais, mantendo a ordem', () => {
    const r = reading([p('1', 'ana'), p('2', 'bia'), p('3', 'caio'), p('4', 'davi')], ['2']);
    const specials = { '3': { username: 'caio', fullName: '', starredAt: 1 } };
    expect(nonFollowers(r, specials).map((x) => x.username)).toEqual(['ana', 'davi']);
  });

  it('sem seguindo, ninguém aparece', () => {
    expect(nonFollowers(reading([], ['1']), {})).toEqual([]);
  });

  it('sem seguidores, todo mundo que você segue aparece', () => {
    expect(nonFollowers(reading([p('1', 'ana'), p('2', 'bia')], []), {}).length).toBe(2);
  });
});

describe('splitVerified', () => {
  it('separa verificados e mantém a ordem dentro de cada grupo', () => {
    const v = (pk: string, username: string): Profile => ({ ...p(pk, username), isVerified: true });
    const { regular, verified } = splitVerified([v('1', 'nasa'), p('2', 'ana'), v('3', 'museu'), p('4', 'bia')]);
    expect(regular.map((x) => x.username)).toEqual(['ana', 'bia']);
    expect(verified.map((x) => x.username)).toEqual(['nasa', 'museu']);
  });

  it('lista vazia dá dois grupos vazios', () => {
    expect(splitVerified([])).toEqual({ regular: [], verified: [] });
  });
});

describe('specialsView', () => {
  it('ordena pela estrela mais recente e usa o @ atual da leitura', () => {
    const r = reading([p('1', 'ana_nova'), p('2', 'bia')], []);
    const rows = specialsView(r, {
      '1': { username: 'ana_velha', fullName: 'Ana', starredAt: 10 },
      '2': { username: 'bia', fullName: 'Bia', starredAt: 20 },
    });
    expect(rows.map((x) => x.username)).toEqual(['bia', 'ana_nova']);
    expect(rows.every((x) => !x.outsideFollowing)).toBe(true);
  });

  it('marca "fora de seguindo" quem não está mais na leitura', () => {
    const rows = specialsView(reading([], []), { '9': { username: 'zeca', fullName: 'Zeca', starredAt: 1 } });
    expect(rows).toEqual([expect.objectContaining({ pk: '9', username: 'zeca', fullName: 'Zeca', outsideFollowing: true })]);
  });

  it('sem leitura, nada fica "fora de seguindo"', () => {
    const rows = specialsView(null, { '9': { username: 'zeca', fullName: '', starredAt: 1 } });
    expect(rows[0].outsideFollowing).toBe(false);
  });
});

describe('normalizeProfile', () => {
  it('converte o formato da API', () => {
    expect(normalizeProfile({
      pk: 123, username: 'ana', full_name: 'Ana', profile_pic_url: 'https://x.fbcdn.net/a.jpg',
      is_verified: true, is_private: false, account_badges: [],
    })).toEqual({ pk: '123', username: 'ana', fullName: 'Ana', picUrl: 'https://x.fbcdn.net/a.jpg', isVerified: true, isPrivate: false });
  });

  it('guarda o id da foto e ignora a foto padrão do Instagram', () => {
    expect(normalizeProfile({ pk: '1', username: 'a', profile_pic_url: 'https://x.fbcdn.net/a.jpg', profile_pic_id: '123_1' }))
      .toMatchObject({ picUrl: 'https://x.fbcdn.net/a.jpg', picId: '123_1' });
    expect(normalizeProfile({ pk: '2', username: 'b', profile_pic_url: 'https://x.fbcdn.net/anon.jpg', has_anonymous_profile_picture: true }))
      .toMatchObject({ picUrl: '' });
  });

  it('campos opcionais ausentes viram padrão', () => {
    expect(normalizeProfile({ pk: '5', username: 'bia' })).toEqual({
      pk: '5', username: 'bia', fullName: '', picUrl: '', isVerified: false, isPrivate: false,
    });
  });

  it('sem pk ou username é formato inválido', () => {
    expect(() => normalizeProfile({ username: 'x' })).toThrow(IgError);
    expect(() => normalizeProfile({ pk: '1' })).toThrow(IgError);
    expect(() => normalizeProfile(null)).toThrow(IgError);
  });
});

describe('matchesQuery', () => {
  const vini = { username: 'vini.melo', fullName: 'Vinícius Melo' };

  it('ignora acento e caixa', () => {
    expect(matchesQuery(vini, 'VINICIUS')).toBe(true);
  });

  it('aceita @ no começo', () => {
    expect(matchesQuery(vini, '@vini.m')).toBe(true);
  });

  it('busca vazia acha tudo', () => {
    expect(matchesQuery(vini, '   ')).toBe(true);
  });

  it('não acha o que não está lá', () => {
    expect(matchesQuery(vini, 'ana')).toBe(false);
  });
});
