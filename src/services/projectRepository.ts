import { cloneProject, createNewProject, migrateLegacy, validateProject, validateProjectTitle } from '../domain/project';
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
  async function transaction(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', mode);
        let result: unknown;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Ошибка хранилища проекта'));
        const request = action(tx.objectStore('projects'));
        request.onsuccess = () => { result = request.result; };
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
        const projectsMap = new Map<string, Project>();
        let currentProject: Project | null = null;

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const key = String(cursor.key);
            const value = cursor.value;
            if (record(value) && value.version === 2) {
              if (key === 'current') {
                currentProject = value as unknown as Project;
              } else {
                projectsMap.set(key, value as unknown as Project);
              }
            }
            cursor.continue();
          } else {
            if (currentProject) {
              const currentId = currentProject.id || 'current';
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

            const summaries: ProjectSummary[] = Array.from(projectsMap.values()).map(p => {
              const id = p.id || 'current';
              const title = p.title || 'Новый мультик';
              const frameCount = Array.isArray(p.frames) ? p.frames.length : 1;
              const preview = p.frames?.[0]?.preview || p.frames?.[0]?.bitmap || '';
              const createdAt = typeof p.createdAt === 'number' ? p.createdAt : Date.now();
              const updatedAt = typeof p.updatedAt === 'number' ? p.updatedAt : createdAt;
              return {
                id,
                title,
                version: 2,
                frameCount,
                preview,
                createdAt,
                updatedAt,
              };
            });

            summaries.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(summaries);
          }
        };
        request.onerror = tx.onerror = () => reject(tx.error || new Error('Ошибка чтения проектов'));
      });
    } finally {
      db.close();
    }
  }
  async function loadProject(id?: string): Promise<Project | null> {
    if (id && id !== 'current') {
      const value = await transaction('readonly', store => store.get(id));
      if (value === undefined) return null;
      return verifyImages(validateProject(value));
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
    await transaction('readwrite', store => {
      if (project.id) {
        store.put(project, project.id);
        store.put(project, 'current');
        return store.put(project, project.id);
      }
      return store.put(project, 'current');
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
  async function migrateLegacyProject(): Promise<Project | null> {
    const existing = await loadProject();
    if (existing) {
      try {
        const local = storage();
        const raw = local.getItem(LEGACY_KEY);
        // A previous migration may have committed before localStorage cleanup failed.
        if (raw) {
          const legacy = migrateLegacy(JSON.parse(raw));
          if (legacy.frames.length === existing.frames.length && legacy.frames.every((frame, index) => frame.bitmap === existing.frames[index].bitmap && existing.frames[index].objects.length === 0)) {
            const value = JSON.parse(raw);
            savePreferences({ ...readPreferences(local), recentColors: colors(value.recentColors), favoriteColors: colors(value.favoriteColors) }, local);
            local.removeItem(LEGACY_KEY);
          }
        }
      } catch { /* IndexedDB is authoritative; leave an unreadable legacy source untouched. */ }
      return existing;
    }
    const local = storage();
    const raw = local.getItem(LEGACY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    const project = migrateLegacy(value);
    await verifyImages(project);
    await saveProject(project);
    const verified = await loadProject();
    if (JSON.stringify(verified) !== JSON.stringify(project)) throw new Error('Не удалось проверить миграцию');
    savePreferences({ ...readPreferences(local), recentColors: colors(value.recentColors), favoriteColors: colors(value.favoriteColors) }, local);
    local.removeItem(LEGACY_KEY);
    return verified;
  }
  return { loadProject, saveProject, deleteProject, migrateLegacyProject, listProjects, createProject, renameProject, duplicateProject };
}
export const projectRepository = createProjectRepository();
