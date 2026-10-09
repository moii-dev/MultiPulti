import type { CanvasObject, Frame, Project } from '../types/editor';
export const createId = () => crypto.randomUUID();
export function createFrame(bitmap: string): Frame {
  return { id: createId(), bitmap, preview: bitmap, objects: [] };
}
export function copyFrame(frame: Frame): Frame {
  const copy = structuredClone(frame);
  copy.id = createId();
  copy.objects = copy.objects.map(object => ({ ...object, id: createId() }));
  return copy;
}
export function upsertObject(objects: CanvasObject[], object: CanvasObject): CanvasObject[] {
  return objects.some(item => item.id === object.id)
    ? objects.map(item => item.id === object.id ? object : item)
    : [...objects, object];
}
export function deleteFrame(frames: Frame[], id: string): Frame[] {
  return frames.length > 1 ? frames.filter(frame => frame.id !== id) : frames;
}
export function reorderFrame(frames: Frame[], id: string, destination: number): Frame[] {
  const index = frames.findIndex(frame => frame.id === id);
  if (index < 0 || destination < 0 || destination >= frames.length) return frames;
  const result = [...frames];
  result.splice(destination, 0, ...result.splice(index, 1));
  return result;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
export const isBitmap = (value: unknown): value is string => typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
function isObject(value: unknown): value is CanvasObject {
  if (!record(value) || typeof value.id !== 'string' || !value.id) return false;
  if (value.kind === 'raster') return isBitmap(value.bitmap);
  if (!finite(value.x) || !finite(value.y) || !finite(value.size) || (value.size as number) <= 0) return false;
  if (value.kind === 'sticker') return typeof value.emoji === 'string';
  return value.kind === 'text' && [value.text, value.font, value.color].every(item => typeof item === 'string') && finite(value.w) && finite(value.h);
}
export function validateProject(value: unknown): Project {
  if (!record(value) || value.version !== 2 || !Array.isArray(value.frames) || !value.frames.length) throw new Error('Повреждённый проект или неизвестная версия схемы');
  const ids = new Set<string>();
  for (const frame of value.frames) {
    if (!record(frame) || typeof frame.id !== 'string' || !frame.id || ids.has(frame.id) || !isBitmap(frame.bitmap) || !isBitmap(frame.preview) || !Array.isArray(frame.objects) || !Array.from(frame.objects).every(isObject) || new Set(frame.objects.map(object => object.id)).size !== frame.objects.length) throw new Error('Повреждённые данные кадра');
    ids.add(frame.id);
  }
  if (typeof value.currentFrameId !== 'string' || !ids.has(value.currentFrameId)) throw new Error('Неизвестный текущий кадр');
  return value as unknown as Project;
}
export function migrateLegacy(value: unknown): Project {
  if (!record(value) || !Array.isArray(value.history) || !value.history.length) throw new Error('Повреждённое старое состояние');
  const clamp = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) ? Math.max(0, Math.min(v, max)) : 0;
  const entry = value.history[clamp(value.historyIndex, value.history.length - 1)];
  if (!record(entry) || !Array.isArray(entry.frames) || !entry.frames.length || !Array.from(entry.frames).every(isBitmap)) throw new Error('Повреждённые старые кадры');
  const frames = entry.frames.map(createFrame);
  return { version: 2, frames, currentFrameId: frames[clamp(value.currentFrame, frames.length - 1)].id };
}

export const DEFAULT_PROJECT_TITLE = 'Новый мультик';
export const MAX_PROJECT_TITLE_LENGTH = 50;
export const BLANK_FRAME_BITMAP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=';

export function validateProjectTitle(title: unknown): string {
  if (typeof title !== 'string') throw new Error('Название должно быть строкой');
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Название не может быть пустым');
  if (trimmed.length > MAX_PROJECT_TITLE_LENGTH) {
    throw new Error(`Название не может быть длиннее ${MAX_PROJECT_TITLE_LENGTH} символов`);
  }
  return trimmed;
}

export function generateCopyTitle(originalTitle: string, existingTitles: string[] = []): string {
  const base = (originalTitle || DEFAULT_PROJECT_TITLE).trim();
  const copyPattern = /^(.*?)(?:\s*—\s*копия(?:\s+(\d+))?)?$/;
  const match = base.match(copyPattern);
  const root = match && match[1] && match[1].trim() ? match[1].trim() : base;

  const existingSet = new Set(existingTitles.map(t => t.trim().toLowerCase()));

  const candidate1 = `${root} — копия`;
  if (!existingSet.has(candidate1.toLowerCase())) {
    return candidate1;
  }

  let counter = 2;
  while (true) {
    const candidateN = `${root} — копия ${counter}`;
    if (!existingSet.has(candidateN.toLowerCase())) {
      return candidateN;
    }
    counter++;
  }
}

export function cloneProject(original: Project, existingTitles: string[] = []): Project {
  const newId = createId();
  const newTitle = generateCopyTitle(original.title || DEFAULT_PROJECT_TITLE, existingTitles);
  const newFrames = original.frames.map(copyFrame);
  const originalIdx = Math.max(0, original.frames.findIndex(f => f.id === original.currentFrameId));
  const newCurrentFrameId = newFrames[originalIdx]?.id ?? newFrames[0]?.id ?? createId();
  const now = Date.now();

  return {
    id: newId,
    title: newTitle,
    version: 2,
    frames: newFrames,
    currentFrameId: newCurrentFrameId,
    createdAt: now,
    updatedAt: now,
  };
}

export function createNewProject(title?: string, initialBitmap: string = BLANK_FRAME_BITMAP): Project {
  const cleanTitle = validateProjectTitle(title ?? DEFAULT_PROJECT_TITLE);
  const frame = createFrame(initialBitmap);
  const now = Date.now();
  return {
    id: createId(),
    title: cleanTitle,
    version: 2,
    frames: [frame],
    currentFrameId: frame.id,
    createdAt: now,
    updatedAt: now,
  };
}
