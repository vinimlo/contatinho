import { describe, expect, it } from 'vitest';
import {
  accountKey, getCooldown, getLastViewerPk, importSpecials, LAST_VIEWER_KEY, loadAccount, loadThumbs, markSeen,
  saveReading, saveThumbs, setCooldown, toggleSpecial,
} from './storage';
import { buildSpecialsFile } from './specialsFile';
import type { Reading } from './types';

const reading: Reading = { at: 1, username: 'eu', following: [], followerPks: ['2'] };
const ana = { pk: '10', username: 'ana', fullName: 'Ana' };

describe('storage', () => {
  it('conta sem dados devolve padrões', async () => {
    expect(await loadAccount('1')).toEqual({ reading: null, specials: {}, seen: [], cooldownUntil: 0, thumbs: {} });
    expect(await getLastViewerPk()).toBeNull();
  });

  it('gravar leitura zera as vistas e lembra a conta', async () => {
    await markSeen('1', '10');
    await saveReading('1', reading);
    expect(await loadAccount('1')).toMatchObject({ reading, seen: [] });
    expect(chromeMock.store[LAST_VIEWER_KEY]).toBe('1');
    expect(await getLastViewerPk()).toBe('1');
  });

  it('cada conta tem os próprios dados', async () => {
    await saveReading('1', reading);
    await toggleSpecial('2', ana, 5);
    expect((await loadAccount('2')).reading).toBeNull();
    expect((await loadAccount('1')).specials).toEqual({});
    expect(Object.keys(chromeMock.store)).toContain(accountKey('2', 'specials'));
  });

  it('estrela liga e desliga', async () => {
    expect(await toggleSpecial('1', ana, 5)).toBe(true);
    expect((await loadAccount('1')).specials).toEqual({ '10': { username: 'ana', fullName: 'Ana', starredAt: 5 } });
    expect(await toggleSpecial('1', ana, 6)).toBe(false);
    expect((await loadAccount('1')).specials).toEqual({});
  });

  it('cliques rápidos na estrela não se atropelam', async () => {
    const bia = { pk: '11', username: 'bia', fullName: '' };
    await Promise.all([toggleSpecial('1', ana, 1), toggleSpecial('1', bia, 2)]);
    expect(Object.keys((await loadAccount('1')).specials).sort()).toEqual(['10', '11']);
  });

  it('vista não repete', async () => {
    await markSeen('1', '10');
    await markSeen('1', '10');
    expect((await loadAccount('1')).seen).toEqual(['10']);
  });

  it('miniaturas ficam por conta', async () => {
    const thumbs = { '10': { key: '10_1', data: 'data:image/webp;base64,AAA' } };
    await saveThumbs('1', thumbs);
    expect(await loadThumbs('1')).toEqual(thumbs);
    expect((await loadAccount('1')).thumbs).toEqual(thumbs);
    expect(await loadThumbs('2')).toEqual({});
  });

  it('trava guarda o instante', async () => {
    await setCooldown('1', 12345);
    expect(await getCooldown('1')).toBe(12345);
    expect(await getCooldown('2')).toBe(0);
  });

  it('importar soma às especiais da conta ativa', async () => {
    await toggleSpecial('1', ana, 5);
    const file = buildSpecialsFile({ pk: '99', username: 'outra' }, {
      '10': { username: 'ana', fullName: 'Ana', starredAt: 1 },
      '12': { username: 'caio', fullName: 'Caio', starredAt: 2 },
    });
    expect(await importSpecials('1', file)).toEqual({ added: 1, existing: 1 });
    expect(Object.keys((await loadAccount('1')).specials).sort()).toEqual(['10', '12']);
  });
});
