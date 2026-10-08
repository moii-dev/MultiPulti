import { useEffect, useRef } from "react";

interface KeyboardShortcuts {
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onUndo: () => void;
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
      if (isEditableTarget(event.target) || (!event.ctrlKey && !event.metaKey)) return;
      const key = event.key.toLowerCase();
      const current = shortcutsRef.current;

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
