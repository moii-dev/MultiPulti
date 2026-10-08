import type { ComponentType } from "react";

export interface Point {
  x: number;
  y: number;
}

export type SmartShape =
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number };

export interface TextObject {
  kind: "text";
  id: string;
  size: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: string;
  color: string;
}

export interface FrameHistoryEntry {
  frames: Frame[];
}

export interface StickerObject {
  kind: "sticker";
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
}

/** Raster overlays retain paint order without converting brush strokes to vectors. */
export interface RasterLayer {
  kind: "raster";
  id: string;
  bitmap: string;
}
export type CanvasObject = TextObject | StickerObject | RasterLayer;
export interface Frame {
  id: string;
  bitmap: string;
  objects: CanvasObject[];
  /** Derived composite for timeline and export. */
  preview: string;
}
export interface Project {
  version: 2;
  frames: Frame[];
  currentFrameId: string;
}

export interface StoredAppState {
  history: FrameHistoryEntry[];
  historyIndex: number;
  currentFrame: number;
  recentColors: string[];
  favoriteColors: string[];
}

export interface ActiveSelection {
  ownerFrameId?: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;
  originalBitmap?: string;
  hasChanged?: boolean;
}

export interface ActiveSticker {
  id?: string;
  ownerFrameId?: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  initialX?: number;
  initialY?: number;
  initialSize?: number;
  initialEmoji?: string;
  isNew?: boolean;
}

export interface ActiveText {
  id?: string;
  ownerFrameId?: string;
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  color: string;
  isEditing: boolean;
  initialText?: string;
  initialX?: number;
  initialY?: number;
  initialSize?: number;
  initialFont?: string;
  initialColor?: string;
  isNew?: boolean;
}

export interface EditorContextMenu {
  x: number;
  y: number;
  target: "selection" | "sticker" | "text";
}

export type ToolId =
  | "select"
  | "brush"
  | "eraser"
  | "fill"
  | "pipette"
  | "shape"
  | "text"
  | "sticker";

export type ShapeId =
  | "line"
  | "rect"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "arrow"
  | "star"
  | "heart"
  | "hexagon";

export interface ToolOption {
  id: ToolId;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

export interface ShapeOption {
  id: ShapeId;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

export interface CanvasClientPosition {
  clientX: number;
  clientY: number;
}
