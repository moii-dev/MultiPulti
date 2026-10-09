import { useState, useRef, useCallback } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants/editor';
import { playAction, playPop } from "../utils/audio";
import { renderRasterSelection } from '../canvas/rasterSelection';
import type { ActiveSelection, Frame } from "../types/editor";

interface UseSelectionProps {
  frames: Frame[];
  currentFrame: number;
  saveState: (framesOrUpdater: Frame[] | ((prev: Frame[]) => Frame[])) => void;
}

export function useSelection({
  frames,
  currentFrame,
  saveState,
}: UseSelectionProps) {
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);

  const activeSelectionRef = useRef<ActiveSelection | null>(activeSelection);
  activeSelectionRef.current = activeSelection;

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  const commitSelectionChange = useCallback(
    (updatedSelection: ActiveSelection) => {
      const ownerFrameId = updatedSelection.ownerFrameId ?? frames[currentFrameRef.current]?.id;
      if (!ownerFrameId) return;

      const target = frames.find(f => f.id === ownerFrameId);
      if (!target) return;
      const updated = renderRasterSelection(target, updatedSelection);
      saveState(prev => prev.map(f => f.id === ownerFrameId ? updated : f));

      setActiveSelection({
        ...updatedSelection,
        initialX: updatedSelection.x,
        initialY: updatedSelection.y,
        initialWidth: updatedSelection.width,
        initialHeight: updatedSelection.height,
        originalBitmap: updated.bitmap,
        hasChanged: false,
      });
    },
    [frames, saveState],
  );

  const scaleSelection = useCallback(
    (factor: number) => {
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
    },
    [activeSelection, commitSelectionChange],
  );

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

  const tintSelection = useCallback(
    (colorHex: string, silent = false) => {
      if (!activeSelection) return;
      const canvas = activeSelection.canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = colorHex;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      const updated: ActiveSelection = {
        ...activeSelection,
        hasChanged: true,
      };
      commitSelectionChange(updated);
      if (!silent) playPop();
    },
    [activeSelection, commitSelectionChange],
  );

  const deleteSelection = useCallback(() => {
    if (!activeSelection) return;
    const owner = activeSelection.ownerFrameId ?? frames[currentFrameRef.current]?.id;
    if (owner) {
      saveState(prev => prev.map(f => f.id === owner ? renderRasterSelection(f, activeSelection, false) : f));
    }
    setActiveSelection(null);
  }, [activeSelection, frames, saveState]);

  const clearSelection = useCallback(() => {
    setActiveSelection(null);
  }, []);

  return {
    activeSelection,
    setActiveSelection,
    activeSelectionRef,
    commitSelectionChange,
    scaleSelection,
    flipSelection,
    tintSelection,
    deleteSelection,
    clearSelection,
  };
}
