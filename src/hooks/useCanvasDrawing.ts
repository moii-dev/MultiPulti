import type React from "react";
import { useRef, useEffect, useCallback } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PRAISE_MESSAGES,
  type FontName,
} from "../constants/editor";
import {
  drawPerfectShape,
  drawSmoothedCurve,
  getCanvasCoordinates,
  isSelectionPixelAt,
  rgbToHex,
  traceShapePath,
} from "../canvas/operations";
import { drawObjects, hitObject } from "../canvas/frameRenderer";
import {
  eraseObjectPixels,
  findConnectedObject,
  findObjectInRect,
} from "../utils/extractObject";
import { floodFill } from "../utils/floodFill";
import { detectSmartShape } from "../utils/shapeDetection";
import { playAction, playPop } from "../utils/audio";
import { createId } from "../domain/project";
import { hasStickerChanged, hasTextChanged } from "../domain/transaction";
import type {
  ActiveSelection,
  ActiveSticker,
  ActiveText,
  CanvasClientPosition,
  EditorContextMenu,
  Frame,
  Point,
  ShapeId,
  ToolId,
} from "../types/editor";

interface UseCanvasDrawingProps {
  tool: ToolId;
  setTool: (tool: ToolId) => void;
  color: string;
  brushSize: number;
  selectedShape: ShapeId;
  assistMode: boolean;
  symmetryMode: boolean;
  isPlaying: boolean;
  frames: Frame[];
  currentFrame: number;
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  loadedFrameIdRef: React.RefObject<string | null>;
  activeSelection: ActiveSelection | null;
  setActiveSelection: React.Dispatch<React.SetStateAction<ActiveSelection | null>>;
  commitSelectionChange: (selection: ActiveSelection) => void;
  activeText: ActiveText | null;
  setActiveText: React.Dispatch<React.SetStateAction<ActiveText | null>>;
  setTextInput: (text: string) => void;
  selectedFont: FontName;
  setSelectedFont: (font: FontName) => void;
  textInputRef: React.RefObject<HTMLInputElement | null>;
  commitTextChange: (text: ActiveText) => void;
  activeSticker: ActiveSticker | null;
  setActiveSticker: React.Dispatch<React.SetStateAction<ActiveSticker | null>>;
  selectedSticker: string;
  commitStickerChange: (sticker: ActiveSticker) => void;
  commitPendingChanges: () => Frame[];
  saveCanvasSnapshot: (canvas: HTMLCanvasElement) => void;
  saveRasterOverlay: (overlay: HTMLCanvasElement) => void;
  handleColorSelect: (color: string) => void;
  setFeedback: React.Dispatch<React.SetStateAction<{ text: string; id: number } | null>>;
  setContextMenu: React.Dispatch<React.SetStateAction<EditorContextMenu | null>>;
}

export function useCanvasDrawing(props: UseCanvasDrawingProps) {
  const {
    tool,
    setTool,
    color,
    brushSize,
    selectedShape,
    assistMode,
    symmetryMode,
    isPlaying,
    frames,
    currentFrame,
    mainCanvasRef,
    overlayCanvasRef,
    baseCanvasRef,
    loadedFrameIdRef,
    activeSelection,
    setActiveSelection,
    commitSelectionChange,
    activeText,
    setActiveText,
    setTextInput,
    selectedFont,
    setSelectedFont,
    textInputRef,
    commitTextChange,
    activeSticker,
    setActiveSticker,
    selectedSticker,
    commitStickerChange,
    commitPendingChanges,
    saveCanvasSnapshot,
    saveRasterOverlay,
    handleColorSelect,
    setFeedback,
    setContextMenu,
  } = props;

  // Single primary pointer ID tracker to guard multi-touch & pen collision
  const activePointerIdRef = useRef<number | null>(null);

  // Drawing refs
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<Point[]>([]);
  const startPosRef = useRef({ x: 0, y: 0 });

  // Sticker interaction refs
  const isMovingStickerRef = useRef(false);
  const isResizingStickerRef = useRef(false);
  const initialStickerPosRef = useRef({ x: 0, y: 0 });
  const initialStickerSizeRef = useRef(100);

  // Text interaction refs
  const isMovingTextRef = useRef(false);
  const initialTextPosRef = useRef({ x: 0, y: 0 });

  // Selection interaction refs
  const isMovingSelectionRef = useRef(false);
  const isBoxSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const initialSelectionPosRef = useRef({ x: 0, y: 0 });

  // Pipette return tool
  const pipetteReturnToolRef = useRef<ToolId>("brush");

  // Keep references to active state to avoid stale closures
  const activeSelectionRef = useRef(activeSelection);
  activeSelectionRef.current = activeSelection;
  const activeTextRef = useRef(activeText);
  activeTextRef.current = activeText;
  const activeStickerRef = useRef(activeSticker);
  activeStickerRef.current = activeSticker;

  const clearOverlayCanvas = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");
    if (!overlayCanvas || !overlayCtx) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }, [overlayCanvasRef]);

  const getCoordinates = useCallback(
    (event: CanvasClientPosition): Point =>
      getCanvasCoordinates(mainCanvasRef.current, event),
    [mainCanvasRef],
  );

  const redrawOverlayState = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");
    if (!overlayCanvas || !overlayCtx) return;

    if (tool === "select" && activeSelectionRef.current) {
      const sel = activeSelectionRef.current;
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCtx.drawImage(sel.canvas, sel.x, sel.y, sel.width, sel.height);
      overlayCtx.strokeStyle = "#3B82F6";
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.strokeRect(sel.x, sel.y, sel.width, sel.height);
      overlayCtx.setLineDash([]);
    } else if (tool === "sticker") {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      const stk = activeStickerRef.current;
      if (stk) {
        overlayCtx.font = `${stk.size}px Arial`;
        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        overlayCtx.fillText(stk.emoji, stk.x, stk.y);

        const halfSize = stk.size / 2;
        overlayCtx.strokeStyle = "#3B82F6";
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(stk.x - halfSize, stk.y - halfSize, stk.size, stk.size);
        overlayCtx.setLineDash([]);

        overlayCtx.fillStyle = "#3B82F6";
        const handleSize = 20;
        overlayCtx.fillRect(
          stk.x + halfSize - handleSize / 2,
          stk.y + halfSize - handleSize / 2,
          handleSize,
          handleSize,
        );

        overlayCtx.fillStyle = "#FFFFFF";
        overlayCtx.font = "12px Arial";
        overlayCtx.fillText("⤡", stk.x + halfSize, stk.y + halfSize);
      }
    } else if (tool === "text" || (tool === "select" && activeTextRef.current)) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      const txt = activeTextRef.current;
      if (txt && !txt.isEditing) {
        overlayCtx.font = `${txt.size}px ${txt.font}`;
        const metrics = overlayCtx.measureText(txt.text);
        const w = metrics.width;
        const h = txt.size;

        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        overlayCtx.fillStyle = txt.color;
        overlayCtx.fillText(txt.text, txt.x, txt.y);

        overlayCtx.strokeStyle = "#3B82F6";
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(txt.x - w / 2 - 5, txt.y - h / 2 - 5, w + 10, h + 10);
        overlayCtx.setLineDash([]);
      }
    } else if (!isDrawingRef.current) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  }, [overlayCanvasRef, tool]);

  // Keep overlay in sync with active selection / sticker / text changes
  useEffect(() => {
    redrawOverlayState();
  }, [activeSelection, activeSticker, activeText, redrawOverlayState, tool]);

  // Clean cancellation of active gesture
  const cancelActiveGesture = useCallback(() => {
    const wasBoxSelecting = isBoxSelectingRef.current;
    const wasEraser = tool === "eraser" && isDrawingRef.current;

    isBoxSelectingRef.current = false;
    isMovingSelectionRef.current = false;
    isMovingTextRef.current = false;
    isMovingStickerRef.current = false;
    isResizingStickerRef.current = false;
    isDrawingRef.current = false;
    pointsRef.current = [];
    activePointerIdRef.current = null;

    if (wasBoxSelecting || tool !== "select") {
      clearOverlayCanvas();
    } else {
      redrawOverlayState();
    }

    if (wasEraser && baseCanvasRef.current && mainCanvasRef.current) {
      const mainCtx = mainCanvasRef.current.getContext("2d");
      if (mainCtx) {
        mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        mainCtx.drawImage(baseCanvasRef.current, 0, 0);
        drawObjects(mainCtx, frames[currentFrame].objects);
      }
    }
  }, [baseCanvasRef, clearOverlayCanvas, currentFrame, frames, mainCanvasRef, redrawOverlayState, tool]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying || loadedFrameIdRef.current !== frames[currentFrame].id) return;
    if (e.button === 2) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Guard against multi-touch / secondary pointer collision
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

    const { x, y } = getCoordinates(e);
    const mainCanvas = mainCanvasRef.current;
    const mainCtx = mainCanvas?.getContext("2d", { willReadFrequently: true });
    if (!mainCanvas || !mainCtx) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    // Hit test semantic objects first
    if (
      (tool === "select" || tool === "text" || tool === "sticker") &&
      !activeText &&
      !activeSticker &&
      !activeSelection
    ) {
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
      setTool(pipetteReturnToolRef.current);
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
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

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
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activePointerIdRef.current = null;

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
        if (
          activeSelection &&
          (activeSelection.x !== activeSelection.initialX ||
            activeSelection.y !== activeSelection.initialY)
        ) {
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
      if (assistMode) {
        const shape = detectSmartShape(pointsRef.current);
        if (shape) {
          overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          drawPerfectShape(overlayCtx, shape, color, brushSize, symmetryMode);
          playPop();
        }
      }

      saveRasterOverlay(overlayCanvas);
      mainCtx.drawImage(overlayCanvas, 0, 0);
      overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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
      return;
    }

    saveCanvasSnapshot(mainCanvas);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

    cancelActiveGesture();

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleLostPointerCapture = (_e: React.PointerEvent<HTMLCanvasElement>) => {
    cancelActiveGesture();
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

  const activatePipette = useCallback(() => {
    if (tool !== "pipette") pipetteReturnToolRef.current = tool;
    setTool("pipette");
    playPop();
  }, [setTool, tool]);

  return {
    isDrawingRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    handleContextMenu,
    clearOverlayCanvas,
    cancelActiveGesture,
    activatePipette,
    redrawOverlayState,
  };
}
