const COLOR_TOLERANCE = 20;
const GAP_RADIUS = 2;

export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorHex: string,
) {
  const { width, height } = ctx.canvas;
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const fillColor = hexToRgba(fillColorHex);
  if (!fillColor) return;

  const startPixel = startY * width + startX;
  const startIndex = startPixel * 4;
  const startColor = {
    r: data[startIndex],
    g: data[startIndex + 1],
    b: data[startIndex + 2],
    a: data[startIndex + 3],
  };

  if (colorsMatch(startColor, fillColor, COLOR_TOLERANCE)) return;

  const pixelCount = width * height;
  const boundary = new Uint8Array(pixelCount);
  const traversalBlocked = new Uint8Array(pixelCount);
  const reached = new Uint8Array(pixelCount);

  // Настоящие пиксели контура не перекрашиваются.
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const index = pixel * 4;
    if (!pixelMatches(data, index, startColor, COLOR_TOLERANCE)) {
      boundary[pixel] = 1;
    }
  }

  // Временное расширение границы закрывает небольшие разрывы карандашного
  // контура, но существует только во время поиска области заливки.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!boundary[pixel]) continue;
      markNeighborhood(traversalBlocked, x, y, width, height, GAP_RADIUS);
    }
  }

  const seed = findSeed(startX, startY, width, height, traversalBlocked, boundary);
  if (seed === -1) return;

  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  reached[seed] = 1;

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  function enqueue(pixel: number) {
    if (reached[pixel] || traversalBlocked[pixel] || boundary[pixel]) return;
    reached[pixel] = 1;
    queue[tail++] = pixel;
  }

  // Подводим цвет обратно вплотную к настоящему контуру, не пересекая его.
  const paintMask = reached.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!reached[pixel]) continue;
      const minY = Math.max(0, y - GAP_RADIUS);
      const maxY = Math.min(height - 1, y + GAP_RADIUS);
      const minX = Math.max(0, x - GAP_RADIUS);
      const maxX = Math.min(width - 1, x + GAP_RADIUS);
      for (let nearY = minY; nearY <= maxY; nearY++) {
        for (let nearX = minX; nearX <= maxX; nearX++) {
          const nearPixel = nearY * width + nearX;
          if (!boundary[nearPixel]) paintMask[nearPixel] = 1;
        }
      }
    }
  }

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (!paintMask[pixel] || boundary[pixel]) continue;
    const index = pixel * 4;
    data[index] = fillColor.r;
    data[index + 1] = fillColor.g;
    data[index + 2] = fillColor.b;
    data[index + 3] = fillColor.a;
  }

  ctx.putImageData(imageData, 0, 0);
}

function markNeighborhood(
  mask: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(height - 1, y + radius);
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(width - 1, x + radius);
  for (let nearY = minY; nearY <= maxY; nearY++) {
    for (let nearX = minX; nearX <= maxX; nearX++) {
      mask[nearY * width + nearX] = 1;
    }
  }
}

function findSeed(
  startX: number,
  startY: number,
  width: number,
  height: number,
  blocked: Uint8Array,
  boundary: Uint8Array,
) {
  const startPixel = startY * width + startX;
  if (!blocked[startPixel] && !boundary[startPixel]) return startPixel;

  for (let radius = 1; radius <= GAP_RADIUS + 2; radius++) {
    for (let y = Math.max(0, startY - radius); y <= Math.min(height - 1, startY + radius); y++) {
      for (let x = Math.max(0, startX - radius); x <= Math.min(width - 1, startX + radius); x++) {
        const pixel = y * width + x;
        if (!blocked[pixel] && !boundary[pixel]) return pixel;
      }
    }
  }
  return -1;
}

function pixelMatches(
  data: Uint8ClampedArray,
  index: number,
  color: { r: number; g: number; b: number; a: number },
  tolerance: number,
) {
  return (
    Math.abs(data[index] - color.r) <= tolerance &&
    Math.abs(data[index + 1] - color.g) <= tolerance &&
    Math.abs(data[index + 2] - color.b) <= tolerance &&
    Math.abs(data[index + 3] - color.a) <= tolerance
  );
}

function colorsMatch(
  first: { r: number; g: number; b: number; a: number },
  second: { r: number; g: number; b: number; a: number },
  tolerance: number,
) {
  return (
    Math.abs(first.r - second.r) <= tolerance &&
    Math.abs(first.g - second.g) <= tolerance &&
    Math.abs(first.b - second.b) <= tolerance &&
    Math.abs(first.a - second.a) <= tolerance
  );
}

function hexToRgba(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
        a: 255,
      }
    : null;
}
