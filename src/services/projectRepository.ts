import { migrateLegacy, validateProject } from '../domain/project';
import type { Project } from '../types/editor';
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
  async function loadProject(): Promise<Project | null> {
    const value = await transaction('readonly', store => store.get('current'));
    return value === undefined ? null : verifyImages(validateProject(value));
  }
  async function saveProject(project: Project) {
    validateProject(project);
    await transaction('readwrite', store => store.put(project, 'current'));
  }
  async function deleteProject() { await transaction('readwrite', store => store.delete('current')); }
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
  return { loadProject, saveProject, deleteProject, migrateLegacyProject };
}
export const projectRepository = createProjectRepository();
