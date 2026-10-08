import type { ActiveSelection, ActiveSticker, ActiveText, CanvasObject, Frame, StickerObject, TextObject } from '../types/editor';
import { createId, upsertObject } from './project';

export function hasSelectionChanged(selection: ActiveSelection): boolean {
  if (selection.hasChanged) return true;
  return (
    (selection.initialX !== undefined && selection.x !== selection.initialX) ||
    (selection.initialY !== undefined && selection.y !== selection.initialY) ||
    (selection.initialWidth !== undefined && selection.width !== selection.initialWidth) ||
    (selection.initialHeight !== undefined && selection.height !== selection.initialHeight)
  );
}

export function hasTextChanged(activeText: ActiveText): boolean {
  if (activeText.isNew) {
    return activeText.text.trim().length > 0;
  }
  if (activeText.text.trim().length === 0) return true; // Deletion
  return (
    activeText.text !== (activeText.initialText ?? '') ||
    activeText.x !== (activeText.initialX ?? activeText.x) ||
    activeText.y !== (activeText.initialY ?? activeText.y) ||
    activeText.size !== (activeText.initialSize ?? activeText.size) ||
    activeText.font !== (activeText.initialFont ?? activeText.font) ||
    activeText.color !== (activeText.initialColor ?? activeText.color)
  );
}

export function hasStickerChanged(activeSticker: ActiveSticker): boolean {
  if (activeSticker.isNew) return true;
  return (
    activeSticker.x !== (activeSticker.initialX ?? activeSticker.x) ||
    activeSticker.y !== (activeSticker.initialY ?? activeSticker.y) ||
    activeSticker.size !== (activeSticker.initialSize ?? activeSticker.size) ||
    activeSticker.emoji !== (activeSticker.initialEmoji ?? activeSticker.emoji)
  );
}

export function commitTextToFrame(
  frame: Frame,
  activeText: ActiveText,
  measuredWidth?: number
): Frame {
  const trimmed = activeText.text.trim();
  let objects = frame.objects;
  if (!trimmed) {
    if (activeText.id) {
      objects = objects.filter(obj => obj.id !== activeText.id);
    }
  } else {
    const textObject: TextObject = {
      kind: 'text',
      id: activeText.id ?? createId(),
      text: activeText.text,
      x: activeText.x,
      y: activeText.y,
      size: activeText.size,
      w: measuredWidth ?? activeText.size * activeText.text.length * 0.6,
      h: activeText.size,
      font: activeText.font,
      color: activeText.color,
    };
    objects = upsertObject(objects, textObject);
  }
  return { ...frame, objects };
}

export function commitStickerToFrame(
  frame: Frame,
  activeSticker: ActiveSticker
): Frame {
  const stickerObject: StickerObject = {
    kind: 'sticker',
    id: activeSticker.id ?? createId(),
    emoji: activeSticker.emoji,
    x: activeSticker.x,
    y: activeSticker.y,
    size: activeSticker.size,
  };
  return { ...frame, objects: upsertObject(frame.objects, stickerObject) };
}

export interface PendingResolutionInput {
  selection?: ActiveSelection | null;
  text?: ActiveText | null;
  sticker?: ActiveSticker | null;
  textWidth?: number;
  renderSelectionBitmap?: (selection: ActiveSelection, baseBitmap: string) => string;
}

export interface PendingResolutionResult {
  frames: Frame[];
  hasCommitted: boolean;
}

/**
 * Pure resolver that commits any pending changes strictly to their owner frame,
 * guaranteeing frame isolation when switching frames or mutating the project.
 */
export function resolvePendingForFrameSwitch(
  frames: Frame[],
  pending: PendingResolutionInput
): PendingResolutionResult {
  let modifiedFrames = frames;
  let hasCommitted = false;

  // 1. Text resolution
  if (pending.text && pending.text.ownerFrameId) {
    const ownerId = pending.text.ownerFrameId;
    if (hasTextChanged(pending.text)) {
      modifiedFrames = modifiedFrames.map(frame => {
        if (frame.id !== ownerId) return frame;
        return commitTextToFrame(frame, pending.text!, pending.textWidth);
      });
      hasCommitted = true;
    }
  }

  // 2. Sticker resolution
  if (pending.sticker && pending.sticker.ownerFrameId) {
    const ownerId = pending.sticker.ownerFrameId;
    if (hasStickerChanged(pending.sticker)) {
      modifiedFrames = modifiedFrames.map(frame => {
        if (frame.id !== ownerId) return frame;
        return commitStickerToFrame(frame, pending.sticker!);
      });
      hasCommitted = true;
    }
  }

  // 3. Selection resolution
  if (pending.selection && pending.selection.ownerFrameId) {
    const ownerId = pending.selection.ownerFrameId;
    if (hasSelectionChanged(pending.selection) && pending.renderSelectionBitmap) {
      modifiedFrames = modifiedFrames.map(frame => {
        if (frame.id !== ownerId) return frame;
        const newBitmap = pending.renderSelectionBitmap!(pending.selection!, frame.bitmap);
        return { ...frame, bitmap: newBitmap, preview: newBitmap };
      });
      hasCommitted = true;
    }
  }

  return { frames: modifiedFrames, hasCommitted };
}

