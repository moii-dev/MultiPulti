import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants/editor";
import type { ActiveSelection, CanvasClientPosition, Point, ShapeId, SmartShape } from "../types/editor";

export function rgbToHex(r: number, g: number, b: number) {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

export function hsvToHex(h: number, s: number, v: number) {
  const saturation = s / 100;
  const value = v / 100;
  const channel = (n: number, k = (n + h / 60) % 6) =>
    value - value * saturation * Math.max(Math.min(k, 4 - k, 1), 0);
  const hex = (number: number) => Math.round(number * 255).toString(16).padStart(2, "0");
  return `#${hex(channel(5))}${hex(channel(3))}${hex(channel(1))}`.toUpperCase();
}

export function getCanvasCoordinates(canvas: HTMLCanvasElement | null, position: CanvasClientPosition) {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (position.clientX - rect.left) * (canvas.width / rect.width),
    y: (position.clientY - rect.top) * (canvas.height / rect.height),
  };
}

export function createBlankFrame() {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return canvas.toDataURL("image/png");
}

export function drawSmoothedCurve(ctx: CanvasRenderingContext2D, points: Point[], color: string, size: number, symmetry: boolean) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (points.length === 0) return;
  const draw = (mirror: boolean) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const getX = (point: Point) => (mirror ? CANVAS_WIDTH - point.x : point.x);
    ctx.moveTo(getX(points[0]), points[0].y);
    if (points.length < 3) {
      for (let index = 1; index < points.length; index++) ctx.lineTo(getX(points[index]), points[index].y);
    } else {
      for (let index = 1; index < points.length - 2; index++) {
        const centerX = (points[index].x + points[index + 1].x) / 2;
        const centerY = (points[index].y + points[index + 1].y) / 2;
        ctx.quadraticCurveTo(getX(points[index]), points[index].y, mirror ? CANVAS_WIDTH - centerX : centerX, centerY);
      }
      const last = points[points.length - 1];
      const previous = points[points.length - 2];
      ctx.quadraticCurveTo(getX(previous), previous.y, getX(last), last.y);
    }
    ctx.stroke();
  };
  draw(false);
  if (symmetry) draw(true);
}

export function drawPerfectShape(ctx: CanvasRenderingContext2D, shape: SmartShape, color: string, size: number, symmetry: boolean) {
  const draw = (mirror: boolean) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (shape.type === "ellipse") {
      ctx.ellipse(mirror ? CANVAS_WIDTH - shape.cx : shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
    } else {
      ctx.moveTo(mirror ? CANVAS_WIDTH - shape.x1 : shape.x1, shape.y1);
      ctx.lineTo(mirror ? CANVAS_WIDTH - shape.x2 : shape.x2, shape.y2);
    }
    ctx.stroke();
  };
  draw(false);
  if (symmetry) draw(true);
}

export function traceShapePath(ctx: CanvasRenderingContext2D, shape: ShapeId, startX: number, startY: number, endX: number, endY: number) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const right = left + width;
  const bottom = top + height;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  if (shape === "line") { ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); return; }
  if (shape === "arrow") {
    const angle = Math.atan2(endY - startY, endX - startX);
    const headLength = Math.max(14, Math.min(42, Math.hypot(width, height) * 0.25));
    ctx.moveTo(startX, startY); ctx.lineTo(endX, endY);
    ctx.moveTo(endX, endY); ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(endX, endY); ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
    return;
  }
  if (shape === "rect") { ctx.rect(startX, startY, endX - startX, endY - startY); return; }
  if (shape === "circle") { ctx.arc(startX, startY, Math.hypot(endX - startX, endY - startY), 0, Math.PI * 2); return; }
  if (shape === "ellipse") { ctx.ellipse(centerX, centerY, Math.max(width / 2, 1), Math.max(height / 2, 1), 0, 0, Math.PI * 2); return; }
  if (shape === "triangle") { ctx.moveTo(centerX, top); ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.closePath(); return; }
  if (shape === "diamond") { ctx.moveTo(centerX, top); ctx.lineTo(right, centerY); ctx.lineTo(centerX, bottom); ctx.lineTo(left, centerY); ctx.closePath(); return; }
  if (shape === "heart") {
    ctx.moveTo(centerX, bottom);
    ctx.bezierCurveTo(left - width * 0.08, centerY + height * 0.2, left, top, centerX, top + height * 0.28);
    ctx.bezierCurveTo(right, top, right + width * 0.08, centerY + height * 0.2, centerX, bottom);
    ctx.closePath(); return;
  }
  const points = shape === "star" ? 10 : 6;
  for (let index = 0; index < points; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / points;
    const radiusScale = shape === "star" && index % 2 === 1 ? 0.45 : 1;
    const x = centerX + Math.cos(angle) * (width / 2) * radiusScale;
    const y = centerY + Math.sin(angle) * (height / 2) * radiusScale;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function isSelectionPixelAt(selection: ActiveSelection, x: number, y: number) {
  if (x < selection.x || x > selection.x + selection.width || y < selection.y || y > selection.y + selection.height) return false;
  const context = selection.canvas.getContext("2d", { willReadFrequently: true });
  if (!context || selection.width <= 0 || selection.height <= 0) return false;
  const localX = Math.floor(((x - selection.x) / selection.width) * selection.canvas.width);
  const localY = Math.floor(((y - selection.y) / selection.height) * selection.canvas.height);
  const radiusX = Math.max(1, Math.ceil((8 / selection.width) * selection.canvas.width));
  const radiusY = Math.max(1, Math.ceil((8 / selection.height) * selection.canvas.height));
  const sampleX = Math.max(0, localX - radiusX);
  const sampleY = Math.max(0, localY - radiusY);
  const sampleWidth = Math.min(selection.canvas.width - sampleX, radiusX * 2 + 1);
  const sampleHeight = Math.min(selection.canvas.height - sampleY, radiusY * 2 + 1);
  if (sampleWidth <= 0 || sampleHeight <= 0) return false;
  const pixels = context.getImageData(sampleX, sampleY, sampleWidth, sampleHeight).data;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
  return false;
}

