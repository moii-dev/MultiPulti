import { useCallback, useState } from "react";
import { createBlankFrame } from "../canvas/operations";
import type { FrameHistoryEntry, StoredAppState } from "../types/editor";

const MAX_HISTORY_ENTRIES = 50;

export function useFrameHistory(initialState: StoredAppState | null) {
  const [history, setHistory] = useState<FrameHistoryEntry[]>(() =>
    initialState?.history ?? [{ frames: [createBlankFrame()] }],
  );
  const [historyIndex, setHistoryIndex] = useState(initialState?.historyIndex ?? 0);
  const [currentFrame, setCurrentFrame] = useState(initialState?.currentFrame ?? 0);
  const frames = history[historyIndex].frames;

  const saveFrames = useCallback((nextFrames: string[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ frames: nextFrames });
    if (nextHistory.length > MAX_HISTORY_ENTRIES) nextHistory.shift();
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  }, [history, historyIndex]);

  const saveCanvasSnapshot = useCallback((canvas: HTMLCanvasElement) => {
    const nextFrames = [...frames];
    nextFrames[currentFrame] = canvas.toDataURL("image/png");
    saveFrames(nextFrames);
  }, [currentFrame, frames, saveFrames]);

  const discardBlockedFrame = useCallback(() => {
    setHistory((previousHistory) => {
      const latestFrames = previousHistory[previousHistory.length - 1]?.frames ?? [createBlankFrame()];
      const cleanFrames = latestFrames.length <= 1
        ? [createBlankFrame()]
        : latestFrames.filter((_, index) => index !== currentFrame);
      const nextFrame = Math.min(currentFrame, cleanFrames.length - 1);
      setCurrentFrame(nextFrame);
      setHistoryIndex(0);
      return [{ frames: cleanFrames }];
    });
  }, [currentFrame]);

  return {
    history,
    historyIndex,
    setHistoryIndex,
    currentFrame,
    setCurrentFrame,
    frames,
    saveFrames,
    saveCanvasSnapshot,
    discardBlockedFrame,
  };
}
