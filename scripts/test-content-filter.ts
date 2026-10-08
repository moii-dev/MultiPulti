import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeImageData } from "../src/utils/contentFilter";
import { downloadPng } from "../src/services/imageExport";

const WIDTH = 800;
const HEIGHT = 600;

function createImageData(w = WIDTH, h = HEIGHT) {
  const data = new Uint8ClampedArray(w * h * 4);
  data.fill(255);
  return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
}

function paintPixel(image: ImageData, x: number, y: number, color: [number, number, number]) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
  const index = (y * image.width + x) * 4;
  image.data[index] = color[0];
  image.data[index + 1] = color[1];
  image.data[index + 2] = color[2];
}

function paintThickDiagonal(
  image: ImageData,
  reverse: boolean,
  color: [number, number, number],
) {
  for (let x = 80; x < image.width - 80; x++) {
    const progress = (x - 80) / (image.width - 160);
    const centerY = reverse
      ? Math.round(image.height - 80 - progress * (image.height - 160))
      : Math.round(80 + progress * (image.height - 160));
    for (let offset = -14; offset <= 14; offset++) {
      paintPixel(image, x, centerY + offset, color);
    }
  }
}

test("CONTENT FILTER [SAFE]: Colorful drawing (sun and grass) is not blocked", () => {
  const safeImage = createImageData();
  // Draw green grass
  for (let y = 450; y < 600; y++) {
    for (let x = 0; x < 800; x++) {
      paintPixel(safeImage, x, y, [46, 204, 113]);
    }
  }
  // Draw yellow sun
  for (let y = 50; y < 150; y++) {
    for (let x = 50; x < 150; x++) {
      if (Math.hypot(x - 100, y - 100) < 40) {
        paintPixel(safeImage, x, y, [241, 196, 15]);
      }
    }
  }
  const result = analyzeImageData(safeImage);
  assert.equal(result.blocked, false);
  assert.ok(result.severity < 60);
});

test("CONTENT FILTER [SAFE]: Red-and-black ladybug is NOT blocked (false positive protection)", () => {
  const ladybug = createImageData();
  // Red body
  for (let y = 150; y < 450; y++) {
    for (let x = 250; x < 550; x++) {
      if (Math.hypot(x - 400, y - 300) < 120) {
        paintPixel(ladybug, x, y, [220, 20, 20]);
      }
    }
  }
  // Black spots
  for (const [bx, by] of [
    [360, 260],
    [440, 260],
    [360, 340],
    [440, 340],
  ]) {
    for (let y = by - 15; y <= by + 15; y++) {
      for (let x = bx - 15; x <= bx + 15; x++) {
        if (Math.hypot(x - bx, y - by) < 15) {
          paintPixel(ladybug, x, y, [0, 0, 0]);
        }
      }
    }
  }
  const result = analyzeImageData(ladybug);
  // Standalone red/black palette without dangerous cross/scribble pattern must NOT block!
  assert.equal(result.blocked, false, "Божья коровка не должна блокироваться");
  assert.ok(result.severity <= 40, `Severity должна быть <= 40, получено ${result.severity}`);
});

test("CONTENT FILTER [SAFE]: Blue diagonal cross is NOT blocked without aggressive palette", () => {
  const blueCross = createImageData();
  paintThickDiagonal(blueCross, false, [0, 122, 255]);
  paintThickDiagonal(blueCross, true, [0, 122, 255]);
  const result = analyzeImageData(blueCross);
  assert.equal(result.blocked, false, "Синий крест без агрессивной палитры не должен блокироваться");
  assert.ok(result.severity < 60, `Severity должна быть < 60, получено ${result.severity}`);
});

test("CONTENT FILTER [SAFE]: Orthogonal plus sign (+) is NOT blocked", () => {
  const plusImage = createImageData();
  const midX = 400;
  const midY = 300;
  // Horizontal bar
  for (let y = midY - 10; y <= midY + 10; y++) {
    for (let x = 250; x <= 550; x++) {
      paintPixel(plusImage, x, y, [80, 80, 80]);
    }
  }
  // Vertical bar
  for (let y = 150; y <= 450; y++) {
    for (let x = midX - 10; x <= midX + 10; x++) {
      paintPixel(plusImage, x, y, [80, 80, 80]);
    }
  }
  const result = analyzeImageData(plusImage);
  assert.equal(result.blocked, false, "Обычный плюс не должен блокироваться");
  assert.ok(result.severity < 60);
});

test("CONTENT FILTER [SAFE]: Small image (<300px) bypasses heavy heuristic safely", () => {
  const smallImage = createImageData(200, 200);
  const result = analyzeImageData(smallImage);
  assert.equal(result.blocked, false);
  assert.equal(result.severity, 0);
});

test("CONTENT FILTER [BLOCKED]: Aggressive black-and-red diagonal cross is blocked", () => {
  const blockedImage = createImageData();
  paintThickDiagonal(blockedImage, false, [0, 0, 0]);
  paintThickDiagonal(blockedImage, true, [220, 20, 20]);
  const result = analyzeImageData(blockedImage);
  assert.equal(result.blocked, true, `Чёрно-красный X должен блокироваться, severity=${result.severity}`);
  assert.ok(result.severity >= 60);
});

test("CONTENT FILTER [BLOCKED]: Aggressive black-and-red chaotic scribble is blocked", () => {
  const scribbleImage = createImageData();
  // Fill sectors with chaotic dense black and red strokes
  for (let y = 60; y < 540; y += 2) {
    for (let x = 60; x < 740; x += 2) {
      if ((x * 3 + y * 7) % 11 > 3) {
        const isRed = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
        const color: [number, number, number] = isRed ? [220, 20, 20] : [0, 0, 0];
        paintPixel(scribbleImage, x, y, color);
        paintPixel(scribbleImage, x + 1, y, color);
        paintPixel(scribbleImage, x, y + 1, color);
        paintPixel(scribbleImage, x + 1, y + 1, color);
      }
    }
  }
  const result = analyzeImageData(scribbleImage);
  assert.equal(result.blocked, true, `Чёрно-красная хаотичная штриховка должна блокироваться: severity=${result.severity}`);
  assert.ok(result.severity >= 60);
});

test("EXPORT: PNG export configures clean anchor download with correct filename pattern", () => {
  const link = {
    clickCount: 0,
    download: "",
    href: "",
    click() {
      this.clickCount += 1;
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tagName: string) {
        assert.equal(tagName, "a", `Экспорт создал неожиданный элемент ${tagName}`);
        return link;
      },
    },
  });

  downloadPng("data:image/png;base64,test-valid-payload");
  assert.equal(link.clickCount, 1, "PNG-экспорт не инициировал скачивание");
  assert.equal(link.href, "data:image/png;base64,test-valid-payload", "PNG-экспорт изменил данные кадра");
  assert.ok(
    link.download.startsWith("рисунок-") && link.download.endsWith(".png"),
    `Некорректное имя файла: ${link.download}`,
  );
});
