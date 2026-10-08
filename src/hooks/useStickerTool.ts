import type React from "react";
import { useState, useRef, useCallback } from "react";
import type { ActiveSticker, CanvasObject, Frame } from "../types/editor";
import { commitStickerToFrame } from "../domain/transaction";
import { composeFrame } from "../canvas/frameRenderer";

interface UseStickerToolProps {
  frames: Frame[];
  currentFrame: number;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  loadedFrameIdRef: React.RefObject<string | null>;
  saveState: (framesOrUpdater: Frame[] | ((prev: Frame[]) => Frame[])) => void;
  commitObjects: (objects: CanvasObject[], ownerFrameId: string) => void;
}

export function useStickerTool({
  frames,
  currentFrame,
  baseCanvasRef,
  loadedFrameIdRef,
  saveState,
  commitObjects,
}: UseStickerToolProps) {
  const [activeSticker, setActiveSticker] = useState<ActiveSticker | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string>("⭐");

  const activeStickerRef = useRef<ActiveSticker | null>(activeSticker);
  activeStickerRef.current = activeSticker;

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  const commitStickerChange = useCallback(
    (updatedSticker: ActiveSticker) => {
      const ownerFrameId = updatedSticker.ownerFrameId ?? frames[currentFrameRef.current]?.id;
      if (!ownerFrameId) return;
      const frame = frames.find((f) => f.id === ownerFrameId);
      if (!frame) return;

      const updated = commitStickerToFrame(frame, updatedSticker);
      if (baseCanvasRef.current && loadedFrameIdRef.current === ownerFrameId) {
        updated.preview = composeFrame(baseCanvasRef.current, updated.objects);
      }
      saveState((prev) => prev.map((f) => (f.id === ownerFrameId ? updated : f)));
      setActiveSticker({
        ...updatedSticker,
        initialX: updatedSticker.x,
        initialY: updatedSticker.y,
        initialSize: updatedSticker.size,
        initialEmoji: updatedSticker.emoji,
        isNew: false,
      });
    },
    [baseCanvasRef, frames, loadedFrameIdRef, saveState],
  );

  const deleteSticker = useCallback(
    (ownerFrameId?: string) => {
      if (activeSticker?.id) {
        const owner = ownerFrameId ?? activeSticker.ownerFrameId ?? frames[currentFrameRef.current]?.id;
        const targetFrame = frames.find((frame) => frame.id === owner);
        if (targetFrame && owner) {
          commitObjects(
            targetFrame.objects.filter((obj) => obj.id !== activeSticker.id),
            owner,
          );
        }
      }
      setActiveSticker(null);
    },
    [activeSticker, commitObjects, frames],
  );

  const clearSticker = useCallback(() => {
    setActiveSticker(null);
  }, []);

  return {
    activeSticker,
    setActiveSticker,
    activeStickerRef,
    selectedSticker,
    setSelectedSticker,
    commitStickerChange,
    deleteSticker,
    clearSticker,
  };
}
