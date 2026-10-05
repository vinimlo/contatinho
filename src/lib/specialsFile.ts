import type { Special, Specials } from './types';

export const SPECIALS_FORMAT = 'contatinho/specials';
/** Exportações feitas antes do nome Contatinho continuam valendo. */
const LEGACY_FORMATS = ['segue-de-volta/specials'];

export interface SpecialsFileEntry extends Special {
  pk: string;
}

export interface SpecialsFile {
  format: typeof SPECIALS_FORMAT;
  version: 1;
  account: { pk: string; username: string };
  specials: SpecialsFileEntry[];
}

const INVALID = 'Arquivo inválido: não é uma exportação de especiais do Contatinho.';
const isPk = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);

export function buildSpecialsFile(account: { pk: string; username: string }, specials: Specials): SpecialsFile {
  return {
    format: SPECIALS_FORMAT,
    version: 1,
    account,
    specials: Object.entries(specials).map(([pk, s]) => ({ pk, username: s.username, fullName: s.fullName, starredAt: s.starredAt })),
  };
}

export function parseSpecialsFile(text: string): SpecialsFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(INVALID);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(INVALID);
  const file = raw as Record<string, unknown>;
  if (file.format !== SPECIALS_FORMAT && !LEGACY_FORMATS.includes(String(file.format))) throw new Error(INVALID);
  if (file.version !== 1) throw new Error(`Versão de arquivo não suportada: ${String(file.version)}.`);
  const account = file.account as Record<string, unknown> | undefined;
  if (!account || !isPk(account.pk) || typeof account.username !== 'string' || !Array.isArray(file.specials)) {
    throw new Error(INVALID);
  }
  const specials = file.specials.map((item: unknown): SpecialsFileEntry => {
    const s = item as Record<string, unknown> | null;
    if (!s || !isPk(s.pk) || typeof s.username !== 'string') throw new Error(INVALID);
    return {
      pk: s.pk,
      username: s.username,
      fullName: typeof s.fullName === 'string' ? s.fullName : '',
      starredAt: typeof s.starredAt === 'number' ? s.starredAt : 0,
    };
  });
  return { format: SPECIALS_FORMAT, version: 1, account: { pk: account.pk, username: account.username }, specials };
}

export function specialsFileName(username: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `contatinho-especiais-${username}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function mergeSpecials(
  current: Specials,
  incoming: SpecialsFileEntry[],
): { merged: Specials; added: number; existing: number } {
  const merged: Specials = { ...current };
  let added = 0;
  let existing = 0;
  for (const { pk, ...special } of incoming) {
    if (pk in merged) {
      existing++;
    } else {
      merged[pk] = special;
      added++;
    }
  }
  return { merged, added, existing };
}
