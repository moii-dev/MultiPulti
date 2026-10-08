import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export type GifProgressCallback = (current: number, total: number) => void;

export async function exportToGif(
  framesDataUrls: string[],
  fps: number,
  width: number,
  height: number,
  onProgress?: GifProgressCallback,
): Promise<Blob> {
  if (framesDataUrls.length === 0) {
    throw new Error('Нет кадров для экспорта в GIF');
  }

  const gif = GIFEncoder();
  const delay = Math.max(10, Math.round(1000 / Math.max(1, fps)));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context недоступен для экспорта GIF');
  }

  const total = framesDataUrls.length;

  for (let i = 0; i < total; i++) {
    const dataUrl = framesDataUrls[i];
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Не удалось загрузить кадр ${i + 1} для экспорта`));
      img.src = dataUrl;
    });

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    img.src = ''; // Освобождаем decoded Image ресурс

    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);

    gif.writeFrame(index, width, height, { palette, delay });

    if (onProgress) {
      onProgress(i + 1, total);
    }

    // Даем браузеру обновить UI и отрисовать индикатор прогресса
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  gif.finish();
  // Освобождаем backing store холста
  canvas.width = 0;
  canvas.height = 0;

  return new Blob([gif.bytes()], { type: 'image/gif' });
}
