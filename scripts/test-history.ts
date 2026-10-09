import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory, commitFrames, undo, redo, canUndo, canRedo } from '../src/domain/history';
import { createFrame, copyFrame, deleteFrame, reorderFrame } from '../src/domain/project';
import {
  commitTextToFrame, hasSelectionChanged,
  hasTextChanged, resolvePendingForFrameSwitch
} from '../src/domain/transaction';
import type { ActiveSelection, ActiveSticker, ActiveText } from '../src/types/editor';

const bitmapBlank = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=';
const bitmapStrokeA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const bitmapStrokeB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const bitmapStrokeC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const bitmapObjAtX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGRAQoABy0B/q0iQpEAAAAASUVORK5CYII=';
const bitmapObjAtY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8//8/AwMDAwMjAxQAA6gB/2F0vP8AAAAASUVORK5CYII=';

test('DRAW: draw -> undo -> redo works as single logical undo steps', () => {
  const initialFrame = createFrame(bitmapBlank);
  let history = createHistory([initialFrame]);
  assert.equal(history.entries.length, 1);
  assert.equal(canUndo(history), false);
  assert.equal(canRedo(history), false);

  // Draw stroke
  const frameAfterDraw = { ...initialFrame, bitmap: bitmapStrokeA, preview: bitmapStrokeA };
  history = commitFrames(history, [frameAfterDraw]);
  assert.equal(history.entries.length, 2);
  assert.equal(history.index, 1);
  assert.equal(history.entries[1].frames[0].bitmap, bitmapStrokeA);
  assert.equal(canUndo(history), true);
  assert.equal(canRedo(history), false);

  // Undo draw
  history = undo(history);
  assert.equal(history.index, 0);
  assert.equal(history.entries[history.index].frames[0].bitmap, bitmapBlank);
  assert.equal(canUndo(history), false);
  assert.equal(canRedo(history), true);

  // Redo draw
  history = redo(history);
  assert.equal(history.index, 1);
  assert.equal(history.entries[history.index].frames[0].bitmap, bitmapStrokeA);
  assert.equal(canUndo(history), true);
  assert.equal(canRedo(history), false);
});

test('BRANCH: draw A -> draw B -> undo -> draw C -> redo B unavailable', () => {
  const initialFrame = createFrame(bitmapBlank);
  let history = createHistory([initialFrame]);

  // Draw A
  const frameA = { ...initialFrame, bitmap: bitmapStrokeA, preview: bitmapStrokeA };
  history = commitFrames(history, [frameA]);
  assert.equal(history.index, 1);

  // Draw B
  const frameB = { ...initialFrame, bitmap: bitmapStrokeB, preview: bitmapStrokeB };
  history = commitFrames(history, [frameB]);
  assert.equal(history.index, 2);
  assert.equal(history.entries.length, 3);

  // Undo (back to A)
  history = undo(history);
  assert.equal(history.index, 1);
  assert.equal(history.entries[history.index].frames[0].bitmap, bitmapStrokeA);
  assert.equal(canRedo(history), true);

  // Draw C
  const frameC = { ...initialFrame, bitmap: bitmapStrokeC, preview: bitmapStrokeC };
  history = commitFrames(history, [frameC]);

  // Redo B must now be completely unavailable
  assert.equal(history.index, 2);
  assert.equal(history.entries.length, 3);
  assert.equal(canRedo(history), false);

  const bitmapsInHistory = history.entries.map(e => e.frames[0].bitmap);
  assert.deepEqual(bitmapsInHistory, [bitmapBlank, bitmapStrokeA, bitmapStrokeC]);
  assert.ok(!bitmapsInHistory.includes(bitmapStrokeB), 'Redo branch B was pruned');
});

test('SELECTION: object at X -> move X to Y -> undo returns X -> redo returns Y (NO intermediate empty frame)', () => {
  const frameWithObjAtX = createFrame(bitmapObjAtX);
  let history = createHistory([frameWithObjAtX]);
  assert.equal(history.entries.length, 1);

  // Simulating selection begin:
  // Selection starts by lifting/identifying the object at (10, 10).
  const selection: ActiveSelection = {
    ownerFrameId: frameWithObjAtX.id,
    canvas: {} as HTMLCanvasElement,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    initialX: 10,
    initialY: 10,
    initialWidth: 20,
    initialHeight: 20,
    originalBitmap: bitmapObjAtX,
    hasChanged: false,
  };

  // Selection start MUST NOT create a history entry!
  assert.equal(hasSelectionChanged(selection), false);
  assert.equal(history.entries.length, 1, 'Selection start does not create history state');

  // Move selection from X (10, 10) to Y (50, 50)
  selection.x = 50;
  selection.y = 50;
  assert.equal(hasSelectionChanged(selection), true);

  // Commit the move
  const frameWithObjAtY = { ...frameWithObjAtX, bitmap: bitmapObjAtY, preview: bitmapObjAtY };
  history = commitFrames(history, [frameWithObjAtY]);

  // Check: Exactly TWO history states exist: original X and new Y.
  // There is NO intermediate state with an empty frame!
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[0].frames[0].bitmap, bitmapObjAtX, 'State 0 has object at X');
  assert.equal(history.entries[1].frames[0].bitmap, bitmapObjAtY, 'State 1 has object at Y');

  // Undo returns directly to X
  history = undo(history);
  assert.equal(history.index, 0);
  assert.equal(history.entries[history.index].frames[0].bitmap, bitmapObjAtX);

  // Redo moves directly to Y
  history = redo(history);
  assert.equal(history.index, 1);
  assert.equal(history.entries[history.index].frames[0].bitmap, bitmapObjAtY);
});

test('TEXT: create text -> edit text -> undo -> redo', () => {
  const initialFrame = createFrame(bitmapBlank);
  let history = createHistory([initialFrame]);

  // 1. Create text
  const activeTextNew: ActiveText = {
    id: 'text-1',
    ownerFrameId: initialFrame.id,
    text: 'Привет',
    x: 100,
    y: 100,
    size: 32,
    font: 'Nunito',
    color: '#000000',
    isEditing: true,
    isNew: true,
  };
  assert.equal(hasTextChanged(activeTextNew), true);

  const frameWithText = commitTextToFrame(initialFrame, activeTextNew, 120);
  history = commitFrames(history, [frameWithText]);
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[1].frames[0].objects.length, 1);
  assert.equal((history.entries[1].frames[0].objects[0] as any).text, 'Привет');

  // 2. Edit text
  const activeTextEdit: ActiveText = {
    id: 'text-1',
    ownerFrameId: initialFrame.id,
    text: 'Привет Мир',
    x: 100,
    y: 100,
    size: 32,
    font: 'Nunito',
    color: '#000000',
    isEditing: false,
    initialText: 'Привет',
    initialX: 100,
    initialY: 100,
    isNew: false,
  };
  assert.equal(hasTextChanged(activeTextEdit), true);

  const frameWithEditedText = commitTextToFrame(frameWithText, activeTextEdit, 180);
  history = commitFrames(history, [frameWithEditedText]);
  assert.equal(history.entries.length, 3);
  assert.equal((history.entries[2].frames[0].objects[0] as any).text, 'Привет Мир');

  // 3. Undo edit
  history = undo(history);
  assert.equal(history.index, 1);
  assert.equal((history.entries[history.index].frames[0].objects[0] as any).text, 'Привет');

  // 4. Undo creation
  history = undo(history);
  assert.equal(history.index, 0);
  assert.equal(history.entries[history.index].frames[0].objects.length, 0);

  // 5. Redo creation
  history = redo(history);
  assert.equal(history.index, 1);
  assert.equal((history.entries[history.index].frames[0].objects[0] as any).text, 'Привет');

  // 6. Redo edit
  history = redo(history);
  assert.equal(history.index, 2);
  assert.equal((history.entries[history.index].frames[0].objects[0] as any).text, 'Привет Мир');
});

test('FRAME ISOLATION: pending object on frame A -> switch frame B -> object not present in B', () => {
  const frameA = createFrame(bitmapBlank);
  const frameB = createFrame(bitmapBlank);
  const frames = [frameA, frameB];

  // User starts editing text on Frame A
  const pendingText: ActiveText = {
    id: 'text-isolated',
    ownerFrameId: frameA.id,
    text: 'Только на кадре A',
    x: 50,
    y: 50,
    size: 30,
    font: 'Nunito',
    color: '#0000FF',
    isEditing: true,
    isNew: true,
  };

  // User switches to Frame B: resolvePendingForFrameSwitch runs
  const result = resolvePendingForFrameSwitch(frames, { text: pendingText, textWidth: 150 });
  assert.equal(result.hasCommitted, true);

  const resolvedA = result.frames.find(f => f.id === frameA.id)!;
  const resolvedB = result.frames.find(f => f.id === frameB.id)!;

  // Frame A has the text object
  assert.equal(resolvedA.objects.length, 1);
  assert.equal((resolvedA.objects[0] as any).text, 'Только на кадре A');

  // Frame B is completely clean and isolated!
  assert.equal(resolvedB.objects.length, 0, 'Frame B must NOT receive objects from Frame A');
});

test('FRAME OPERATIONS: add -> copy -> reorder -> delete -> undo all -> redo all', () => {
  const f1 = createFrame(bitmapBlank);
  let history = createHistory([f1]);

  // Add frame
  const f2 = createFrame(bitmapBlank);
  let currentFrames = [f1, f2];
  history = commitFrames(history, currentFrames);
  assert.equal(history.index, 1);

  // Copy frame
  const f3 = copyFrame(f2);
  currentFrames = [f1, f2, f3];
  history = commitFrames(history, currentFrames);
  assert.equal(history.index, 2);

  // Reorder: move f3 to position 0
  currentFrames = reorderFrame(currentFrames, f3.id, 0);
  assert.equal(currentFrames[0].id, f3.id);
  history = commitFrames(history, currentFrames);
  assert.equal(history.index, 3);

  // Delete f1
  currentFrames = deleteFrame(currentFrames, f1.id);
  assert.equal(currentFrames.length, 2);
  history = commitFrames(history, currentFrames);
  assert.equal(history.index, 4);

  // Undo delete
  history = undo(history);
  assert.equal(history.entries[history.index].frames.length, 3);
  assert.equal(history.entries[history.index].frames[1].id, f1.id);

  // Undo reorder
  history = undo(history);
  assert.equal(history.entries[history.index].frames[0].id, f1.id);

  // Undo copy
  history = undo(history);
  assert.equal(history.entries[history.index].frames.length, 2);

  // Undo add
  history = undo(history);
  assert.equal(history.entries[history.index].frames.length, 1);
  assert.equal(canUndo(history), false);

  // Redo back to final deleted state
  history = redo(history); // add
  assert.equal(history.entries[history.index].frames.length, 2);
  history = redo(history); // copy
  assert.equal(history.entries[history.index].frames.length, 3);
  history = redo(history); // reorder
  assert.equal(history.entries[history.index].frames[0].id, f3.id);
  history = redo(history); // delete
  assert.equal(history.entries[history.index].frames.length, 2);
  assert.equal(canRedo(history), false);
});

test('PENDING: selection / text / sticker -> switch frame -> correct isolated results', () => {
  const frameA = createFrame(bitmapBlank);
  const frameB = createFrame(bitmapBlank);
  const frames = [frameA, frameB];

  // 1. Pending sticker on frame A
  const pendingSticker: ActiveSticker = {
    id: 'sticker-1',
    ownerFrameId: frameA.id,
    emoji: '🚀',
    x: 100,
    y: 100,
    size: 50,
    isNew: true,
  };
  const rSticker = resolvePendingForFrameSwitch(frames, { sticker: pendingSticker });
  assert.equal(rSticker.hasCommitted, true);
  assert.equal(rSticker.frames[0].objects.length, 1);
  assert.equal((rSticker.frames[0].objects[0] as any).emoji, '🚀');
  assert.equal(rSticker.frames[1].objects.length, 0);

  // 2. Pending selection on frame A
  const pendingSel: ActiveSelection = {
    ownerFrameId: frameA.id,
    canvas: {} as HTMLCanvasElement,
    x: 30,
    y: 40,
    width: 20,
    height: 20,
    initialX: 10,
    initialY: 10,
    initialWidth: 20,
    initialHeight: 20,
    originalBitmap: bitmapBlank,
    hasChanged: true,
  };
  const rSel = resolvePendingForFrameSwitch(frames, {
    selection: pendingSel,
    renderSelectionBitmap: () => bitmapStrokeA,
  });
  assert.equal(rSel.hasCommitted, true);
  assert.equal(rSel.frames[0].bitmap, bitmapStrokeA);
  assert.equal(rSel.frames[1].bitmap, bitmapBlank);

  // 3. Unchanged selection does not commit
  const unchangedSel: ActiveSelection = {
    ownerFrameId: frameA.id,
    canvas: {} as HTMLCanvasElement,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    initialX: 10,
    initialY: 10,
    initialWidth: 20,
    initialHeight: 20,
    originalBitmap: bitmapBlank,
    hasChanged: false,
  };
  const rUnchanged = resolvePendingForFrameSwitch(frames, { selection: unchangedSel });
  assert.equal(rUnchanged.hasCommitted, false);
});
