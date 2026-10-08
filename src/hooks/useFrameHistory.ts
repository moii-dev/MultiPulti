import { useCallback, useRef, useState } from 'react';
import { createBlankFrame } from '../canvas/operations';
import { createFrame } from '../domain/project';
import { commitFrames, MAX_HISTORY_ENTRIES } from '../domain/history';
import type { Frame, StoredAppState } from '../types/editor';

export function useFrameHistory(initialState: StoredAppState | null) {
  const [state, setState] = useState(() => {
    const history = initialState?.history ?? [{ frames: [createFrame(createBlankFrame())] }];
    const historyIndex = Math.max(0, Math.min(initialState?.historyIndex ?? 0, history.length - 1));
    const validFrames = history[historyIndex].frames;
    const currentIdx = Math.max(0, Math.min(initialState?.currentFrame ?? 0, validFrames.length - 1));
    return { history, historyIndex, currentFrameId: validFrames[currentIdx].id };
  });

  const latest = useRef(state);
  latest.current = state;

  const update = useCallback((change: (state: typeof latest.current) => typeof latest.current) => {
    latest.current = change(latest.current);
    setState(latest.current);
  }, []);

  const frames = state.history[state.historyIndex].frames;
  const currentFrame = Math.max(0, frames.findIndex(frame => frame.id === state.currentFrameId));
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  const setCurrentFrame = useCallback((value: number | ((previous: number) => number)) => update(previous => {
    const frames = previous.history[previous.historyIndex].frames;
    const index = Math.max(0, frames.findIndex(frame => frame.id === previous.currentFrameId));
    const next = typeof value === 'function' ? value(index) : value;
    return { ...previous, currentFrameId: frames[Math.max(0, Math.min(next, frames.length - 1))].id };
  }), [update]);

  const setHistoryIndex = useCallback((index: number) => update(previous => {
    const historyIndex = Math.max(0, Math.min(index, previous.history.length - 1));
    const nextFrames = previous.history[historyIndex].frames;
    const previousIndex = Math.max(0, previous.history[previous.historyIndex].frames.findIndex(f => f.id === previous.currentFrameId));
    const currentFrameId = nextFrames.some(frame => frame.id === previous.currentFrameId)
      ? previous.currentFrameId
      : nextFrames[Math.min(previousIndex, nextFrames.length - 1)].id;
    return { ...previous, historyIndex, currentFrameId };
  }), [update]);

  const saveFrames = useCallback((value: Frame[] | ((frames: Frame[]) => Frame[])) => update(previous => {
    const currentFrames = previous.history[previous.historyIndex].frames;
    const nextFrames = typeof value === 'function' ? value(currentFrames) : value;
    const nextHistoryState = commitFrames(
      { entries: previous.history, index: previous.historyIndex },
      nextFrames,
      MAX_HISTORY_ENTRIES
    );
    if (nextHistoryState.entries === previous.history && nextHistoryState.index === previous.historyIndex) {
      return previous;
    }
    const currentFrameId = nextFrames.some(frame => frame.id === previous.currentFrameId)
      ? previous.currentFrameId
      : nextFrames[0].id;
    return {
      history: nextHistoryState.entries,
      historyIndex: nextHistoryState.index,
      currentFrameId,
    };
  }), [update]);

  const saveCanvasSnapshot = useCallback((canvas: HTMLCanvasElement) => {
    const bitmap = canvas.toDataURL('image/png');
    const previous = latest.current;
    const frames = previous.history[previous.historyIndex].frames;
    const id = frames.find(frame => frame.id === previous.currentFrameId)?.id ?? frames[0].id;
    const target = frames.find(frame => frame.id === id);
    if (target && target.bitmap === bitmap && target.objects.length === 0) {
      return;
    }
    saveFrames(frames => frames.map(frame => frame.id === id ? { ...frame, bitmap, preview: bitmap, objects: [] } : frame));
  }, [saveFrames]);

  const undo = useCallback(() => {
    if (latest.current.historyIndex > 0) {
      setHistoryIndex(latest.current.historyIndex - 1);
    }
  }, [setHistoryIndex]);

  const redo = useCallback(() => {
    if (latest.current.historyIndex < latest.current.history.length - 1) {
      setHistoryIndex(latest.current.historyIndex + 1);
    }
  }, [setHistoryIndex]);

  const discardBlockedFrame = useCallback(() => update(previous => {
    const frames = previous.history[previous.historyIndex].frames;
    const clean = frames.length <= 1 ? [createFrame(createBlankFrame())] : frames.filter(frame => frame.id !== previous.currentFrameId);
    return { history: [{ frames: clean }], historyIndex: 0, currentFrameId: clean[0].id };
  }), [update]);

  const getFrames = useCallback(() => latest.current.history[latest.current.historyIndex].frames, []);

  return {
    ...state,
    frames,
    currentFrame,
    canUndo,
    canRedo,
    undo,
    redo,
    setCurrentFrame,
    setHistoryIndex,
    saveFrames,
    saveCanvasSnapshot,
    discardBlockedFrame,
    getFrames,
  };
}
