import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createNewProject, copyFrame } from '../src/domain/project';
import { createProjectSaveSession } from '../src/domain/projectSaveSession';
import { createProjectRepository } from '../src/services/projectRepository';
import { commitFrames, undo, redo } from '../src/domain/history';

function setup() {
  const factory = new IDBFactory();
  return createProjectRepository(() => factory, undefined, async () => {});
}
test('create, edit, immediate exit flush, reopen: frames, settings, date and preview persist', async () => {
  const repo = setup();
  const initial = await repo.createProject('Мультик А');
  const session = createProjectSaveSession(initial, repo.saveProject);
  const frame = { ...initial.frames[0], objects: [{ kind: 'sticker' as const, id: 'star', x: 10, y: 10, size: 30, emoji: '⭐' }], preview: 'data:image/png;base64,YQ==' };
  const edited = { ...initial, fps: 12, frames: [frame, copyFrame(frame), copyFrame(frame)] };
  await session.flush(edited);
  const loaded = await repo.loadProject(initial.id);
  assert.deepEqual(loaded?.frames, edited.frames);
  assert.equal(loaded?.fps, 12);
  assert.ok(loaded!.updatedAt! >= initial.updatedAt!);
  assert.equal((await repo.listProjects())[0].preview, frame.preview);
});
test('opening unchanged project causes no write or updatedAt change', async () => {
  const p = createNewProject(); let writes = 0;
  const session = createProjectSaveSession(p, async () => { writes++; });
  await session.flush(p); assert.equal(writes, 0); assert.equal(session.dirty(p), false);
});
test('two projects and fresh undo histories are isolated after switching', async () => {
  const repo = setup();
  const a = await repo.createProject('А'); const b = await repo.createProject('Б');
  const changed = { ...a, frames: [a.frames[0], copyFrame(a.frames[0]), copyFrame(a.frames[0])] };
  await createProjectSaveSession(a, repo.saveProject).flush(changed);
  const loadedB = (await repo.loadProject(b.id))!;
  assert.equal(loadedB.frames.length, 1); assert.equal(loadedB.frames[0].objects.length, 0);
  const historyB = { entries: [{ frames: loadedB.frames }], index: 0 };
  assert.equal(commitFrames(historyB, loadedB.frames).index, 0);
  assert.equal(undo(historyB), historyB);
  const editedB = commitFrames(historyB, [loadedB.frames[0], copyFrame(loadedB.frames[0])]);
  assert.deepEqual(undo(editedB).entries[undo(editedB).index].frames, loadedB.frames);
  assert.equal(redo(undo(editedB)).entries[1].frames.length, 2);
  assert.equal((await repo.loadProject(a.id))?.frames.length, 3);
});
test('queued save revisions and another project retain their own snapshots', async () => {
  const a = createNewProject('А'); const b = createNewProject('Б');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: number[] = [];
  const session = createProjectSaveSession(a, async p => { if (!writes.length) await gate; writes.push(p.frames.length); });
  const first = session.flush({ ...a, frames: [...a.frames, copyFrame(a.frames[0])] });
  const second = session.flush({ ...a, frames: [...a.frames, copyFrame(a.frames[0]), copyFrame(a.frames[0])] });
  assert.equal(createProjectSaveSession(b, async () => {}).dirty(b), false);
  release(); await Promise.all([first, second]); assert.deepEqual(writes, [2, 3]);
});
test('failed save leaves dirty document available and retry succeeds', async () => {
  const p = createNewProject(); const changed = { ...p, fps: 15 }; let fail = true;
  const session = createProjectSaveSession(p, async () => { if (fail) throw Error('quota'); });
  await assert.rejects(session.flush(changed)); assert.equal(session.dirty(changed), true);
  assert.equal(changed.fps, 15); fail = false; await session.flush(changed); assert.equal(session.dirty(changed), false);
});
test('missing project returns null', async () => { assert.equal(await setup().loadProject('missing'), null); });

test('undo to baseline during an unfinished save must still be persisted', async () => {
  const initial = createNewProject();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: (number | undefined)[] = [];
  const session = createProjectSaveSession(initial, async p => { await gate; writes.push(p.fps); });
  const saving = session.flush({ ...initial, fps: 15 });
  assert.equal(session.dirty(initial), true);
  const reverting = session.flush(initial);
  release(); await Promise.all([saving, reverting]);
  assert.deepEqual(writes, [15, undefined]);
  assert.equal(session.dirty(initial), false);
});
