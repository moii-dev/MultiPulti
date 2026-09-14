import type { DragEvent } from "react";
import { Copy, Play, Plus, Square as StopCircle, Trash } from "lucide-react";
import { FPS_OPTIONS } from "../constants/editor";
import { cn } from "../utils/cn";

interface TimelineProps {
  frames: string[];
  currentFrame: number;
  draggedFrameIndex: number | null;
  isPlaying: boolean;
  fps: number;
  onTogglePlayback: () => void;
  onFpsChange: (fps: number) => void;
  onAddFrame: () => void;
  onCopyFrame: () => void;
  onDeleteFrame: () => void;
  onSelectFrame: (index: number) => void;
  onDragStart: (event: DragEvent, index: number) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent, index: number) => void;
  onDragEnd: () => void;
}

export function Timeline(props: TimelineProps) {
  return (
    <footer className="h-40 bg-white border-t-4 border-black p-4 flex flex-col gap-2 shrink-0 z-10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button className={cn("btn-kid px-4 py-2 gap-2 text-white", props.isPlaying ? "!bg-red-500 hover:!bg-red-400" : "!bg-green-500 hover:!bg-green-400")} onClick={props.onTogglePlayback}>
            {props.isPlaying ? <><StopCircle className="w-6 h-6 fill-current" /> Стоп</> : <><Play className="w-6 h-6 fill-current" /> Играть</>}
          </button>
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 p-1 rounded-2xl border-4 border-black ml-4">
            {FPS_OPTIONS.map((option) => (
              <button key={option.id} className={cn("px-3 py-1 rounded-xl font-bold text-sm transition-all", props.fps === option.fps ? "bg-white shadow-sm border-2 border-black" : "text-gray-500 hover:bg-gray-200")} onClick={() => props.onFpsChange(option.fps)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-kid p-2 text-blue-500" onClick={props.onAddFrame} disabled={props.isPlaying} title="Новый кадр"><Plus className="w-6 h-6" /></button>
          <button className="btn-kid p-2 text-orange-500" onClick={props.onCopyFrame} disabled={props.isPlaying} title="Копировать кадр"><Copy className="w-6 h-6" /></button>
          <button className="btn-kid p-2 text-red-500" onClick={props.onDeleteFrame} disabled={props.isPlaying || props.frames.length <= 1} title="Удалить кадр"><Trash className="w-6 h-6" /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-3 overflow-x-auto pb-2 px-2 snap-x">
        {props.frames.map((frame, index) => (
          <div
            key={index}
            draggable={!props.isPlaying}
            onDragStart={(event) => props.onDragStart(event, index)}
            onDragOver={props.onDragOver}
            onDrop={(event) => props.onDrop(event, index)}
            onDragEnd={props.onDragEnd}
            className={cn("relative h-full aspect-[4/3] bg-white border-4 rounded-xl shrink-0 cursor-pointer snap-center transition-all overflow-hidden", props.currentFrame === index ? "border-blue-500 scale-105 shadow-[0_0_0_4px_rgba(59,130,246,0.3)]" : "border-gray-300 hover:border-gray-400", props.draggedFrameIndex === index && "opacity-50 scale-95")}
            onClick={() => { if (!props.isPlaying) props.onSelectFrame(index); }}
          >
            <img src={frame} alt={`Кадр ${index + 1}`} className="w-full h-full object-contain bg-white" />
            <div className="absolute bottom-1 right-1 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{index + 1}</div>
          </div>
        ))}
        {!props.isPlaying && <button className="h-full aspect-[4/3] border-4 border-dashed border-gray-300 rounded-xl shrink-0 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-500 hover:bg-blue-50 transition-all" onClick={props.onAddFrame}><Plus className="w-8 h-8" /></button>}
      </div>
    </footer>
  );
}

