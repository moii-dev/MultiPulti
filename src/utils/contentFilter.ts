export interface FilterResult {
  blocked: boolean;
  reason: string;
  severity: number;
}

// Фильтр намеренно эвристический: он не пытается "понять" рисунок, а ищет грубые пиксельные признаки.
function classifyColor(r: number, g: number, b: number): string {
  if (r > 240 && g > 240 && b > 240) return "white";
  if (r < 40 && g < 40 && b < 40) return "black";
  if (r > 150 && g < 80 && b < 80) return "red";
  if (r > 100 && r < 180 && g < 50 && b < 50) return "red";
  if (r > 180 && g > 80 && g < 170 && b < 80) return "orange";
  if (r > 180 && g > 180 && b < 100) return "yellow";
  if (g > 100 && r < 100 && b < 100) return "green";
  if (g > 150 && r < g && b < g) return "green";
  if (b > 120 && r < 100 && g < 150) return "blue";
  if (r > 80 && b > 80 && g < 80) return "purple";
  if (r > 180 && g < 120 && b > 100) return "pink";
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r > 40 && r < 240) return "gray";
  if (r > 100 && g > 50 && g < 130 && b < 80) return "brown";
  return "other";
}

function analyzeColorPalette(imageData: ImageData): {
  colorGroups: Map<string, number>;
  totalDrawnPixels: number;
} {
  const colorGroups = new Map<string, number>();
  const data = imageData.data;
  let drawnPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;

    const group = classifyColor(r, g, b);
    if (group !== "white") {
      drawnPixels++;
      colorGroups.set(group, (colorGroups.get(group) || 0) + 1);
    }
  }

  return {
    colorGroups,
    totalDrawnPixels: drawnPixels,
  };
}

function checkAggressivePalette(
  colorGroups: Map<string, number>,
  totalDrawn: number,
): { isAggressive: boolean; score: number } {
  if (totalDrawn < 500) return { isAggressive: false, score: 0 };

  const blackCount = colorGroups.get("black") || 0;
  const redCount = colorGroups.get("red") || 0;
  const aggressivePixels = blackCount + redCount;

  let otherColorPixels = 0;
  for (const [group, count] of colorGroups) {
    if (group !== "black" && group !== "red" && group !== "gray") {
      otherColorPixels += count;
    }
  }

  const aggressiveRatio = aggressivePixels / totalDrawn;
  const otherRatio = otherColorPixels / totalDrawn;

  // Палитра подозрительна только когда черный и красный почти полностью вытесняют все остальные цвета.
  if (
    blackCount > 100 &&
    redCount > 100 &&
    aggressiveRatio > 0.85 &&
    otherRatio < 0.1
  ) {
    const score = Math.min(100, Math.round(aggressiveRatio * 80));
    return { isAggressive: true, score };
  }

  return { isAggressive: false, score: 0 };
}

function detectCrossPattern(imageData: ImageData): {
  hasCross: boolean;
  score: number;
} {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  // Сканируем уменьшенную копию: для фильтра важен общий жест, а не точная толщина штриха.
  const scale = 4;
  const sw = Math.floor(w / scale);
  const sh = Math.floor(h / scale);

  const binary: number[][] = [];
  for (let y = 0; y < sh; y++) {
    binary[y] = [];
    for (let x = 0; x < sw; x++) {
      const px = x * scale;
      const py = y * scale;
      const idx = (py * w + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      binary[y][x] = r < 230 || g < 230 || b < 230 ? 1 : 0;
    }
  }

  const directions = [
    { dx: 1, dy: 1, name: "diag-down-right" },
    { dx: 1, dy: -1, name: "diag-up-right" },
    { dx: 1, dy: 0, name: "horizontal" },
    { dx: 0, dy: 1, name: "vertical" },
  ];

  interface Line {
    dir: string;
    midX: number;
    midY: number;
  }

  const significantLines: Line[] = [];
  const minLineLength = Math.min(sw, sh) * 0.25;

  for (const dir of directions) {
    for (let sy = 0; sy < sh; sy += 2) {
      for (let sx = 0; sx < sw; sx += 2) {
        if (!binary[sy]?.[sx]) continue;

        let length = 0;
        let gaps = 0;
        let currentGap = 0;
        let cx = sx;
        let cy = sy;

        while (
          cx >= 0 && cx < sw &&
          cy >= 0 && cy < sh
        ) {
          if (binary[cy]?.[cx]) {
            length++;
            currentGap = 0;
          } else {
            currentGap++;
            gaps++;
            if (currentGap > 3) break;
          }
          cx += dir.dx;
          cy += dir.dy;
        }

        if (length >= minLineLength && gaps / (length + gaps) < 0.3) {
          const endX = cx - dir.dx;
          const endY = cy - dir.dy;
          significantLines.push({
            dir: dir.name,
            midX: (sx + endX) / 2,
            midY: (sy + endY) / 2,
          });
        }
      }
    }
  }

  let crossScore = 0;

  for (let i = 0; i < significantLines.length; i++) {
    for (let j = i + 1; j < significantLines.length; j++) {
      const a = significantLines[i];
      const b = significantLines[j];

      if (a.dir === b.dir) continue;

      const dist = Math.hypot(a.midX - b.midX, a.midY - b.midY);
      const tolerance = Math.min(sw, sh) * 0.15;

      if (dist < tolerance) {
        const isDiagCross =
          (a.dir === "diag-down-right" && b.dir === "diag-up-right") ||
          (a.dir === "diag-up-right" && b.dir === "diag-down-right");

        const isOrthoCross =
          (a.dir === "horizontal" && b.dir === "vertical") ||
          (a.dir === "vertical" && b.dir === "horizontal");

        if (isDiagCross) {
          crossScore = Math.max(crossScore, 70);
        } else if (isOrthoCross) {
          // Плюс часто бывает частью обычного рисунка, поэтому сам по себе он слабый сигнал.
          crossScore = Math.max(crossScore, 30);
        } else {
          crossScore = Math.max(crossScore, 20);
        }
      }
    }
  }

  return {
    hasCross: crossScore >= 50,
    score: crossScore,
  };
}

function detectScribblePattern(imageData: ImageData): {
  isScribble: boolean;
  score: number;
} {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  // Сектора помогают отличить хаотичное зачеркивание от локального объекта или обычной заливки.
  const sectorsX = 8;
  const sectorsY = 6;
  const sectorW = Math.floor(w / sectorsX);
  const sectorH = Math.floor(h / sectorsY);

  const sectorDensity: number[][] = [];
  let totalDensity = 0;
  let filledSectors = 0;

  for (let sy = 0; sy < sectorsY; sy++) {
    sectorDensity[sy] = [];
    for (let sx = 0; sx < sectorsX; sx++) {
      let drawn = 0;
      let total = 0;

      for (let py = sy * sectorH; py < (sy + 1) * sectorH && py < h; py++) {
        for (let px = sx * sectorW; px < (sx + 1) * sectorW && px < w; px++) {
          const idx = (py * w + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          total++;
          if (r < 230 || g < 230 || b < 230) drawn++;
        }
      }

      const density = total > 0 ? drawn / total : 0;
      sectorDensity[sy][sx] = density;
      totalDensity += density;
      if (density > 0.3) filledSectors++;
    }
  }

  const avgDensity = totalDensity / (sectorsX * sectorsY);
  const sectorFillRatio = filledSectors / (sectorsX * sectorsY);

  let varianceSum = 0;
  for (let sy = 0; sy < sectorsY; sy++) {
    for (let sx = 0; sx < sectorsX; sx++) {
      varianceSum += Math.pow(sectorDensity[sy][sx] - avgDensity, 2);
    }
  }
  const variance = varianceSum / (sectorsX * sectorsY);

  if (avgDensity > 0.4 && sectorFillRatio > 0.7 && variance > 0.01 && variance < 0.15) {
    const score = Math.min(100, Math.round(avgDensity * 60 + sectorFillRatio * 30));
    return { isScribble: true, score };
  }

  return { isScribble: false, score: 0 };
}

function detectRotationalSymmetry(imageData: ImageData): {
  hasSymmetry: boolean;
  score: number;
} {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  const scale = 8;
  const sw = Math.floor(w / scale);
  const sh = Math.floor(h / scale);
  const cx = sw / 2;
  const cy = sh / 2;

  const getBin = (x: number, y: number): number => {
    const px = Math.min(w - 1, x * scale);
    const py = Math.min(h - 1, y * scale);
    const idx = (py * w + px) * 4;
    return data[idx] < 230 || data[idx + 1] < 230 || data[idx + 2] < 230 ? 1 : 0;
  };

  // Четырехкратная симметрия сама по себе не запрещена, но усиливает общий риск вместе с цветом и формой.
  let matchCount = 0;
  let totalChecked = 0;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const val = getBin(x, y);
      if (val === 0) continue;

      const rx = cx + (y - cy);
      const ry = cy - (x - cx);
      const rxi = Math.round(rx);
      const ryi = Math.round(ry);

      if (rxi >= 0 && rxi < sw && ryi >= 0 && ryi < sh) {
        totalChecked++;
        if (getBin(rxi, ryi) === val) {
          matchCount++;
        }
      }
    }
  }

  const symmetryRatio = totalChecked > 50 ? matchCount / totalChecked : 0;

  if (symmetryRatio > 0.6 && totalChecked > 100) {
    return { hasSymmetry: true, score: Math.round(symmetryRatio * 50) };
  }

  return { hasSymmetry: false, score: 0 };
}

export function analyzeImageData(imageData: ImageData): FilterResult {
  const palette = analyzeColorPalette(imageData);

  if (palette.totalDrawnPixels < 300) {
    return { blocked: false, reason: "", severity: 0 };
  }

  let totalScore = 0;
  const reasons: string[] = [];

  const paletteCheck = checkAggressivePalette(
    palette.colorGroups,
    palette.totalDrawnPixels,
  );
  if (paletteCheck.isAggressive) {
    totalScore += paletteCheck.score;
    reasons.push("агрессивная палитра (только чёрный и красный)");
  }

  const crossCheck = detectCrossPattern(imageData);
  if (crossCheck.hasCross) {
    totalScore += crossCheck.score;
    reasons.push("крестообразная фигура");
  }

  const scribbleCheck = detectScribblePattern(imageData);
  if (scribbleCheck.isScribble) {
    totalScore += scribbleCheck.score;
    reasons.push("хаотичное зачёркивание");
  }

  const symmetryCheck = detectRotationalSymmetry(imageData);
  if (symmetryCheck.hasSymmetry) {
    totalScore += symmetryCheck.score;
    reasons.push("подозрительная симметричная фигура");
  }

  // Комбинации признаков важнее одиночных совпадений: так меньше ложных блокировок обычных рисунков.
  if (paletteCheck.isAggressive && crossCheck.hasCross) {
    totalScore += 30;
  }

  if (paletteCheck.isAggressive && scribbleCheck.isScribble) {
    totalScore += 20;
  }

  const severity = Math.min(100, totalScore);

  if (severity >= 60) {
    return {
      blocked: true,
      reason: reasons.join(", "),
      severity,
    };
  }

  return {
    blocked: false,
    reason: reasons.length > 0 ? reasons.join(", ") : "",
    severity,
  };
}

export function analyzeFrame(canvas: HTMLCanvasElement): FilterResult {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { blocked: false, reason: "", severity: 0 };
  return analyzeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
