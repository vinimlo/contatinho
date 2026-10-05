import type { ErrorCode } from '../lib/types';

const MESSAGES: Record<ErrorCode, string> = {
  'not-instagram': 'Abra o instagram.com nesta aba para ler as listas.',
  'not-logged-in': 'Entre na sua conta no instagram.com.',
  'no-content-script': 'Recarregue a aba do Instagram: ela foi aberta antes da extensão.',
  busy: 'Já tem uma leitura em andamento nesta aba.',
  cooldown: 'Espere a trava de 5 minutos entre leituras.',
  'rate-limited': 'O Instagram pediu uma pausa. A extensão espera 15 minutos antes de ler de novo.',
  session: 'A sessão expirou ou o Instagram pediu verificação. Abra o instagram.com e confira.',
  format: 'O Instagram mudou o formato da resposta. Nada foi gravado.',
  incomplete: 'A lista veio incompleta. Nada foi gravado; tente de novo mais tarde.',
  network: 'Falha de rede ao falar com o Instagram. Nada foi gravado.',
  interrupted: 'Leitura interrompida: a aba do Instagram foi recarregada ou fechada.',
};

export function errorMessage(code: ErrorCode, detail = ''): string {
  if (code === 'incomplete' && detail) {
    return `A lista veio incompleta (${detail}). Nada foi gravado; tente de novo mais tarde.`;
  }
  return MESSAGES[code];
}

export function relativeTime(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function countLabel(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
