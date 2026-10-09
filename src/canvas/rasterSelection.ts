import type { ActiveSelection, Frame } from '../types/editor';
import type { ExtractedObjectData } from '../utils/extractObject';
import { eraseObjectPixels } from '../utils/extractObject';
import { cacheRaster, composeFrame, drawObjects } from './frameRenderer';
import { createId } from '../domain/project';

const copyCanvas = (source: HTMLCanvasElement) => {
  const copy = document.createElement('canvas'); copy.width = source.width; copy.height = source.height;
  copy.getContext('2d')!.drawImage(source, 0, 0); return copy;
};

/** Cut only paint layers. Text/stickers retain their identities and paint order. */
export function extractRasterSelection(frame: Frame, base: HTMLCanvasElement, extract: (ctx: CanvasRenderingContext2D) => ExtractedObjectData | null): ActiveSelection | null {
  const raster = copyCanvas(base);
  drawObjects(raster.getContext('2d')!, frame.objects.filter(o => o.kind === 'raster'));
  const piece = extract(raster.getContext('2d')!);
  if (!piece) return null;
  const background = copyCanvas(base);
  eraseObjectPixels(background.getContext('2d')!, piece.pixelOffsets);
  const objects = frame.objects.map(object => {
    if (object.kind !== 'raster') return object;
    const layer = document.createElement('canvas'); layer.width = base.width; layer.height = base.height;
    const ctx = layer.getContext('2d')!; drawObjects(ctx, [object]); eraseObjectPixels(ctx, piece.pixelOffsets, true);
    const bitmap = layer.toDataURL('image/png'); cacheRaster(bitmap, layer);
    return { ...object, bitmap };
  });
  const backgroundFrame = { ...frame, bitmap: background.toDataURL('image/png'), objects };
  return { ownerFrameId: frame.id, canvas: piece.canvas, x: piece.x, y: piece.y, width: piece.width, height: piece.height,
    initialX: piece.x, initialY: piece.y, initialWidth: piece.width, initialHeight: piece.height,
    originalBitmap: frame.bitmap, backgroundCanvas: background, backgroundFrame, rasterLayerId: createId(), hasChanged: false };
}

export function renderRasterSelection(target: Frame, selection: ActiveSelection, includePiece = true): Frame {
  const base = selection.backgroundCanvas;
  if (!base || !selection.backgroundFrame) throw new Error('Не удалось восстановить фон выделения');
  const background = selection.backgroundFrame;
  const canvas = copyCanvas(base);
  const ctx = canvas.getContext('2d')!;
  let objects = background.objects;
  if (!objects.some(o => o.kind !== 'raster')) {
    drawObjects(ctx, objects);
    if (includePiece) ctx.drawImage(selection.canvas, selection.x, selection.y, selection.width, selection.height);
    objects = [];
  } else if (includePiece) {
    const layer = document.createElement('canvas'); layer.width = base.width; layer.height = base.height;
    layer.getContext('2d')!.drawImage(selection.canvas, selection.x, selection.y, selection.width, selection.height);
    const bitmap = layer.toDataURL('image/png'); cacheRaster(bitmap, layer);
    objects = [...objects, { kind: 'raster', id: selection.rasterLayerId!, bitmap }];
  }
  return { ...target, bitmap: canvas.toDataURL('image/png'), objects, preview: composeFrame(canvas, objects) };
}
