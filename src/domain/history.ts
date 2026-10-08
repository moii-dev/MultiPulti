import type { Frame, FrameHistoryEntry } from '../types/editor';

export const MAX_HISTORY_ENTRIES = 50;

export interface HistoryState {
  entries: FrameHistoryEntry[];
  index: number;
}

export function createHistory(initialFrames: Frame[]): HistoryState {
  return {
    entries: [{ frames: initialFrames }],
    index: 0,
  };
}

export function canUndo(state: HistoryState): boolean {
  return state.index > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.index < state.entries.length - 1;
}

export function undo(state: HistoryState): HistoryState {
  if (!canUndo(state)) return state;
  return {
    entries: state.entries,
    index: state.index - 1,
  };
}

export function redo(state: HistoryState): HistoryState {
  if (!canRedo(state)) return state;
  return {
    entries: state.entries,
    index: state.index + 1,
  };
}

export function areFramesEqual(a: Frame[], b: Frame[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const fA = a[i];
    const fB = b[i];
    if (fA.id !== fB.id || fA.bitmap !== fB.bitmap || fA.preview !== fB.preview) return false;
    if (fA.objects.length !== fB.objects.length) return false;
    for (let j = 0; j < fA.objects.length; j++) {
      const oA = fA.objects[j];
      const oB = fB.objects[j];
      if (oA.id !== oB.id || oA.kind !== oB.kind) return false;
      if (oA.kind === 'raster' && oA.bitmap !== (oB as typeof oA).bitmap) return false;
      if (oA.kind === 'sticker') {
        const sB = oB as typeof oA;
        if (oA.emoji !== sB.emoji || oA.x !== sB.x || oA.y !== sB.y || oA.size !== sB.size) return false;
      }
      if (oA.kind === 'text') {
        const tB = oB as typeof oA;
        if (
          oA.text !== tB.text ||
          oA.x !== tB.x ||
          oA.y !== tB.y ||
          oA.size !== tB.size ||
          oA.w !== tB.w ||
          oA.h !== tB.h ||
          oA.font !== tB.font ||
          oA.color !== tB.color
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

export function commitFrames(
  state: HistoryState,
  nextFrames: Frame[],
  maxEntries = MAX_HISTORY_ENTRIES
): HistoryState {
  const currentFrames = state.entries[state.index]?.frames;
  if (currentFrames && areFramesEqual(currentFrames, nextFrames)) {
    return state;
  }
  // Redo branch truncation: any actions ahead of current index are discarded
  const pruned = state.entries.slice(0, state.index + 1);
  const nextEntries = [...pruned, { frames: nextFrames }].slice(-maxEntries);
  return {
    entries: nextEntries,
    index: nextEntries.length - 1,
  };
}

