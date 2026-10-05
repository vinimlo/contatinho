import { describe, expect, it } from 'vitest';
import { activeTab, isInstagramUrl, openProfile, profileUrl, requestCollect, whoami } from './client';

describe('client', () => {
  it('reconhece só o www.instagram.com em https', () => {
    expect(isInstagramUrl('https://www.instagram.com/')).toBe(true);
    expect(isInstagramUrl('https://www.instagram.com/ana/')).toBe(true);
    expect(isInstagramUrl('https://instagram.com/')).toBe(false);
    expect(isInstagramUrl('https://example.com/?u=https://www.instagram.com/')).toBe(false);
    expect(isInstagramUrl(undefined)).toBe(false);
  });

  it('pega a aba ativa da janela do painel', async () => {
    expect(await activeTab()).toMatchObject({ id: 7 });
    expect(chromeMock.raw.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('whoami sem content script devolve null', async () => {
    chromeMock.raw.tabs.sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    expect(await whoami(7)).toBeNull();
  });

  it('whoami devolve a conta e se há leitura', async () => {
    chromeMock.raw.tabs.sendMessage.mockResolvedValue({ viewerPk: '1', running: true });
    expect(await whoami(7)).toEqual({ viewerPk: '1', running: true });
  });

  it('collect sem content script pede para recarregar a aba', async () => {
    chromeMock.raw.tabs.sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    expect(await requestCollect(7)).toEqual({ ok: false, code: 'no-content-script' });
  });

  it('collect com canal fechado no meio é leitura interrompida', async () => {
    chromeMock.raw.tabs.sendMessage.mockRejectedValue(new Error('The message port closed before a response was received.'));
    expect(await requestCollect(7)).toEqual({ ok: false, code: 'interrupted' });
  });

  it('abre o perfil na aba do Instagram', async () => {
    expect(profileUrl('ana.silva_')).toBe('https://www.instagram.com/ana.silva_/');
    await openProfile(7, 'ana.silva_');
    expect(chromeMock.raw.tabs.update).toHaveBeenCalledWith(7, { url: 'https://www.instagram.com/ana.silva_/' });
  });
});
