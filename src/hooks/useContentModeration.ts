import { useCallback, useEffect, useRef, useState } from "react";
import { CONTENT_WARNING_MESSAGES } from "../constants/editor";
import { analyzeFrame } from "../utils/contentFilter";

interface ContentWarning {
  id: number;
  text: string;
}

interface UseContentModerationOptions {
  onBlocked: () => void;
  onErrorSound: () => void;
}

export function useContentModeration({ onBlocked, onErrorSound }: UseContentModerationOptions) {
  const [warning, setWarning] = useState<ContentWarning | null>(null);
  const cooldownRef = useRef(false);
  const warningTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);

  const checkCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (cooldownRef.current) return false;
    const result = analyzeFrame(canvas);
    if (!result.blocked) return false;

    cooldownRef.current = true;
    onErrorSound();
    onBlocked();
    setWarning({
      id: Date.now(),
      text: CONTENT_WARNING_MESSAGES[
        Math.floor(Math.random() * CONTENT_WARNING_MESSAGES.length)
      ],
    });

    if (warningTimerRef.current !== null) window.clearTimeout(warningTimerRef.current);
    if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => setWarning(null), 3500);
    cooldownTimerRef.current = window.setTimeout(() => {
      cooldownRef.current = false;
    }, 2000);
    return true;
  }, [onBlocked, onErrorSound]);

  useEffect(() => () => {
    if (warningTimerRef.current !== null) window.clearTimeout(warningTimerRef.current);
    if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
  }, []);

  return { warning, checkCanvas };
}

