import type { ErrorCode } from './types';

export class IgError extends Error {
  readonly code: ErrorCode;
  readonly detail: string;

  constructor(code: ErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'IgError';
    this.code = code;
    this.detail = detail;
  }
}
