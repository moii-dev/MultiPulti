import type { CanvasObject, Frame } from '../types/editor';
const rasterCache = new Map<string, CanvasImageSource>();
export function cacheRaster(bitmap: string, source: CanvasImageSource) {
  rasterCache.set(bitmap, source);
}
export async function loadRasterLayers(objects: CanvasObject[]) {
  await Promise.all(objects.filter(object => object.kind === 'raster').map(object => {
    if (rasterCache.has(object.bitmap)) return;
    return new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => { cacheRaster(object.bitmap, image); resolve(); };
      image.onerror = () => reject(new Error('Повреждённый растровый слой'));
      image.src = object.bitmap;
    });
  }));
}
export function pruneRasterCache(frames: Frame[]) {
  const reachable = new Set(frames.flatMap(frame => frame.objects.flatMap(object => object.kind === 'raster' ? [object.bitmap] : [])));
  for (const key of rasterCache.keys()) if (!reachable.has(key)) rasterCache.delete(key);
}
export function drawObjects(ctx: CanvasRenderingContext2D, objects: CanvasObject[]) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const object of objects) {
    if (object.kind === 'raster') {
      const source = rasterCache.get(object.bitmap);
      if (!source) throw new Error('Растровый слой ещё не загружен');
      ctx.drawImage(source, 0, 0);
      continue;
    }
    ctx.font = `${object.size}px ${object.kind === 'text' ? object.font : 'Arial'}`;
    ctx.fillStyle = object.kind === 'text' ? object.color : '#000000';
    ctx.fillText(object.kind === 'text' ? object.text : object.emoji, object.x, object.y);
  }
  ctx.restore();
}
export function composeFrame(base: HTMLCanvasElement, objects: CanvasObject[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(base, 0, 0);
  drawObjects(ctx, objects);
  return canvas.toDataURL('image/png');
}
export function hitObject(ctx: CanvasRenderingContext2D, frame: Frame, x: number, y: number) {
  return [...frame.objects].reverse().find(object => {
    if (object.kind === 'raster') return false;
    ctx.save();
    ctx.font = `${object.size}px ${object.kind === 'text' ? object.font : 'Arial'}`;
    const width = object.kind === 'text' ? ctx.measureText(object.text).width : object.size;
    ctx.restore();
    return Math.abs(x - object.x) <= width / 2 + 5 && Math.abs(y - object.y) <= object.size / 2 + 5;
  });
}
