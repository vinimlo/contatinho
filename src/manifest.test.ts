// @vitest-environment node
import { describe, expect, it } from 'vitest';
import manifest from './manifest.config';

describe('manifest', () => {
  it('pede só o mínimo: painel, storage e o instagram.com', () => {
    const m = manifest as unknown as Record<string, unknown>;
    expect(m.permissions).toEqual(['sidePanel', 'storage']);
    expect(m.host_permissions).toEqual(['https://www.instagram.com/*']);
    expect(m.content_scripts).toEqual([
      expect.objectContaining({ matches: ['https://www.instagram.com/*'] }),
    ]);
    expect(m.minimum_chrome_version).toBe('116');
  });

  it('se chama Contatinho e tem ícones em todos os tamanhos', () => {
    const m = manifest as unknown as Record<string, any>;
    const icons = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
    expect(m.name).toBe('Contatinho');
    expect(m.icons).toEqual(icons);
    expect(m.action.default_icon).toEqual(icons);
    expect(m.action.default_title).toBe('Contatinho');
  });
});
