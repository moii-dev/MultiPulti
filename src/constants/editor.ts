import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Heart,
  Hexagon,
  Minus,
  MousePointer2,
  PaintBucket,
  Pen,
  Shapes,
  Smile,
  Square,
  Star,
  Triangle,
  Type,
} from "lucide-react";
import type { ShapeOption, ToolOption } from "../types/editor";

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const LOGO_URL = new URL("../../assets/MultiPulit-Logo.png", import.meta.url).href;

export const BASIC_COLORS = [
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
] as const;

export const BRUSH_SIZES = [
  { id: "small", size: 5, label: "Тонко" },
  { id: "medium", size: 15, label: "Средне" },
  { id: "large", size: 30, label: "Толсто" },
] as const;

export const TOOLS: ToolOption[] = [
  { id: "select", icon: MousePointer2, label: "Переместить" },
  { id: "brush", icon: Pen, label: "Кисть" },
  { id: "eraser", icon: Eraser, label: "Ластик" },
  { id: "fill", icon: PaintBucket, label: "Заливка" },
  { id: "shape", icon: Shapes, label: "Фигуры" },
  { id: "text", icon: Type, label: "Текст" },
  { id: "sticker", icon: Smile, label: "Стикер" },
];

export const SHAPES: ShapeOption[] = [
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

export const STICKERS = [
  { category: "Фигуры", items: ["⭐", "💖", "🔺", "🔻", "🔴", "🔵", "🟡", "🟢", "🟥", "🟦", "🟨", "🟩"] },
  { category: "Животные", items: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮"] },
  { category: "Смайлики", items: ["😀", "😂", "😊", "😍", "😎", "😜", "😡", "😭", "😱", "😴", "👽", "👻"] },
] as const;

export const FPS_OPTIONS = [
  { id: "slow", fps: 2, label: "🐢 Медленно" },
  { id: "normal", fps: 5, label: "🚶 Нормально" },
  { id: "fast", fps: 12, label: "🚀 Быстро" },
] as const;

export const AVAILABLE_FONTS = ["Nunito", "Caveat", "Comfortaa", "Mali"] as const;
export type FontName = (typeof AVAILABLE_FONTS)[number];

export const TEMPLATES = [
  { id: "cat", label: "Котик", icon: "🐱", url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="35"/><path d="M25 25 L35 15 L45 25 M75 25 L65 15 L55 25"/><circle cx="35" cy="45" r="4" fill="%2394a3b8"/><circle cx="65" cy="45" r="4" fill="%2394a3b8"/><path d="M45 55 Q50 65 55 55"/><path d="M10 45 L25 50 M10 55 L25 55 M10 65 L25 60 M90 45 L75 50 M90 55 L75 55 M90 65 L75 60"/></svg>` },
  { id: "house", label: "Домик", icon: "🏠", url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="40" width="60" height="50"/><path d="M10 40 L50 10 L90 40 Z"/><rect x="40" y="60" width="20" height="30"/><rect x="25" y="50" width="10" height="10"/><rect x="65" y="50" width="10" height="10"/></svg>` },
  { id: "fish", label: "Рыбка", icon: "🐟", url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="50" rx="30" ry="20"/><path d="M20 50 L5 35 L5 65 Z"/><circle cx="65" cy="45" r="3" fill="%2394a3b8"/><path d="M40 30 Q50 15 60 30 M40 70 Q50 85 60 70"/></svg>` },
] as const;

export const PRAISE_MESSAGES = ["Супер!", "Класс!", "Отлично!", "Красота!", "Волшебно!"] as const;

export const CONTENT_WARNING_MESSAGES = [
  "🚫 Ой! Давай рисовать что-нибудь красивое!",
  "🎨 Попробуй нарисовать что-то доброе!",
  "🌈 Используй больше ярких цветов!",
  "✨ Давай создадим что-то волшебное!",
  "🌸 Рисуй красиво — мир станет лучше!",
] as const;
