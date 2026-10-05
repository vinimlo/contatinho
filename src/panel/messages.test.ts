// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { countLabel, errorMessage, formatCount, formatCountdown, relativeTime } from './messages';

describe('messages', () => {
  it('lista incompleta mostra o detalhe', () => {
    expect(errorMessage('incomplete', 'seguidores, 300 lidos')).toBe(
      'A lista veio incompleta (seguidores, 300 lidos). Nada foi gravado; tente de novo mais tarde.',
    );
  });

  it('todo código tem texto', () => {
    for (const code of ['not-instagram', 'not-logged-in', 'no-content-script', 'busy', 'cooldown', 'rate-limited', 'session', 'format', 'network', 'interrupted'] as const) {
      expect(errorMessage(code).length).toBeGreaterThan(10);
    }
  });

  it('tempo relativo', () => {
    const now = 10_000_000_000;
    expect(relativeTime(now - 30_000, now)).toBe('agora');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('há 5 min');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('há 2 h');
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe('há 1 dia');
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('há 3 dias');
  });

  it('números no formato brasileiro', () => {
    expect(formatCount(7)).toBe('7');
    expect(formatCount(1090)).toBe('1.090');
    expect(formatCount(1234567)).toBe('1.234.567');
  });

  it('singular e plural', () => {
    expect(countLabel(1, 'seguidor', 'seguidores')).toBe('1 seguidor');
    expect(countLabel(0, 'vista', 'vistas')).toBe('0 vistas');
    expect(countLabel(1297, 'seguidor', 'seguidores')).toBe('1.297 seguidores');
  });

  it('contagem regressiva', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(64_500)).toBe('1:05');
    expect(formatCountdown(1)).toBe('0:01');
  });
});
