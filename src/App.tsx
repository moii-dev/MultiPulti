import React, { useState, useRef, useEffect, useCallback } from "react";
import { floodFill } from "./utils/floodFill";
import { findConnectedObject, findObjectInRect, eraseObjectPixels } from "./utils/extractObject";
import { detectSmartShape } from "./utils/shapeDetection";
import { playPop, playSwoosh, playAction, playError } from "./utils/audio";
import { DrawingStage } from "./components/DrawingStage";
import { HeaderToolbar } from "./components/HeaderToolbar";
import { Timeline } from "./components/Timeline";
import { ToolsPanel } from "./components/ToolsPanel";
import { ToolSettingsPanel } from "./components/ToolSettingsPanel";
import { ColorPickerModal, SelectionContextMenu, StickerPicker, TemplatePicker } from "./components/EditorModals";
import {
  BASIC_COLORS, BRUSH_SIZES, CANVAS_HEIGHT, CANVAS_WIDTH,
  FPS_OPTIONS, LOGO_URL, PRAISE_MESSAGES,
  type FontName,
} from "./constants/editor";
import {
  createBlankFrame as getBlankCanvas, drawPerfectShape, drawSmoothedCurve,
  getCanvasCoordinates, hsvToHex, isSelectionPixelAt, rgbToHex, traceShapePath,
} from "./canvas/operations";
import { downloadGif, downloadPng } from "./services/imageExport";
import { readPreferences } from "./services/projectRepository";
import { useProjectLoader } from "./hooks/useProjectLoader";
import { createFrame, createId, copyFrame as cloneFrame, deleteFrame as removeFrame, reorderFrame, upsertObject } from "./domain/project";
import {
  commitStickerToFrame, commitTextToFrame, hasSelectionChanged,
  hasStickerChanged, hasTextChanged,
} from "./domain/transaction";
import { composeFrame, drawObjects, hitObject, cacheRaster, loadRasterLayers, pruneRasterCache } from "./canvas/frameRenderer";
import { useAnimationPlayback } from "./hooks/useAnimationPlayback";
import { useFrameHistory } from "./hooks/useFrameHistory";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useContentModeration } from "./hooks/useContentModeration";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type {
  ActiveSelection, ActiveSticker, ActiveText, CanvasClientPosition,
  EditorContextMenu, Point, ShapeId, ToolId, CanvasObject, StoredAppState, Frame,
} from "./types/editor";


export default function App() {
  const loaded = useProjectLoader();
  if (!loaded.ready) return <div role="status">Загрузка проекта…</div>;
  return <Editor initialState={loaded.state} persistenceEnabled={loaded.writable} loadError={loaded.error} />;
}

function Editor({ initialState, persistenceEnabled, loadError }: { initialState: StoredAppState | null; persistenceEnabled: boolean; loadError: string | null }) {
  const [preferences] = useState(readPreferences);

  const {
    history,
    historyIndex,
    setHistoryIndex,
    currentFrame,
    setCurrentFrame,
    frames,
    saveFrames: saveState,
    saveCanvasSnapshot,
    discardBlockedFrame,
    getFrames,
  } = useFrameHistory(initialState);

  const [tool, setTool] = useState<ToolId>("brush");
  const [selectedShape, setSelectedShape] = useState<ShapeId>("line");
  const [color, setColor] = useState(BASIC_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);

  const [isExporting, setIsExporting] = useState(false);

  const [recentColors, setRecentColors] = useState<string[]>(
    initialState?.recentColors ?? preferences.recentColors,
  );
  const [favoriteColors, setFavoriteColors] = useState<string[]>(
    initialState?.favoriteColors ?? preferences.favoriteColors,
  );
  const [showColorModal, setShowColorModal] = useState(false);
  const [customHue, setCustomHue] = useState(0);
  const [customSat, setCustomSat] = useState(100);
  const [customVal, setCustomVal] = useState(100);
  const colorSquareRef = useRef<HTMLDivElement>(null);
  const pipetteReturnToolRef = useRef<ToolId>("brush");

  const [activeSticker, setActiveSticker] = useState<ActiveSticker | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string>("⭐");
  const [showStickerPanel, setShowStickerPanel] = useState(false);

  const [activeText, setActiveText] = useState<ActiveText | null>(null);
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
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedFrameIdRef = useRef<string | null>(null);
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

  const [contextMenu, setContextMenu] = useState<EditorContextMenu | null>(null);

  const isMovingSelectionRef = useRef(false);
  const isBoxSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const initialSelectionPosRef = useRef({ x: 0, y: 0 });

  const [draggedFrameIdx, setDraggedFrameIdx] = useState<number | null>(null);

  // References to keep callbacks immune to stale React closures
  const activeSelectionRef = useRef(activeSelection);
  activeSelectionRef.current = activeSelection;
  const activeTextRef = useRef(activeText);
  activeTextRef.current = activeText;
  const activeStickerRef = useRef(activeSticker);
  activeStickerRef.current = activeSticker;
  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  const { isPlaying, setIsPlaying, fps, setFps } = useAnimationPlayback(
    frames.length,
    setCurrentFrame,
    preferences.fps ?? FPS_OPTIONS[1].fps,
  );

  const clearOverlayCanvas = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");
    if (!overlayCanvas || !overlayCtx) return;

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }, []);

  const commitObjects = useCallback((objects: CanvasObject[], ownerFrameId: string) => {
    const base = baseCanvasRef.current;
    if (!base || loadedFrameIdRef.current !== ownerFrameId) return;
    const preview = composeFrame(base, objects);
    saveState(previous => previous.map(frame => frame.id === ownerFrameId ? { ...frame, objects, preview } : frame));
  }, [saveState]);

  const commitSelectionChange = useCallback((updatedSelection: ActiveSelection) => {
    const ownerFrameId = updatedSelection.ownerFrameId ?? frames[currentFrameRef.current]?.id;
    if (!ownerFrameId) return;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (baseCanvasRef.current && loadedFrameIdRef.current === ownerFrameId) {
      ctx.drawImage(baseCanvasRef.current, 0, 0);
    }
    ctx.drawImage(
      updatedSelection.canvas,
      updatedSelection.x,
      updatedSelection.y,
      updatedSelection.width,
      updatedSelection.height
    );
    const newBitmap = canvas.toDataURL("image/png");

    saveState(prev => prev.map(f => f.id === ownerFrameId ? { ...f, bitmap: newBitmap, preview: newBitmap } : f));

    if (baseCanvasRef.current && loadedFrameIdRef.current === ownerFrameId) {
      const baseCtx = baseCanvasRef.current.getContext("2d");
      if (baseCtx) {
        baseCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        baseCtx.drawImage(canvas, 0, 0);
      }
    }

    setActiveSelection({
      ...updatedSelection,
      initialX: updatedSelection.x,
      initialY: updatedSelection.y,
      initialWidth: updatedSelection.width,
      initialHeight: updatedSelection.height,
      originalBitmap: newBitmap,
      hasChanged: false,
    });
  }, [frames, saveState]);

  const commitStickerChange = useCallback((updatedSticker: ActiveSticker) => {
    const ownerFrameId = updatedSticker.ownerFrameId ?? frames[currentFrameRef.current]?.id;
    if (!ownerFrameId) return;
    const frame = frames.find(f => f.id === ownerFrameId);
    if (!frame) return;

    const updated = commitStickerToFrame(frame, updatedSticker);
    if (baseCanvasRef.current && loadedFrameIdRef.current === ownerFrameId) {
      updated.preview = composeFrame(baseCanvasRef.current, updated.objects);
    }
    saveState(prev => prev.map(f => f.id === ownerFrameId ? updated : f));
    setActiveSticker({
      ...updatedSticker,
      initialX: updatedSticker.x,
      initialY: updatedSticker.y,
      initialSize: updatedSticker.size,
      initialEmoji: updatedSticker.emoji,
      isNew: false,
    });
  }, [frames, saveState]);

  const commitTextChange = useCallback((updatedText: ActiveText) => {
    const ownerFrameId = updatedText.ownerFrameId ?? frames[currentFrameRef.current]?.id;
    if (!ownerFrameId) return;
    const frame = frames.find(f => f.id === ownerFrameId);
    if (!frame) return;

    const ctx = mainCanvasRef.current?.getContext("2d");
    let w = updatedText.size * updatedText.text.length * 0.6;
    if (ctx) {
      ctx.save();
      ctx.font = `${updatedText.size}px ${updatedText.font}`;
      w = ctx.measureText(updatedText.text).width;
      ctx.restore();
    }
    const updated = commitTextToFrame(frame, updatedText, w);
    if (baseCanvasRef.current && loadedFrameIdRef.current === ownerFrameId) {
      updated.preview = composeFrame(baseCanvasRef.current, updated.objects);
    }
    saveState(prev => prev.map(f => f.id === ownerFrameId ? updated : f));
    setActiveText({
      ...updatedText,
      initialText: updatedText.text,
      initialX: updatedText.x,
      initialY: updatedText.y,
      initialSize: updatedText.size,
      initialFont: updatedText.font,
      initialColor: updatedText.color,
      isNew: false,
    });
  }, [frames, saveState]);

  const cancelPendingChanges = useCallback(() => {
    const sel = activeSelectionRef.current;
    if (sel && sel.originalBitmap && baseCanvasRef.current && loadedFrameIdRef.current === sel.ownerFrameId) {
      const img = new Image();
      img.onload = () => {
        const baseCtx = baseCanvasRef.current?.getContext("2d");
        const mainCtx = mainCanvasRef.current?.getContext("2d", { willReadFrequently: true });
        if (baseCtx) {
          baseCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          baseCtx.drawImage(img, 0, 0);
        }
        if (mainCtx) {
          mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          mainCtx.drawImage(img, 0, 0);
          const frame = frames.find(f => f.id === sel.ownerFrameId);
          if (frame) drawObjects(mainCtx, frame.objects);
        }
      };
      img.src = sel.originalBitmap;
    }
    setActiveText(null);
    setTextInput("");
    setActiveSticker(null);
    setActiveSelection(null);
    isDrawingRef.current = false;
    isMovingTextRef.current = false;
    isMovingStickerRef.current = false;
    isResizingStickerRef.current = false;
    isMovingSelectionRef.current = false;
    isBoxSelectingRef.current = false;
    clearOverlayCanvas();
  }, [clearOverlayCanvas, frames]);

  const commitPendingChanges = useCallback((): Frame[] => {
    let currentFrames = getFrames();
    let changed = false;

    // 1. Text
    const text = activeTextRef.current;
    if (text) {
      const ownerId = text.ownerFrameId ?? currentFrames[currentFrameRef.current]?.id;
      const targetFrame = currentFrames.find(f => f.id === ownerId);
      if (targetFrame && hasTextChanged(text)) {
        const ctx = mainCanvasRef.current?.getContext("2d");
        let w = text.size * text.text.length * 0.6;
        if (ctx) {
          ctx.save();
          ctx.font = `${text.size}px ${text.font}`;
          w = ctx.measureText(text.text).width;
          ctx.restore();
        }
        const updated = commitTextToFrame(targetFrame, text, w);
        if (baseCanvasRef.current && loadedFrameIdRef.current === ownerId) {
          updated.preview = composeFrame(baseCanvasRef.current, updated.objects);
        }
        currentFrames = currentFrames.map(f => f.id === ownerId ? updated : f);
        changed = true;
      }
      setActiveText(null);
      setTextInput("");
    }

    // 2. Sticker
    const sticker = activeStickerRef.current;
    if (sticker) {
      const ownerId = sticker.ownerFrameId ?? currentFrames[currentFrameRef.current]?.id;
      const targetFrame = currentFrames.find(f => f.id === ownerId);
      if (targetFrame && hasStickerChanged(sticker)) {
        const updated = commitStickerToFrame(targetFrame, sticker);
        if (baseCanvasRef.current && loadedFrameIdRef.current === ownerId) {
          updated.preview = composeFrame(baseCanvasRef.current, updated.objects);
        }
        currentFrames = currentFrames.map(f => f.id === ownerId ? updated : f);
        changed = true;
      }
      setActiveSticker(null);
    }

    // 3. Selection
    const sel = activeSelectionRef.current;
    if (sel) {
      const ownerId = sel.ownerFrameId ?? currentFrames[currentFrameRef.current]?.id;
      const targetFrame = currentFrames.find(f => f.id === ownerId);
      if (targetFrame) {
        if (hasSelectionChanged(sel)) {
          const canvas = document.createElement("canvas");
          canvas.width = CANVAS_WIDTH;
          canvas.height = CANVAS_HEIGHT;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            if (baseCanvasRef.current && loadedFrameIdRef.current === ownerId) {
              ctx.drawImage(baseCanvasRef.current, 0, 0);
            }
            ctx.drawImage(sel.canvas, sel.x, sel.y, sel.width, sel.height);
            const newBitmap = canvas.toDataURL("image/png");
            const updated = { ...targetFrame, bitmap: newBitmap, preview: newBitmap };
            currentFrames = currentFrames.map(f => f.id === ownerId ? updated : f);
            changed = true;
            if (baseCanvasRef.current && loadedFrameIdRef.current === ownerId) {
              const baseCtx = baseCanvasRef.current.getContext("2d");
              if (baseCtx) {
                baseCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                baseCtx.drawImage(canvas, 0, 0);
              }
            }
          }
        } else if (sel.originalBitmap) {
          if (baseCanvasRef.current && loadedFrameIdRef.current === ownerId) {
            const img = new Image();
            img.onload = () => {
              const baseCtx = baseCanvasRef.current?.getContext("2d");
              const mainCtx = mainCanvasRef.current?.getContext("2d", { willReadFrequently: true });
              if (baseCtx) {
                baseCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                baseCtx.drawImage(img, 0, 0);
              }
              if (mainCtx) {
                mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                mainCtx.drawImage(img, 0, 0);
                drawObjects(mainCtx, targetFrame.objects);
              }
            };
            img.src = sel.originalBitmap;
          }
        }
      }
      setActiveSelection(null);
    }

    clearOverlayCanvas();

    if (changed) {
      saveState(currentFrames);
    }
    return currentFrames;
  }, [getFrames, clearOverlayCanvas, saveState]);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedFrameIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (draggedFrameIdx === null || draggedFrameIdx === dropIdx) return;

    const committed = commitPendingChanges();
    saveState(reorderFrame(committed, frames[draggedFrameIdx].id, dropIdx));
    setDraggedFrameIdx(null);
    playPop();
  };

  const handleDragEnd = () => {
    setDraggedFrameIdx(null);
  };

  const persistenceError = useProjectPersistence(
    history,
    historyIndex,
    currentFrame,
    favoriteColors,
    recentColors,
    fps, persistenceEnabled, isPlaying,
  );

  const { warning: contentWarning, checkCanvas: checkCanvasContent } =
    useContentModeration({
      onBlocked: discardBlockedFrame,
      onErrorSound: playError,
    });

  const handleUndo = useCallback(() => {
    if (isPlaying) return;
    cancelPendingChanges();
    if (historyIndex > 0) {
      playPop();
      setHistoryIndex(historyIndex - 1);
    }
  }, [isPlaying, cancelPendingChanges, historyIndex, setHistoryIndex]);

  const handleRedo = useCallback(() => {
    if (isPlaying) return;
    cancelPendingChanges();
    if (historyIndex < history.length - 1) {
      playPop();
      setHistoryIndex(historyIndex + 1);
    }
  }, [isPlaying, cancelPendingChanges, historyIndex, history.length, setHistoryIndex]);

  useKeyboardShortcuts({
    canUndo: historyIndex > 0 && !isPlaying,
    canRedo: historyIndex < history.length - 1 && !isPlaying,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  const handleSetTool = useCallback(
    (newTool: ToolId) => {
      if (newTool !== tool) {
        commitPendingChanges();
      }
      setTool(newTool);
    },
    [tool, commitPendingChanges],
  );

  const activatePipette = useCallback(() => {
    if (tool !== "pipette") pipetteReturnToolRef.current = tool;
    handleSetTool("pipette");
    playPop();
  }, [handleSetTool, tool]);

  const [canvasError, setCanvasError] = useState<string | null>(null);
  const baseBitmapRef = useRef<string | null>(null);
  useEffect(() => {
    if (isDrawingRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const frame = frames[currentFrame];
    let cancelled = false;
    const render = async (base: HTMLCanvasElement) => {
      try {
        await loadRasterLayers(frame.objects);
        if (cancelled) return;
        baseCanvasRef.current = base;
        baseBitmapRef.current = frame.bitmap;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(base, 0, 0);
        drawObjects(ctx, frame.objects.filter(object => object.id !== activeText?.id && object.id !== activeSticker?.id));
        loadedFrameIdRef.current = frame.id;
        setCanvasError(null);
      } catch { if (!cancelled) setCanvasError("Не удалось отобразить данные кадра"); }
    };
    if (loadedFrameIdRef.current === frame.id && baseBitmapRef.current === frame.bitmap && baseCanvasRef.current) {
      void render(baseCanvasRef.current);
    } else {
      loadedFrameIdRef.current = null;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const base = document.createElement("canvas");
        base.width = canvas.width; base.height = canvas.height;
        const baseCtx = base.getContext("2d");
        if (!baseCtx) { setCanvasError("Canvas недоступен"); return; }
        baseCtx.drawImage(img, 0, 0);
        void render(base);
      };
      img.onerror = () => { if (!cancelled) setCanvasError("Не удалось декодировать кадр"); };
      img.src = frame.bitmap;
    }
    return () => { cancelled = true; };
  }, [frames, currentFrame, activeText?.id, activeSticker?.id]);

  useEffect(() => {
    pruneRasterCache(history.flatMap(entry => entry.frames));
  }, [history]);

  const saveRasterOverlay = (overlay: HTMLCanvasElement) => {
    const frame = frames[currentFrame];
    const base = baseCanvasRef.current;
    if (!base) return;
    const layer = document.createElement("canvas");
    layer.width = overlay.width; layer.height = overlay.height;
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    if (!frame.objects.some(object => object.kind !== "raster")) {
      ctx.drawImage(base, 0, 0);
      drawObjects(ctx, frame.objects);
      ctx.drawImage(overlay, 0, 0);
      const bitmap = layer.toDataURL("image/png");
      saveState(previous => previous.map(item => item.id === frame.id ? { ...item, bitmap, preview: bitmap, objects: [] } : item));
      return;
    }
    const objects = [...frame.objects];
    const last = objects.at(-1);
    if (last?.kind === "raster") {
      drawObjects(ctx, [last]);
      objects.pop();
    }
    ctx.drawImage(overlay, 0, 0);
    const bitmap = layer.toDataURL("image/png");
    cacheRaster(bitmap, layer);
    objects.push({ kind: "raster", id: last?.kind === "raster" ? last.id : createId(), bitmap });
    commitObjects(objects, frame.id);
  };

  const scaleSelection = useCallback((factor: number) => {
    if (!activeSelection) return;
    const newW = activeSelection.width * factor;
    const newH = activeSelection.height * factor;
    const dx = (activeSelection.width - newW) / 2;
    const dy = (activeSelection.height - newH) / 2;

    if (newW < 10 || newH < 10 || newW > CANVAS_WIDTH * 2 || newH > CANVAS_HEIGHT * 2) return;

    const updated: ActiveSelection = {
      ...activeSelection,
      width: newW,
      height: newH,
      x: activeSelection.x + dx,
      y: activeSelection.y + dy,
      hasChanged: true,
    };
    commitSelectionChange(updated);
    playPop();
  }, [activeSelection, commitSelectionChange]);

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
    const updated: ActiveSelection = {
      ...activeSelection,
      hasChanged: true,
    };
    commitSelectionChange(updated);
    playAction();
  }, [activeSelection, commitSelectionChange]);

  const tintSelection = useCallback((colorHex: string, silent = false) => {
    if (!activeSelection) return;
    const canvas = activeSelection.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    const updated: ActiveSelection = {
      ...activeSelection,
      hasChanged: true,
    };
    commitSelectionChange(updated);
    if (!silent) playPop();
  }, [activeSelection, commitSelectionChange]);

  const getCoordinates = (event: CanvasClientPosition) =>
    getCanvasCoordinates(mainCanvasRef.current, event);

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
    if (isPlaying || loadedFrameIdRef.current !== frames[currentFrame].id) return;
    if (e.button === 2) return;
    const { x, y } = getCoordinates(e);
    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    if (!mainCanvas || !mainCtx) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    // Hit test semantic objects first
    if ((tool === "select" || tool === "text" || tool === "sticker") && !activeText && !activeSticker && !activeSelection) {
      const object = hitObject(mainCtx, frames[currentFrame], x, y);
      if (object && object.kind !== "raster") {
        if (object.kind === "text") {
          setActiveText({
            ...object,
            ownerFrameId: frames[currentFrame].id,
            isEditing: tool === "text",
            initialText: object.text,
            initialX: object.x,
            initialY: object.y,
            initialSize: object.size,
            initialFont: object.font,
            initialColor: object.color,
            isNew: false,
          });
          setTextInput(object.text);
          setSelectedFont(object.font as FontName);
        } else {
          setActiveSticker({
            ...object,
            ownerFrameId: frames[currentFrame].id,
            initialX: object.x,
            initialY: object.y,
            initialSize: object.size,
            initialEmoji: object.emoji,
            isNew: false,
          });
          setTool("sticker");
        }
        playPop();
        return;
      }
    }

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
          commitPendingChanges();
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
          commitPendingChanges();
        }
      }

      const extractedObject = findConnectedObject(mainCtx, x, y);
      if (extractedObject) {
        const originalBitmap = frames[currentFrame].bitmap;
        eraseObjectPixels(mainCtx, extractedObject.pixelOffsets);
        const sel: ActiveSelection = {
          ownerFrameId: frames[currentFrame].id,
          canvas: extractedObject.canvas,
          x: extractedObject.x,
          y: extractedObject.y,
          width: extractedObject.width,
          height: extractedObject.height,
          initialX: extractedObject.x,
          initialY: extractedObject.y,
          initialWidth: extractedObject.width,
          initialHeight: extractedObject.height,
          originalBitmap,
          hasChanged: false,
        };
        setActiveSelection(sel);
        isMovingSelectionRef.current = true;
        startPosRef.current = { x, y };
        initialSelectionPosRef.current = {
          x: extractedObject.x,
          y: extractedObject.y,
        };
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

        commitPendingChanges();
        return;
      } else {
        const newSticker: ActiveSticker = {
          id: createId(),
          ownerFrameId: frames[currentFrame].id,
          emoji: selectedSticker,
          x,
          y,
          size: 100,
          initialX: x,
          initialY: y,
          initialSize: 100,
          initialEmoji: selectedSticker,
          isNew: true,
        };
        setActiveSticker(newSticker);
        commitStickerChange(newSticker);
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
          commitPendingChanges();
          return;
        }

        if (activeText.isEditing) {
          commitPendingChanges();
          return;
        }
      } else {
        setActiveText({
          id: createId(),
          ownerFrameId: frames[currentFrame].id,
          text: "",
          x,
          y,
          size: brushSize * 4 + 20,
          font: selectedFont,
          color,
          isEditing: true,
          isNew: true,
        });
        setTextInput("");
        setTimeout(() => textInputRef.current?.focus(), 10);
        return;
      }
    }

    if (tool === "fill") {
      const pixel = mainCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      const targetHex = rgbToHex(pixel[0], pixel[1], pixel[2]);
      if (pixel[3] > 0 && targetHex.toLowerCase() === color.toLowerCase()) {
        return;
      }
      playAction();
      floodFill(mainCtx, Math.floor(x), Math.floor(y), color);
      saveCanvasSnapshot(mainCanvas);
      checkCanvasContent(mainCanvas);
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
                hasChanged: true,
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
          const extractedObject = findObjectInRect(
            mainCtx,
            selectionStart.x,
            selectionStart.y,
            x,
            y,
          );
          if (extractedObject) {
            const originalBitmap = frames[currentFrame].bitmap;
            eraseObjectPixels(mainCtx, extractedObject.pixelOffsets);
            setActiveSelection({
              ownerFrameId: frames[currentFrame].id,
              canvas: extractedObject.canvas,
              x: extractedObject.x,
              y: extractedObject.y,
              width: extractedObject.width,
              height: extractedObject.height,
              initialX: extractedObject.x,
              initialY: extractedObject.y,
              initialWidth: extractedObject.width,
              initialHeight: extractedObject.height,
              originalBitmap,
              hasChanged: false,
            });
            playPop();
          }
        }
        return;
      }

      if (isMovingSelectionRef.current) {
        isMovingSelectionRef.current = false;
        if (activeSelection && (activeSelection.x !== activeSelection.initialX || activeSelection.y !== activeSelection.initialY)) {
          commitSelectionChange(activeSelection);
        }
        return;
      }
      if (isMovingTextRef.current) {
        isMovingTextRef.current = false;
        if (activeText && hasTextChanged(activeText)) {
          commitTextChange(activeText);
        }
        return;
      }
    }

    if (tool === "text") {
      if (isMovingTextRef.current) {
        isMovingTextRef.current = false;
        if (activeText && hasTextChanged(activeText)) {
          commitTextChange(activeText);
        }
      }
      return;
    }

    if (tool === "sticker") {
      if (isMovingStickerRef.current || isResizingStickerRef.current) {
        isMovingStickerRef.current = false;
        isResizingStickerRef.current = false;
        if (activeSticker && hasStickerChanged(activeSticker)) {
          commitStickerChange(activeSticker);
        }
      }
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

      saveRasterOverlay(overlayCanvas);
      mainCtx.drawImage(overlayCanvas, 0, 0);
      overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      checkCanvasContent(mainCanvas);

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
      saveRasterOverlay(overlayCanvas);
      mainCtx.drawImage(overlayCanvas, 0, 0);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      checkCanvasContent(mainCanvas);
      return;
    }

    saveCanvasSnapshot(mainCanvas);
    checkCanvasContent(mainCanvas);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasBoxSelecting = isBoxSelectingRef.current;
    const wasEraser = tool === "eraser" && isDrawingRef.current;
    isBoxSelectingRef.current = false;
    isMovingSelectionRef.current = false;
    isMovingTextRef.current = false;
    isMovingStickerRef.current = false;
    isResizingStickerRef.current = false;
    isDrawingRef.current = false;
    if (wasBoxSelecting || tool !== "select") clearOverlayCanvas();

    if (wasEraser && baseCanvasRef.current && mainCanvasRef.current) {
      const mainCtx = mainCanvasRef.current.getContext("2d");
      if (mainCtx) {
        mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        mainCtx.drawImage(baseCanvasRef.current, 0, 0);
        drawObjects(mainCtx, frames[currentFrame].objects);
      }
    }

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
    } else if (tool === "text" || (tool === "select" && activeText)) {
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
    const newFrames = [...commitPendingChanges()];
    newFrames.splice(currentFrame + 1, 0, createFrame(getBlankCanvas()));
    saveState(newFrames);
    setCurrentFrame(currentFrame + 1);
  };

  const copyFrame = () => {
    playPop();
    const newFrames = [...commitPendingChanges()];
    newFrames.splice(currentFrame + 1, 0, cloneFrame(newFrames[currentFrame]));
    saveState(newFrames);
    setCurrentFrame(currentFrame + 1);
  };

  const deleteFrame = () => {
    if (frames.length <= 1) {
      playError();
      return;
    }
    playSwoosh();
    cancelPendingChanges();
    const newFrames = removeFrame(frames, frames[currentFrame].id);
    saveState(newFrames);
    setCurrentFrame(Math.min(currentFrame, newFrames.length - 1));
  };

  const clearCanvas = () => {
    playSwoosh();
    cancelPendingChanges();
    const newFrames = [...frames];
    newFrames[currentFrame] = { ...frames[currentFrame], bitmap: getBlankCanvas(), preview: getBlankCanvas(), objects: [] };
    saveState(newFrames);
  };

  const savePng = () => {
    playAction();
    const committed = commitPendingChanges();
    downloadPng(committed[currentFrame].preview);
  };

  const saveGif = async () => {
    if (frames.length <= 1) {
      alert("Нужно больше одного кадра для мультика!");
      return;
    }
    playAction();
    setIsExporting(true);
    try {
      const committed = commitPendingChanges();
      await downloadGif(committed.map(frame => frame.preview), fps, CANVAS_WIDTH, CANVAS_HEIGHT);
    } catch (e) {
      console.error(e);
      alert("Ошибка при сохранении GIF");
    }
    setIsExporting(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    cancelPendingChanges();
    const target = frames[currentFrame];
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (getFrames().find(frame => frame.id === target.id) !== target) return;
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_WIDTH; canvas.height = CANVAS_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const bitmap = canvas.toDataURL("image/png");
        saveState(previous => previous.map(frame => frame.id === target.id ? { ...frame, bitmap, preview: bitmap, objects: [] } : frame));
        playPop();
      };
      img.onerror = () => setCanvasError("Не удалось открыть изображение");
      img.src = event.target?.result as string;
    };
    reader.onerror = () => setCanvasError("Не удалось прочитать файл изображения");
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
    } else if ((tool === "text" || tool === "select") && activeText) {
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
      {(loadError || persistenceError || canvasError) && <div role="alert" className="bg-red-100 text-red-800 px-4 py-2 text-sm">{loadError || persistenceError || canvasError}</div>}
      <HeaderToolbar
        logoUrl={LOGO_URL}
        historyIndex={historyIndex}
        historyLength={history.length}
        isPlaying={isPlaying}
        isExporting={isExporting}
        fileInputRef={fileInputRef}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onImageUpload={handleImageUpload}
        onClear={clearCanvas}
        onSavePng={savePng}
        onSaveGif={saveGif}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <ToolsPanel
          tool={tool}
          hasActiveSticker={Boolean(activeSticker)}
          onSelectTool={(nextTool) => { playPop(); handleSetTool(nextTool); }}
          onOpenStickers={() => setShowStickerPanel(true)}
        />

        <ToolSettingsPanel
          tool={tool}
          activeSelection={activeSelection}
          activeText={activeText}
          activeSticker={activeSticker}
          customHue={customHue}
          color={color}
          selectedShape={selectedShape}
          brushSize={brushSize}
          selectedFont={selectedFont}
          textInput={textInput}
          assistMode={assistMode}
          symmetryMode={symmetryMode}
          activeTemplate={activeTemplate}
          selectedSticker={selectedSticker}
          onScaleSelection={scaleSelection}
          onFlipSelection={flipSelection}
          onSelectionHueChange={(hue) => {
            setCustomHue(hue); setCustomSat(100); setCustomVal(100);
            const nextColor = hsvToHex(hue, 100, 100);
            setColor(nextColor);
            if (activeText) setActiveText({ ...activeText, color: nextColor });
            else tintSelection(nextColor, true);
          }}
          onSelectionColorChange={(nextColor) => {
            setColor(nextColor);
            if (activeText) setActiveText({ ...activeText, color: nextColor });
            else tintSelection(nextColor);
          }}
          onShapeChange={(shape) => { playPop(); setSelectedShape(shape); }}
          onBrushSizeChange={(size) => { playPop(); setBrushSize(size); }}
          onTextChange={(value) => {
            setTextInput(value);
            if (activeText) setActiveText({ ...activeText, text: value });
          }}
          onFontChange={(font) => {
            playPop(); setSelectedFont(font);
            if (activeText) setActiveText({ ...activeText, font });
          }}
          onToggleAssist={() => { playPop(); setAssistMode(!assistMode); }}
          onToggleSymmetry={() => { playPop(); setSymmetryMode(!symmetryMode); }}
          onOpenTemplates={() => { playPop(); setShowTemplatesPanel(true); }}
          onOpenColors={() => { playPop(); setShowColorModal(true); }}
          onColorChange={(nextColor) => {
            playPop(); handleColorSelect(nextColor);
            if (activeText) setActiveText({ ...activeText, color: nextColor });
          }}
          onOpenStickers={() => setShowStickerPanel(true)}
          onFinalizeSticker={commitPendingChanges}
          onCancelSticker={cancelPendingChanges}
        />

        <DrawingStage
          mainCanvasRef={mainCanvasRef}
          overlayCanvasRef={overlayCanvasRef}
          textInputRef={textInputRef}
          tool={tool}
          activeTemplate={activeTemplate}
          activeText={activeText}
          textInput={textInput}
          feedback={feedback}
          contentWarning={contentWarning}
          isPlaying={isPlaying}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={handleContextMenu}
          onTextChange={(value) => {
            setTextInput(value);
            setActiveText((current) => current ? { ...current, text: value } : current);
          }}
          onFinalizeText={commitPendingChanges}
        />
      </div>

      <Timeline
        frames={frames}
        currentFrame={currentFrame}
        draggedFrameIndex={draggedFrameIdx}
        isPlaying={isPlaying}
        fps={fps}
        onTogglePlayback={() => { playAction(); commitPendingChanges(); setIsPlaying(!isPlaying); }}
        onFpsChange={(nextFps) => { playPop(); setFps(nextFps); }}
        onAddFrame={addFrame}
        onCopyFrame={copyFrame}
        onDeleteFrame={deleteFrame}
        onSelectFrame={(index) => { playPop(); commitPendingChanges(); setCurrentFrame(index); }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />

      <TemplatePicker
        isOpen={showTemplatesPanel}
        activeTemplate={activeTemplate}
        onClose={() => setShowTemplatesPanel(false)}
        onSelect={(template) => { setActiveTemplate(template); setShowTemplatesPanel(false); playPop(); }}
      />
      <StickerPicker
        isOpen={showStickerPanel}
        selectedSticker={selectedSticker}
        onClose={() => setShowStickerPanel(false)}
        onSelect={(sticker) => {
          setSelectedSticker(sticker);
          setShowStickerPanel(false);
          handleSetTool("sticker");
          playPop();
        }}
      />
      <ColorPickerModal
        isOpen={showColorModal}
        color={color}
        favoriteColors={favoriteColors}
        recentColors={recentColors}
        hue={customHue}
        saturation={customSat}
        value={customVal}
        squareRef={colorSquareRef}
        setHue={setCustomHue}
        setSaturation={setCustomSat}
        setValue={setCustomVal}
        toHex={hsvToHex}
        onSelectColor={(nextColor) => { playPop(); handleColorSelect(nextColor); }}
        onConfirmColor={(nextColor) => { playPop(); handleColorSelect(nextColor); setShowColorModal(false); }}
        onToggleFavorite={toggleFavorite}
        onActivatePipette={() => { setShowColorModal(false); activatePipette(); }}
        onClose={() => setShowColorModal(false)}
      />
      <SelectionContextMenu
        menu={contextMenu}
        onDelete={(target) => {
          if (target === "selection") {
            if (activeSelection) {
              const mainCanvas = mainCanvasRef.current;
              if (mainCanvas) {
                const bitmap = mainCanvas.toDataURL("image/png");
                const owner = activeSelection.ownerFrameId ?? frames[currentFrame].id;
                saveState(prev => prev.map(f => f.id === owner ? { ...f, bitmap, preview: bitmap } : f));
              }
              setActiveSelection(null);
            }
          } else if (target === "sticker") {
            if (activeSticker?.id) {
              const owner = activeSticker.ownerFrameId ?? frames[currentFrame].id;
              const f = frames.find(frame => frame.id === owner);
              if (f) commitObjects(f.objects.filter(object => object.id !== activeSticker.id), owner);
            }
            setActiveSticker(null);
          } else {
            if (activeText?.id) {
              const owner = activeText.ownerFrameId ?? frames[currentFrame].id;
              const f = frames.find(frame => frame.id === owner);
              if (f) commitObjects(f.objects.filter(object => object.id !== activeText.id), owner);
            }
            setActiveText(null);
            setTextInput("");
          }
          setContextMenu(null);
          playSwoosh();
          clearOverlayCanvas();
        }}
      />
    </div>
  );
}
