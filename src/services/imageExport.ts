import { exportToGif } from "../utils/gifExport";

function download(url: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
}

export function downloadPng(dataUrl: string) {
  download(dataUrl, `рисунок-${Date.now()}.png`);
}

export async function downloadGif(frames: string[], fps: number, width: number, height: number) {
  const blob = await exportToGif(frames, fps, width, height);
  const url = URL.createObjectURL(blob);
  try {
    download(url, `мультик-${Date.now()}.gif`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

