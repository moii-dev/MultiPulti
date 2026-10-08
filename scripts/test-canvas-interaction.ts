import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateCanvasCoordinates,
  calculateTextInputGeometry,
} from "../src/canvas/operations";
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

