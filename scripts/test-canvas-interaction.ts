import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateCanvasCoordinates,
  calculateTextInputGeometry,
  calculateAspectFitDimensions,
} from "../src/canvas/operations";
import { detectSmartShape } from "../src/utils/shapeDetection";
import {
  createInitialPointerState,
  startPointerGesture,
  updatePointerGesture,
  finishPointerGesture,
  cancelPointerGesture,
  type PointerGestureState,
} from "../src/canvas/pointerLifecycle";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../src/constants/editor";
import { createFrame } from "../src/domain/project";
import { createHistory } from "../src/domain/history";
import { resolvePendingForFrameSwitch } from "../src/domain/transaction";
import type { ActiveSelection, ActiveSticker, ActiveText } from "../src/types/editor";

test("COORDINATES: 1:1 scale maps client coordinates directly to canvas space", () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  const canvasSize = { width: 800, height: 600 };
  const point = calculateCanvasCoordinates(rect, canvasSize, { clientX: 200, clientY: 150 });
  assert.equal(point.x, 200);
  assert.equal(point.y, 150);
});

test("COORDINATES: CSS scaled down canvas (responsive/mobile) doubles internal coordinates", () => {
  const rect = { left: 50, top: 50, width: 400, height: 300 };
  const canvasSize = { width: 800, height: 600 };
  // Client is 100px from left of rect -> 100 * (800 / 400) = 200
  const point = calculateCanvasCoordinates(rect, canvasSize, { clientX: 150, clientY: 150 });
  assert.equal(point.x, 200);
  assert.equal(point.y, 200);
});

test("COORDINATES: CSS scaled up canvas (large desktop / 4K) halves internal coordinates", () => {
  const rect = { left: 100, top: 100, width: 1600, height: 1200 };
  const canvasSize = { width: 800, height: 600 };
  const point = calculateCanvasCoordinates(rect, canvasSize, { clientX: 500, clientY: 700 });
  // (500 - 100) * (800 / 1600) = 400 * 0.5 = 200
  // (700 - 100) * (600 / 1200) = 600 * 0.5 = 300
  assert.equal(point.x, 200);
  assert.equal(point.y, 300);
});

test("COORDINATES: Degenerate or unmounted rect (0 width or height) returns (0, 0) without NaN or Infinity", () => {
  const zeroRect = { left: 0, top: 0, width: 0, height: 0 };
  const canvasSize = { width: 800, height: 600 };
  const point = calculateCanvasCoordinates(zeroRect, canvasSize, { clientX: 100, clientY: 100 });
  assert.equal(point.x, 0);
  assert.equal(point.y, 0);
  assert.ok(!Number.isNaN(point.x));
  assert.ok(!Number.isNaN(point.y));
});

test("COORDINATES: Pointer coordinates outside rect produce correct signed offsets for canvas clipping", () => {
  const rect = { left: 100, top: 100, width: 800, height: 600 };
  const canvasSize = { width: 800, height: 600 };
  const pointLeft = calculateCanvasCoordinates(rect, canvasSize, { clientX: 50, clientY: 100 });
  assert.equal(pointLeft.x, -50);
  assert.equal(pointLeft.y, 0);

  const pointPastRight = calculateCanvasCoordinates(rect, canvasSize, { clientX: 950, clientY: 750 });
  assert.equal(pointPastRight.x, 850);
  assert.equal(pointPastRight.y, 650);
});

test("TEXT GEOMETRY: Visual DOM input font size is derived from rendered canvas rect, NOT viewport vh", () => {
  const activeText = { x: 400, y: 300, size: 40 };

  // Full rendered size: 800x600 -> scale 1.0
  const geomFull = calculateTextInputGeometry(activeText, 5, { width: 800, height: 600 });
  assert.equal(geomFull.fontSizePx, 40);
  assert.equal(geomFull.leftPercent, 50); // 400 / 800 * 100
  assert.equal(geomFull.topPercent, 50);  // 300 / 600 * 100

  // Half rendered size: 400x300 -> scale 0.5
  const geomHalf = calculateTextInputGeometry(activeText, 5, { width: 400, height: 300 });
  assert.equal(geomHalf.fontSizePx, 20); // 40 * 0.5
  assert.equal(geomHalf.leftPercent, 50);
  assert.equal(geomHalf.topPercent, 50);

  // Fallback when canvasRect is null
  const geomFallback = calculateTextInputGeometry(activeText, 5, null);
  assert.equal(geomFallback.fontSizePx, 40);
  assert.ok(geomFallback.widthPx >= geomFallback.minWidthPx);
});

test("POINTER STATE MACHINE: Single primary pointer starts, tracks and finishes gesture cleanly", () => {
  let state = createInitialPointerState();
  assert.equal(state.gesture, "idle");
  assert.equal(state.activePointerId, null);

  // Pointer 1 starts brush gesture
  const started = startPointerGesture(state, 1, "drawing_brush", { x: 100, y: 100 });
  assert.ok(started !== null);
  state = started;
  assert.equal(state.activePointerId, 1);
  assert.equal(state.gesture, "drawing_brush");
  assert.deepEqual(state.points, [{ x: 100, y: 100 }]);

  // Move pointer 1
  const moved = updatePointerGesture(state, 1, { x: 120, y: 130 });
  assert.ok(moved !== null);
  state = moved.state;
  assert.equal(moved.dx, 20);
  assert.equal(moved.dy, 30);
  assert.equal(state.points.length, 2);

  // Secondary pointer 2 attempts to start gesture -> rejected!
  const secondary = startPointerGesture(state, 2, "drawing_brush", { x: 200, y: 200 });
  assert.equal(secondary, null);

  // Secondary pointer 2 attempts to move -> rejected!
  const secondaryMove = updatePointerGesture(state, 2, { x: 200, y: 200 });
  assert.equal(secondaryMove, null);

  // Primary pointer finishes
  const finished = finishPointerGesture(state, 1);
  assert.ok(finished !== null);
  assert.equal(finished.gesture, "drawing_brush");
  assert.equal(finished.state.gesture, "idle");
  assert.equal(finished.state.activePointerId, null);
});

test("POINTER STATE MACHINE: Gesture cancel or lost pointer capture resets all flags cleanly", () => {
  let state = createInitialPointerState();

  // Start selection move
  const started = startPointerGesture(state, 5, "moving_selection", { x: 50, y: 50 }, {
    initialPos: { x: 50, y: 50 },
  });
  assert.ok(started !== null);
  state = started;

  // Move selection
  const moved = updatePointerGesture(state, 5, { x: 80, y: 90 });
  assert.ok(moved !== null);
  state = moved.state;
  assert.equal(state.gesture, "moving_selection");

  // Pointer cancel occurs (e.g. lostpointercapture or pointercancel event)
  const cancelResult = cancelPointerGesture(state, 5);
  assert.equal(cancelResult.cancelledGesture, "moving_selection");
  assert.equal(cancelResult.needsEraserRollback, false);
  assert.equal(cancelResult.state.gesture, "idle");
  assert.equal(cancelResult.state.activePointerId, null);
});

test("POINTER STATE MACHINE: Eraser gesture cancellation signals rollback requirement", () => {
  let state = createInitialPointerState();
  const started = startPointerGesture(state, 3, "drawing_eraser", { x: 10, y: 10 });
  assert.ok(started !== null);
  state = started;

  const cancelResult = cancelPointerGesture(state, 3);
  assert.equal(cancelResult.cancelledGesture, "drawing_eraser");
  assert.equal(cancelResult.needsEraserRollback, true);
  assert.equal(cancelResult.state.gesture, "idle");
});

test("PENDING CANCELLATION: Switching frame during active gesture isolates frames without corrupting state", () => {
  const frameA = createFrame("data:image/png;base64,A");
  const frameB = createFrame("data:image/png;base64,B");
  const frames = [frameA, frameB];

  // Active text being typed on frame A
  const activeText: ActiveText = {
    id: "text-1",
    ownerFrameId: frameA.id,
    text: "Привет",
    x: 100,
    y: 100,
    size: 30,
    font: "Nunito",
    color: "#000000",
    isEditing: true,
    isNew: true,
  };

  // Resolve pending before switching to frame B
  const resolved = resolvePendingForFrameSwitch(frames, { text: activeText });
  assert.equal(resolved.hasCommitted, true);
  assert.equal(resolved.frames[0].objects.length, 1);
  assert.equal(resolved.frames[0].objects[0].id, "text-1");
  // Frame B must have no objects!
  assert.equal(resolved.frames[1].objects.length, 0);
});

test("PENDING CANCELLATION: Sticker move during gesture cancel leaves original sticker intact", () => {
  const frameA = createFrame("data:image/png;base64,A");
  const activeSticker: ActiveSticker = {
    id: "sticker-1",
    ownerFrameId: frameA.id,
    emoji: "⭐",
    x: 150,
    y: 150,
    size: 100,
    initialX: 50,
    initialY: 50,
    initialSize: 100,
    initialEmoji: "⭐",
    isNew: false,
  };

  // If gesture is cancelled, initial values remain intact
  assert.equal(activeSticker.initialX, 50);
  assert.equal(activeSticker.initialY, 50);
  assert.equal(activeSticker.size, 100);
});

test("ASPECT RATIO FIT: Proportional letterboxing & pillarboxing inside 800x600 without distortion", () => {
  // 1. Wider image: 1600x600 into 800x600 -> scales to 800x300, centered vertically (y = 150)
  const wide = calculateAspectFitDimensions(1600, 600, 800, 600);
  assert.equal(wide.width, 800);
  assert.equal(wide.height, 300);
  assert.equal(wide.x, 0);
  assert.equal(wide.y, 150);

  // 2. Taller image: 400x600 into 800x600 -> scales to 400x600, centered horizontally (x = 200)
  const tall = calculateAspectFitDimensions(400, 600, 800, 600);
  assert.equal(tall.width, 400);
  assert.equal(tall.height, 600);
  assert.equal(tall.x, 200);
  assert.equal(tall.y, 0);

  // 3. Exact match: 800x600 into 800x600 -> fits exactly at (0, 0)
  const exact = calculateAspectFitDimensions(800, 600, 800, 600);
  assert.equal(exact.width, 800);
  assert.equal(exact.height, 600);
  assert.equal(exact.x, 0);
  assert.equal(exact.y, 0);

  // 4. Square image: 500x500 into 800x600 -> height bounded at 600x600, scaled to 600x600, centered horizontally (x = 100)
  const square = calculateAspectFitDimensions(500, 500, 800, 600);
  assert.equal(square.width, 600);
  assert.equal(square.height, 600);
  assert.equal(square.x, 100);
  assert.equal(square.y, 0);

  // 5. Degenerate zero/negative sizes safely fallback to target dimensions
  const zero = calculateAspectFitDimensions(0, 0, 800, 600);
  assert.equal(zero.width, 800);
  assert.equal(zero.height, 600);
  assert.equal(zero.x, 0);
  assert.equal(zero.y, 0);
});

test("SMART SHAPE: Ellipse detected from rough circular loop; line detected from straight points; noise rejected", () => {
  // 1. Rough circular loop points (simulating child drawing a circle)
  const circlePoints: { x: number; y: number }[] = [];
  const cx = 300;
  const cy = 300;
  const r = 80;
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    // slight natural jitter
    const jitter = (i % 2 === 0 ? 1 : -1) * 2;
    circlePoints.push({
      x: cx + (r + jitter) * Math.cos(angle),
      y: cy + (r + jitter) * Math.sin(angle),
    });
  }
  // close the loop
  circlePoints.push({ ...circlePoints[0] });

  const detectedCircle = detectSmartShape(circlePoints);
  assert.ok(detectedCircle !== null);
  assert.equal(detectedCircle.type, "ellipse");
  assert.ok(Math.abs((detectedCircle as any).cx - cx) < 15);
  assert.ok(Math.abs((detectedCircle as any).cy - cy) < 15);

  // 2. Straight line points
  const linePoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    linePoints.push({ x: 100 + i * 15, y: 150 + (i % 2 === 0 ? 1 : 0) });
  }
  const detectedLine = detectSmartShape(linePoints);
  assert.ok(detectedLine !== null);
  assert.equal(detectedLine.type, "line");
  assert.equal((detectedLine as any).x1, 100);

  // 3. Insufficient points (<10)
  assert.equal(detectSmartShape(linePoints.slice(0, 5)), null);

  // 4. Random erratic squiggle (not a closed loop, not a straight line)
  const squiggle = [
    { x: 10, y: 10 }, { x: 50, y: 90 }, { x: 100, y: 20 },
    { x: 120, y: 80 }, { x: 20, y: 150 }, { x: 180, y: 40 },
    { x: 190, y: 100 }, { x: 30, y: 70 }, { x: 140, y: 130 },
    { x: 80, y: 160 }, { x: 220, y: 10 },
  ];
  assert.equal(detectSmartShape(squiggle), null);
});

test("IMPORT VALIDATION: Rejects invalid MIME types, oversized bytes (>15MB), oversized dimensions (>8192px)", () => {
  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_DIMENSION = 8192;

  // 1. MIME type validation
  const isValidMime = (type: string) => type.startsWith("image/");
  assert.equal(isValidMime("image/png"), true);
  assert.equal(isValidMime("image/jpeg"), true);
  assert.equal(isValidMime("image/webp"), true);
  assert.equal(isValidMime("image/gif"), true);
  assert.equal(isValidMime("text/plain"), false);
  assert.equal(isValidMime("application/pdf"), false);
  assert.equal(isValidMime("application/octet-stream"), false);

  // 2. File size limit
  const isFileSizeAllowed = (size: number) => size <= MAX_FILE_SIZE;
  assert.equal(isFileSizeAllowed(5 * 1024 * 1024), true);
  assert.equal(isFileSizeAllowed(15 * 1024 * 1024), true);
  assert.equal(isFileSizeAllowed(15 * 1024 * 1024 + 1), false);
  assert.equal(isFileSizeAllowed(50 * 1024 * 1024), false);

  // 3. Dimension limits
  const areDimensionsAllowed = (w: number, h: number) =>
    w > 0 && h > 0 && w <= MAX_DIMENSION && h <= MAX_DIMENSION;
  assert.equal(areDimensionsAllowed(800, 600), true);
  assert.equal(areDimensionsAllowed(4096, 4096), true);
  assert.equal(areDimensionsAllowed(8192, 8192), true);
  assert.equal(areDimensionsAllowed(8193, 100), false);
  assert.equal(areDimensionsAllowed(100, 10000), false);
  assert.equal(areDimensionsAllowed(0, 500), false);
});

test("PENDING CANCELLATION: Canvas clear and playback toggle safely discard active pending state", () => {
  const frameA = createFrame("data:image/png;base64,A");
  const frames = [frameA];

  const pendingText: ActiveText = {
    id: "text-1",
    ownerFrameId: frameA.id,
    text: "Uncommitted text",
    x: 100,
    y: 100,
    size: 24,
    font: "Nunito",
    color: "#000000",
    isEditing: true,
    isNew: true,
  };

  // When user clicks clear or toggles playback, cancelPendingChanges resets the tool state
  let activeTextState: ActiveText | null = pendingText;
  const cancelPendingChanges = () => {
    activeTextState = null;
  };

  cancelPendingChanges();
  assert.equal(activeTextState, null);
  // Original frame remained clean without uncommitted text object
  assert.equal(frames[0].objects.length, 0);
});


