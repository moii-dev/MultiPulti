import { useState, useRef, useEffect, useCallback } from "react";
import { DrawingStage } from "./components/DrawingStage";
import { HeaderToolbar } from "./components/HeaderToolbar";
import { Timeline } from "./components/Timeline";
import { ToolsPanel } from "./components/ToolsPanel";
import { ToolSettingsPanel } from "./components/ToolSettingsPanel";
import { HomeScreen } from "./components/HomeScreen";
import {
  ColorPickerModal,
  SelectionContextMenu,
  StickerPicker,
  TemplatePicker,
} from "./components/EditorModals";
import {
  BASIC_COLORS,
  BRUSH_SIZES,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FPS_OPTIONS,
  LOGO_URL,
  type FontName,
} from "./constants/editor";
import { hsvToHex } from "./canvas/operations";
import { composeFrame, drawObjects } from "./canvas/frameRenderer";
import { projectRepository, readPreferences } from "./services/projectRepository";
import { commitStickerToFrame, commitTextToFrame, hasSelectionChanged, hasStickerChanged, hasTextChanged } from "./domain/transaction";
import { useAnimationPlayback } from "./hooks/useAnimationPlayback";
import { useFrameHistory } from "./hooks/useFrameHistory";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSelection } from "./hooks/useSelection";
import { useTextTool } from "./hooks/useTextTool";
import { useStickerTool } from "./hooks/useStickerTool";
import { useFrames } from "./hooks/useFrames";
import { useCanvasDrawing } from "./hooks/useCanvasDrawing";
import { playAction, playPop, playSwoosh } from "./utils/audio";
import type {
  EditorContextMenu,
  Frame,
  Project,
  ShapeId,
  StoredAppState,
  ToolId,
} from "./types/editor";

export default function App() {
  const [screen, setScreen] = useState<"home" | "editor">("home");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [editorInitialState, setEditorInitialState] = useState<StoredAppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadGeneration = useRef(0);

  useEffect(() => {
    projectRepository.migrateLegacyProject().catch(() => {}).finally(() => {
      setReady(true);
    });
  }, []);

  const handleOpenProject = async (id: string) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await projectRepository.loadProject(id);
      if (generation !== loadGeneration.current) return;
      if (!loaded) {
        setLoadError("Не удалось найти выбранный мультик");
        return;
      }
      const preferences = readPreferences();
      const currentIdx = loaded.frames.findIndex((f) => f.id === loaded.currentFrameId);

      const state: StoredAppState = {
        history: [{ frames: loaded.frames }],
        historyIndex: 0,
        currentFrame: Math.max(0, currentIdx),
        ...preferences,
      };

      setActiveProject({ ...loaded, id: loaded.id ?? id });
      setEditorInitialState(state);
      setScreen("editor");
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      console.error("Ошибка загрузки мультика:", err);
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки мультика");
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  };

  const handleBackToHome = () => {
    setScreen("home");
    setActiveProject(null);
  };

  if (!ready || loading) {
    return (
      <div role="status" className="h-screen flex items-center justify-center font-black text-xl text-gray-700 bg-[#f0f9ff]">
        Загрузка MultiPulti…
      </div>
    );
  }

  if (screen === "editor" && editorInitialState) {
    return (
      <Editor
        key={activeProject?.id ?? "editor"}
        initialState={editorInitialState}
        persistenceEnabled={true}
        loadError={loadError}
        project={activeProject}
        onBackToHome={handleBackToHome}
      />
    );
  }

  if (loadError) return <div role="alert" className="p-8 bg-blue-50 h-screen">
    <p>{loadError}</p><button className="btn-kid mt-4 p-3" onClick={() => setLoadError(null)}>Мои мультики</button>
  </div>;
  return <HomeScreen onOpenProject={handleOpenProject} />;
}

function Editor({
  initialState,
  persistenceEnabled,
  loadError,
  project,
  onBackToHome,
}: {
  key?: string;
  initialState: StoredAppState | null;
  persistenceEnabled: boolean;
  loadError: string | null;
  project?: Project | null;
  onBackToHome?: () => void;
}) {
  const [preferences] = useState(readPreferences);

  // Canvas DOM references
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const loadedFrameIdRef = useRef<string | null>(null);

  // Editor history
  const {
    history,
    historyIndex,
    setHistoryIndex,
    currentFrame,
    setCurrentFrame,
    frames,
    saveFrames: saveState,
    saveCanvasSnapshot,
    getFrames,
  } = useFrameHistory(initialState);

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  // Tool preferences & state
  const [tool, setTool] = useState<ToolId>("brush");
  const [selectedShape, setSelectedShape] = useState<ShapeId>("line");
  const [color, setColor] = useState(BASIC_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);

  const [recentColors, setRecentColors] = useState<string[]>(
    initialState?.recentColors ?? preferences.recentColors,
  );
  const [favoriteColors, setFavoriteColors] = useState<string[]>(
    initialState?.favoriteColors ?? preferences.favoriteColors,
  );

  // Modals & overlay controls
  const [showColorModal, setShowColorModal] = useState(false);
  const [customHue, setCustomHue] = useState(0);
  const [customSat, setCustomSat] = useState(100);
  const [customVal, setCustomVal] = useState(100);
  const colorSquareRef = useRef<HTMLDivElement>(null);

  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const [assistMode, setAssistMode] = useState(false);
  const [symmetryMode, setSymmetryMode] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; id: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<EditorContextMenu | null>(null);

  // Playback
  const { isPlaying, setIsPlaying, fps, setFps } = useAnimationPlayback(
    frames.length,
    setCurrentFrame,
    project?.fps ?? FPS_OPTIONS[1].fps,
  );

  // Domain tool hooks
  const selectionTool = useSelection({
    frames,
    currentFrame,
    baseCanvasRef,
    mainCanvasRef,
    loadedFrameIdRef,
    saveState,
  });

  const textTool = useTextTool({
    frames,
    currentFrame,
    baseCanvasRef,
    mainCanvasRef,
    loadedFrameIdRef,
    saveState,
    commitObjects: (objects, ownerId) => frameManager.commitObjects(objects, ownerId),
  });

  const stickerTool = useStickerTool({
    frames,
    currentFrame,
    baseCanvasRef,
    loadedFrameIdRef,
    saveState,
    commitObjects: (objects, ownerId) => frameManager.commitObjects(objects, ownerId),
  });

  const cancelActiveGestureRef = useRef<() => void>(() => {});

  const clearOverlayCanvas = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d");
    if (!overlayCanvas || !overlayCtx) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }, []);

  // Pending changes coordination
  const cancelPendingChanges = useCallback(() => {
    cancelActiveGestureRef.current();

    const sel = selectionTool.activeSelectionRef.current;
    if (
      sel &&
      sel.originalBitmap &&
      baseCanvasRef.current &&
      loadedFrameIdRef.current === sel.ownerFrameId
    ) {
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
          const frame = frames.find((f) => f.id === sel.ownerFrameId);
          if (frame) drawObjects(mainCtx, frame.objects);
        }
      };
      img.src = sel.originalBitmap;
    }

    textTool.clearText();
    stickerTool.clearSticker();
    selectionTool.clearSelection();
    clearOverlayCanvas();
  }, [clearOverlayCanvas, frames, selectionTool, stickerTool, textTool]);

  const commitPendingChanges = useCallback((): Frame[] => {
    let currentFrames = getFrames();
    let changed = false;

    // 1. Text
    const text = textTool.activeTextRef.current;
    if (text) {
      const ownerId = text.ownerFrameId ?? currentFrames[currentFrameRef.current]?.id;
      const targetFrame = currentFrames.find((f) => f.id === ownerId);
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
        currentFrames = currentFrames.map((f) => (f.id === ownerId ? updated : f));
        changed = true;
      }
      textTool.clearText();
    }

    // 2. Sticker
    const sticker = stickerTool.activeStickerRef.current;
    if (sticker) {
      const ownerId = sticker.ownerFrameId ?? currentFrames[currentFrameRef.current]?.id;
      const targetFrame = currentFrames.find((f) => f.id === ownerId);
      if (targetFrame && hasStickerChanged(sticker)) {
        const updated = commitStickerToFrame(targetFrame, sticker);
        if (baseCanvasRef.current && loadedFrameIdRef.current === ownerId) {
          updated.preview = composeFrame(baseCanvasRef.current, updated.objects);
        }
        currentFrames = currentFrames.map((f) => (f.id === ownerId ? updated : f));
        changed = true;
      }
      stickerTool.clearSticker();
    }

    // 3. Selection
    const sel = selectionTool.activeSelectionRef.current;
    if (sel) {
      const ownerId = sel.ownerFrameId ?? currentFrames[currentFrameRef.current]?.id;
      const targetFrame = currentFrames.find((f) => f.id === ownerId);
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
            const updated = { ...targetFrame, bitmap: newBitmap, preview: composeFrame(canvas, targetFrame.objects) };
            currentFrames = currentFrames.map((f) => (f.id === ownerId ? updated : f));
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
      selectionTool.clearSelection();
    }

    clearOverlayCanvas();

    if (changed) {
      saveState(currentFrames);
    }
    return currentFrames;
  }, [
    clearOverlayCanvas,
    getFrames,
    saveState,
    selectionTool,
    stickerTool,
    textTool,
  ]);

  const handleColorSelect = useCallback((c: string) => {
    setColor(c);
    setRecentColors((prev) => [c, ...prev.filter((col) => col !== c)].slice(0, 8));
  }, []);

  const toggleFavorite = (c: string) => {
    setFavoriteColors((prev) =>
      prev.includes(c) ? prev.filter((col) => col !== c) : [...prev, c],
    );
    playPop();
  };

  // Frame lifecycle & raster rendering hook
  const isDrawingRef = useRef(false);
  const frameManager = useFrames({
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
    activeTextId: textTool.activeText?.id,
    activeStickerId: stickerTool.activeSticker?.id,
    fps,
    isPlaying,
    commitPendingChanges,
    cancelPendingChanges,
  });

  // Canvas drawing & pointer interaction hook
  const canvasDrawing = useCanvasDrawing({
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
    activeSelection: selectionTool.activeSelection,
    setActiveSelection: selectionTool.setActiveSelection,
    commitSelectionChange: selectionTool.commitSelectionChange,
    activeText: textTool.activeText,
    setActiveText: textTool.setActiveText,
    setTextInput: textTool.setTextInput,
    selectedFont: textTool.selectedFont,
    setSelectedFont: textTool.setSelectedFont,
    textInputRef: textTool.textInputRef,
    commitTextChange: textTool.commitTextChange,
    activeSticker: stickerTool.activeSticker,
    setActiveSticker: stickerTool.setActiveSticker,
    selectedSticker: stickerTool.selectedSticker,
    commitStickerChange: stickerTool.commitStickerChange,
    commitPendingChanges,
    saveCanvasSnapshot,
    saveRasterOverlay: frameManager.saveRasterOverlay,
    handleColorSelect,
    setFeedback,
    setContextMenu,
  });

  // Keep drawing ref and cancel gesture ref in sync
  isDrawingRef.current = canvasDrawing.isDrawingRef.current;
  cancelActiveGestureRef.current = canvasDrawing.cancelActiveGesture;

  // Persistence
  const persistence = useProjectPersistence(
    history,
    historyIndex,
    currentFrame,
    favoriteColors,
    recentColors,
    fps,
    persistenceEnabled,
    isPlaying,
    project!,
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (isPlaying) return;
    cancelPendingChanges();
    if (historyIndex > 0) {
      playPop();
      setHistoryIndex(historyIndex - 1);
    }
  }, [cancelPendingChanges, historyIndex, isPlaying, setHistoryIndex]);

  const handleRedo = useCallback(() => {
    if (isPlaying) return;
    cancelPendingChanges();
    if (historyIndex < history.length - 1) {
      playPop();
      setHistoryIndex(historyIndex + 1);
    }
  }, [cancelPendingChanges, history.length, historyIndex, isPlaying, setHistoryIndex]);

  const handleEscape = useCallback(() => {
    if (showColorModal) {
      setShowColorModal(false);
      return;
    }
    if (showStickerPanel) {
      setShowStickerPanel(false);
      return;
    }
    if (showTemplatesPanel) {
      setShowTemplatesPanel(false);
      return;
    }
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    cancelPendingChanges();
  }, [
    cancelPendingChanges,
    contextMenu,
    showColorModal,
    showStickerPanel,
    showTemplatesPanel,
  ]);

  useKeyboardShortcuts({
    canUndo: historyIndex > 0 && !isPlaying,
    canRedo: historyIndex < history.length - 1 && !isPlaying,
    isPlaying,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onEscape: handleEscape,
  });

  const handleSetTool = useCallback(
    (newTool: ToolId) => {
      if (newTool !== tool) {
        commitPendingChanges();
      }
      setTool(newTool);
    },
    [commitPendingChanges, tool],
  );

  // Close context menu on outside click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const [leaving, setLeaving] = useState(false);
  const exitInProgress = useRef(false);
  const handleBackToHome = async () => {
    if (exitInProgress.current) return;
    exitInProgress.current = true;
    setLeaving(true);
    setIsPlaying(false);
    try {
      await persistence.flush(commitPendingChanges());
      onBackToHome?.();
    } catch {
      exitInProgress.current = false;
      setLeaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-blue-50 font-sans text-gray-800">
      {(loadError || persistence.error || frameManager.canvasError) && (
        <div role="alert" className="bg-red-100 text-red-800 px-4 py-2 text-sm">
          {loadError || persistence.error || frameManager.canvasError}
        </div>
      )}
      <div role="status" className="px-4 text-xs bg-white">{persistence.status}</div>
      {leaving && <div className="fixed inset-0 z-50 bg-white/70 flex items-center justify-center font-bold" role="status">Сохранение перед выходом…</div>}
      <HeaderToolbar
        logoUrl={LOGO_URL}
        projectTitle={project?.title}
        onBackToHome={onBackToHome ? handleBackToHome : undefined}
        historyIndex={historyIndex}
        historyLength={history.length}
        isPlaying={isPlaying}
        isExporting={frameManager.isExporting}
        exportProgress={frameManager.exportProgress}
        fileInputRef={frameManager.fileInputRef}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onImageUpload={frameManager.handleImageUpload}
        onClear={frameManager.clearCanvas}
        onSavePng={frameManager.savePng}
        onSaveGif={frameManager.saveGif}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <ToolsPanel
          tool={tool}
          hasActiveSticker={Boolean(stickerTool.activeSticker)}
          onSelectTool={(nextTool) => {
            playPop();
            handleSetTool(nextTool);
          }}
          onOpenStickers={() => setShowStickerPanel(true)}
        />

        <ToolSettingsPanel
          tool={tool}
          activeSelection={selectionTool.activeSelection}
          activeText={textTool.activeText}
          activeSticker={stickerTool.activeSticker}
          customHue={customHue}
          color={color}
          selectedShape={selectedShape}
          brushSize={brushSize}
          selectedFont={textTool.selectedFont}
          textInput={textTool.textInput}
          assistMode={assistMode}
          symmetryMode={symmetryMode}
          activeTemplate={activeTemplate}
          selectedSticker={stickerTool.selectedSticker}
          onScaleSelection={selectionTool.scaleSelection}
          onFlipSelection={selectionTool.flipSelection}
          onSelectionHueChange={(hue) => {
            setCustomHue(hue);
            setCustomSat(100);
            setCustomVal(100);
            const nextColor = hsvToHex(hue, 100, 100);
            setColor(nextColor);
            if (textTool.activeText) {
              textTool.setActiveText({ ...textTool.activeText, color: nextColor });
            } else {
              selectionTool.tintSelection(nextColor, true);
            }
          }}
          onSelectionColorChange={(nextColor) => {
            setColor(nextColor);
            if (textTool.activeText) {
              textTool.setActiveText({ ...textTool.activeText, color: nextColor });
            } else {
              selectionTool.tintSelection(nextColor);
            }
          }}
          onShapeChange={(shape) => {
            playPop();
            setSelectedShape(shape);
          }}
          onBrushSizeChange={(size) => {
            playPop();
            setBrushSize(size);
          }}
          onTextChange={(value) => {
            textTool.setTextInput(value);
            if (textTool.activeText) {
              textTool.setActiveText({ ...textTool.activeText, text: value });
            }
          }}
          onFontChange={(font) => {
            playPop();
            textTool.setSelectedFont(font);
            if (textTool.activeText) {
              textTool.setActiveText({ ...textTool.activeText, font });
            }
          }}
          onToggleAssist={() => {
            playPop();
            setAssistMode(!assistMode);
          }}
          onToggleSymmetry={() => {
            playPop();
            setSymmetryMode(!symmetryMode);
          }}
          onOpenTemplates={() => {
            playPop();
            setShowTemplatesPanel(true);
          }}
          onOpenColors={() => {
            playPop();
            setShowColorModal(true);
          }}
          onColorChange={(nextColor) => {
            playPop();
            handleColorSelect(nextColor);
            if (textTool.activeText) {
              textTool.setActiveText({ ...textTool.activeText, color: nextColor });
            }
          }}
          onOpenStickers={() => setShowStickerPanel(true)}
          onFinalizeSticker={commitPendingChanges}
          onCancelSticker={cancelPendingChanges}
        />

        <DrawingStage
          mainCanvasRef={mainCanvasRef}
          overlayCanvasRef={overlayCanvasRef}
          textInputRef={textTool.textInputRef}
          tool={tool}
          activeTemplate={activeTemplate}
          activeText={textTool.activeText}
          textInput={textTool.textInput}
          feedback={feedback}
          isPlaying={isPlaying}
          onPointerDown={canvasDrawing.handlePointerDown}
          onPointerMove={canvasDrawing.handlePointerMove}
          onPointerUp={canvasDrawing.handlePointerUp}
          onPointerCancel={canvasDrawing.handlePointerCancel}
          onLostPointerCapture={canvasDrawing.handleLostPointerCapture}
          onContextMenu={canvasDrawing.handleContextMenu}
          onTextChange={(value) => {
            textTool.setTextInput(value);
            textTool.setActiveText((current) =>
              current ? { ...current, text: value } : current,
            );
          }}
          onFinalizeText={commitPendingChanges}
        />
      </div>

      <Timeline
        frames={frames}
        currentFrame={currentFrame}
        draggedFrameIndex={frameManager.draggedFrameIdx}
        isPlaying={isPlaying}
        fps={fps}
        onTogglePlayback={() => {
          playAction();
          commitPendingChanges();
          setIsPlaying(!isPlaying);
        }}
        onFpsChange={(nextFps) => {
          playPop();
          setFps(nextFps);
        }}
        onAddFrame={frameManager.addFrame}
        onCopyFrame={frameManager.copyFrame}
        onDeleteFrame={frameManager.deleteFrame}
        onSelectFrame={(index) => {
          playPop();
          commitPendingChanges();
          setCurrentFrame(index);
        }}
        onDragStart={frameManager.handleDragStart}
        onDragOver={frameManager.handleDragOver}
        onDrop={frameManager.handleDrop}
        onDragEnd={frameManager.handleDragEnd}
      />

      <TemplatePicker
        isOpen={showTemplatesPanel}
        activeTemplate={activeTemplate}
        onClose={() => setShowTemplatesPanel(false)}
        onSelect={(template) => {
          setActiveTemplate(template);
          setShowTemplatesPanel(false);
          playPop();
        }}
      />
      <StickerPicker
        isOpen={showStickerPanel}
        selectedSticker={stickerTool.selectedSticker}
        onClose={() => setShowStickerPanel(false)}
        onSelect={(sticker) => {
          stickerTool.setSelectedSticker(sticker);
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
        onSelectColor={(nextColor) => {
          playPop();
          handleColorSelect(nextColor);
        }}
        onConfirmColor={(nextColor) => {
          playPop();
          handleColorSelect(nextColor);
          setShowColorModal(false);
        }}
        onToggleFavorite={toggleFavorite}
        onActivatePipette={() => {
          setShowColorModal(false);
          canvasDrawing.activatePipette();
        }}
        onClose={() => setShowColorModal(false)}
      />
      <SelectionContextMenu
        menu={contextMenu}
        onDelete={(target) => {
          if (target === "selection") {
            selectionTool.deleteSelection();
          } else if (target === "sticker") {
            stickerTool.deleteSticker();
          } else {
            textTool.deleteText();
          }
          setContextMenu(null);
          playSwoosh();
          clearOverlayCanvas();
        }}
      />
    </div>
  );
}
