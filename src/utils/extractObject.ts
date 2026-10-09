export interface ExtractedObjectData {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelOffsets: number[];
}

/**
 * Pure analysis: inspects pixels and returns connected component data
 * without mutating the source canvas context.
 */
export function findConnectedObject(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number
): ExtractedObjectData | null {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  startX = Math.floor(startX);
  startY = Math.floor(startY);

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return null;

  const getPixelOffset = (x: number, y: number) => y * width + x;
  const getDataIndex = (x: number, y: number) => getPixelOffset(x, y) * 4;

  const isBackgroundPixel = (index: number) => {
    if (data[index + 3] === 0) return true;
    if (data[index] > 250 && data[index + 1] > 250 && data[index + 2] > 250) return true;
    return false;
  };

  const startIndex = getDataIndex(startX, startY);

  // В режиме выбора дети часто нажимают рядом с контуром, поэтому сначала ищем ближайший нарисованный пиксель.
  if (isBackgroundPixel(startIndex)) {
    let found = false;
    for (let r = 1; r <= 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = startX + dx;
          const ny = startY + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (!isBackgroundPixel(getDataIndex(nx, ny))) {
              startX = nx;
              startY = ny;
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) return null;
  }

  const visited = new Uint8Array(width * height);
  const objectPixels: number[] = [];

  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;

  const stack = [startX, startY];
  visited[getPixelOffset(startX, startY)] = 1;

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    const pixelOffset = getPixelOffset(x, y);
    objectPixels.push(pixelOffset);

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nextOffset = getPixelOffset(nx, ny);
          if (!visited[nextOffset]) {
            visited[nextOffset] = 1;
            if (!isBackgroundPixel(nextOffset * 4)) {
              stack.push(nx, ny);
            }
          }
        }
      }
    }
  }

  const objWidth = maxX - minX + 1;
  const objHeight = maxY - minY + 1;

  const objectCanvas = document.createElement("canvas");
  objectCanvas.width = objWidth;
  objectCanvas.height = objHeight;
  const objectCtx = objectCanvas.getContext("2d");
  if (!objectCtx) return null;

  const objectImageData = objectCtx.createImageData(objWidth, objHeight);

  for (let i = 0; i < objectPixels.length; i++) {
    const pixelOffset = objectPixels[i];
    const px = pixelOffset % width;
    const py = Math.floor(pixelOffset / width);

    const sourceIndex = pixelOffset * 4;
    const targetIndex = ((py - minY) * objWidth + (px - minX)) * 4;

    objectImageData.data[targetIndex] = data[sourceIndex];
    objectImageData.data[targetIndex + 1] = data[sourceIndex + 1];
    objectImageData.data[targetIndex + 2] = data[sourceIndex + 2];
    objectImageData.data[targetIndex + 3] = data[sourceIndex + 3];
  }

  objectCtx.putImageData(objectImageData, 0, 0);

  return {
    canvas: objectCanvas,
    x: minX,
    y: minY,
    width: objWidth,
    height: objHeight,
    pixelOffsets: objectPixels,
  };
}

/**
 * Pure analysis: inspects pixels in rect and returns cutout data
 * without mutating the source canvas context.
 */
export function findObjectInRect(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): ExtractedObjectData | null {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const data = imageData.data;

  const left = Math.max(0, Math.floor(Math.min(startX, endX)));
  const top = Math.max(0, Math.floor(Math.min(startY, endY)));
  const right = Math.min(canvasWidth - 1, Math.ceil(Math.max(startX, endX)));
  const bottom = Math.min(canvasHeight - 1, Math.ceil(Math.max(startY, endY)));

  if (right < left || bottom < top) return null;

  const isBackgroundPixel = (index: number) => {
    if (data[index + 3] === 0) return true;
    return data[index] > 250 && data[index + 1] > 250 && data[index + 2] > 250;
  };

  const objectPixels: number[] = [];
  let minX = right;
  let minY = bottom;
  let maxX = left;
  let maxY = top;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const pixelOffset = y * canvasWidth + x;
      if (isBackgroundPixel(pixelOffset * 4)) continue;

      objectPixels.push(pixelOffset);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (objectPixels.length === 0) return null;

  const objectWidth = maxX - minX + 1;
  const objectHeight = maxY - minY + 1;
  const objectCanvas = document.createElement("canvas");
  objectCanvas.width = objectWidth;
  objectCanvas.height = objectHeight;

  const objectCtx = objectCanvas.getContext("2d");
  if (!objectCtx) return null;

  const objectImageData = objectCtx.createImageData(objectWidth, objectHeight);

  for (const pixelOffset of objectPixels) {
    const x = pixelOffset % canvasWidth;
    const y = Math.floor(pixelOffset / canvasWidth);
    const sourceIndex = pixelOffset * 4;
    const targetIndex = ((y - minY) * objectWidth + (x - minX)) * 4;

    objectImageData.data[targetIndex] = data[sourceIndex];
    objectImageData.data[targetIndex + 1] = data[sourceIndex + 1];
    objectImageData.data[targetIndex + 2] = data[sourceIndex + 2];
    objectImageData.data[targetIndex + 3] = data[sourceIndex + 3];
  }

  objectCtx.putImageData(objectImageData, 0, 0);

  return {
    canvas: objectCanvas,
    x: minX,
    y: minY,
    width: objectWidth,
    height: objectHeight,
    pixelOffsets: objectPixels,
  };
}

/**
 * Explicit mutation: erases specified pixels on ctx by replacing them with solid white.
 */
export function eraseObjectPixels(
  ctx: CanvasRenderingContext2D,
  pixelOffsets: number[],
  transparent = false,
): void {
  if (pixelOffsets.length === 0) return;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < pixelOffsets.length; i++) {
    const sourceIndex = pixelOffsets[i] * 4;
    data[sourceIndex] = 255;
    data[sourceIndex + 1] = 255;
    data[sourceIndex + 2] = 255;
    data[sourceIndex + 3] = transparent ? 0 : 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Composite operation: extracts object and erases it from source context.
 */
export function cutObject(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number
): ExtractedObjectData | null {
  const result = findConnectedObject(ctx, startX, startY);
  if (result) {
    eraseObjectPixels(ctx, result.pixelOffsets);
  }
  return result;
}

/**
 * Composite operation: extracts object in rect and erases it from source context.
 */
export function cutObjectInRect(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): ExtractedObjectData | null {
  const result = findObjectInRect(ctx, startX, startY, endX, endY);
  if (result) {
    eraseObjectPixels(ctx, result.pixelOffsets);
  }
  return result;
}

export const extractObject = cutObject;
export const extractObjectInRect = cutObjectInRect;
