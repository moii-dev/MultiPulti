import React, { useState, useRef, useEffect, useCallback } from "react";
import { floodFill } from "./utils/floodFill";
import { extractObject, extractObjectInRect } from "./utils/extractObject";
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
import { loadProjectState } from "./services/projectStorage";
import { useAnimationPlayback } from "./hooks/useAnimationPlayback";
import { useFrameHistory } from "./hooks/useFrameHistory";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useContentModeration } from "./hooks/useContentModeration";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type {
  ActiveSelection, ActiveSticker, ActiveText, CanvasClientPosition,
  EditorContextMenu, PlacedText, Point, ShapeId, ToolId,
} from "./types/editor";


export default function App() {
  const [initialState] = useState(loadProjectState);

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
  } = useFrameHistory(initialState);

  const [tool, setTool] = useState<ToolId>("brush");
  const [selectedShape, setSelectedShape] = useState<ShapeId>("line");
  const [color, setColor] = useState(BASIC_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);

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

  const [placedTexts, setPlacedTexts] = useState<PlacedText[]>([]);

  const isMovingSelectionRef = useRef(false);
  const isBoxSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const initialSelectionPosRef = useRef({ x: 0, y: 0 });

  const [draggedFrameIdx, setDraggedFrameIdx] = useState<number | null>(null);

  const { isPlaying, setIsPlaying, fps, setFps } = useAnimationPlayback(
    frames.length,
    setCurrentFrame,
    FPS_OPTIONS[1].fps,
  );

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

  useProjectPersistence(
    history,
    historyIndex,
    currentFrame,
    favoriteColors,
    recentColors,
  );

  const { warning: contentWarning, checkCanvas: checkCanvasContent } =
    useContentModeration({
      onBlocked: discardBlockedFrame,
      onErrorSound: playError,
    });

  useKeyboardShortcuts({
    canUndo: historyIndex > 0 && !isPlaying,
    canRedo: historyIndex < history.length - 1 && !isPlaying,
    onUndo: () => {
      playPop();
      setHistoryIndex(Math.max(0, historyIndex - 1));
    },
    onRedo: () => {
      playPop();
      setHistoryIndex(Math.min(history.length - 1, historyIndex + 1));
    },
  });



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
      mainCtx.drawImage(overlayCanvas, 0, 0);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    saveCanvasSnapshot(mainCanvas);
    checkCanvasContent(mainCanvas);


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
    downloadPng(frames[currentFrame]);
  };

  const saveGif = async () => {
    if (frames.length <= 1) {
      alert("Нужно больше одного кадра для мультика!");
      return;
    }
    playAction();
    setIsExporting(true);
    try {
      await downloadGif(frames, fps, CANVAS_WIDTH, CANVAS_HEIGHT);
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
      <HeaderToolbar
        logoUrl={LOGO_URL}
        historyIndex={historyIndex}
        historyLength={history.length}
        isPlaying={isPlaying}
        isExporting={isExporting}
        fileInputRef={fileInputRef}
        onUndo={() => { playPop(); setHistoryIndex(Math.max(0, historyIndex - 1)); }}
        onRedo={() => { playPop(); setHistoryIndex(Math.min(history.length - 1, historyIndex + 1)); }}
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
          placedTexts={placedTexts}
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
          onConvertSelectionToText={convertSelectionToText}
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
          onFinalizeSticker={finalizeSticker}
          onCancelSticker={cancelSticker}
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
          onFinalizeText={finalizeText}
        />
      </div>

      <Timeline
        frames={frames}
        currentFrame={currentFrame}
        draggedFrameIndex={draggedFrameIdx}
        isPlaying={isPlaying}
        fps={fps}
        onTogglePlayback={() => { playAction(); setIsPlaying(!isPlaying); }}
        onFpsChange={(nextFps) => { playPop(); setFps(nextFps); }}
        onAddFrame={addFrame}
        onCopyFrame={copyFrame}
        onDeleteFrame={deleteFrame}
        onSelectFrame={(index) => { playPop(); setCurrentFrame(index); }}
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
          if (target === "selection") setActiveSelection(null);
          else if (target === "sticker") cancelSticker();
          else { setActiveText(null); setTextInput(""); }
          setContextMenu(null);
          playSwoosh();
          clearOverlayCanvas();
        }}
      />
    </div>
  );
}
