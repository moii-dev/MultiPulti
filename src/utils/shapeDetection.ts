import type { Point, SmartShape } from "../types/editor";

export type { Point, SmartShape } from "../types/editor";

export function detectSmartShape(points: Point[]): SmartShape | null {
  if (points.length < 10) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let pathLength = 0;
  for (let i = 0; i < points.length; i++) {
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);
    if (i > 0) {
      pathLength += Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y,
      );
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const isClosed = dist < Math.max(width, height) * 0.3;

  if (isClosed && width > 20 && height > 20) {
    const perimeter =
      2 * Math.PI * Math.sqrt((width * width + height * height) / 8);
    const ratio = pathLength / perimeter;
    // Ребенок редко замыкает контур идеально, поэтому допускаем заметную погрешность.
    if (ratio > 0.8 && ratio < 1.4) {
      return {
        type: "ellipse",
        cx: minX + width / 2,
        cy: minY + height / 2,
        rx: width / 2,
        ry: height / 2,
      };
    }
  } else if (width > 20 || height > 20) {
    const straightDist = Math.hypot(last.x - first.x, last.y - first.y);
    // Небольшое дрожание руки не должно мешать превращать штрих в ровную линию.
    if (pathLength / straightDist < 1.15) {
      return { type: "line", x1: first.x, y1: first.y, x2: last.x, y2: last.y };
    }
  }
  return null;
}
