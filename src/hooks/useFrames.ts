import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants/editor";
import {
  calculateAspectFitDimensions,
  createBlankFrame as getBlankCanvas,
} from "../canvas/operations";
import { analyzeFrame } from "../utils/contentFilter";
import {
  cacheRaster,
  composeFrame,
  drawObjects,
  loadRasterLayers,
  pruneRasterCache,
} from "../canvas/frameRenderer";
import {
  copyFrame as cloneFrame,
  createFrame,
  createId,
  deleteFrame as removeFrame,
  reorderFrame,
} from "../domain/project";
import { downloadGif, downloadPng } from "../services/imageExport";
import { playAction, playError, playPop, playSwoosh } from "../utils/audio";
import type { CanvasObject, Frame, FrameHistoryEntry } from "../types/editor";

interface UseFramesProps {
  frames: Frame[];
  currentFrame: number;
  setCurrentFrame: (frameOrUpdater: number | ((prev: number) => number)) => void;
  history: FrameHistoryEntry[];
  saveState: (framesOrUpdater: Frame[] | ((prev: Frame[]) => Frame[])) => void;
  getFrames: () => Frame[];
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  loadedFrameIdRef: React.RefObject<string | null>;
  isDrawingRef: React.RefObject<boolean>;
  activeTextId?: string;
  activeStickerId?: string;
  fps: number;
  isPlaying?: boolean;
  commitPendingChanges: () => Frame[];
  cancelPendingChanges: () => void;
  onModerationBlocked?: () => void;
  onFrameRendered?: (canvas: HTMLCanvasElement) => void;
}

export function useFrames({
  frames,
  currentFrame,
  setCurrentFrame,
  history,
  saveState,
  getFrames,
  mainCanvasRef,
  baseCanvasRef,
  loadedFrameIdRef,
  isDrawingRef,
  activeTextId,
  activeStickerId,
  fps,
  isPlaying = false,
  commitPendingChanges,
  cancelPendingChanges,
  onModerationBlocked,
  onFrameRendered,
}: UseFramesProps) {
  const [draggedFrameIdx, setDraggedFrameIdx] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseBitmapRef = useRef<string | null>(null);
  const uploadRequestIdRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const commitObjects = useCallback(
    (objects: CanvasObject[], ownerFrameId: string) => {
      const base = baseCanvasRef.current;
      if (!base || loadedFrameIdRef.current !== ownerFrameId) return;
      const preview = composeFrame(base, objects);
      saveState((previous) =>
        previous.map((frame) =>
          frame.id === ownerFrameId ? { ...frame, objects, preview } : frame,
        ),
      );
    },
    [baseCanvasRef, loadedFrameIdRef, saveState],
  );

  // Render current frame raster & objects onto the main canvas
  useEffect(() => {
    if (isDrawingRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const frame = frames[currentFrame];
    if (!frame) return;

    let cancelled = false;
    const render = async (base: HTMLCanvasElement) => {
      try {
        await loadRasterLayers(frame.objects);
        if (cancelled) return;
        baseCanvasRef.current = base;
        baseBitmapRef.current = frame.bitmap;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(base, 0, 0);
        drawObjects(
          ctx,
          frame.objects.filter(
            (object) => object.id !== activeTextId && object.id !== activeStickerId,
          ),
        );
        loadedFrameIdRef.current = frame.id;
        setCanvasError(null);
        if (!isPlayingRef.current) {
          onFrameRendered?.(canvas);
        }
      } catch {
        if (!cancelled) setCanvasError("Не удалось отобразить данные кадра");
      }
    };

    if (
      loadedFrameIdRef.current === frame.id &&
      baseBitmapRef.current === frame.bitmap &&
      baseCanvasRef.current
    ) {
      void render(baseCanvasRef.current);
    } else {
      loadedFrameIdRef.current = null;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const base = document.createElement("canvas");
        base.width = canvas.width;
        base.height = canvas.height;
        const baseCtx = base.getContext("2d");
        if (!baseCtx) {
          setCanvasError("Canvas недоступен");
          return;
        }
        baseCtx.drawImage(img, 0, 0);
        void render(base);
      };
      img.onerror = () => {
        if (!cancelled) setCanvasError("Не удалось декодировать кадр");
      };
      img.src = frame.bitmap;
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeStickerId,
    activeTextId,
    baseCanvasRef,
    currentFrame,
    frames,
    isDrawingRef,
    loadedFrameIdRef,
    mainCanvasRef,
  ]);

  // Prune unused raster layers when history changes
  useEffect(() => {
    pruneRasterCache(history.flatMap((entry) => entry.frames));
  }, [history]);

  const saveRasterOverlay = useCallback(
    (overlay: HTMLCanvasElement) => {
      const frame = frames[currentFrame];
      const base = baseCanvasRef.current;
      if (!base || !frame) return;
      const layer = document.createElement("canvas");
      layer.width = overlay.width;
      layer.height = overlay.height;
      const ctx = layer.getContext("2d");
      if (!ctx) return;

      if (!frame.objects.some((object) => object.kind !== "raster")) {
        ctx.drawImage(base, 0, 0);
        drawObjects(ctx, frame.objects);
        ctx.drawImage(overlay, 0, 0);
        const bitmap = layer.toDataURL("image/png");
        saveState((previous) =>
          previous.map((item) =>
            item.id === frame.id ? { ...item, bitmap, preview: bitmap, objects: [] } : item,
          ),
        );
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
      objects.push({
        kind: "raster",
        id: last?.kind === "raster" ? last.id : createId(),
        bitmap,
      });
      commitObjects(objects, frame.id);
    },
    [baseCanvasRef, commitObjects, currentFrame, frames, saveState],
  );

  const addFrame = useCallback(() => {
    playPop();
    const newFrames = [...commitPendingChanges()];
    newFrames.splice(currentFrame + 1, 0, createFrame(getBlankCanvas()));
    saveState(newFrames);
    setCurrentFrame(currentFrame + 1);
  }, [commitPendingChanges, currentFrame, saveState, setCurrentFrame]);

  const copyFrame = useCallback(() => {
    playPop();
    const newFrames = [...commitPendingChanges()];
    newFrames.splice(currentFrame + 1, 0, cloneFrame(newFrames[currentFrame]));
    saveState(newFrames);
    setCurrentFrame(currentFrame + 1);
  }, [commitPendingChanges, currentFrame, saveState, setCurrentFrame]);

  const deleteFrame = useCallback(() => {
    if (frames.length <= 1) {
      playError();
      return;
    }
    playSwoosh();
    cancelPendingChanges();
    const newFrames = removeFrame(frames, frames[currentFrame].id);
    saveState(newFrames);
    setCurrentFrame(Math.min(currentFrame, newFrames.length - 1));
  }, [cancelPendingChanges, currentFrame, frames, saveState, setCurrentFrame]);

  const clearCanvas = useCallback(() => {
    playSwoosh();
    cancelPendingChanges();
    const newFrames = [...frames];
    newFrames[currentFrame] = {
      ...frames[currentFrame],
      bitmap: getBlankCanvas(),
      preview: getBlankCanvas(),
      objects: [],
    };
    saveState(newFrames);
  }, [cancelPendingChanges, currentFrame, frames, saveState]);

  const savePng = useCallback(() => {
    playAction();
    const committed = commitPendingChanges();
    const target = committed[currentFrame] ?? committed[0];
    if (target?.preview) {
      downloadPng(target.preview);
    }
  }, [commitPendingChanges, currentFrame]);

  const saveGif = useCallback(async () => {
    if (isExporting) return;
    if (frames.length <= 1) {
      alert("Нужно больше одного кадра для мультика!");
      return;
    }
    playAction();
    setIsExporting(true);
    setExportProgress({ current: 0, total: frames.length });
    try {
      const committed = commitPendingChanges();
      await downloadGif(
        committed.map((frame) => frame.preview),
        fps,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        (current, total) => setExportProgress({ current, total }),
      );
    } catch (e) {
      console.error(e);
      setCanvasError(e instanceof Error ? e.message : "Ошибка при сохранении GIF");
      playError();
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [commitPendingChanges, fps, frames.length, isExporting]);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (e.target) {
        e.target.value = "";
      }
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setCanvasError("Пожалуйста, выбери файл изображения (PNG, JPEG, WebP, GIF)");
        playError();
        return;
      }

      const MAX_SIZE = 15 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setCanvasError("Файл слишком большой (максимум 15 МБ)");
        playError();
        return;
      }

      cancelPendingChanges();
      const target = frames[currentFrame];
      if (!target) return;

      const requestId = ++uploadRequestIdRef.current;
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (requestId !== uploadRequestIdRef.current) return;

        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
          setCanvasError("Не удалось определить размеры изображения");
          playError();
          return;
        }

        if (img.naturalWidth > 8192 || img.naturalHeight > 8192) {
          setCanvasError("Разрешение изображения слишком велико (максимум 8192×8192)");
          playError();
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setCanvasError("Canvas недоступен");
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const { width: drawWidth, height: drawHeight, x: drawX, y: drawY } =
          calculateAspectFitDimensions(img.naturalWidth, img.naturalHeight, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        const moderation = analyzeFrame(canvas);
        if (moderation.blocked) {
          setCanvasError("Изображение заблокировано фильтром содержимого");
          playError();
          onModerationBlocked?.();
          return;
        }

        const currentFrames = getFrames();
        const targetExists = currentFrames.some((frame) => frame.id === target.id);
        if (!targetExists) return;

        const bitmap = canvas.toDataURL("image/png");
        saveState((previous) =>
          previous.map((frame) =>
            frame.id === target.id
              ? { ...frame, bitmap, preview: bitmap, objects: [] }
              : frame,
          ),
        );
        setCanvasError(null);
        playPop();
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (requestId === uploadRequestIdRef.current) {
          setCanvasError("Не удалось открыть файл изображения");
          playError();
        }
      };

      img.src = objectUrl;
    },
    [cancelPendingChanges, currentFrame, frames, getFrames, onModerationBlocked, saveState],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      setDraggedFrameIdx(idx);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", idx.toString());
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIdx: number) => {
      e.preventDefault();
      if (draggedFrameIdx === null || draggedFrameIdx === dropIdx) return;

      const committed = commitPendingChanges();
      saveState(reorderFrame(committed, frames[draggedFrameIdx].id, dropIdx));
      setDraggedFrameIdx(null);
      playPop();
    },
    [commitPendingChanges, draggedFrameIdx, frames, saveState],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedFrameIdx(null);
  }, []);

  return {
    draggedFrameIdx,
    isExporting,
    exportProgress,
    canvasError,
    fileInputRef,
    commitObjects,
    saveRasterOverlay,
    addFrame,
    copyFrame,
    deleteFrame,
    clearCanvas,
    savePng,
    saveGif,
    handleImageUpload,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
