// Gera os PNG do ícone da extensão a partir dos SVG em public/icons (rode com `make icons`).
// O de 16 px vem de um desenho próprio, sem as perfurações, que viram borrão nesse tamanho.
import sharp from 'sharp';

const sources = { 16: 'public/icons/icon-16.svg', 32: 'public/icons/icon.svg', 48: 'public/icons/icon.svg', 128: 'public/icons/icon.svg' };
for (const [size, svg] of Object.entries(sources)) {
  await sharp(svg, { density: 72 * (Number(size) / 16) }).resize(Number(size), Number(size)).png().toFile(`public/icons/icon${size}.png`);
  console.log(`icon${size}.png`);
}
