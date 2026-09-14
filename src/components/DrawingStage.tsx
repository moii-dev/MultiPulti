import type { PointerEvent, MouseEvent, RefObject } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, TEMPLATES } from "../constants/editor";
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
  contentWarning: { text: string; id: number } | null;
  isPlaying: boolean;
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLCanvasElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLCanvasElement>) => void;
  onTextChange: (value: string) => void;
  onFinalizeText: () => void;
}

export function DrawingStage(props: DrawingStageProps) {
  const { activeText } = props;
  return (
    <main className="flex-1 flex items-center justify-center bg-gray-200 p-4 sm:p-8 overflow-hidden relative">
      <div className="relative bg-white border-8 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] overflow-hidden w-full max-w-4xl" style={{ aspectRatio: "4/3" }}>
        <canvas ref={props.mainCanvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 w-full h-full" />
        <canvas
          ref={props.overlayCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={cn("absolute inset-0 w-full h-full touch-none", props.tool === "select" && "cursor-crosshair")}
          onPointerDown={props.onPointerDown}
          onPointerMove={props.onPointerMove}
          onPointerUp={props.onPointerUp}
          onPointerCancel={props.onPointerCancel}
          onContextMenu={props.onContextMenu}
        />
        {props.activeTemplate && <img src={TEMPLATES.find((template) => template.id === props.activeTemplate)?.url} className="absolute inset-0 w-full h-full object-contain opacity-30 pointer-events-none" alt="Template" />}
        {activeText?.isEditing && (
          <input
            ref={props.textInputRef}
            type="text"
            value={props.textInput}
            onChange={(event) => props.onTextChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") props.onFinalizeText(); }}
            className="absolute bg-transparent border-2 border-blue-500 border-dashed outline-none p-1 pointer-events-auto z-20 whitespace-pre"
            style={{
              left: `${(activeText.x / CANVAS_WIDTH) * 100}%`,
              top: `${(activeText.y / CANVAS_HEIGHT) * 100}%`,
              transform: "translate(-50%, -50%)",
              fontFamily: activeText.font,
              fontSize: `${(activeText.size / CANVAS_HEIGHT) * 100}vh`,
              color: activeText.color,
              minWidth: "50px",
              width: `${Math.max(50, props.textInput.length * (activeText.size * 0.6))}px`,
              textAlign: "center",
            }}
            autoFocus
          />
        )}
        {props.feedback && (
          <div key={props.feedback.id} className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl sm:text-6xl font-black text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-bounce z-50 pointer-events-none" style={{ WebkitTextStroke: "2px #FF3B30" }}>
            {props.feedback.text}
          </div>
        )}
        {props.contentWarning && (
          <div key={props.contentWarning.id} className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-red-500/90 backdrop-blur-sm text-white px-8 py-6 rounded-3xl border-4 border-white shadow-2xl max-w-md text-center animate-bounce">
              <div className="text-3xl sm:text-4xl font-black mb-2">🚫</div>
              <div className="text-lg sm:text-xl font-bold leading-snug">{props.contentWarning.text}</div>
            </div>
          </div>
        )}
        {props.isPlaying && <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full font-bold animate-pulse border-4 border-black">🔴 ЗАПИСЬ</div>}
      </div>
    </main>
  );
}
