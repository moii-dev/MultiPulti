import type { Point } from "../types/editor";

export type PointerGestureType =
  | "idle"
  | "drawing_brush"
  | "drawing_eraser"
  | "drawing_shape"
  | "moving_selection"
  | "box_selecting"
  | "moving_text"
  | "moving_sticker"
  | "resizing_sticker";

export interface PointerGestureState {
  activePointerId: number | null;
  gesture: PointerGestureType;
  startPos: Point;
  lastPos: Point;
  points: Point[];
  initialPos: Point;
  initialSize: number;
}

export function createInitialPointerState(): PointerGestureState {
  return {
    activePointerId: null,
    gesture: "idle",
    startPos: { x: 0, y: 0 },
    lastPos: { x: 0, y: 0 },
    points: [],
    initialPos: { x: 0, y: 0 },
    initialSize: 100,
  };
}

export function startPointerGesture(
  currentState: PointerGestureState,
  pointerId: number,
  gesture: PointerGestureType,
  pos: Point,
  options?: {
    initialPos?: Point;
    initialSize?: number;
    initialPoints?: Point[];
  }
): PointerGestureState | null {
  // Disallow starting a new gesture if another pointer is already active
  if (currentState.activePointerId !== null && currentState.activePointerId !== pointerId) {
    return null;
  }

  return {
    activePointerId: pointerId,
    gesture,
    startPos: { ...pos },
    lastPos: { ...pos },
    points: options?.initialPoints ? [...options.initialPoints] : [{ ...pos }],
    initialPos: options?.initialPos ? { ...options.initialPos } : { ...pos },
    initialSize: options?.initialSize ?? 100,
  };
}

export function updatePointerGesture(
  currentState: PointerGestureState,
  pointerId: number,
  currentPos: Point
): { state: PointerGestureState; dx: number; dy: number } | null {
  if (currentState.activePointerId === null || currentState.activePointerId !== pointerId) {
    return null;
  }
  if (currentState.gesture === "idle") {
    return null;
  }

  const dx = currentPos.x - currentState.startPos.x;
  const dy = currentPos.y - currentState.startPos.y;

  const nextPoints =
    currentState.gesture === "drawing_brush"
      ? [...currentState.points, { ...currentPos }]
      : currentState.points;

  const nextState: PointerGestureState = {
    ...currentState,
    lastPos: { ...currentPos },
    points: nextPoints,
  };

  return { state: nextState, dx, dy };
}

export function finishPointerGesture(
  currentState: PointerGestureState,
  pointerId: number
): { gesture: PointerGestureType; state: PointerGestureState } | null {
  if (currentState.activePointerId === null || currentState.activePointerId !== pointerId) {
    return null;
  }

  const finishedGesture = currentState.gesture;
  const nextState = createInitialPointerState();

  return { gesture: finishedGesture, state: nextState };
}

export function cancelPointerGesture(
  currentState: PointerGestureState,
  pointerId?: number | null
): { cancelledGesture: PointerGestureType; needsEraserRollback: boolean; state: PointerGestureState } {
  // If specific pointerId is passed and doesn't match active, no-op cancel
  if (
    pointerId !== undefined &&
    pointerId !== null &&
    currentState.activePointerId !== null &&
    currentState.activePointerId !== pointerId
  ) {
    return {
      cancelledGesture: "idle",
      needsEraserRollback: false,
      state: currentState,
    };
  }

  const cancelledGesture = currentState.gesture;
  const needsEraserRollback = cancelledGesture === "drawing_eraser";

  return {
    cancelledGesture,
    needsEraserRollback,
    state: createInitialPointerState(),
  };
}

