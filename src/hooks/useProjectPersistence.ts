import { useEffect } from "react";
import { saveProjectState } from "../services/projectStorage";
import type { FrameHistoryEntry } from "../types/editor";

export function useProjectPersistence(
  history: FrameHistoryEntry[],
  historyIndex: number,
  currentFrame: number,
  favoriteColors: string[],
  recentColors: string[],
) {
  useEffect(() => {
    saveProjectState({
      history,
      historyIndex,
      currentFrame,
      favoriteColors,
      recentColors,
    });
  }, [currentFrame, favoriteColors, history, historyIndex, recentColors]);
}

