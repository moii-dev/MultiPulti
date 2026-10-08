import { useCallback, useRef, useState } from 'react';
import { createBlankFrame } from '../canvas/operations';
import { createFrame } from '../domain/project';
import type { Frame, StoredAppState } from '../types/editor';
const MAX_HISTORY_ENTRIES = 50;
export function useFrameHistory(initialState: StoredAppState | null) {
  const [state, setState] = useState(() => {
    const history = initialState?.history ?? [{ frames: [createFrame(createBlankFrame())] }];
    const historyIndex = initialState?.historyIndex ?? 0;
    return { history, historyIndex, currentFrameId: history[historyIndex].frames[initialState?.currentFrame ?? 0].id };
  });
  const latest = useRef(state);
  latest.current = state;
  const update = useCallback((change: (state: typeof latest.current) => typeof latest.current) => {
    latest.current = change(latest.current);
    setState(latest.current);
  }, []);
  const frames = state.history[state.historyIndex].frames;
  const currentFrame = Math.max(0, frames.findIndex(frame => frame.id === state.currentFrameId));
  const setCurrentFrame = useCallback((value: number | ((previous: number) => number)) => update(previous => {
    const frames = previous.history[previous.historyIndex].frames;
    const index = Math.max(0, frames.findIndex(frame => frame.id === previous.currentFrameId));
    const next = typeof value === 'function' ? value(index) : value;
    return { ...previous, currentFrameId: frames[Math.max(0, Math.min(next, frames.length - 1))].id };
  }), [update]);
  const setHistoryIndex = useCallback((index: number) => update(previous => {
    const historyIndex = Math.max(0, Math.min(index, previous.history.length - 1));
    const frames = previous.history[historyIndex].frames;
    return { ...previous, historyIndex, currentFrameId: frames.some(frame => frame.id === previous.currentFrameId) ? previous.currentFrameId : frames[0].id };
  }), [update]);
  const saveFrames = useCallback((value: Frame[] | ((frames: Frame[]) => Frame[])) => update(previous => {
    const frames = previous.history[previous.historyIndex].frames;
    const nextFrames = typeof value === 'function' ? value(frames) : value;
    const history = [...previous.history.slice(0, previous.historyIndex + 1), { frames: nextFrames }].slice(-MAX_HISTORY_ENTRIES);
    return { history, historyIndex: history.length - 1, currentFrameId: nextFrames.some(frame => frame.id === previous.currentFrameId) ? previous.currentFrameId : nextFrames[0].id };
  }), [update]);
  const saveCanvasSnapshot = useCallback((canvas: HTMLCanvasElement) => {
    const bitmap = canvas.toDataURL('image/png');
    const previous = latest.current;
    const frames = previous.history[previous.historyIndex].frames;
    const id = frames.find(frame => frame.id === previous.currentFrameId)?.id ?? frames[0].id;
    saveFrames(frames => frames.map(frame => frame.id === id ? { ...frame, bitmap, preview: bitmap, objects: [] } : frame));
  }, [saveFrames]);
  const discardBlockedFrame = useCallback(() => update(previous => {
    const frames = previous.history[previous.historyIndex].frames;
    const clean = frames.length <= 1 ? [createFrame(createBlankFrame())] : frames.filter(frame => frame.id !== previous.currentFrameId);
    return { history: [{ frames: clean }], historyIndex: 0, currentFrameId: clean[0].id };
  }), [update]);
  const getFrames = useCallback(() => latest.current.history[latest.current.historyIndex].frames, []);
  return { ...state, frames, currentFrame, setCurrentFrame, setHistoryIndex, saveFrames, saveCanvasSnapshot, discardBlockedFrame, getFrames };
}
