export interface Profile {
  pk: string;
  username: string;
  fullName: string;
  picUrl: string;
  /** Id estável da foto (muda só quando a pessoa troca de foto). */
  picId?: string;
  isVerified: boolean;
  isPrivate: boolean;
}

/** A última leitura de uma conta. `following` vem na ordem do Instagram (seguidos mais recentes primeiro). */
export interface Reading {
  at: number;
  username: string;
  following: Profile[];
  followerPks: string[];
}

export interface Special {
  username: string;
  fullName: string;
  starredAt: number;
}

export type Specials = Record<string, Special>;

export type ErrorCode =
  | 'not-instagram'
  | 'not-logged-in'
  | 'no-content-script'
  | 'busy'
  | 'cooldown'
  | 'rate-limited'
  | 'session'
  | 'format'
  | 'incomplete'
  | 'network'
  | 'interrupted';

export type StartResult = { ok: true } | { ok: false; code: ErrorCode };

export type CollectResult = { ok: true; viewerPk: string } | { ok: false; code: ErrorCode; detail?: string };

export interface ProgressMessage {
  type: 'progress';
  phase: 'following' | 'followers';
  read: number;
  waitingSeconds?: number;
}

export interface DoneMessage {
  type: 'done';
  result: CollectResult;
}

/** Fotos sendo baixadas depois da leitura; não trava o painel. */
export interface PhotosMessage {
  type: 'photos';
  done: number;
  total: number;
}

export type RuntimeMessage = ProgressMessage | DoneMessage | PhotosMessage;
