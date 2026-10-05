import '@testing-library/jest-dom/vitest';
import '@testing-library/svelte/vitest';
import { beforeEach } from 'vitest';
import { installChromeMock, type ChromeMock } from './chrome';

declare global {
  var chromeMock: ChromeMock;
}

beforeEach(() => {
  globalThis.chromeMock = installChromeMock();
});
