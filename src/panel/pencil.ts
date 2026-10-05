/**
 * Traços de lápis dermatográfico, o que fotógrafos usam para marcar uma folha de contato.
 * Levemente tortos e com sobra no fim, como feitos à mão.
 */
export const PENCIL = {
  /** Em volta da foto de quem é especial (viewBox 62×62). */
  circle: 'M14 47 C 3 37, 5 16, 22 8 C 37 1, 55 9, 57 27 C 59 44, 44 57, 27 56 C 15 55, 6 45, 9 32 C 11 23, 18 16, 26 13',
  /** Risca o número do quadro já visto (viewBox 24×22). */
  slash: 'M3 18 C 9 13, 15 8, 22 3',
  /** Sublinha a aba ativa (viewBox 100×10, esticado). */
  underline: 'M2 6 C 25 3, 55 8, 98 4',
  /** Botão de marcar como especial (viewBox 24×24). */
  star: 'M12 2.8 L 14.6 9.1 L 21.2 9.6 L 16.1 13.9 L 17.8 20.6 L 12.1 17 L 6.3 20.7 L 7.9 14 L 2.7 9.8 L 9.4 9.2 Z',
} as const;
