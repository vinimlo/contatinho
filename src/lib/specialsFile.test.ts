// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSpecialsFile, mergeSpecials, parseSpecialsFile, specialsFileName } from './specialsFile';

const specials = { '10': { username: 'ana', fullName: 'Ana', starredAt: 5 } };

describe('arquivo de especiais', () => {
  it('ida e volta preserva tudo', () => {
    const file = buildSpecialsFile({ pk: '1', username: 'eu' }, specials);
    expect(file).toEqual({
      format: 'contatinho/specials',
      version: 1,
      account: { pk: '1', username: 'eu' },
      specials: [{ pk: '10', username: 'ana', fullName: 'Ana', starredAt: 5 }],
    });
    expect(parseSpecialsFile(JSON.stringify(file))).toEqual(file);
  });

  it('ainda importa arquivos exportados antes do nome Contatinho', () => {
    const legacy = { format: 'segue-de-volta/specials', version: 1, account: { pk: '1', username: 'eu' }, specials: [{ pk: '9', username: 'zeca' }] };
    expect(parseSpecialsFile(JSON.stringify(legacy)).specials).toEqual([{ pk: '9', username: 'zeca', fullName: '', starredAt: 0 }]);
  });

  it('recusa o que não é exportação nossa', () => {
    expect(() => parseSpecialsFile('não é json')).toThrow('Arquivo inválido: não é uma exportação de especiais do Contatinho.');
    expect(() => parseSpecialsFile('{"format":"outra-coisa","version":1}')).toThrow('Arquivo inválido');
    expect(() => parseSpecialsFile('[]')).toThrow('Arquivo inválido');
  });

  it('recusa versão desconhecida com mensagem própria', () => {
    expect(() => parseSpecialsFile('{"format":"contatinho/specials","version":2}')).toThrow('Versão de arquivo não suportada: 2.');
  });

  it('recusa item sem pk numérico', () => {
    const bad = { format: 'contatinho/specials', version: 1, account: { pk: '1', username: 'eu' }, specials: [{ pk: 'abc', username: 'x' }] };
    expect(() => parseSpecialsFile(JSON.stringify(bad))).toThrow('Arquivo inválido');
  });

  it('item sem nome ou data ganha padrão', () => {
    const file = { format: 'contatinho/specials', version: 1, account: { pk: '1', username: 'eu' }, specials: [{ pk: '9', username: 'zeca' }] };
    expect(parseSpecialsFile(JSON.stringify(file)).specials).toEqual([{ pk: '9', username: 'zeca', fullName: '', starredAt: 0 }]);
  });

  it('nome do arquivo usa a data local', () => {
    expect(specialsFileName('eu.mesmo', new Date(2026, 9, 5, 23, 59))).toBe('contatinho-especiais-eu.mesmo-2026-10-05.json');
  });

  it('juntar só soma e conta o que já existia', () => {
    const { merged, added, existing } = mergeSpecials(specials, [
      { pk: '10', username: 'ana', fullName: 'Ana (outra data)', starredAt: 99 },
      { pk: '11', username: 'bia', fullName: 'Bia', starredAt: 7 },
    ]);
    expect(added).toBe(1);
    expect(existing).toBe(1);
    expect(merged['10']).toEqual(specials['10']);
    expect(merged['11']).toEqual({ username: 'bia', fullName: 'Bia', starredAt: 7 });
  });
});
