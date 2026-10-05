import { IgError } from './errors';
import type { Profile, Reading, Specials } from './types';

export interface SpecialRow extends Profile {
  outsideFollowing: boolean;
}

export function normalizeProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object') throw new IgError('format', 'perfil não é objeto');
  const u = raw as Record<string, unknown>;
  const pk = typeof u.pk === 'string' || typeof u.pk === 'number' ? String(u.pk) : '';
  if (!pk || typeof u.username !== 'string') throw new IgError('format', 'perfil sem pk ou username');
  // A silhueta padrão do Instagram diz menos que as iniciais: fica sem foto.
  const anonymous = u.has_anonymous_profile_picture === true;
  return {
    pk,
    username: u.username,
    fullName: typeof u.full_name === 'string' ? u.full_name : '',
    picUrl: !anonymous && typeof u.profile_pic_url === 'string' ? u.profile_pic_url : '',
    ...(typeof u.profile_pic_id === 'string' ? { picId: u.profile_pic_id } : {}),
    isVerified: u.is_verified === true,
    isPrivate: u.is_private === true,
  };
}

export function nonFollowers(reading: Reading, specials: Specials): Profile[] {
  const followers = new Set(reading.followerPks);
  return reading.following.filter((p) => !followers.has(p.pk) && !(p.pk in specials));
}

/** Verificados vão para o fim, em grupo próprio; a ordem do Instagram fica dentro de cada grupo. */
export function splitVerified(profiles: Profile[]): { regular: Profile[]; verified: Profile[] } {
  return {
    regular: profiles.filter((p) => !p.isVerified),
    verified: profiles.filter((p) => p.isVerified),
  };
}

export function specialsView(reading: Reading | null, specials: Specials): SpecialRow[] {
  const byPk = new Map((reading?.following ?? []).map((p) => [p.pk, p] as const));
  return Object.entries(specials)
    .sort(([, a], [, b]) => b.starredAt - a.starredAt)
    .map(([pk, s]) => {
      const p = byPk.get(pk);
      return {
        pk,
        username: p?.username ?? s.username,
        fullName: p?.fullName ?? s.fullName,
        picUrl: p?.picUrl ?? '',
        isVerified: p?.isVerified ?? false,
        isPrivate: p?.isPrivate ?? false,
        outsideFollowing: reading !== null && !p,
      };
    });
}

const fold = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matchesQuery(p: { username: string; fullName: string }, query: string): boolean {
  const needle = fold(query.trim().replace(/^@/, ''));
  return !needle || fold(p.username).includes(needle) || fold(p.fullName).includes(needle);
}
