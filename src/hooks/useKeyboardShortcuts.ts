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

      if (key === "z" && event.shiftKey && current.canRedo) {
        event.preventDefault();
        current.onRedo();
      } else if (key === "y" && current.canRedo) {
        event.preventDefault();
        current.onRedo();
      } else if (key === "z" && current.canUndo) {
        event.preventDefault();
        current.onUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
