import type React from "react";
import { useState, useRef, useCallback } from "react";
import type { ActiveText, CanvasObject, Frame } from "../types/editor";
import { type FontName } from "../constants/editor";
import { commitTextToFrame } from "../domain/transaction";
import { composeFrame } from "../canvas/frameRenderer";

interface UseTextToolProps {
  frames: Frame[];
  currentFrame: number;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  loadedFrameIdRef: React.RefObject<string | null>;
  saveState: (framesOrUpdater: Frame[] | ((prev: Frame[]) => Frame[])) => void;
  commitObjects: (objects: CanvasObject[], ownerFrameId: string) => void;
}

export function useTextTool({
  frames,
  currentFrame,
  baseCanvasRef,
  mainCanvasRef,
  loadedFrameIdRef,
  saveState,
  commitObjects,
}: UseTextToolProps) {
  const [activeText, setActiveText] = useState<ActiveText | null>(null);
  const [selectedFont, setSelectedFont] = useState<FontName>("Nunito");
  const [textInput, setTextInput] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  const activeTextRef = useRef<ActiveText | null>(activeText);
  activeTextRef.current = activeText;

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  const commitTextChange = useCallback(
    (updatedText: ActiveText) => {
      const ownerFrameId = updatedText.ownerFrameId ?? frames[currentFrameRef.current]?.id;
      if (!ownerFrameId) return;
      const frame = frames.find((f) => f.id === ownerFrameId);
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
      saveState((prev) => prev.map((f) => (f.id === ownerFrameId ? updated : f)));
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
    },
    [baseCanvasRef, frames, loadedFrameIdRef, mainCanvasRef, saveState],
  );

  const deleteText = useCallback(
    (ownerFrameId?: string) => {
      if (activeText?.id) {
        const owner = ownerFrameId ?? activeText.ownerFrameId ?? frames[currentFrameRef.current]?.id;
        const targetFrame = frames.find((frame) => frame.id === owner);
        if (targetFrame && owner) {
          commitObjects(
            targetFrame.objects.filter((obj) => obj.id !== activeText.id),
            owner,
          );
        }
      }
      setActiveText(null);
      setTextInput("");
    },
    [activeText, commitObjects, frames],
  );

  const clearText = useCallback(() => {
    setActiveText(null);
    setTextInput("");
  }, []);

  return {
    activeText,
    setActiveText,
    activeTextRef,
    selectedFont,
    setSelectedFont,
    textInput,
    setTextInput,
    textInputRef,
    commitTextChange,
    deleteText,
    clearText,
  };
}
