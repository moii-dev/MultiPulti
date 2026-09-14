import type { FrameHistoryEntry, StoredAppState } from "../types/editor";

const STORAGE_KEY = "multipulti_state";

function isFrameHistoryEntry(value: unknown): value is FrameHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const { frames } = value as { frames?: unknown };
  return Array.isArray(frames) && frames.length > 0 && frames.every((frame) => typeof frame === "string");
}

function clampIndex(value: unknown, maxIndex: number) {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(Math.max(value, 0), maxIndex) : 0;
}

export function loadProjectState(): StoredAppState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const rawState = parsed as Partial<StoredAppState>;
    const history = Array.isArray(rawState.history) ? rawState.history.filter(isFrameHistoryEntry) : [];
    if (history.length === 0) return null;
    const historyIndex = clampIndex(rawState.historyIndex, history.length - 1);
    return {
      history,
      historyIndex,
      currentFrame: clampIndex(rawState.currentFrame, history[historyIndex].frames.length - 1),
      recentColors: Array.isArray(rawState.recentColors) ? rawState.recentColors.filter((item): item is string => typeof item === "string") : [],
      favoriteColors: Array.isArray(rawState.favoriteColors) ? rawState.favoriteColors.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

export function saveProjectState(state: StoredAppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Не удалось сохранить полное состояние в localStorage, пробуем сохранить только текущий кадр", error);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        history: [state.history[state.historyIndex]],
        historyIndex: 0,
      } satisfies StoredAppState));
    } catch (minimalError) {
      console.error("Даже минимальное состояние не помещается в localStorage", minimalError);
    }
  }
}

