import { useEffect, useRef, useState } from 'react';
import { projectRepository, savePreferences } from '../services/projectRepository';
import type { FrameHistoryEntry, Project } from '../types/editor';

/** Serial writes prevent an older transaction from winning over a newer revision. */
export function createSaveQueue(save: (project: Project) => Promise<void>) {
  let tail = Promise.resolve();
  return (project: Project) => {
    const result = tail.catch(() => {}).then(() => save(project));
    tail = result;
    return result;
  };
}
const enqueueSave = createSaveQueue(projectRepository.saveProject);
export function useProjectPersistence(
  history: FrameHistoryEntry[], historyIndex: number, currentFrame: number,
  favoriteColors: string[], recentColors: string[], fps: number,
  enabled: boolean, isPlaying: boolean,
) {
  const [error, setError] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selection = useRef(currentFrame);
  if (!isPlaying) selection.current = currentFrame;
  const frames = history[historyIndex].frames;
  const currentFrameId = frames[currentFrame].id;
  // Palette and playback ticks never serialize or write the heavy document.
  useEffect(() => {
    if (!enabled || isPlaying) return;
    try { savePreferences({ favoriteColors, recentColors, fps, currentFrameId }); setPreferenceError(null); }
    catch { setPreferenceError('Не удалось сохранить настройки браузера'); }
  }, [enabled, isPlaying, currentFrameId, favoriteColors, recentColors, fps]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      const selected = frames[Math.min(selection.current, frames.length - 1)];
      enqueueSave({ version: 2, frames, currentFrameId: selected.id })
        .then(() => { if (mounted.current) setError(null); })
        .catch(() => { if (mounted.current) setError('Не удалось сохранить проект. Проверьте доступность и свободное место хранилища.'); });
    }, 600);
    return () => { window.clearTimeout(timer); };
  }, [enabled, frames]);
  return error || preferenceError;
}
