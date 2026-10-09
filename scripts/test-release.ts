import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createNewProject, generateCopyTitle, validateProjectTitle } from '../src/domain/project';
import { createProjectRepository, LEGACY_KEY } from '../src/services/projectRepository';
import { createProjectSaveSession } from '../src/domain/projectSaveSession';

function setup() {
  const factory = new IDBFactory();
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; }, clear: () => values.clear(), key: i => [...values.keys()][i] ?? null,
    getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); },
  };
  const repo = createProjectRepository(() => factory, () => storage, async () => {});
  async function put(key: string, value: unknown) {
    await repo.listProjects();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('multipulti', 1);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }
  return { repo, put, storage, factory };
}

test('release: single current slot survives startup, new project, delete and fresh repository', async () => {
  const { repo, factory, put, storage } = setup();
  const original = createNewProject('Старый'); delete original.id;
  await put('current', original);
  const migrated = (await repo.migrateLegacyProject())!;
  const created = await repo.createProject('Новый');
  assert.equal((await repo.listProjects()).length, 2);
  await repo.deleteProject(created.id);
  const reopened = createProjectRepository(() => factory, () => storage, async () => {});
  assert.deepEqual((await reopened.loadProject(migrated.id))?.frames, original.frames);
  assert.equal((await reopened.listProjects()).length, 1);
});

test('release: concurrent startup migration produces exactly one verified project', async () => {
  const { repo, storage } = setup();
  const frame = createNewProject().frames[0];
  storage.setItem(LEGACY_KEY, JSON.stringify({ history: [{ frames: [frame.bitmap] }] }));
  const [a, b] = await Promise.all([repo.migrateLegacyProject(), repo.migrateLegacyProject()]);
  assert.deepEqual(a, b);
  assert.equal((await repo.listProjects()).length, 1);
  assert.equal(storage.getItem(LEGACY_KEY), null);
});

test('release: migration imports a different legacy document alongside an existing project', async () => {
  const { repo, storage } = setup();
  const existing = await repo.createProject('Новый');
  storage.setItem(LEGACY_KEY, JSON.stringify({ history: [{ frames: [existing.frames[0].bitmap, existing.frames[0].bitmap] }] }));
  await repo.migrateLegacyProject(); await repo.migrateLegacyProject();
  assert.equal((await repo.listProjects()).length, 2);
  assert.deepEqual(await repo.loadProject(existing.id), existing);
  assert.equal((await repo.loadProject('legacy-local'))?.frames.length, 2);
  assert.equal(storage.getItem(LEGACY_KEY), null);
});

test('release: changed legacy source is retained even when the captured migration succeeds', async () => {
  const { factory, storage } = setup();
  const bitmap = createNewProject().frames[0].bitmap;
  const raw = JSON.stringify({ history: [{ frames: [bitmap] }] });
  const changed = JSON.stringify({ history: [{ frames: [bitmap, bitmap] }] });
  storage.setItem(LEGACY_KEY, raw);
  let reads = 0;
  const repo = createProjectRepository(() => factory, () => storage, async () => { if (++reads === 2) storage.setItem(LEGACY_KEY, changed); });
  await repo.migrateLegacyProject();
  assert.equal(storage.getItem(LEGACY_KEY), changed);
  assert.equal((await repo.loadProject('legacy-local'))?.frames.length, 1);
});

test('release: an unreadable orphan is preserved when another project is created', async () => {
  const { repo, put } = setup();
  await put('current', { version: 99, frames: ['recoverable source'], title: 'Старые данные' });
  await assert.rejects(repo.migrateLegacyProject());
  await repo.createProject('Здоровый');
  const summaries = await repo.listProjects();
  assert.equal(summaries.length, 2);
  assert.equal(summaries.find(p => p.id === 'legacy-current')?.damaged, true);
  await assert.rejects(repo.loadProject('legacy-current'));
});

test('release: a failure while preserving the old current slot aborts the entire new save', async () => {
  const { repo } = setup(); const old = createNewProject('Старый'); delete old.id;
  await repo.saveProject(old);
  const put = IDBObjectStore.prototype.put; let calls = 0;
  IDBObjectStore.prototype.put = function (...args) { if (++calls === 3) throw new DOMException('quota', 'QuotaExceededError'); return put.apply(this, args); };
  try { await assert.rejects(repo.createProject('Новый'), { name: 'QuotaExceededError' }); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await repo.loadProject(), old);
  assert.equal((await repo.listProjects()).length, 1);
});

test('release: malformed record, metadata and foreign ID cannot break healthy cards or cross project boundaries', async () => {
  const { repo, put } = setup();
  const healthy = await repo.createProject('Здоровый');
  await put('damaged', { version: 2, title: {}, frames: null, updatedAt: 1e100 });
  await put('null-record', null);
  await put('foreign', { ...healthy, title: 25, updatedAt: Infinity });
  await put('bad-title', { ...healthy, id: 'bad-title', title: {} });
  const summaries = await repo.listProjects();
  assert.equal(summaries.length, 5);
  assert.ok(summaries.every(s => typeof s.title === 'string' && Number.isFinite(new Date(s.updatedAt).getTime())));
  assert.equal(summaries.find(s => s.id === 'damaged')?.damaged, true);
  await assert.rejects(repo.loadProject('foreign'), /Идентификатор/);
  await assert.rejects(repo.loadProject('bad-title'), /метаданные/);
  assert.deepEqual(await repo.loadProject(healthy.id), healthy);
});

test('release: copy title fits limit including numbered suffix', () => {
  const title = 'Д'.repeat(50);
  const first = generateCopyTitle(title);
  const second = generateCopyTitle(title, [first]);
  assert.equal(validateProjectTitle(first), first);
  assert.equal(validateProjectTitle(second), second);
  assert.notEqual(first, second);
});

test('release: repository snapshots at invocation before asynchronous database open', async () => {
  const { repo } = setup(); const project = await repo.createProject('А');
  project.fps = 12;
  const saving = repo.saveProject(project);
  project.fps = 2;
  await saving;
  assert.equal((await repo.loadProject(project.id))?.fps, 12);
});

test('release: save session rejects foreign project and retains retryable changes', async () => {
  const initial = createNewProject('А'); let writes = 0;
  const session = createProjectSaveSession(initial, async () => { writes++; });
  await assert.rejects(session.flush(createNewProject('Б')), /другой проект/);
  assert.equal(writes, 0);
  await session.flush({ ...initial, fps: 12 });
  assert.equal(writes, 1);
});

for (const count of [1, 10, 50]) test(`release: ${count} independent projects with 100 frames retain counts and sorting`, async () => {
  const { repo } = setup();
  for (let n = 0; n < count; n++) {
    const project = createNewProject(`Мультик ${n}`);
    project.frames = Array.from({ length: 100 }, () => createNewProject().frames[0]);
    project.currentFrameId = project.frames[99].id;
    project.updatedAt = n + 1;
    await repo.saveProject(project);
  }
  const summaries = await repo.listProjects();
  assert.equal(summaries.length, count);
  assert.ok(summaries.every(p => p.frameCount === 100));
  assert.equal(summaries[0].title, `Мультик ${count - 1}`);
  assert.equal((await repo.loadProject(summaries[0].id))?.frames.length, 100);
});
