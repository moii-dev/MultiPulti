import { analyzeImageData } from "../src/utils/contentFilter";
import { downloadPng } from "../src/services/imageExport";

const WIDTH = 800;
const HEIGHT = 600;

function createImageData() {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
  return { data, width: WIDTH, height: HEIGHT, colorSpace: "srgb" } as ImageData;
}

function paintPixel(image: ImageData, x: number, y: number, color: [number, number, number]) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 4;
  image.data[index] = color[0];
  image.data[index + 1] = color[1];
  image.data[index + 2] = color[2];
}

function paintThickDiagonal(
  image: ImageData,
  reverse: boolean,
  color: [number, number, number],
) {
  for (let x = 80; x < WIDTH - 80; x++) {
    const progress = (x - 80) / (WIDTH - 160);
    const centerY = reverse
      ? Math.round(HEIGHT - 80 - progress * (HEIGHT - 160))
      : Math.round(80 + progress * (HEIGHT - 160));
    for (let offset = -14; offset <= 14; offset++) {
      paintPixel(image, x, centerY + offset, color);
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const safeImage = createImageData();
for (let y = 30; y < 50; y++) {
  for (let x = 30; x < 50; x++) paintPixel(safeImage, x, y, [0, 122, 255]);
}
assert(!analyzeImageData(safeImage).blocked, "Безопасный цветной рисунок был ошибочно заблокирован");

const blockedImage = createImageData();
paintThickDiagonal(blockedImage, false, [0, 0, 0]);
paintThickDiagonal(blockedImage, true, [220, 20, 20]);
const blockedResult = analyzeImageData(blockedImage);
assert(blockedResult.blocked, `Чёрно-красный X не был заблокирован: severity=${blockedResult.severity}`);

console.log("content filter: safe drawing allowed, aggressive cross blocked");

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
      assert(tagName === "a", `Экспорт создал неожиданный элемент ${tagName}`);
      return link;
    },
  },
});

downloadPng("data:image/png;base64,test");
assert(link.clickCount === 1, "PNG-экспорт не инициировал скачивание");
assert(link.href === "data:image/png;base64,test", "PNG-экспорт изменил данные кадра");
assert(link.download.startsWith("рисунок-") && link.download.endsWith(".png"), "PNG-экспорт создал неверное имя файла");

console.log("png export: download link configured and triggered");
