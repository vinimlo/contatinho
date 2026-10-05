import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountKey, LAST_VIEWER_KEY } from '../lib/storage';
import type { Profile, Reading } from '../lib/types';
import App from './App.svelte';

const p = (pk: string, username: string): Profile => ({ pk, username, fullName: '', picUrl: '', isVerified: false, isPrivate: false });

function seedReading() {
  const reading: Reading = {
    at: Date.now() - 2 * 3_600_000,
    username: 'eu',
    following: [p('10', 'ana'), p('11', 'bia'), p('12', 'caio')],
    followerPks: ['11'],
  };
  chromeMock.store[accountKey('1', 'lastReading')] = reading;
  chromeMock.store[LAST_VIEWER_KEY] = '1';
}

function onTab(url: string) {
  chromeMock.raw.tabs.query.mockResolvedValue([{ id: 7, url }]);
}

beforeEach(() => {
  seedReading();
  onTab('https://www.instagram.com/');
  chromeMock.raw.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) =>
    message.type === 'whoami' ? { viewerPk: '1', running: false } : { ok: true },
  );
});

describe('App', () => {
  it('mostra quem não te segue a partir da última leitura, sem ler de novo', async () => {
    render(App);
    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('@caio')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Contatinho' })).toBeInTheDocument();
    expect(screen.queryByText('@bia')).not.toBeInTheDocument();
    expect(screen.getByText(/Lido há 2 h: 3 seguindo e 1 seguidor\.$/)).toBeInTheDocument();
    expect(chromeMock.raw.tabs.sendMessage).not.toHaveBeenCalledWith(7, { type: 'collect' });
  });

  it('clicar na linha abre o perfil na aba do Instagram e marca como vista', async () => {
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: 'Abrir perfil de @ana' }));
    expect(chromeMock.raw.tabs.update).toHaveBeenCalledWith(7, { url: 'https://www.instagram.com/ana/' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir perfil de @ana' }).closest('li')).toHaveClass('seen'));
    expect(screen.getByText('1 vista')).toBeInTheDocument();
  });

  it('a estrela leva a conta para Especiais', async () => {
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: 'Marcar @ana como especial' }));
    await waitFor(() => expect(screen.queryByText('@ana')).not.toBeInTheDocument());
    await fireEvent.click(screen.getByRole('tab', { name: /Especiais/ }));
    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tirar @ana das especiais' })).toBeInTheDocument();
  });

  it('durante a leitura as linhas ficam desativadas e o progresso aparece', async () => {
    render(App, { pollMs: 60_000 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    expect(chromeMock.raw.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'collect' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir perfil de @ana' })).toBeDisabled());
    chromeMock.emitRuntimeMessage({ type: 'progress', phase: 'followers', read: 25 });
    expect(await screen.findByText(/Lendo seguidores: 25/)).toBeInTheDocument();
  });

  it('ignora mensagens de outra aba', async () => {
    render(App, { pollMs: 60_000 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    chromeMock.emitRuntimeMessage({ type: 'progress', phase: 'followers', read: 999 }, { tab: { id: 9 } });
    chromeMock.emitRuntimeMessage({ type: 'done', result: { ok: false, code: 'session' } }, { tab: { id: 9 } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro ao fim da leitura aparece no aviso', async () => {
    render(App, { pollMs: 60_000 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    chromeMock.emitRuntimeMessage({ type: 'done', result: { ok: false, code: 'rate-limited' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('O Instagram pediu uma pausa');
  });

  it('fora do instagram.com pede para abrir, não deixa ler e mostra a última leitura', async () => {
    onTab('https://example.com/');
    render(App);
    expect(await screen.findByRole('alert')).toHaveTextContent('Abra o instagram.com');
    expect(screen.getByRole('button', { name: 'Ler agora' })).toBeDisabled();
    expect(await screen.findByText('@ana')).toBeInTheDocument();
  });

  it('ao trocar para a aba do Instagram, o painel se atualiza', async () => {
    onTab('https://example.com/');
    render(App);
    await screen.findByRole('alert');
    onTab('https://www.instagram.com/');
    chromeMock.emitTabActivated(7);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Ler agora' })).toBeEnabled();
  });

  it('aba recarregada no meio da leitura vira "leitura interrompida"', async () => {
    render(App, { pollMs: 20, graceMs: 10 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Leitura interrompida');
  });

  it('depois de "leitura interrompida" por aba fechada, o painel passa para a aba ativa', async () => {
    render(App, { pollMs: 20, graceMs: 10 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    chromeMock.raw.tabs.query.mockResolvedValue([{ id: 8, url: 'https://www.instagram.com/' }]);
    chromeMock.raw.tabs.sendMessage.mockImplementation(async (tabId: number, message: { type: string }) => {
      if (tabId === 7) throw new Error('Could not establish connection. Receiving end does not exist.');
      return message.type === 'whoami' ? { viewerPk: '1', running: false } : { ok: true };
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Leitura interrompida');
    await fireEvent.click(screen.getByRole('button', { name: 'Ler agora' }));
    expect(chromeMock.raw.tabs.sendMessage).toHaveBeenCalledWith(8, { type: 'collect' });
  });

  it('depois do fim da leitura, as linhas abrem na aba ativa', async () => {
    render(App, { pollMs: 60_000 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    chromeMock.raw.tabs.query.mockResolvedValue([{ id: 8, url: 'https://www.instagram.com/' }]);
    chromeMock.emitRuntimeMessage({ type: 'done', result: { ok: true, viewerPk: '1' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir perfil de @ana' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Abrir perfil de @ana' }));
    await waitFor(() => expect(chromeMock.raw.tabs.update).toHaveBeenCalledWith(8, { url: 'https://www.instagram.com/ana/' }));
  });

  it('linha com a aba já fechada não quebra e o painel se reencontra', async () => {
    render(App);
    const row = await screen.findByRole('button', { name: 'Abrir perfil de @ana' });
    chromeMock.raw.tabs.update.mockRejectedValueOnce(new Error('No tab with id: 7.'));
    chromeMock.raw.tabs.query.mockResolvedValue([{ id: 8, url: 'https://www.instagram.com/' }]);
    await fireEvent.click(row);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fireEvent.click(screen.getByRole('button', { name: 'Abrir perfil de @ana' }));
    await waitFor(() => expect(chromeMock.raw.tabs.update).toHaveBeenLastCalledWith(8, { url: 'https://www.instagram.com/ana/' }));
  });

  it('fora do instagram.com, a linha abre o perfil numa aba nova e não troca o site atual', async () => {
    onTab('https://mail.google.com/');
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: 'Abrir perfil de @ana' }));
    expect(chromeMock.raw.tabs.create).toHaveBeenCalledWith({ url: 'https://www.instagram.com/ana/' });
    expect(chromeMock.raw.tabs.update).not.toHaveBeenCalled();
  });

  it('o botão "Abrir o instagram.com" abre aba nova', async () => {
    onTab('https://mail.google.com/');
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: 'Abrir o instagram.com' }));
    expect(chromeMock.raw.tabs.create).toHaveBeenCalledWith({ url: 'https://www.instagram.com/' });
    expect(chromeMock.raw.tabs.update).not.toHaveBeenCalled();
  });

  it('se a leitura "interrompida" ainda termina bem, o aviso some', async () => {
    render(App, { pollMs: 20, graceMs: 10 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ler agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Leitura interrompida');
    chromeMock.emitRuntimeMessage({ type: 'done', result: { ok: true, viewerPk: '1' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('tirar a estrela em Especiais pode ser desfeito, com a data original', async () => {
    chromeMock.store[accountKey('1', 'specials')] = { '11': { username: 'bia', fullName: '', starredAt: 5 } };
    render(App);
    await fireEvent.click(await screen.findByRole('tab', { name: /Especiais/ }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Tirar @bia das especiais' }));
    await waitFor(() => expect(screen.queryByText('@bia')).not.toBeInTheDocument());
    expect(screen.getByText(/Tirou @bia das especiais/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('@bia')).toBeInTheDocument();
    expect(chromeMock.store[accountKey('1', 'specials')]).toEqual({ '11': { username: 'bia', fullName: '', starredAt: 5 } });
  });

  it('Importar é um botão alcançável pelo teclado que abre o seletor de arquivo', async () => {
    render(App);
    await fireEvent.click(await screen.findByRole('tab', { name: /Especiais/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const pick = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    await fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    expect(pick).toHaveBeenCalledOnce();
  });

  it('as abas controlam um painel com o nome da aba', async () => {
    render(App);
    expect(await screen.findByRole('tabpanel', { name: /Não te seguem/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('tab', { name: /Especiais/ }));
    expect(screen.getByRole('tabpanel', { name: /Especiais/ })).toBeInTheDocument();
  });

  it('verificados ficam no fim, numa tira própria com título', async () => {
    const v = (pk: string, username: string): Profile => ({ ...p(pk, username), isVerified: true });
    chromeMock.store[accountKey('1', 'lastReading')] = {
      at: Date.now(), username: 'eu', following: [v('20', 'nasa'), p('10', 'ana'), v('21', 'museu'), p('12', 'caio')], followerPks: [],
    };
    render(App);
    await screen.findByText('@ana');
    const order = screen.getAllByRole('button', { name: /^Abrir perfil de/ }).map((b) => b.getAttribute('aria-label'));
    expect(order).toEqual(['Abrir perfil de @ana', 'Abrir perfil de @caio', 'Abrir perfil de @nasa, verificado', 'Abrir perfil de @museu, verificado']);
    expect(screen.getByRole('heading', { name: 'Verificados 2' })).toBeInTheDocument();
    const frameOf = (handle: string) => screen.getByText(handle).closest('li')!.querySelector('.frame')!.textContent!.trim();
    expect([frameOf('@ana'), frameOf('@caio'), frameOf('@nasa'), frameOf('@museu')]).toEqual(['1', '2', '1', '2']);
  });

  it('o número do quadro não muda na busca', async () => {
    render(App);
    await screen.findByText('@caio');
    const frameOf = (handle: string) => screen.getByText(handle).closest('li')!.querySelector('.frame')!.textContent!.trim();
    expect(frameOf('@caio')).toBe('2');
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'caio' } });
    await waitFor(() => expect(screen.queryByText('@ana')).not.toBeInTheDocument());
    expect(frameOf('@caio')).toBe('2');
  });

  it('estrelar traça o círculo de lápis antes de a conta ir para Especiais', async () => {
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: 'Marcar @ana como especial' }));
    expect(screen.getByText('@ana').closest('li')!.querySelector('.circle.drawing')).not.toBeNull();
    expect(chromeMock.store[accountKey('1', 'specials')]).toBeUndefined();
    await waitFor(() => expect(screen.queryByText('@ana')).not.toBeInTheDocument());
    expect(chromeMock.store[accountKey('1', 'specials')]).toMatchObject({ '10': { username: 'ana' } });
  });

  it('dois cliques na estrela durante o traço não desfazem a marcação', async () => {
    render(App);
    const starButton = await screen.findByRole('button', { name: 'Marcar @ana como especial' });
    await fireEvent.click(starButton);
    await fireEvent.click(starButton);
    await waitFor(() => expect(screen.queryByText('@ana')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(chromeMock.store[accountKey('1', 'specials')]).toMatchObject({ '10': { username: 'ana' } });
  });

  it('com movimento reduzido, a estrela age na hora', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      render(App);
      await fireEvent.click(await screen.findByRole('button', { name: 'Marcar @ana como especial' }));
      await waitFor(() => expect(chromeMock.store[accountKey('1', 'specials')]).toBeDefined(), { timeout: 150 });
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('baixar as fotos mostra o progresso e não trava a lista', async () => {
    render(App, { pollMs: 60_000 });
    await screen.findByText('@ana');
    chromeMock.emitRuntimeMessage({ type: 'photos', done: 3, total: 10 });
    expect(await screen.findByText('Baixando fotos: 3 de 10.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir perfil de @ana' })).toBeEnabled();
    chromeMock.emitRuntimeMessage({ type: 'photos', done: 10, total: 10 });
    await waitFor(() => expect(screen.queryByText(/Baixando fotos/)).not.toBeInTheDocument());
  });

  it('a linha usa a miniatura guardada da conta', async () => {
    chromeMock.store[accountKey('1', 'thumbs')] = { '10': { key: 'x', data: 'data:image/webp;base64,ANA' } };
    render(App);
    await screen.findByText('@ana');
    expect(screen.getByText('@ana').closest('li')!.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,ANA');
  });

  it('a trava aparece no botão', async () => {
    chromeMock.store[accountKey('1', 'cooldownUntil')] = Date.now() + 120_000;
    render(App);
    expect(await screen.findByRole('button', { name: /Ler de novo em [12]:\d\d/ })).toBeDisabled();
  });
});
