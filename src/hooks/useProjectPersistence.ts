import { useEffect, useRef, useState } from 'react';
import { projectRepository, savePreferences } from '../services/projectRepository';
import { createProjectSaveSession } from '../domain/projectSaveSession';
import type { Frame, FrameHistoryEntry, Project } from '../types/editor';

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
  enabled: boolean, isPlaying: boolean, initial: Project,
) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Сохранено');
  const [session] = useState(() => createProjectSaveSession({ ...initial, fps: initial.fps ?? fps }, enqueueSave));
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selection = useRef(currentFrame);
  if (!isPlaying) selection.current = currentFrame;
  const frames = history[historyIndex].frames;
  const latest = useRef(initial);
  latest.current = { ...initial, frames, fps, currentFrameId: frames[selection.current]?.id ?? frames[0].id };

  const flush = async (committed?: Frame[]) => {
    clearTimeout(timer.current);
    const snapshot = { ...latest.current };
    if (committed) {
      snapshot.frames = committed;
      if (!committed.some(f => f.id === snapshot.currentFrameId)) snapshot.currentFrameId = committed[0].id;
    }
    if (mounted.current && session.dirty(snapshot)) setStatus('Сохранение…');
    try {
      await session.flush(snapshot);
      if (mounted.current) { setError(null); setStatus(session.dirty(latest.current) ? 'Сохранение…' : 'Сохранено'); }
    } catch {
      const message = 'Ошибка сохранения. Данные остаются в редакторе. Нажмите «Мультики», чтобы повторить попытку, или продолжайте редактирование.';
      if (mounted.current) { setError(message); setStatus('Ошибка сохранения'); }
      throw new Error(message);
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (session.dirty(latest.current)) { event.preventDefault(); event.returnValue = ''; }
    };
    const visibility = () => { if (document.visibilityState === 'hidden' && enabled) void flushRef.current().catch(() => {}); };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [session, enabled]);
  useEffect(() => {
    if (!enabled) return;
    try { savePreferences({ favoriteColors, recentColors }); }
    catch { setError('Не удалось сохранить настройки браузера'); }
  }, [enabled, favoriteColors, recentColors]);
  useEffect(() => {
    if (!enabled || !session.dirty(latest.current)) return;
    setStatus('Сохранение…');
    timer.current = setTimeout(() => { void flushRef.current().catch(() => {}); }, 600);
    return () => clearTimeout(timer.current);
  }, [enabled, frames, fps, isPlaying, currentFrame, session]);
  return { error, status, flush };
}
