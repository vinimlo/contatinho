/** Reduz a foto para uma miniatura quadrada em WebP (88 px = 44 px de tela em 2×) e devolve como data URL. */
export async function encodeThumb(blob: Blob, size = 88): Promise<string> {
  const bitmap = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  const canvas = new OffscreenCanvas(size, size);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(webp);
  });
}
