import { useState, useEffect, type PointerEvent, type MouseEvent, type RefObject } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, TEMPLATES } from "../constants/editor";
import { calculateTextInputGeometry } from "../canvas/operations";
import type { ActiveText, ToolId } from "../types/editor";
import { cn } from "../utils/cn";

interface DrawingStageProps {
  mainCanvasRef: RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  textInputRef: RefObject<HTMLInputElement | null>;
  tool: ToolId;
  activeTemplate: string | null;
  activeText: ActiveText | null;
  textInput: string;
  feedback: { text: string; id: number } | null;
  isPlaying: boolean;
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLCanvasElement>) => void;
  onLostPointerCapture?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLCanvasElement>) => void;
  onTextChange: (value: string) => void;
  onFinalizeText: () => void;
}

export function DrawingStage(props: DrawingStageProps) {
  const { activeText } = props;
  const [canvasRect, setCanvasRect] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const canvas = props.overlayCanvasRef.current || props.mainCanvasRef.current;
    if (!canvas) return;

    const updateRect = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasRect({ width: rect.width, height: rect.height });
      }
    };

    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(canvas);
    window.addEventListener("resize", updateRect);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
    };
  }, [props.overlayCanvasRef, props.mainCanvasRef]);

  const textGeom = activeText?.isEditing
    ? calculateTextInputGeometry(activeText, props.textInput.length, canvasRect)
    : null;

  return (
    <main className="flex-1 flex items-center justify-center bg-gray-200 p-2 sm:p-6 overflow-hidden relative">
      <div
        className="relative bg-white border-4 sm:border-8 border-black rounded-2xl sm:rounded-3xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] overflow-hidden w-full max-w-4xl max-h-full"
        style={{ aspectRatio: "4/3" }}
      >
        <canvas
          ref={props.mainCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full"
        />
        <canvas
          ref={props.overlayCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={cn(
            "absolute inset-0 w-full h-full touch-none",
            props.tool === "select" && "cursor-crosshair",
          )}
          onPointerDown={props.onPointerDown}
          onPointerMove={props.onPointerMove}
          onPointerUp={props.onPointerUp}
          onPointerCancel={props.onPointerCancel}
          onLostPointerCapture={props.onLostPointerCapture}
          onContextMenu={props.onContextMenu}
        />
        {props.activeTemplate && (
          <img
            src={TEMPLATES.find((template) => template.id === props.activeTemplate)?.url}
            className="absolute inset-0 w-full h-full object-contain opacity-30 pointer-events-none"
            alt="Template"
          />
        )}
        {activeText?.isEditing && textGeom && (
          <input
            ref={props.textInputRef}
            type="text"
            value={props.textInput}
            onChange={(event) => props.onTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onFinalizeText();
            }}
            className="absolute bg-transparent border-2 border-blue-500 border-dashed outline-none p-1 pointer-events-auto touch-auto z-20 whitespace-pre"
            style={{
              left: `${textGeom.leftPercent}%`,
              top: `${textGeom.topPercent}%`,
              transform: "translate(-50%, -50%)",
              fontFamily: activeText.font,
              fontSize: `${textGeom.fontSizePx}px`,
              color: activeText.color,
              minWidth: `${textGeom.minWidthPx}px`,
              width: `${textGeom.widthPx}px`,
              textAlign: "center",
            }}
            autoFocus
          />
        )}
        {props.feedback && (
          <div
            key={props.feedback.id}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl sm:text-6xl font-black text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-bounce z-50 pointer-events-none"
            style={{ WebkitTextStroke: "2px #FF3B30" }}
          >
            {props.feedback.text}
          </div>
        )}
        {props.isPlaying && (
          <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full font-bold animate-pulse border-4 border-black">
            🔴 ЗАПИСЬ
          </div>
        )}
      </div>
    </main>
  );
}
