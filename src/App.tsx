import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Pen,
  Eraser,
  PaintBucket,
  Minus,
  Circle,
  Square,
  Undo,
  Redo,
  Play,
  Square as StopCircle,
  Plus,
  Copy,
  Trash,
  Save,
  Image as ImageIcon,
  Download,
  Smile,
  Check,
  X,
  Wand2,
  FlipHorizontal,
  BookTemplate,
  Pipette,
  Palette,
  Star,
  Triangle,
  Diamond,
  ArrowRight,
  Heart,
  Hexagon,
  Shapes,
  Type,
  MousePointer2,
} from "lucide-react";
import { cn } from "./utils/cn";
import { floodFill } from "./utils/floodFill";
import { extractObject, extractObjectInRect } from "./utils/extractObject";
import { detectSmartShape, type Point, type SmartShape } from "./utils/shapeDetection";
import { exportToGif } from "./utils/gifExport";
import { playPop, playSwoosh, playAction, playError } from "./utils/audio";


interface PlacedText {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: string;
  color: string;
}

interface FrameHistoryEntry {
  frames: string[];
}

interface StoredAppState {
  history: FrameHistoryEntry[];
  historyIndex: number;
  currentFrame: number;
  recentColors: string[];
  favoriteColors: string[];
}

interface ActiveSelection {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
}

type ToolId =
  | "select"
  | "brush"
  | "eraser"
  | "fill"
  | "pipette"
  | "shape"
  | "text"
  | "sticker";

type ShapeId =
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

interface ToolOption {
  id: ToolId;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface CanvasClientPosition {
  clientX: number;
  clientY: number;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const LOGO_URL = new URL("../assets/MultiPulit-Logo.png", import.meta.url).href;

const BASIC_COLORS = [
  { hex: "#000000", name: "Чёрный" },
  { hex: "#FFFFFF", name: "Белый" },
  { hex: "#FF3B30", name: "Красный" },
  { hex: "#FF9500", name: "Оранжевый" },
  { hex: "#FFCC00", name: "Жёлтый" },
  { hex: "#4CD964", name: "Зелёный" },
  { hex: "#5AC8FA", name: "Голубой" },
  { hex: "#007AFF", name: "Синий" },
  { hex: "#5856D6", name: "Фиолетовый" },
  { hex: "#FF2D55", name: "Розовый" },
  { hex: "#A2845E", name: "Коричневый" },
  { hex: "#8E8E93", name: "Серый" },
];

const rgbToHex = (r: number, g: number, b: number) => {
  return (
    "#" +
    ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()
  );
};

const hsvToHex = (h: number, s: number, v: number) => {
  s /= 100;
  v /= 100;
  const f = (n: number, k = (n + h / 60) % 6) =>
    v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  const r = Math.round(f(5) * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(f(3) * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(f(1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
};

const BRUSH_SIZES = [
  { id: "small", size: 5, label: "Тонко" },
  { id: "medium", size: 15, label: "Средне" },
  { id: "large", size: 30, label: "Толсто" },
];

const TOOLS: ToolOption[] = [
  { id: "select", icon: MousePointer2, label: "Переместить" },
  { id: "brush", icon: Pen, label: "Кисть" },
  { id: "eraser", icon: Eraser, label: "Ластик" },
  { id: "fill", icon: PaintBucket, label: "Заливка" },
  { id: "shape", icon: Shapes, label: "Фигуры" },
  { id: "text", icon: Type, label: "Текст" },
  { id: "sticker", icon: Smile, label: "Стикер" },
];

const SHAPES: Array<{
  id: ShapeId;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { id: "line", icon: Minus, label: "Линия" },
  { id: "rect", icon: Square, label: "Квадрат" },
  { id: "circle", icon: Circle, label: "Круг" },
  { id: "ellipse", icon: Circle, label: "Овал" },
  { id: "triangle", icon: Triangle, label: "Треугольник" },
  { id: "diamond", icon: Diamond, label: "Ромб" },
  { id: "arrow", icon: ArrowRight, label: "Стрелка" },
  { id: "star", icon: Star, label: "Звезда" },
  { id: "heart", icon: Heart, label: "Сердце" },
  { id: "hexagon", icon: Hexagon, label: "Шестиугольник" },
];

const STICKERS = [
  {
    category: "Фигуры",
    items: [
      "⭐",
      "💖",
      "🔺",
      "🔻",
      "🔴",
      "🔵",
      "🟡",
      "🟢",
      "🟥",
      "🟦",
      "🟨",
      "🟩",
    ],
  },
  {
    category: "Животные",
    items: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
    ],
  },
  {
    category: "Смайлики",
    items: [
      "😀",
      "😂",
      "😊",
      "😍",
      "😎",
      "😜",
      "😡",
      "😭",
      "😱",
      "😴",
      "👽",
      "👻",
    ],
  },
];

const FPS_OPTIONS = [
  { id: "slow", fps: 2, label: "🐢 Медленно" },
  { id: "normal", fps: 5, label: "🚶 Нормально" },
  { id: "fast", fps: 12, label: "🚀 Быстро" },
];

const AVAILABLE_FONTS = ["Nunito", "Caveat", "Comfortaa", "Mali"] as const;
type FontName = (typeof AVAILABLE_FONTS)[number];

const TEMPLATES = [
  {
    id: "cat",
    label: "Котик",
    icon: "🐱",
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="35"/><path d="M25 25 L35 15 L45 25 M75 25 L65 15 L55 25"/><circle cx="35" cy="45" r="4" fill="%2394a3b8"/><circle cx="65" cy="45" r="4" fill="%2394a3b8"/><path d="M45 55 Q50 65 55 55"/><path d="M10 45 L25 50 M10 55 L25 55 M10 65 L25 60 M90 45 L75 50 M90 55 L75 55 M90 65 L75 60"/></svg>`,
  },
  {
    id: "house",
    label: "Домик",
    icon: "🏠",
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="40" width="60" height="50"/><path d="M10 40 L50 10 L90 40 Z"/><rect x="40" y="60" width="20" height="30"/><rect x="25" y="50" width="10" height="10"/><rect x="65" y="50" width="10" height="10"/></svg>`,
  },
  {
    id: "fish",
    label: "Рыбка",
    icon: "🐟",
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="50" rx="30" ry="20"/><path d="M20 50 L5 35 L5 65 Z"/><circle cx="65" cy="45" r="3" fill="%2394a3b8"/><path d="M40 30 Q50 15 60 30 M40 70 Q50 85 60 70"/></svg>`,
  },
];



const PRAISE_MESSAGES = ["Супер!", "Класс!", "Отлично!", "Красота!", "Волшебно!"];

const drawSmoothedCurve = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  size: number,
  symmetry: boolean,
) => {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (points.length === 0) return;

  const draw = (mirror: boolean) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const getX = (p: { x: number }) => (mirror ? CANVAS_WIDTH - p.x : p.x);

    ctx.moveTo(getX(points[0]), points[0].y);

    if (points.length < 3) {
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(getX(points[i]), points[i].y);
      }
    } else {
      for (let i = 1; i < points.length - 2; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(
          getX(points[i]),
          points[i].y,
          mirror ? CANVAS_WIDTH - xc : xc,
          yc,
        );
      }
      const last = points[points.length - 1];
      const secondLast = points[points.length - 2];
      ctx.quadraticCurveTo(getX(secondLast), secondLast.y, getX(last), last.y);
    }
    ctx.stroke();
  };

  draw(false);
  if (symmetry) draw(true);
};

const drawPerfectShape = (
  ctx: CanvasRenderingContext2D,
  shape: SmartShape,
  color: string,
  size: number,
  symmetry: boolean,
) => {
  const draw = (mirror: boolean) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (shape.type === "ellipse") {
      const cx = mirror ? CANVAS_WIDTH - shape.cx : shape.cx;
      ctx.ellipse(cx, shape.cy, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
    } else if (shape.type === "line") {
      ctx.moveTo(mirror ? CANVAS_WIDTH - shape.x1 : shape.x1, shape.y1);
      ctx.lineTo(mirror ? CANVAS_WIDTH - shape.x2 : shape.x2, shape.y2);
    }
    ctx.stroke();
  };
  draw(false);
  if (symmetry) draw(true);
};

const traceShapePath = (
  ctx: CanvasRenderingContext2D,
  shape: ShapeId,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) => {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const right = left + width;
  const bottom = top + height;
  const cx = left + width / 2;
  const cy = top + height / 2;

  if (shape === "line") {
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    return;
  }
  if (shape === "arrow") {
    const angle = Math.atan2(endY - startY, endX - startX);
    const headLength = Math.max(14, Math.min(42, Math.hypot(width, height) * 0.25));
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
    return;
  }
  if (shape === "rect") {
    ctx.rect(startX, startY, endX - startX, endY - startY);
    return;
  }
  if (shape === "circle") {
    ctx.arc(startX, startY, Math.hypot(endX - startX, endY - startY), 0, Math.PI * 2);
    return;
  }
  if (shape === "ellipse") {
    ctx.ellipse(cx, cy, Math.max(width / 2, 1), Math.max(height / 2, 1), 0, 0, Math.PI * 2);
    return;
  }
  if (shape === "triangle") {
    ctx.moveTo(cx, top);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    return;
  }
  if (shape === "diamond") {
    ctx.moveTo(cx, top);
    ctx.lineTo(right, cy);
    ctx.lineTo(cx, bottom);
    ctx.lineTo(left, cy);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    ctx.moveTo(cx, bottom);
    ctx.bezierCurveTo(left - width * 0.08, cy + height * 0.2, left, top, cx, top + height * 0.28);
    ctx.bezierCurveTo(right, top, right + width * 0.08, cy + height * 0.2, cx, bottom);
    ctx.closePath();
    return;
  }

  const points = shape === "star" ? 10 : 6;
  for (let i = 0; i < points; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / points;
    const radiusScale = shape === "star" && i % 2 === 1 ? 0.45 : 1;
    const px = cx + Math.cos(angle) * (width / 2) * radiusScale;
    const py = cy + Math.sin(angle) * (height / 2) * radiusScale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

const getBlankCanvas = () => {
  const c = document.createElement("canvas");
  c.width = CANVAS_WIDTH;
  c.height = CANVAS_HEIGHT;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return c.toDataURL("image/png");
};

const isFrameHistoryEntry = (value: unknown): value is FrameHistoryEntry => {
  if (typeof value !== "object" || value === null) return false;
  const { frames } = value as { frames?: unknown };
  return (
    Array.isArray(frames) &&
    frames.length > 0 &&
    frames.every((frame) => typeof frame === "string")
  );
};

const clampIndex = (value: unknown, maxIndex: number) => {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(Math.max(value, 0), maxIndex)
    : 0;
};

const getInitialState = (): StoredAppState | null => {
  try {
    const saved = localStorage.getItem("multipulti_state");
    if (saved) {
      const parsed = JSON.parse(saved) as unknown;
      if (typeof parsed !== "object" || parsed === null) return null;

      // Состояние в localStorage могло остаться от старой версии, поэтому нормализуем индексы и списки.
      const rawState = parsed as Partial<StoredAppState>;
      const history = Array.isArray(rawState.history)
        ? rawState.history.filter(isFrameHistoryEntry)
        : [];
      if (history.length === 0) return null;

      const historyIndex = clampIndex(rawState.historyIndex, history.length - 1);
      const currentFrame = clampIndex(
        rawState.currentFrame,
        history[historyIndex].frames.length - 1,
      );

      return {
        history,
        historyIndex,
        currentFrame,
        recentColors: Array.isArray(rawState.recentColors)
          ? rawState.recentColors.filter((item): item is string => typeof item === "string")
          : [],
        favoriteColors: Array.isArray(rawState.favoriteColors)
          ? rawState.favoriteColors.filter((item): item is string => typeof item === "string")
          : [],
      };
    }
  } catch {
    return null;
  }
  return null;
};

export default function App() {
  const [initialState] = useState(getInitialState);

  const [history, setHistory] = useState<FrameHistoryEntry[]>(
    initialState?.history || [{ frames: [getBlankCanvas()] }],
  );
  const [historyIndex, setHistoryIndex] = useState(
    initialState?.historyIndex ?? 0,
  );
  const [currentFrame, setCurrentFrame] = useState(
    initialState?.currentFrame ?? 0,
  );

  const [tool, setTool] = useState<ToolId>("brush");
  const [selectedShape, setSelectedShape] = useState<ShapeId>("line");
  const [color, setColor] = useState(BASIC_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);

  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(FPS_OPTIONS[1].fps);
  const [isExporting, setIsExporting] = useState(false);

  const [recentColors, setRecentColors] = useState<string[]>(
    initialState?.recentColors || [],
  );
  const [favoriteColors, setFavoriteColors] = useState<string[]>(
    initialState?.favoriteColors || [],
  );
  const [showColorModal, setShowColorModal] = useState(false);
  const [customHue, setCustomHue] = useState(0);
  const [customSat, setCustomSat] = useState(100);
  const [customVal, setCustomVal] = useState(100);
  const colorSquareRef = useRef<HTMLDivElement>(null);
  const pipetteReturnToolRef = useRef<ToolId>("brush");

  const [activeSticker, setActiveSticker] = useState<{
    emoji: string;
    x: number;
    y: number;
    size: number;
  } | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string>("⭐");
  const [showStickerPanel, setShowStickerPanel] = useState(false);

  const [activeText, setActiveText] = useState<{
    text: string;
    x: number;
    y: number;
    size: number;
    font: string;
    color: string;
    isEditing: boolean;
  } | null>(null);
  const [selectedFont, setSelectedFont] = useState<FontName>("Nunito");
  const [textInput, setTextInput] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  const [assistMode, setAssistMode] = useState(false);
  const [symmetryMode, setSymmetryMode] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; id: number } | null>(
    null,
  );

  const pointsRef = useRef<Point[]>([]);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMovingStickerRef = useRef(false);
  const isResizingStickerRef = useRef(false);
  const initialStickerPosRef = useRef({ x: 0, y: 0 });
  const initialStickerSizeRef = useRef(100);

  const isMovingTextRef = useRef(false);
  const initialTextPosRef = useRef({ x: 0, y: 0 });

  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: "selection" | "sticker" | "text";
  } | null>(null);

  const [placedTexts, setPlacedTexts] = useState<PlacedText[]>([]);

  const isMovingSelectionRef = useRef(false);
  const isBoxSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const initialSelectionPosRef = useRef({ x: 0, y: 0 });

  const [draggedFrameIdx, setDraggedFrameIdx] = useState<number | null>(null);

  const frames = history[historyIndex].frames;

  const clearOverlayCanvas = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");
    if (!overlayCanvas || !overlayCtx) return;

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }, []);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedFrameIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    // Firefox не запускает drag-and-drop без данных, даже если они не нужны приложению.
    e.dataTransfer.setData("text/plain", idx.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (draggedFrameIdx === null || draggedFrameIdx === dropIdx) return;

    const newFrames = [...frames];
    const [draggedFrame] = newFrames.splice(draggedFrameIdx, 1);
    newFrames.splice(dropIdx, 0, draggedFrame);

    saveState(newFrames);
    if (currentFrame === draggedFrameIdx) {
      setCurrentFrame(dropIdx);
    } else if (currentFrame > draggedFrameIdx && currentFrame <= dropIdx) {
      setCurrentFrame(currentFrame - 1);
    } else if (currentFrame < draggedFrameIdx && currentFrame >= dropIdx) {
      setCurrentFrame(currentFrame + 1);
    }
    setDraggedFrameIdx(null);
    playPop();
  };

  const handleDragEnd = () => {
    setDraggedFrameIdx(null);
  };

  useEffect(() => {
    try {
      const stateToSave = {
        history,
        historyIndex,
        currentFrame,
        favoriteColors,
        recentColors,
      };
      localStorage.setItem("multipulti_state", JSON.stringify(stateToSave));
    } catch (e) {
      console.warn(
        "Не удалось сохранить полное состояние в localStorage, пробуем сохранить только текущий кадр",
        e,
      );
      try {
        const minimalState = {
          history: [history[historyIndex]],
          historyIndex: 0,
          currentFrame,
          favoriteColors,
          recentColors,
        };
        localStorage.setItem("multipulti_state", JSON.stringify(minimalState));
      } catch (e2) {
        console.error("Даже минимальное состояние не помещается в localStorage", e2);
      }
    }
  }, [history, historyIndex, currentFrame, favoriteColors, recentColors]);

  const saveState = useCallback(
    (newFrames: string[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ frames: newFrames });
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex],
  );

  const saveCanvasSnapshot = useCallback(
    (canvas: HTMLCanvasElement) => {
      const newFrames = [...frames];
      newFrames[currentFrame] = canvas.toDataURL("image/png");
      saveState(newFrames);
    },
    [frames, currentFrame, saveState],
  );



  const finalizeSticker = useCallback(() => {
    if (!activeSticker) return;
    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    if (!mainCanvas || !mainCtx) return;

    mainCtx.font = `${activeSticker.size}px Arial`;
    mainCtx.textAlign = "center";
    mainCtx.textBaseline = "middle";
    mainCtx.fillText(activeSticker.emoji, activeSticker.x, activeSticker.y);

    saveCanvasSnapshot(mainCanvas);

    setActiveSticker(null);
    clearOverlayCanvas();
    playPop();
  }, [activeSticker, clearOverlayCanvas, saveCanvasSnapshot]);

  const finalizeText = useCallback(() => {
    if (!activeText || activeText.text.trim() === "") {
      setActiveText(null);
      return;
    }
    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    if (!mainCanvas || !mainCtx) return;

    mainCtx.font = `${activeText.size}px ${activeText.font}`;
    mainCtx.textAlign = "center";
    mainCtx.textBaseline = "middle";
    mainCtx.fillStyle = activeText.color;
    mainCtx.fillText(activeText.text, activeText.x, activeText.y);

    const metrics = mainCtx.measureText(activeText.text);
    setPlacedTexts((prev) => [
      ...prev,
      {
        id: Date.now(),
        x: activeText.x,
        y: activeText.y,
        w: metrics.width,
        h: activeText.size,
        text: activeText.text,
        font: activeText.font,
        color: activeText.color,
      },
    ]);

    saveCanvasSnapshot(mainCanvas);

    setActiveText(null);
    setTextInput("");
    clearOverlayCanvas();
    playPop();
  }, [activeText, clearOverlayCanvas, saveCanvasSnapshot]);

  const finalizeSelection = useCallback(() => {
    if (!activeSelection) return;
    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    if (!mainCanvas || !mainCtx) return;

    mainCtx.drawImage(
      activeSelection.canvas,
      activeSelection.x,
      activeSelection.y,
      activeSelection.width,
      activeSelection.height
    );

    saveCanvasSnapshot(mainCanvas);

    setActiveSelection(null);
    clearOverlayCanvas();
    playPop();
  }, [activeSelection, clearOverlayCanvas, saveCanvasSnapshot]);

  const cancelSticker = useCallback(() => {
    setActiveSticker(null);
    clearOverlayCanvas();
    playPop();
  }, [clearOverlayCanvas]);

  const handleSetTool = useCallback(
    (newTool: ToolId) => {
      if (tool === "sticker" && newTool !== "sticker" && activeSticker && newTool !== "select") {
        finalizeSticker();
      }
      if (tool === "text" && newTool !== "text" && activeText && newTool !== "select") {
        finalizeText();
      }
      if (tool === "select" && newTool !== "select") {
        if (activeSelection) finalizeSelection();
        if (activeText) finalizeText();
        if (activeSticker) finalizeSticker();
      }
      setTool(newTool);
    },
    [
      tool,
      activeSticker,
      activeText,
      activeSelection,
      finalizeSticker,
      finalizeText,
      finalizeSelection,
    ],
  );

  const activatePipette = useCallback(() => {
    if (tool !== "pipette") pipetteReturnToolRef.current = tool;
    handleSetTool("pipette");
    playPop();
  }, [handleSetTool, tool]);

  const convertSelectionToText = useCallback((matchedText?: PlacedText | null) => {
    if (!activeSelection) return;
    setActiveText({
      text: matchedText ? matchedText.text : "",
      x: activeSelection.x + activeSelection.width / 2,
      y: activeSelection.y + activeSelection.height / 2,
      size: Math.max(30, Math.min(activeSelection.height, 120)),
      font: matchedText ? matchedText.font : "Nunito",
      color: matchedText ? matchedText.color : color,
      isEditing: true,
    });
    setTextInput(matchedText ? matchedText.text : "");
    if (matchedText) {
      setPlacedTexts(prev => prev.filter(pt => pt.id !== matchedText.id));
    }
    setActiveSelection(null);
    setTool("text");
    setTimeout(() => textInputRef.current?.focus(), 50);
    playPop();
  }, [activeSelection, color]);

  useEffect(() => {
    if (isDrawingRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = frames[currentFrame] || getBlankCanvas();
  }, [frames, currentFrame]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
      }, 1000 / fps);
    }
    return () => clearInterval(interval);
  }, [isPlaying, fps, frames.length]);

  const scaleSelection = useCallback((factor: number) => {
    if (!activeSelection) return;
    const newW = activeSelection.width * factor;
    const newH = activeSelection.height * factor;
    const dx = (activeSelection.width - newW) / 2;
    const dy = (activeSelection.height - newH) / 2;
    
    if (newW < 10 || newH < 10 || newW > CANVAS_WIDTH * 2 || newH > CANVAS_HEIGHT * 2) return;

    setActiveSelection({
      ...activeSelection,
      width: newW,
      height: newH,
      x: activeSelection.x + dx,
      y: activeSelection.y + dy,
    });
    playPop();
  }, [activeSelection]);

  const flipSelection = useCallback(() => {
    if (!activeSelection) return;
    const canvas = activeSelection.canvas;
    const temp = document.createElement("canvas");
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tctx = temp.getContext("2d");
    if (!tctx) return;

    tctx.translate(canvas.width, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(canvas, 0, 0);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(temp, 0, 0);
    }
    setActiveSelection({ ...activeSelection });
    playAction();
  }, [activeSelection]);

  const tintSelection = useCallback((colorHex: string, silent = false) => {
    if (!activeSelection) return;
    const canvas = activeSelection.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    
    setActiveSelection({ ...activeSelection });
    if (!silent) playPop();
  }, [activeSelection]);

  const getCoordinates = (e: CanvasClientPosition) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const isSelectionPixelAt = (
    selection: ActiveSelection,
    x: number,
    y: number,
  ) => {
    if (
      x < selection.x ||
      x > selection.x + selection.width ||
      y < selection.y ||
      y > selection.y + selection.height
    ) {
      return false;
    }

    const selectionCtx = selection.canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!selectionCtx || selection.width <= 0 || selection.height <= 0) {
      return false;
    }

    const localX = Math.floor(
      ((x - selection.x) / selection.width) * selection.canvas.width,
    );
    const localY = Math.floor(
      ((y - selection.y) / selection.height) * selection.canvas.height,
    );
    const radiusX = Math.max(
      1,
      Math.ceil((8 / selection.width) * selection.canvas.width),
    );
    const radiusY = Math.max(
      1,
      Math.ceil((8 / selection.height) * selection.canvas.height),
    );
    const sampleX = Math.max(0, localX - radiusX);
    const sampleY = Math.max(0, localY - radiusY);
    const sampleWidth = Math.min(
      selection.canvas.width - sampleX,
      radiusX * 2 + 1,
    );
    const sampleHeight = Math.min(
      selection.canvas.height - sampleY,
      radiusY * 2 + 1,
    );

    if (sampleWidth <= 0 || sampleHeight <= 0) return false;

    const pixels = selectionCtx.getImageData(
      sampleX,
      sampleY,
      sampleWidth,
      sampleHeight,
    ).data;

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) return true;
    }
    return false;
  };

  const handleColorSelect = useCallback((c: string) => {
    setColor(c);
    setRecentColors((prev) => {
      const newRecent = [c, ...prev.filter((col) => col !== c)].slice(0, 8);
      return newRecent;
    });
  }, []);

  const toggleFavorite = (c: string) => {
    setFavoriteColors((prev) =>
      prev.includes(c) ? prev.filter((col) => col !== c) : [...prev, c],
    );
    playPop();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    if (e.button === 2) return;
    const { x, y } = getCoordinates(e);
    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    if (!mainCanvas || !mainCtx) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "select") {
      if (activeText) {
        mainCtx.font = `${activeText.size}px ${activeText.font}`;
        const metrics = mainCtx.measureText(activeText.text || " ");
        const textW = metrics.width;
        const textH = activeText.size;
        if (
          Math.abs(x - activeText.x) < Math.max(textW / 2 + 20, 30) &&
          Math.abs(y - activeText.y) < Math.max(textH / 2 + 20, 30)
        ) {
          isMovingTextRef.current = true;
          startPosRef.current = { x, y };
          initialTextPosRef.current = { x: activeText.x, y: activeText.y };
          return;
        } else {
          finalizeText();
        }
      }

      if (activeSelection) {
        if (isSelectionPixelAt(activeSelection, x, y)) {
          isMovingSelectionRef.current = true;
          startPosRef.current = { x, y };
          initialSelectionPosRef.current = {
            x: activeSelection.x,
            y: activeSelection.y,
          };
          return;
        } else {
          finalizeSelection();
        }
      }

      const extractedObject = extractObject(mainCtx, x, y);
      if (extractedObject) {
        setActiveSelection(extractedObject);
        isMovingSelectionRef.current = true;
        startPosRef.current = { x, y };
        initialSelectionPosRef.current = {
          x: extractedObject.x,
          y: extractedObject.y,
        };

        saveCanvasSnapshot(mainCanvas);
        playPop();
      } else {
        isBoxSelectingRef.current = true;
        selectionStartRef.current = { x, y };
        startPosRef.current = { x, y };
      }
      return;
    }

    if (tool === "pipette") {
      const pixel = mainCtx.getImageData(x, y, 1, 1).data;
      if (pixel[3] === 0) {
        handleColorSelect("#FFFFFF");
      } else {
        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        handleColorSelect(hex);
      }
      handleSetTool(pipetteReturnToolRef.current);
      playPop();
      return;
    }

    if (tool === "sticker") {
      if (activeSticker) {
        const halfSize = activeSticker.size / 2;
        const handleSize = 24;
        const handleX = activeSticker.x + halfSize;
        const handleY = activeSticker.y + halfSize;

        if (
          Math.abs(x - handleX) < handleSize &&
          Math.abs(y - handleY) < handleSize
        ) {
          isResizingStickerRef.current = true;
          startPosRef.current = { x, y };
          initialStickerSizeRef.current = activeSticker.size;
          return;
        }

        if (
          Math.abs(x - activeSticker.x) < halfSize &&
          Math.abs(y - activeSticker.y) < halfSize
        ) {
          isMovingStickerRef.current = true;
          startPosRef.current = { x, y };
          initialStickerPosRef.current = {
            x: activeSticker.x,
            y: activeSticker.y,
          };
          return;
        }

        finalizeSticker();
        return;
      } else {
        setActiveSticker({ emoji: selectedSticker, x, y, size: 100 });
        playPop();
        return;
      }
    }

    if (tool === "text") {
      if (activeText) {
        if (!activeText.isEditing) {
          const ctx = overlayCanvasRef.current?.getContext("2d");
          if (ctx) {
            ctx.font = `${activeText.size}px ${activeText.font}`;
            const metrics = ctx.measureText(activeText.text);
            const halfWidth = metrics.width / 2;
            const halfHeight = activeText.size / 2;

            // Даем небольшой запас, чтобы текст было проще схватить пальцем.
            if (
              Math.abs(x - activeText.x) < halfWidth + 20 &&
              Math.abs(y - activeText.y) < halfHeight + 20
            ) {
              isMovingTextRef.current = true;
              startPosRef.current = { x, y };
              initialTextPosRef.current = { x: activeText.x, y: activeText.y };
              return;
            }
          }
          finalizeText();
          return;
        }

        if (activeText.isEditing) {
          finalizeText();
          return;
        }
      } else {
        setActiveText({
          text: "",
          x,
          y,
          size: brushSize * 4 + 20,
          font: selectedFont,
          color,
          isEditing: true,
        });
        setTextInput("");
        setTimeout(() => textInputRef.current?.focus(), 10);
        return;
      }
    }

    if (tool === "fill") {
      playAction();
      floodFill(mainCtx, Math.floor(x), Math.floor(y), color);
      saveCanvasSnapshot(mainCanvas);

      return;
    }

    if (tool === "brush") {
      isDrawingRef.current = true;
      pointsRef.current = [{ x, y }];
      const overlayCtx = overlayCanvasRef.current?.getContext("2d");
      if (overlayCtx) {
        drawSmoothedCurve(
          overlayCtx,
          pointsRef.current,
          color,
          brushSize,
          symmetryMode,
        );
      }
      return;
    }

    if (tool === "eraser") {
      isDrawingRef.current = true;
      startPosRef.current = { x, y };
      mainCtx.lineCap = "round";
      mainCtx.lineJoin = "round";
      mainCtx.lineWidth = brushSize;
      mainCtx.strokeStyle = "#FFFFFF";

      mainCtx.beginPath();
      mainCtx.moveTo(x, y);
      mainCtx.lineTo(x, y);
      mainCtx.stroke();

      if (symmetryMode) {
        mainCtx.beginPath();
        mainCtx.moveTo(CANVAS_WIDTH - x, y);
        mainCtx.lineTo(CANVAS_WIDTH - x, y);
        mainCtx.stroke();
      }
      return;
    }

    isDrawingRef.current = true;
    startPosRef.current = { x, y };

    mainCtx.lineCap = "round";
    mainCtx.lineJoin = "round";
    mainCtx.lineWidth = brushSize;
    mainCtx.strokeStyle = color;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const { x, y } = getCoordinates(e);

    if (tool === "select") {
      if (isBoxSelectingRef.current) {
        const overlayCanvas = overlayCanvasRef.current;
        const overlayCtx = overlayCanvas?.getContext("2d");
        if (!overlayCanvas || !overlayCtx) return;

        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        overlayCtx.strokeStyle = "#2563EB";
        overlayCtx.fillStyle = "rgba(37, 99, 235, 0.08)";
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([7, 5]);
        overlayCtx.fillRect(
          selectionStartRef.current.x,
          selectionStartRef.current.y,
          x - selectionStartRef.current.x,
          y - selectionStartRef.current.y,
        );
        overlayCtx.strokeRect(
          selectionStartRef.current.x,
          selectionStartRef.current.y,
          x - selectionStartRef.current.x,
          y - selectionStartRef.current.y,
        );
        overlayCtx.setLineDash([]);
        return;
      }

      if (activeSelection && isMovingSelectionRef.current) {
        const dx = x - startPosRef.current.x;
        const dy = y - startPosRef.current.y;
        setActiveSelection((selection) =>
          selection
            ? {
                ...selection,
                x: initialSelectionPosRef.current.x + dx,
                y: initialSelectionPosRef.current.y + dy,
              }
            : selection,
        );
        return;
      }
    }

    if ((tool === "text" || tool === "select") && activeText) {
      if (isMovingTextRef.current) {
        const dx = x - startPosRef.current.x;
        const dy = y - startPosRef.current.y;
        setActiveText({
          ...activeText,
          x: initialTextPosRef.current.x + dx,
          y: initialTextPosRef.current.y + dy,
        });
      }
      return;
    }

    if (tool === "sticker" && activeSticker) {
      if (isMovingStickerRef.current) {
        const dx = x - startPosRef.current.x;
        const dy = y - startPosRef.current.y;
        setActiveSticker({
          ...activeSticker,
          x: initialStickerPosRef.current.x + dx,
          y: initialStickerPosRef.current.y + dy,
        });
      } else if (isResizingStickerRef.current) {
        const dx = x - startPosRef.current.x;
        const newSize = Math.max(30, initialStickerSizeRef.current + dx * 2);
        setActiveSticker({
          ...activeSticker,
          size: newSize,
        });
      }
      return;
    }

    if (!isDrawingRef.current) return;
    const mainCtx = mainCanvasRef.current?.getContext("2d", {
      willReadFrequently: true,
    });
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");

    if (!mainCtx || !overlayCanvas || !overlayCtx) return;

    if (tool === "brush") {
      pointsRef.current.push({ x, y });
      drawSmoothedCurve(
        overlayCtx,
        pointsRef.current,
        color,
        brushSize,
        symmetryMode,
      );
      return;
    }

    if (tool === "eraser") {
      const prev = startPosRef.current;
      mainCtx.beginPath();
      mainCtx.moveTo(prev.x, prev.y);
      mainCtx.lineTo(x, y);
      mainCtx.stroke();

      if (symmetryMode) {
        mainCtx.beginPath();
        mainCtx.moveTo(CANVAS_WIDTH - prev.x, prev.y);
        mainCtx.lineTo(CANVAS_WIDTH - x, y);
        mainCtx.stroke();
      }
      startPosRef.current = { x, y };
      return;
    }

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.lineCap = "round";
    overlayCtx.lineJoin = "round";
    overlayCtx.lineWidth = brushSize;
    overlayCtx.strokeStyle = color;

    const startX = startPosRef.current.x;
    const startY = startPosRef.current.y;

    overlayCtx.beginPath();
    if (tool === "shape") {
      traceShapePath(overlayCtx, selectedShape, startX, startY, x, y);
    }
    overlayCtx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (tool === "select") {
      if (isBoxSelectingRef.current) {
        isBoxSelectingRef.current = false;
        const { x, y } = getCoordinates(e);
        const selectionStart = selectionStartRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const overlayCtx = overlayCanvas?.getContext("2d");
        overlayCtx?.clearRect(
          0,
          0,
          overlayCanvas?.width ?? 0,
          overlayCanvas?.height ?? 0,
        );

        const selectionWidth = Math.abs(x - selectionStart.x);
        const selectionHeight = Math.abs(y - selectionStart.y);
        const mainCanvas = mainCanvasRef.current;
        const mainCtx = mainCanvas?.getContext("2d", {
          willReadFrequently: true,
        });

        if (
          selectionWidth >= 6 &&
          selectionHeight >= 6 &&
          mainCanvas &&
          mainCtx
        ) {
          const extractedObject = extractObjectInRect(
            mainCtx,
            selectionStart.x,
            selectionStart.y,
            x,
            y,
          );
          if (extractedObject) {
            setActiveSelection(extractedObject);
            saveCanvasSnapshot(mainCanvas);
            playPop();
          }
        }
        return;
      }

      if (isMovingSelectionRef.current) {
        isMovingSelectionRef.current = false;
        return;
      }
      if (isMovingTextRef.current) {
        isMovingTextRef.current = false;
        return;
      }
    }

    if (tool === "text") {
      isMovingTextRef.current = false;
      return;
    }

    if (tool === "sticker") {
      isMovingStickerRef.current = false;
      isResizingStickerRef.current = false;
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");

    if (!mainCanvas || !mainCtx || !overlayCanvas || !overlayCtx) return;

    if (tool === "brush") {
      let shapeDetected = false;
      if (assistMode) {
        const shape = detectSmartShape(pointsRef.current);
        if (shape) {
          overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          drawPerfectShape(overlayCtx, shape, color, brushSize, symmetryMode);
          shapeDetected = true;
          playPop();
        }
      }

      mainCtx.drawImage(overlayCanvas, 0, 0);
      overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      saveCanvasSnapshot(mainCanvas);

      if (assistMode && pointsRef.current.length > 20 && Math.random() > 0.5) {
        setFeedback({
          text: PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)],
          id: Date.now(),
        });
        setTimeout(() => setFeedback(null), 2000);
      }
      return;
    }

    if (tool === "eraser") {
      saveCanvasSnapshot(mainCanvas);
      return;
    }

    if (tool === "shape") {
      mainCtx.drawImage(overlayCanvas, 0, 0);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    saveCanvasSnapshot(mainCanvas);


  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasBoxSelecting = isBoxSelectingRef.current;
    isBoxSelectingRef.current = false;
    isMovingSelectionRef.current = false;
    isMovingTextRef.current = false;
    isDrawingRef.current = false;
    if (wasBoxSelecting || tool !== "select") clearOverlayCanvas();

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");
    if (!overlayCanvas || !overlayCtx) return;

    if (tool === "select" && activeSelection) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCtx.drawImage(
        activeSelection.canvas,
        activeSelection.x,
        activeSelection.y,
        activeSelection.width,
        activeSelection.height
      );
      overlayCtx.strokeStyle = "#3B82F6";
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.strokeRect(
        activeSelection.x,
        activeSelection.y,
        activeSelection.width,
        activeSelection.height
      );
      overlayCtx.setLineDash([]);
    } else if (tool === "sticker") {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      if (activeSticker) {
        overlayCtx.font = `${activeSticker.size}px Arial`;
        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        overlayCtx.fillText(
          activeSticker.emoji,
          activeSticker.x,
          activeSticker.y,
        );

        const halfSize = activeSticker.size / 2;

        overlayCtx.strokeStyle = "#3B82F6";
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(
          activeSticker.x - halfSize,
          activeSticker.y - halfSize,
          activeSticker.size,
          activeSticker.size,
        );
        overlayCtx.setLineDash([]);

        overlayCtx.fillStyle = "#3B82F6";
        const handleSize = 20;
        overlayCtx.fillRect(
          activeSticker.x + halfSize - handleSize / 2,
          activeSticker.y + halfSize - handleSize / 2,
          handleSize,
          handleSize,
        );

        overlayCtx.fillStyle = "#FFFFFF";
        overlayCtx.font = "12px Arial";
        overlayCtx.fillText(
          "⤡",
          activeSticker.x + halfSize,
          activeSticker.y + halfSize,
        );
      }
    } else if (tool === "text") {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      if (activeText && !activeText.isEditing) {
        overlayCtx.font = `${activeText.size}px ${activeText.font}`;
        const metrics = overlayCtx.measureText(activeText.text);
        const w = metrics.width;
        const h = activeText.size;

        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        overlayCtx.fillStyle = activeText.color;
        overlayCtx.fillText(activeText.text, activeText.x, activeText.y);

        overlayCtx.strokeStyle = "#3B82F6";
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(
          activeText.x - w / 2 - 5,
          activeText.y - h / 2 - 5,
          w + 10,
          h + 10,
        );
        overlayCtx.setLineDash([]);
      }
    } else if (!isDrawingRef.current) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  }, [activeSticker, activeText, tool, activeSelection]);

  const addFrame = () => {
    playPop();
    const newFrames = [...frames];
    newFrames.splice(currentFrame + 1, 0, getBlankCanvas());
    saveState(newFrames);
    setCurrentFrame(currentFrame + 1);
  };

  const copyFrame = () => {
    playPop();
    const newFrames = [...frames];
    newFrames.splice(currentFrame + 1, 0, frames[currentFrame]);
    saveState(newFrames);
    setCurrentFrame(currentFrame + 1);
  };

  const deleteFrame = () => {
    if (frames.length <= 1) {
      playError();
      return;
    }
    playSwoosh();
    const newFrames = [...frames];
    newFrames.splice(currentFrame, 1);
    saveState(newFrames);
    setCurrentFrame(Math.min(currentFrame, newFrames.length - 1));
  };

  const clearCanvas = () => {
    playSwoosh();
    const newFrames = [...frames];
    newFrames[currentFrame] = getBlankCanvas();
    saveState(newFrames);
    setPlacedTexts([]);
  };

  const savePng = () => {
    playAction();
    const link = document.createElement("a");
    link.download = `рисунок-${Date.now()}.png`;
    link.href = frames[currentFrame];
    link.click();
  };

  const saveGif = async () => {
    if (frames.length <= 1) {
      alert("Нужно больше одного кадра для мультика!");
      return;
    }
    playAction();
    setIsExporting(true);
    try {
      const blob = await exportToGif(frames, fps, CANVAS_WIDTH, CANVAS_HEIGHT);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `мультик-${Date.now()}.gif`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Ошибка при сохранении GIF");
    }
    setIsExporting(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = mainCanvasRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const newFrames = [...frames];
        newFrames[currentFrame] = canvas.toDataURL("image/png");
        saveState(newFrames);
        playPop();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);

    if (tool === "select" && activeSelection) {
      if (
        x >= activeSelection.x &&
        x <= activeSelection.x + activeSelection.width &&
        y >= activeSelection.y &&
        y <= activeSelection.y + activeSelection.height
      ) {
        setContextMenu({ x: e.pageX, y: e.pageY, target: "selection" });
      }
    } else if (tool === "sticker" && activeSticker) {
      const halfSize = activeSticker.size / 2;
      if (
        Math.abs(x - activeSticker.x) < halfSize &&
        Math.abs(y - activeSticker.y) < halfSize
      ) {
        setContextMenu({ x: e.pageX, y: e.pageY, target: "sticker" });
      }
    } else if (tool === "text" && activeText) {
      const overlayCtx = overlayCanvasRef.current?.getContext("2d");
      if (overlayCtx) {
        overlayCtx.font = `${activeText.size}px ${activeText.font}`;
        const metrics = overlayCtx.measureText(activeText.text);
        if (
          Math.abs(x - activeText.x) < metrics.width / 2 + 20 &&
          Math.abs(y - activeText.y) < activeText.size / 2 + 20
        ) {
          setContextMenu({ x: e.pageX, y: e.pageY, target: "text" });
        }
      }
    }
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-blue-50 font-sans text-gray-800">
      <header className="h-16 bg-white border-b-4 border-black flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <img
            src={LOGO_URL}
            alt="Мульти-Пульти"
            className="h-12 w-12 rounded-2xl border-4 border-black object-cover shadow-sm"
          />
          <h1
            className="text-xl font-black tracking-wider text-black uppercase hidden sm:block"
            style={{ WebkitTextStroke: "1px white" }}
          >
            Мульти-Пульти
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-kid p-2 text-blue-600"
            onClick={() => {
              playPop();
              setHistoryIndex(Math.max(0, historyIndex - 1));
            }}
            disabled={historyIndex === 0 || isPlaying}
            title="Отменить"
          >
            <Undo className="w-6 h-6" />
          </button>
          <button
            className="btn-kid p-2 text-blue-600"
            onClick={() => {
              playPop();
              setHistoryIndex(Math.min(history.length - 1, historyIndex + 1));
            }}
            disabled={historyIndex === history.length - 1 || isPlaying}
            title="Повторить"
          >
            <Redo className="w-6 h-6" />
          </button>

          <div className="w-1 h-8 bg-gray-300 mx-1 rounded-full" />

          <button
            className="btn-kid p-2 text-green-600"
            onClick={() => fileInputRef.current?.click()}
            title="Загрузить картинку"
          >
            <ImageIcon className="w-6 h-6" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />

          <button
            className="btn-kid p-2 text-red-600"
            onClick={clearCanvas}
            title="Очистить холст"
          >
            <Trash className="w-6 h-6" />
          </button>

          <button
            className="btn-kid p-2 text-purple-600"
            onClick={savePng}
            title="Сохранить картинку"
          >
            <Download className="w-6 h-6" />
          </button>
          <button
            className="btn-kid p-2 px-4 text-pink-600 flex items-center gap-2"
            onClick={saveGif}
            disabled={isExporting}
          >
            {isExporting ? (
              <span className="animate-pulse">⏳...</span>
            ) : (
              <>
                <Save className="w-6 h-6" />{" "}
                <span className="hidden sm:inline">GIF</span>
              </>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className="w-[72px] sm:w-[88px] bg-white flex flex-col items-center py-4 gap-2 overflow-y-auto no-scrollbar shrink-0 z-30 hover:z-40">
          <div className="flex flex-col gap-2 w-full px-2">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={cn(
                  "btn-kid w-14 h-14 sm:w-16 sm:h-16 flex flex-col items-center justify-center gap-0.5 p-1 relative",
                  tool === t.id &&
                    "btn-kid-active ring-4 ring-yellow-400 ring-offset-2",
                )}
                onClick={() => {
                  playPop();
                  handleSetTool(t.id);
                  if (t.id === "sticker" && !activeSticker)
                    setShowStickerPanel(true);
                }}
                title={t.label}
                aria-label={t.label}
              >
                <t.icon className="w-7 h-7 shrink-0" />
                <span className="w-full truncate text-[8px] sm:text-[9px] font-black leading-none">
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <aside className="w-48 sm:w-60 bg-blue-50/50 flex flex-col pt-0 pb-6 overflow-y-auto no-scrollbar shrink-0 z-20 transition-all duration-300">
          <div className="bg-white py-4 px-4 border-b-4 border-black mb-4 sticky top-0 z-10 shadow-sm flex items-center justify-center">
            <span className="font-black text-lg sm:text-lg uppercase tracking-wider text-black">
              {tool === "pipette" ? "Цвет" : TOOLS.find((t) => t.id === tool)?.label}
            </span>
          </div>

          <div className="flex flex-col gap-6 px-3">
            {tool === "select" && (
              <div className="flex flex-col gap-6">
                {!activeSelection && !activeText ? (
                  <div className="text-center text-sm font-bold text-gray-500 mt-4 px-2">
                    Нажми на штрих или обведи весь предмет рамкой, затем перетащи.
                  </div>
                ) : activeSelection && !activeText ? (
                  <>
                    <div className="flex flex-col gap-3">
                      <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                        Размер
                      </div>
                      <div className="flex justify-center gap-4">
                        <button
                          className="btn-kid p-3 text-2xl font-black w-14 h-14"
                          onClick={() => scaleSelection(0.9)}
                          title="Уменьшить"
                        >
                          -
                        </button>
                        <button
                          className="btn-kid p-3 text-2xl font-black w-14 h-14"
                          onClick={() => scaleSelection(1.1)}
                          title="Увеличить"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                        Отразить
                      </div>
                      <div className="flex justify-center gap-4">
                        <button
                          className="btn-kid p-3 flex items-center justify-center text-blue-600 w-14 h-14"
                          onClick={flipSelection}
                          title="По горизонтали"
                        >
                          <FlipHorizontal className="w-8 h-8" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 items-center">
                      <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                        Перекрасить (Свой цвет)
                      </div>
                      
                      <div className="w-full px-2 mb-2">
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={customHue}
                          onChange={(e) => {
                            const hue = Number(e.target.value);
                            setCustomHue(hue);
                            setCustomSat(100);
                            setCustomVal(100);
                            const hex = hsvToHex(hue, 100, 100);
                            setColor(hex);
                            if (activeText) {
                              setActiveText({ ...activeText, color: hex });
                            } else {
                              tintSelection(hex, true); // silent
                            }
                          }}
                          className="color-slider w-full h-8 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none"
                          style={{
                            background:
                              "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-2 w-full px-2">
                        {BASIC_COLORS.slice(0, 12).map((c) => (
                          <button
                            key={c.hex}
                            className="w-full aspect-square rounded-full border-4 border-black hover:-translate-y-1 transition-transform"
                            style={{ backgroundColor: c.hex }}
                            onClick={() => {
                              setColor(c.hex);
                              if (activeText) {
                                setActiveText({ ...activeText, color: c.hex });
                              } else {
                                tintSelection(c.hex);
                              }
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {(() => {
                      if (!activeSelection) return null;
                      const matched = placedTexts.find(pt => {
                        const ptLeft = pt.x - pt.w / 2;
                        const ptTop = pt.y - pt.h / 2;
                        const ptRight = pt.x + pt.w / 2;
                        const ptBottom = pt.y + pt.h / 2;
                        
                        const selLeft = activeSelection.x;
                        const selTop = activeSelection.y;
                        const selRight = activeSelection.x + activeSelection.width;
                        const selBottom = activeSelection.y + activeSelection.height;
                        
                        const overlapX = Math.max(0, Math.min(ptRight, selRight) - Math.max(ptLeft, selLeft));
                        const overlapY = Math.max(0, Math.min(ptBottom, selBottom) - Math.max(ptTop, selTop));
                        const overlapArea = overlapX * overlapY;
                        const ptArea = pt.w * pt.h;
                        
                        return ptArea > 0 && (overlapArea / ptArea) >= 0.3;
                      });
                      
                      if (!matched) return null;

                      return (
                        <div className="flex flex-col gap-3 px-2">
                          <button
                            className="btn-kid bg-yellow-400 text-black py-4 px-4 flex items-center justify-center gap-2"
                            onClick={() => convertSelectionToText(matched)}
                          >
                            <Type className="w-6 h-6" /> Изменить текст
                          </button>
                        </div>
                      );
                    })()}
                  </>
                ) : null}
              </div>
            )}

            {tool === "shape" && (
              <div className="flex flex-col gap-3">
                <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                  Выбери фигуру
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SHAPES.map((shape) => (
                    <button
                      key={shape.id}
                      className={cn(
                        "btn-kid min-h-16 p-2 flex flex-col items-center justify-center gap-1",
                        selectedShape === shape.id &&
                          "btn-kid-active ring-2 ring-blue-500",
                      )}
                      onClick={() => {
                        playPop();
                        setSelectedShape(shape.id);
                      }}
                      title={shape.label}
                      aria-label={shape.label}
                    >
                      <shape.icon className="w-7 h-7" />
                      <span className="text-[9px] font-black leading-none">
                        {shape.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {["brush", "eraser", "shape"].includes(tool) && (
              <div className="flex flex-col gap-3">
                <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                  Толщина
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {BRUSH_SIZES.map((s) => (
                    <button
                      key={s.id}
                      className={cn(
                        "btn-kid p-2 rounded-2xl w-14 h-14 flex items-center justify-center",
                        brushSize === s.size &&
                          "btn-kid-active ring-2 ring-blue-500",
                      )}
                      onClick={() => {
                        playPop();
                        setBrushSize(s.size);
                      }}
                    >
                      <div
                        className="bg-black rounded-full"
                        style={{ width: s.size, height: s.size }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(tool === "text" || (tool === "select" && activeText)) && (
              <div className="flex flex-col gap-3">
                <div className="text-[10px] sm:text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                  Текст
                </div>
                <div className="px-2">
                  <textarea
                    value={activeText ? activeText.text : textInput}
                    onChange={(e) => {
                      setTextInput(e.target.value);
                      if (activeText) {
                        setActiveText({ ...activeText, text: e.target.value });
                      }
                    }}
                    className="w-full h-24 p-2 rounded-xl border-4 border-black font-bold outline-none resize-none"
                    placeholder="Введи текст..."
                  />
                </div>

                <div className="text-[10px] sm:text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider mt-2">
                  Шрифт
                </div>
                <div className="flex flex-col gap-2">
                  {AVAILABLE_FONTS.map((font) => (
                    <button
                      key={font}
                      className={cn(
                        "btn-kid p-3 font-bold text-lg text-left",
                        selectedFont === font &&
                          "btn-kid-active ring-2 ring-blue-500",
                      )}
                      style={{ fontFamily: font }}
                      onClick={() => {
                        playPop();
                        setSelectedFont(font);
                        if (activeText) {
                          setActiveText({ ...activeText, font: font });
                        }
                      }}
                    >
                      Aa Бб Вв
                    </button>
                  ))}
                </div>
              </div>
            )}

            {["brush", "eraser"].includes(tool) && (
              <div className="flex flex-col gap-3">
                <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                  Магия
                </div>
                <div className="flex flex-col gap-2">
                  {tool === "brush" && (
                    <button
                      className={cn(
                        "btn-kid p-3 flex items-center justify-start gap-3 w-full",
                        assistMode &&
                          "bg-purple-100 border-purple-400 text-purple-600",
                      )}
                      onClick={() => {
                        playPop();
                        setAssistMode(!assistMode);
                      }}
                      title="Умный помощник (сглаживание и ровные фигуры)"
                    >
                      <Wand2 className="w-6 h-6 shrink-0" />
                      <span className="text-xs font-bold leading-none text-left whitespace-nowrap">
                        Умный контур
                      </span>
                    </button>
                  )}
                  <button
                    className={cn(
                      "btn-kid p-3 flex items-center justify-start gap-3 w-full",
                      symmetryMode &&
                        "bg-blue-100 border-blue-400 text-blue-600",
                    )}
                    onClick={() => {
                      playPop();
                      setSymmetryMode(!symmetryMode);
                    }}
                    title="Симметричное рисование"
                  >
                    <FlipHorizontal className="w-6 h-6 shrink-0" />
                    <span className="text-xs font-bold leading-none text-left">
                      Симметрия
                    </span>
                  </button>
                  <button
                    className={cn(
                      "btn-kid p-3 flex items-center justify-start gap-3 w-full",
                      activeTemplate &&
                        "bg-green-100 border-green-400 text-green-600",
                    )}
                    onClick={() => {
                      playPop();
                      setShowTemplatesPanel(true);
                    }}
                    title="Шаблоны для обводки"
                  >
                    <BookTemplate className="w-6 h-6 shrink-0" />
                    <span className="text-xs font-bold leading-none text-left">
                      Шаблоны
                    </span>
                  </button>
                </div>
              </div>
            )}

            {["brush", "eraser", "text"].includes(tool) && (
              <hr className="border-2 border-gray-200 rounded-full opacity-50" />
            )}

            {(["brush", "fill", "shape", "text"].includes(tool) || (tool === "select" && activeText)) && (
              <div className="flex flex-col gap-3 items-center">
                <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                  Цвет
                </div>

                <div className="relative mb-2">
                  <div
                    className="w-16 h-16 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center transition-colors"
                    style={{ backgroundColor: color }}
                  />
                  <button
                    className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 border-4 border-black shadow-sm hover:scale-110 active:scale-95 transition-transform"
                    onClick={() => {
                      playPop();
                      setShowColorModal(true);
                    }}
                    title="Больше цветов"
                  >
                    <Palette className="w-5 h-5 text-pink-500" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 w-full">
                  {BASIC_COLORS.slice(0, 12).map((c) => (
                    <button
                      key={c.hex}
                      title={c.name}
                      className={cn(
                        "w-full aspect-square rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all",
                        color === c.hex &&
                          "scale-110 shadow-none translate-y-[2px] ring-4 ring-blue-400 ring-offset-2",
                      )}
                      style={{ backgroundColor: c.hex }}
                      onClick={() => {
                        playPop();
                        handleColorSelect(c.hex);
                        if (activeText) {
                          setActiveText({ ...activeText, color: c.hex });
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {tool === "sticker" && (
              <div className="flex flex-col items-center gap-3">
                <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">
                  Выбран
                </div>
                <button
                  className="text-6xl hover:scale-110 transition-transform p-4 rounded-3xl bg-white border-4 border-blue-200 w-full flex justify-center shadow-sm"
                  onClick={() => setShowStickerPanel(true)}
                  title="Выбрать другой стикер"
                >
                  {selectedSticker}
                </button>

                <button
                  className="btn-kid w-full py-3 bg-blue-100 flex gap-2 justify-center mt-2"
                  onClick={() => setShowStickerPanel(true)}
                >
                  <Smile className="w-5 h-5" /> Изменить
                </button>

                {activeSticker && (
                  <div className="flex flex-col gap-2 w-full mt-4">
                    <button
                      className="btn-kid !bg-green-500 hover:!bg-green-400 text-white py-3 flex justify-center items-center gap-2 text-lg"
                      onClick={finalizeSticker}
                    >
                      <Check className="w-6 h-6" /> ОК
                    </button>
                    <button
                      className="btn-kid !bg-red-500 hover:!bg-red-400 text-white py-3 flex justify-center items-center gap-2 text-lg"
                      onClick={cancelSticker}
                    >
                      <X className="w-6 h-6" /> Отмена
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </aside>

        <main className="flex-1 flex items-center justify-center bg-gray-200 p-4 sm:p-8 overflow-hidden relative">
          <div
            className="relative bg-white border-8 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] overflow-hidden w-full max-w-4xl"
            style={{ aspectRatio: "4/3" }}
          >
            <canvas
              ref={mainCanvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="absolute inset-0 w-full h-full"
            />
            <canvas
              ref={overlayCanvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className={cn(
                "absolute inset-0 w-full h-full touch-none",
                tool === "select" && "cursor-crosshair",
              )}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onContextMenu={handleContextMenu}
            />
            {activeTemplate && (
              <img
                src={TEMPLATES.find((t) => t.id === activeTemplate)?.url}
                className="absolute inset-0 w-full h-full object-contain opacity-30 pointer-events-none"
                alt="Template"
              />
            )}

            {activeText && activeText.isEditing && (
              <input
                ref={textInputRef}
                type="text"
                value={textInput}
                onChange={(e) => {
                  setTextInput(e.target.value);
                  setActiveText({ ...activeText, text: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finalizeText();
                }}
                className="absolute bg-transparent border-2 border-blue-500 border-dashed outline-none p-1 pointer-events-auto z-20 whitespace-pre"
                style={{
                  left: `${(activeText.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(activeText.y / CANVAS_HEIGHT) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: activeText.font,
                  fontSize: `${(activeText.size / CANVAS_HEIGHT) * 100}vh`,
                  color: activeText.color,
                  minWidth: "50px",
                  width: `${Math.max(50, textInput.length * (activeText.size * 0.6))}px`,
                  textAlign: "center",
                }}
                autoFocus
              />
            )}

            {feedback && (
              <div
                key={feedback.id}
                className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl sm:text-6xl font-black text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-bounce z-50 pointer-events-none"
                style={{ WebkitTextStroke: "2px #FF3B30" }}
              >
                {feedback.text}
              </div>
            )}


            {isPlaying && (
              <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full font-bold animate-pulse border-4 border-black">
                🔴 ЗАПИСЬ
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="h-40 bg-white border-t-4 border-black p-4 flex flex-col gap-2 shrink-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              className={cn(
                "btn-kid px-4 py-2 gap-2 text-white",
                isPlaying
                  ? "!bg-red-500 hover:!bg-red-400"
                  : "!bg-green-500 hover:!bg-green-400",
              )}
              onClick={() => {
                playAction();
                setIsPlaying(!isPlaying);
              }}
            >
              {isPlaying ? (
                <>
                  <StopCircle className="w-6 h-6 fill-current" /> Стоп
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" /> Играть
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2 bg-gray-100 p-1 rounded-2xl border-4 border-black ml-4">
              {FPS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={cn(
                    "px-3 py-1 rounded-xl font-bold text-sm transition-all",
                    fps === opt.fps
                      ? "bg-white shadow-sm border-2 border-black"
                      : "text-gray-500 hover:bg-gray-200",
                  )}
                  onClick={() => {
                    playPop();
                    setFps(opt.fps);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-kid p-2 text-blue-500"
              onClick={addFrame}
              disabled={isPlaying}
              title="Новый кадр"
            >
              <Plus className="w-6 h-6" />
            </button>
            <button
              className="btn-kid p-2 text-orange-500"
              onClick={copyFrame}
              disabled={isPlaying}
              title="Копировать кадр"
            >
              <Copy className="w-6 h-6" />
            </button>
            <button
              className="btn-kid p-2 text-red-500"
              onClick={deleteFrame}
              disabled={isPlaying || frames.length <= 1}
              title="Удалить кадр"
            >
              <Trash className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-3 overflow-x-auto pb-2 px-2 snap-x">
          {frames.map((frame, idx) => (
            <div
              key={idx}
              draggable={!isPlaying}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative h-full aspect-[4/3] bg-white border-4 rounded-xl shrink-0 cursor-pointer snap-center transition-all overflow-hidden",
                currentFrame === idx
                  ? "border-blue-500 scale-105 shadow-[0_0_0_4px_rgba(59,130,246,0.3)]"
                  : "border-gray-300 hover:border-gray-400",
                draggedFrameIdx === idx && "opacity-50 scale-95",
              )}
              onClick={() => {
                if (!isPlaying) {
                  playPop();
                  setCurrentFrame(idx);
                }
              }}
            >
              <img
                src={frame}
                alt={`Кадр ${idx + 1}`}
                className="w-full h-full object-contain bg-white"
              />
              <div className="absolute bottom-1 right-1 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                {idx + 1}
              </div>
            </div>
          ))}
          {!isPlaying && (
            <button
              className="h-full aspect-[4/3] border-4 border-dashed border-gray-300 rounded-xl shrink-0 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-500 hover:bg-blue-50 transition-all"
              onClick={addFrame}
            >
              <Plus className="w-8 h-8" />
            </button>
          )}
        </div>
      </footer>

      {showTemplatesPanel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-2xl font-black uppercase text-black">
                Выбери шаблон
              </h2>
              <button
                className="btn-kid p-2 text-red-500"
                onClick={() => setShowTemplatesPanel(false)}
              >
                <X className="w-8 h-8" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-4 transition-all hover:scale-105",
                  activeTemplate === null
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300",
                )}
                onClick={() => {
                  setActiveTemplate(null);
                  setShowTemplatesPanel(false);
                  playPop();
                }}
              >
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
                  ❌
                </div>
                <span className="font-bold text-sm">Без шаблона</span>
              </button>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-4 transition-all hover:scale-105",
                    activeTemplate === t.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300",
                  )}
                  onClick={() => {
                    setActiveTemplate(t.id);
                    setShowTemplatesPanel(false);
                    playPop();
                  }}
                >
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
                    {t.icon}
                  </div>
                  <span className="font-bold text-sm">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showStickerPanel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-2xl font-black uppercase text-black">
                Выбери стикер
              </h2>
              <button
                className="btn-kid p-2 text-red-500"
                onClick={() => setShowStickerPanel(false)}
              >
                <X className="w-8 h-8" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 flex flex-col gap-6 pr-2">
              {STICKERS.map((cat) => (
                <div key={cat.category}>
                  <h3 className="text-xl font-bold mb-3 text-gray-700 border-b-4 border-gray-200 pb-1">
                    {cat.category}
                  </h3>
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                    {cat.items.map((emoji) => (
                      <button
                        key={emoji}
                        className={cn(
                          "text-4xl hover:scale-110 transition-transform p-2 rounded-xl hover:bg-gray-100 flex items-center justify-center aspect-square",
                          selectedSticker === emoji &&
                            "bg-blue-100 ring-4 ring-blue-500",
                        )}
                        onClick={() => {
                          setSelectedSticker(emoji);
                          setShowStickerPanel(false);
                          handleSetTool("sticker");
                          playPop();
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showColorModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-3xl border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-2xl font-black uppercase text-black flex items-center gap-2">
                <Palette className="w-8 h-8 text-pink-500" /> Палитра цветов
              </h2>
              <button
                className="btn-kid p-2 text-red-500"
                onClick={() => setShowColorModal(false)}
              >
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6 overflow-y-auto pr-2">
              <div className="flex-1 flex flex-col gap-6">
                <div className="flex items-center gap-4 bg-gray-100 p-4 rounded-2xl border-4 border-gray-200">
                  <div
                    className="w-16 h-16 rounded-full border-4 border-black shadow-md"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1">
                    <div className="text-lg font-bold">Текущий цвет</div>
                  </div>
                  <button
                    className="btn-kid p-3 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                    onClick={() => {
                      setShowColorModal(false);
                      activatePipette();
                    }}
                    title="Взять цвет с рисунка"
                    aria-label="Пипетка"
                  >
                    <Pipette className="w-8 h-8" />
                  </button>
                  <button
                    className={cn(
                      "btn-kid p-3 transition-colors",
                      favoriteColors.includes(color)
                        ? "text-yellow-500 bg-yellow-50 border-yellow-400"
                        : "text-gray-400",
                    )}
                    onClick={() => toggleFavorite(color)}
                    title="В любимые"
                  >
                    <Star
                      className={cn(
                        "w-8 h-8",
                        favoriteColors.includes(color) && "fill-current",
                      )}
                    />
                  </button>
                </div>

                {favoriteColors.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-gray-700">
                      <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />{" "}
                      Любимые цвета
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {favoriteColors.map((c) => (
                        <button
                          key={c}
                          className="w-12 h-12 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all"
                          style={{ backgroundColor: c }}
                          onClick={() => {
                            playPop();
                            handleColorSelect(c);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {recentColors.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-gray-700">
                      Недавние
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {recentColors.map((c, i) => (
                        <button
                          key={i}
                          className="w-12 h-12 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all"
                          style={{ backgroundColor: c }}
                          onClick={() => {
                            playPop();
                            handleColorSelect(c);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-bold mb-3 text-gray-700">
                    Основные
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {BASIC_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        title={c.name}
                        className="w-12 h-12 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all"
                        style={{ backgroundColor: c.hex }}
                        onClick={() => {
                          playPop();
                          handleColorSelect(c.hex);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-4 bg-blue-50 p-6 rounded-3xl border-4 border-blue-200">
                <h3 className="text-xl font-bold text-center text-blue-800">
                  Создать свой цвет
                </h3>

                <div
                  ref={colorSquareRef}
                  className="w-full aspect-square rounded-2xl border-4 border-black relative touch-none cursor-crosshair overflow-hidden shadow-inner"
                  style={{ backgroundColor: `hsl(${customHue}, 100%, 50%)` }}
                  onPointerDown={(e) => {
                    if (!colorSquareRef.current) return;
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    const rect = colorSquareRef.current.getBoundingClientRect();
                    const s = Math.max(
                      0,
                      Math.min(
                        100,
                        ((e.clientX - rect.left) / rect.width) * 100,
                      ),
                    );
                    const v = Math.max(
                      0,
                      Math.min(
                        100,
                        100 - ((e.clientY - rect.top) / rect.height) * 100,
                      ),
                    );
                    setCustomSat(s);
                    setCustomVal(v);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons > 0 && colorSquareRef.current) {
                      const rect =
                        colorSquareRef.current.getBoundingClientRect();
                      const s = Math.max(
                        0,
                        Math.min(
                          100,
                          ((e.clientX - rect.left) / rect.width) * 100,
                        ),
                      );
                      const v = Math.max(
                        0,
                        Math.min(
                          100,
                          100 - ((e.clientY - rect.top) / rect.height) * 100,
                        ),
                      );
                      setCustomSat(s);
                      setCustomVal(v);
                    }
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to right, #fff, transparent)",
                    }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to top, #000, transparent)",
                    }}
                  />

                  <div
                    className="absolute w-6 h-6 border-4 border-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      left: `${customSat}%`,
                      top: `${100 - customVal}%`,
                      backgroundColor: hsvToHex(
                        customHue,
                        customSat,
                        customVal,
                      ),
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-sm font-bold text-gray-600 uppercase tracking-wider">
                    Радуга
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={customHue}
                    onChange={(e) => setCustomHue(Number(e.target.value))}
                    className="color-slider w-full h-8 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    style={{
                      background:
                        "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                    }}
                  />
                </div>

                <button
                  className="btn-kid !bg-green-500 hover:!bg-green-400 text-white py-4 mt-4 text-xl flex items-center justify-center gap-2"
                  onClick={() => {
                    playPop();
                    handleColorSelect(
                      hsvToHex(customHue, customSat, customVal),
                    );
                    setShowColorModal(false);
                  }}
                >
                  <Check className="w-8 h-8" /> Выбрать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 bg-white border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="px-6 py-3 font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors focus:outline-none"
            onClick={() => {
              if (contextMenu.target === "selection") {
                setActiveSelection(null);
              } else if (contextMenu.target === "sticker") {
                cancelSticker();
              } else if (contextMenu.target === "text") {
                setActiveText(null);
                setTextInput("");
              }
              setContextMenu(null);
              playSwoosh();
              const overlayCtx = overlayCanvasRef.current?.getContext("2d");
              if (overlayCtx) {
                overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
              }
            }}
          >
            <Trash className="w-5 h-5" /> Удалить
          </button>
        </div>
      )}
    </div>
  );
}
