import { useEffect, useState } from 'react';
import { migrateLegacy } from '../domain/project';
import { LEGACY_KEY, projectRepository, readPreferences } from '../services/projectRepository';
import type { Project, StoredAppState } from '../types/editor';
let startup: Promise<Project | null> | undefined;
function editorState(project: Project | null): StoredAppState | null {
  if (!project) return null;
  const preferences = readPreferences();
  const selected = project.frames.findIndex(frame => frame.id === preferences.currentFrameId);
  return { history: [{ frames: project.frames }], historyIndex: 0,
    currentFrame: selected < 0 ? project.frames.findIndex(frame => frame.id === project.currentFrameId) : selected, ...preferences };
}
export function useProjectLoader() {
  const [result, setResult] = useState<{ ready: boolean; state: StoredAppState | null; error: string | null; writable: boolean }>({ ready: false, state: null, error: null, writable: false });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        startup ??= projectRepository.migrateLegacyProject();
        const loaded = await startup;
        if (active) setResult({ ready: true, state: editorState(loaded), error: null, writable: true });
      } catch (error) {
        // Keep the source intact and forbid blank autosave over a failed load.
        let fallback: Project | null = null;
        try {
          const raw = localStorage.getItem(LEGACY_KEY);
          if (raw) fallback = migrateLegacy(JSON.parse(raw));
        } catch { /* Source remains available for recovery. */ }
        if (active) setResult({ ready: true, state: editorState(fallback), writable: false,
          error: `Не удалось загрузить или перенести проект. Исходные данные сохранены; автосохранение отключено. ${error instanceof Error ? error.message : ''}` });
      }
    })();
    return () => { active = false; };
  }, []);
  return result;
}
