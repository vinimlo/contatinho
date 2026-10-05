import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Row from './Row.svelte';

const profile = { pk: '1', username: 'ana', fullName: 'Ana Souza', picUrl: 'https://x.fbcdn.net/a.jpg', isVerified: true, isPrivate: false };

describe('Row', () => {
  it('usa a miniatura guardada antes da URL do Instagram', () => {
    const { container } = render(Row, { profile, thumb: 'data:image/webp;base64,AAA', starred: false, onopen: vi.fn(), onstar: vi.fn() });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,AAA');
  });

  it('foto vencida vira iniciais', async () => {
    const { container } = render(Row, { profile, starred: false, onopen: vi.fn(), onstar: vi.fn() });
    await fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('iniciais ignoram emoji e nunca cortam caractere', () => {
    const { container } = render(Row, { profile: { ...profile, fullName: '🌸 Ana Souza', picUrl: '' }, starred: false, onopen: vi.fn(), onstar: vi.fn() });
    expect(container.querySelector('.initials')?.textContent).toBe('AS');
  });

  it('nome só de emoji usa as iniciais do @', () => {
    const { container } = render(Row, { profile: { ...profile, fullName: '🌸🌸', picUrl: '' }, starred: false, onopen: vi.fn(), onstar: vi.fn() });
    expect(container.querySelector('.initials')?.textContent).toBe('A');
  });

  it('o rótulo da linha diz nome, selos e nota para o leitor de tela', () => {
    render(Row, { profile: { ...profile, isPrivate: true }, starred: true, note: 'fora de seguindo', onopen: vi.fn(), onstar: vi.fn() });
    expect(screen.getByRole('button', { name: 'Abrir perfil de @ana, Ana Souza, verificado, privado, fora de seguindo' })).toBeInTheDocument();
  });

  it('mostra o número do quadro e risca a lápis quando já foi vista', () => {
    const { container } = render(Row, { profile, starred: false, frame: 12, seen: true, onopen: vi.fn(), onstar: vi.fn() });
    expect(container.querySelector('.frame')?.textContent?.trim()).toBe('12');
    expect(container.querySelector('.frame .slash')).not.toBeNull();
  });

  it('marcação em andamento traça o círculo de lápis em volta da foto', () => {
    const { container } = render(Row, { profile, starred: false, marking: true, onopen: vi.fn(), onstar: vi.fn() });
    expect(container.querySelector('.photo .circle.drawing')).not.toBeNull();
  });

  it('especial mostra o círculo pronto, sem animar', () => {
    const { container } = render(Row, { profile, starred: true, onopen: vi.fn(), onstar: vi.fn() });
    expect(container.querySelector('.photo .circle')).not.toBeNull();
    expect(container.querySelector('.circle.drawing')).toBeNull();
  });

  it('abre e estrela por botões separados', async () => {
    const onopen = vi.fn();
    const onstar = vi.fn();
    render(Row, { profile, starred: false, onopen, onstar });
    await fireEvent.click(screen.getByRole('button', { name: 'Abrir perfil de @ana, Ana Souza, verificado' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Marcar @ana como especial' }));
    expect(onopen).toHaveBeenCalledOnce();
    expect(onstar).toHaveBeenCalledOnce();
  });
});
