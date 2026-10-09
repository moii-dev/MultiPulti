import { cloneProject, createNewProject, isBitmap, migrateLegacy, validateProject, validateProjectTitle } from '../domain/project';
import type { Project, ProjectSummary } from '../types/editor';
export const LEGACY_KEY = 'multipulti_state';
const PREFERENCES_KEY = 'multipulti_preferences';
export interface Preferences { recentColors: string[]; favoriteColors: string[]; fps?: number; currentFrameId?: string; }
export function readPreferences(storage?: Storage): Preferences {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(PREFERENCES_KEY) || '{}');
    return { recentColors: colors(value?.recentColors), favoriteColors: colors(value?.favoriteColors), fps: typeof value?.fps === 'number' && value.fps > 0 ? value.fps : undefined,
      currentFrameId: typeof value?.currentFrameId === 'string' ? value.currentFrameId : undefined };
  } catch { return { recentColors: [], favoriteColors: [] }; }
}
const colors = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 100) : [];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
export function savePreferences(value: Preferences, storage: Storage = localStorage) {
  storage.setItem(PREFERENCES_KEY, JSON.stringify(value));
}
async function decodeBitmap(bitmap: string) {
  if (typeof Image === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Повреждённое изображение проекта'));
    image.src = bitmap;
  });
}
export function createProjectRepository(factory: () => IDBFactory = () => indexedDB, storage: () => Storage = () => localStorage, verifyBitmap = decodeBitmap) {
  async function verifyImages(project: Project) {
    const images = new Set(project.frames.flatMap(frame => [frame.bitmap, frame.preview, ...frame.objects.flatMap(object => object.kind === 'raster' ? [object.bitmap] : [])]));
    // Sequential decode bounds startup memory for large legacy projects.
    for (const bitmap of images) await verifyBitmap(bitmap);
    return project;
  }
  async function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = factory().open('multipulti', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB недоступен'));
      request.onblocked = () => { blocked = true; reject(new Error('IndexedDB заблокирован другой вкладкой')); };
    });
  }
  async function transaction(mode: IDBTransactionMode, action: (store: IDBObjectStore, fail: (error: unknown) => void) => IDBRequest): Promise<unknown> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', mode);
        let result: unknown;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Ошибка хранилища проекта'));
        const fail = (error: unknown) => { reject(error); tx.abort(); };
        try {
          const request = action(tx.objectStore('projects'), fail);
          request.addEventListener('success', () => { result = request.result; });
        } catch (error) {
          fail(error);
        }
      });
    } finally { db.close(); }
  }
  async function listProjects(): Promise<ProjectSummary[]> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const request = store.openCursor();
        const projectsMap = new Map<string, unknown>();
        let currentProject: Project | null = null;

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const key = String(cursor.key);
            const value = cursor.value;
            if (key === 'current') currentProject = value as Project;
            else projectsMap.set(key, value);
            cursor.continue();
          } else {
            if (currentProject) {
              const currentId = typeof currentProject.id === 'string' && currentProject.id ? currentProject.id : 'current';
              if (!projectsMap.has(currentId)) {
                projectsMap.set(currentId, {
                  ...currentProject,
                  id: currentId,
                  title: currentProject.title || 'Мой мультик',
                  createdAt: currentProject.createdAt || Date.now(),
                  updatedAt: currentProject.updatedAt || Date.now(),
                });
              }
            }

            const date = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 8.64e15 ? v : 0;
            const summaries: ProjectSummary[] = Array.from(projectsMap.entries()).map(([id, value]) => {
              const p = record(value) ? value : {};
              const title = typeof p.title === 'string' && p.title.trim() ? p.title : 'Мой мультик';
              let damaged = false;
              try { validateProject(value); if (id !== 'current' && p.id && p.id !== id) damaged = true; }
              catch { damaged = true; }
              const frameCount = Array.isArray(p.frames) ? p.frames.length : 0;
              const first = Array.isArray(p.frames) && record(p.frames[0]) ? p.frames[0] : {};
              const preview = isBitmap(first.preview) ? first.preview : '';
              const createdAt = date(p.createdAt);
              const updatedAt = date(p.updatedAt) || createdAt;
              return {
                id,
                title,
                version: 2,
                frameCount,
                preview,
                createdAt,
                updatedAt,
                damaged,
              };
            });

            summaries.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(summaries);
          }
        };
        request.onerror = tx.onerror = tx.onabort = () => reject(tx.error || new Error('Ошибка чтения проектов'));
      });
    } finally {
      db.close();
    }
  }
  async function loadProject(id?: string): Promise<Project | null> {
    if (id && id !== 'current') {
      const value = await transaction('readonly', store => store.get(id));
      if (value === undefined) return null;
      if (record(value) && value.id && value.id !== id) throw new Error('Идентификатор проекта не совпадает с записью хранилища');
      const project = validateProject(value);
      return verifyImages({ ...project, id });
    }
    const currentVal = await transaction('readonly', store => store.get('current'));
    if (currentVal !== undefined) {
      return verifyImages(validateProject(currentVal));
    }
    const summaries = await listProjects();
    if (summaries.length > 0) {
      return loadProject(summaries[0].id);
    }
    return null;
  }
  async function saveProject(project: Project) {
    validateProject(project);
    if (project.id === 'current') throw new Error('Ключ current зарезервирован для совместимости');
    // Freeze before opening the database; callers may keep editing meanwhile.
    const snapshot = structuredClone(project);
    await transaction('readwrite', (store, fail) => {
      const previous = store.get('current');
      previous.onsuccess = () => {
        const old = previous.result;
        if (!snapshot.id || old === undefined || (record(old) && old.id === snapshot.id)) return;
        const oldId = record(old) && typeof old.id === 'string' && old.id && old.id !== 'current' ? old.id : 'legacy-current';
        if (oldId === snapshot.id) return;
        const named = store.get(oldId);
        named.onsuccess = () => {
          try {
            // Preserve even an unreadable orphan before replacing the legacy slot.
            if (named.result === undefined) store.put(record(old) ? { ...old, id: oldId } : old, oldId);
            else if (!record(old) || !old.id) {
              const backupId = crypto.randomUUID();
              store.put(record(old) ? { ...old, id: backupId } : old, backupId);
            }
          } catch (error) { fail(error); }
        };
      };
      if (snapshot.id) {
        store.put(snapshot, snapshot.id);
      }
      return store.put(snapshot, 'current');
    });
  }
  async function createProject(title?: string): Promise<Project> {
    const cleanTitle = validateProjectTitle(title ?? 'Новый мультик');
    const newProject = createNewProject(cleanTitle);
    await saveProject(newProject);
    return newProject;
  }
  async function renameProject(id: string, newTitle: string): Promise<Project> {
    const cleanTitle = validateProjectTitle(newTitle);
    const existing = await loadProject(id);
    if (!existing) throw new Error('Проект не найден');
    const updated: Project = {
      ...existing,
      id: existing.id || id,
      title: cleanTitle,
      updatedAt: Date.now(),
    };
    await saveProject(updated);
    return updated;
  }
  async function duplicateProject(id: string): Promise<Project> {
    const original = await loadProject(id);
    if (!original) throw new Error('Исходный проект не найден');
    const allSummaries = await listProjects();
    const existingTitles = allSummaries.map(s => s.title);
    const cloned = cloneProject(original, existingTitles);
    await saveProject(cloned);
    return cloned;
  }
  async function deleteProject(id?: string) {
    await transaction('readwrite', store => {
      if (id && id !== 'current') {
        const getReq = store.get('current');
        getReq.onsuccess = () => {
          const currentVal = getReq.result as Project | undefined;
          if (currentVal && currentVal.id === id) {
            store.delete('current');
          }
        };
        return store.delete(id);
      }
      return store.delete('current');
    });
  }
  async function migrate(): Promise<Project | null> {
    const existing = await loadProject();
    if (existing) {
      // Promote the old single-project slot BEFORE any new project can replace it.
      const current = await transaction('readonly', store => store.get('current'));
      if (current !== undefined) {
        const old = validateProject(current);
        const id = old.id && old.id !== 'current' ? old.id : 'legacy-current';
        const named = await transaction('readonly', store => store.get(id));
        if (named === undefined) {
          const promoted = { ...old, id, title: typeof old.title === 'string' ? old.title : 'Мой мультик', createdAt: old.createdAt ?? Date.now(), updatedAt: old.updatedAt ?? Date.now() };
          await verifyImages(promoted);
          await saveProject(promoted);
          const verified = await loadProject(id);
          if (JSON.stringify(verified) !== JSON.stringify(promoted)) throw new Error('Не удалось проверить перенос старого проекта');
          return migrate();
        }
      }
      const local = storage();
      const raw = local.getItem(LEGACY_KEY);
        // A previous migration may have committed before localStorage cleanup failed.
        if (raw) {
          let legacy: Project;
          try { legacy = migrateLegacy(JSON.parse(raw)); }
          catch { return existing; } // Keep the unreadable source; the home screen reports it.
          if (legacy.frames.length === existing.frames.length && legacy.frames.every((frame, index) => frame.bitmap === existing.frames[index].bitmap && existing.frames[index].objects.length === 0)) {
            const value = JSON.parse(raw);
            savePreferences({ ...readPreferences(local), recentColors: colors(value.recentColors), favoriteColors: colors(value.favoriteColors) }, local);
            if (local.getItem(LEGACY_KEY) === raw) local.removeItem(LEGACY_KEY);
          } else if (!await loadProject('legacy-local')) {
            // A different old document must be imported alongside newer projects.
            return migrateSource(raw);
          }
        }
      return existing;
    }
    const local = storage();
    const raw = local.getItem(LEGACY_KEY);
    if (!raw) return null;
    return migrateSource(raw);
  }
  async function migrateSource(raw: string): Promise<Project | null> {
    const local = storage();
    const value = JSON.parse(raw);
    const now = Date.now();
    const project = { ...migrateLegacy(value), id: 'legacy-local', title: 'Мой мультик', createdAt: now, updatedAt: now };
    await verifyImages(project);
    await saveProject(project);
    const verified = await loadProject(project.id);
    if (JSON.stringify(verified) !== JSON.stringify(project)) throw new Error('Не удалось проверить миграцию');
    savePreferences({ ...readPreferences(local), recentColors: colors(value.recentColors), favoriteColors: colors(value.favoriteColors) }, local);
    if (local.getItem(LEGACY_KEY) === raw) local.removeItem(LEGACY_KEY);
    return verified;
  }
  // StrictMode can invoke startup twice. Share only the in-flight migration;
  // rejected migrations must remain retryable.
  let migration: Promise<Project | null> | undefined;
  function migrateLegacyProject() {
    migration ??= migrate().finally(() => { migration = undefined; });
    return migration;
  }
  return { loadProject, saveProject, deleteProject, migrateLegacyProject, listProjects, createProject, renameProject, duplicateProject };
}
export const projectRepository = createProjectRepository();
