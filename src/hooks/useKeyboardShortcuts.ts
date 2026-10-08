import { useEffect, useRef } from "react";

interface KeyboardShortcuts {
  canRedo: boolean;
  canUndo: boolean;
  isPlaying?: boolean;
  onRedo: () => void;
  onUndo: () => void;
  onEscape?: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = shortcutsRef.current;

      if (event.key === "Escape") {
        current.onEscape?.();
        return;
      }

      if (isEditableTarget(event.target) || (!event.ctrlKey && !event.metaKey) || current.isPlaying) return;
      const key = event.key.toLowerCase();

      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      const isUndo = key === "z" && !event.shiftKey;

      if (isRedo) {
        event.preventDefault();
        if (current.canRedo) current.onRedo();
      } else if (isUndo) {
        event.preventDefault();
        if (current.canUndo) current.onUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
