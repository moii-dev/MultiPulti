import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { copyFrame, createFrame, deleteFrame, migrateLegacy, reorderFrame, upsertObject, validateProject } from '../src/domain/project';
import { createProjectRepository, LEGACY_KEY, readPreferences } from '../src/services/projectRepository';
import { createSaveQueue } from '../src/hooks/useProjectPersistence';
import { drawObjects, hitObject } from '../src/canvas/frameRenderer';
import type { TextObject, Project } from '../src/types/editor';
const bitmap = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=';
const text: TextObject = { kind: 'text', id: 'text-A', x: 100, y: 100, size: 40, w: 100, h: 40, text: 'Кадр A', font: 'Nunito', color: '#000000' };
function project(): Project {
  const frame = createFrame(bitmap);
  frame.objects = [structuredClone(text), { kind: 'sticker', id: 'sticker-A', x: 200, y: 100, size: 60, emoji: '⭐' }];
  return { version: 2, frames: [frame, createFrame(bitmap)], currentFrameId: frame.id };
}
class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
function setup() {
  const local = new MemoryStorage();
  const factory = new IDBFactory();
  return { local, factory, repo: createProjectRepository(() => factory, () => local) };
}
const legacy = () => ({ history: [{ frames: [bitmap, bitmap] }, { frames: [bitmap] }], historyIndex: 0, currentFrame: 1, recentColors: ['#123456'], favoriteColors: ['#abcdef'] });

test('Frame JSON round trip retains stable IDs, text, sticker and raster layers', () => {
  const value = project();
  value.frames[0].objects.push({ kind: 'raster', id: 'paint', bitmap });
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(value))), value);
});
test('objects of different frames are isolated', () => {
  const value = project();
  value.frames[1].objects = [ { ...text, id: 'text-B', text: 'Кадр B' } ];
  value.frames[0].objects = upsertObject(value.frames[0].objects, { ...text, text: 'Изменение A' });
  assert.equal((value.frames[1].objects[0] as TextObject).text, 'Кадр B');
});
test('copy frame deeply clones objects and generates new identities', () => {
  const original = project().frames[0];
  const copy = copyFrame(original);
  assert.notEqual(copy.id, original.id);
  assert.notEqual(copy.objects, original.objects);
  assert.notEqual(copy.objects[0].id, original.objects[0].id);
  (copy.objects[0] as TextObject).text = 'Copy';
  assert.equal((original.objects[0] as TextObject).text, 'Кадр A');
});
test('delete frame deletes its objects, preserves neighbors, guards last frame', () => {
  const value = project();
  assert.deepEqual(deleteFrame(value.frames, value.frames[0].id), [value.frames[1]]);
  assert.deepEqual(deleteFrame([value.frames[0]], value.frames[0].id), [value.frames[0]]);
});
test('reorder moves the whole frame by identity', () => {
  const value = project();
  const result = reorderFrame(value.frames, value.frames[0].id, 1);
  assert.equal(result[1], value.frames[0]);
  assert.deepEqual(result[1].objects, value.frames[0].objects);
  assert.equal(value.frames[0].id, value.currentFrameId);
});
test('editing an object retains paint order', () => {
  const objects = [text, { kind: 'raster' as const, id: 'paint', bitmap }];
  assert.equal(upsertObject(objects, { ...text, text: 'Edit' })[1].id, 'paint');
});
test('save/load/delete use IndexedDB and structured copies', async () => {
  const { repo, local } = setup();
  assert.equal(await repo.loadProject(), null);
  const value = project();
  await repo.saveProject(value);
  (value.frames[0].objects[0] as TextObject).text = 'Unsaved';
  const loaded = await repo.loadProject();
  assert.equal((loaded!.frames[0].objects[0] as TextObject).text, 'Кадр A');
  assert.equal(local.length, 0);
  await repo.deleteProject();
  assert.equal(await repo.loadProject(), null);
});
test('legacy migration keeps every selected snapshot frame and preferences; removes source only after verification', async () => {
  const { repo, local } = setup();
  const raw = JSON.stringify(legacy());
  local.setItem(LEGACY_KEY, raw);
  const migrated = await repo.migrateLegacyProject();
  assert.equal(migrated!.frames.length, 2);
  assert.equal(migrated!.currentFrameId, migrated!.frames[1].id);
  assert.deepEqual(migrated!.frames[0].objects, []);
  assert.equal(local.getItem(LEGACY_KEY), null);
  assert.deepEqual(readPreferences(local).favoriteColors, ['#abcdef']);
  assert.deepEqual(await repo.migrateLegacyProject(), migrated);
});
test('legacy indices clamp without filtering or renumbering history', () => {
  assert.equal(migrateLegacy({ ...legacy(), historyIndex: 900, currentFrame: -10 }).frames.length, 1);
});
test('corrupted legacy remains untouched and no project is written', async () => {
  for (const raw of ['{', 'null', JSON.stringify({ history: [] }), JSON.stringify({ history: [{ frames: [bitmap, null] }] }), JSON.stringify({ history: [{ frames: ['not an image'] }] })]) {
    const { local, repo } = setup(); local.setItem(LEGACY_KEY, raw);
    await assert.rejects(repo.migrateLegacyProject());
    assert.equal(local.getItem(LEGACY_KEY), raw);
    assert.equal(await repo.loadProject(), null);
  }
});
test('unknown schema and duplicate IDs are rejected', () => {
  const value = project();
  assert.throws(() => validateProject({ ...value, version: 99 }));
  assert.throws(() => validateProject({ ...value, frames: [value.frames[0], value.frames[0]] }));
  assert.throws(() => validateProject({ ...value, currentFrameId: 'missing' }));
});
test('corrupted IndexedDB data is reported and not replaced', async () => {
  const { factory, repo } = setup();
  await repo.saveProject(project());
  await new Promise<void>((resolve, reject) => {
    const open = factory.open('multipulti', 1);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ version: 100 }, 'current');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  });
  await assert.rejects(repo.loadProject(), /версия/);
  await assert.rejects(repo.migrateLegacyProject());
});
test('IndexedDB unavailable does not consume legacy source', async () => {
  const local = new MemoryStorage(); local.setItem(LEGACY_KEY, JSON.stringify(legacy()));
  const repo = createProjectRepository(() => { throw new Error('IndexedDB unavailable'); }, () => local);
  await assert.rejects(repo.migrateLegacyProject(), /unavailable/);
  assert.ok(local.getItem(LEGACY_KEY));
});
test('quota error rolls back save and preserves both previous project and legacy', async () => {
  const { repo, local } = setup(); const original = project();
  await repo.saveProject(original);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  try { await assert.rejects(repo.saveProject(project()), { name: 'QuotaExceededError' }); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await repo.loadProject(), original);
  const failed = setup(); failed.local.setItem(LEGACY_KEY, JSON.stringify(legacy()));
  IDBObjectStore.prototype.put = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  try { await assert.rejects(failed.repo.migrateLegacyProject()); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.ok(failed.local.getItem(LEGACY_KEY));
  assert.equal(await failed.repo.loadProject(), null);
});
test('image decode failure leaves legacy intact', async () => {
  const { local, factory } = setup(); local.setItem(LEGACY_KEY, JSON.stringify(legacy()));
  const repo = createProjectRepository(() => factory, () => local, async () => { throw new Error('decode'); });
  await assert.rejects(repo.migrateLegacyProject(), /decode/);
  assert.ok(local.getItem(LEGACY_KEY));
});
test('verification failure after transaction keeps legacy source', async () => {
  const { local, factory } = setup(); local.setItem(LEGACY_KEY, JSON.stringify(legacy()));
  let calls = 0;
  const repo = createProjectRepository(() => factory, () => local, async () => { if (++calls > 1) throw new Error('verification'); });
  await assert.rejects(repo.migrateLegacyProject(), /verification/);
  assert.ok(local.getItem(LEGACY_KEY));
});
test('preferences failure after migration preserves source and recovers next launch', async () => {
  const { local, repo } = setup(); local.setItem(LEGACY_KEY, JSON.stringify(legacy()));
  const originalSet = local.setItem;
  local.setItem = () => { throw new Error('denied'); };
  await assert.rejects(repo.migrateLegacyProject(), /denied/);
  assert.ok(local.getItem(LEGACY_KEY));
  local.setItem = originalSet;
  assert.ok(await repo.migrateLegacyProject());
  assert.equal(local.getItem(LEGACY_KEY), null);
});
test('valid IndexedDB project takes priority over corrupted legacy', async () => {
  const { local, repo } = setup(); const value = project(); await repo.saveProject(value);
  local.setItem(LEGACY_KEY, '{');
  assert.deepEqual(await repo.migrateLegacyProject(), value);
  assert.equal(local.getItem(LEGACY_KEY), '{');
});
test('save queue orders writes and continues after failure', async () => {
  const order: string[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = project(), second = project();
  const save = createSaveQueue(async value => {
    order.push(value.currentFrameId);
    if (value === first) { await gate; throw new Error('failed write'); }
  });
  const failed = save(first).catch(error => error);
  const next = save(second);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(order, [first.currentFrameId]); release();
  assert.ok(await failed instanceof Error); await next;
  assert.deepEqual(order, [first.currentFrameId, second.currentFrameId]);
});
test('text/sticker share renderer; semantic hit test chooses top object', () => {
  const operations: string[] = [];
  const ctx = { save() {}, restore() {}, fillText(value: string) { operations.push(value); }, measureText() { return { width: 100 }; } } as unknown as CanvasRenderingContext2D;
  const value = project(); drawObjects(ctx, value.frames[0].objects);
  assert.deepEqual(operations, ['Кадр A', '⭐']);
  assert.equal(hitObject(ctx, value.frames[0], 100, 100)?.id, text.id);
  assert.equal(hitObject(ctx, value.frames[1], 100, 100), undefined);
});

test('transaction abort is reported and old document survives', async () => {
  const { repo } = setup(); const original = project(); await repo.saveProject(original);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = put.apply(this, args);
    this.transaction.abort();
    return request;
  };
  try { await assert.rejects(repo.saveProject(project())); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await repo.loadProject(), original);
});
test('sparse objects and legacy frames are rejected', () => {
  const value = project(); value.frames[0].objects = new Array(1);
  assert.throws(() => validateProject(value));
  assert.throws(() => migrateLegacy({ history: [{ frames: new Array(1) }] }));
});
