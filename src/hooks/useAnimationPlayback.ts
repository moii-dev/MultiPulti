import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useAnimationPlayback(frameCount: number, setCurrentFrame: Dispatch<SetStateAction<number>>, initialFps: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(initialFps);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setCurrentFrame((previous) => (previous + 1) % frameCount);
    }, 1000 / fps);
    return () => window.clearInterval(interval);
  }, [fps, frameCount, isPlaying, setCurrentFrame]);

  return { isPlaying, setIsPlaying, fps, setFps };
}

