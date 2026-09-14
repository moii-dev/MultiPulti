import type { ComponentType } from "react";

export interface Point {
  x: number;
  y: number;
}

export type SmartShape =
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number };

export interface PlacedText {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: string;
  color: string;
}

export interface FrameHistoryEntry {
  frames: string[];
}

export interface StoredAppState {
  history: FrameHistoryEntry[];
  historyIndex: number;
  currentFrame: number;
  recentColors: string[];
  favoriteColors: string[];
}

export interface ActiveSelection {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveSticker {
  emoji: string;
  x: number;
  y: number;
  size: number;
}

export interface ActiveText {
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  color: string;
  isEditing: boolean;
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

