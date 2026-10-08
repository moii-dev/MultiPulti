import type { Frame } from "../types/editor";
import type { DragEvent } from "react";
import { Copy, Play, Plus, Square as StopCircle, Trash } from "lucide-react";
import { FPS_OPTIONS } from "../constants/editor";
import { cn } from "../utils/cn";

interface TimelineProps {
  frames: Frame[];
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
    <footer className="h-32 sm:h-40 bg-white border-t-4 border-black p-2 sm:p-4 flex flex-col gap-1 sm:gap-2 shrink-0 z-10">
      <div className="flex items-center justify-between mb-1 sm:mb-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            className={cn(
              "btn-kid px-3 py-1.5 sm:px-4 sm:py-2 gap-1.5 sm:gap-2 text-white text-sm sm:text-base",
              props.isPlaying ? "!bg-red-500 hover:!bg-red-400" : "!bg-green-500 hover:!bg-green-400",
            )}
            onClick={props.onTogglePlayback}
            aria-label={props.isPlaying ? "Остановить просмотр мультика" : "Запустить просмотр мультика"}
          >
            {props.isPlaying ? (
              <>
                <StopCircle className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> Стоп
              </>
            ) : (
              <>
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> Играть
              </>
            )}
          </button>
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 p-1 rounded-2xl border-4 border-black ml-4">
            {FPS_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={cn(
                  "px-3 py-1 rounded-xl font-bold text-sm transition-all",
                  props.fps === option.fps
                    ? "bg-white shadow-sm border-2 border-black"
                    : "text-gray-500 hover:bg-gray-200",
                )}
                onClick={() => props.onFpsChange(option.fps)}
                aria-label={`Установить скорость: ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            className="sm:hidden btn-kid px-2 py-1 text-xs font-black bg-gray-100 ml-1"
            onClick={() => props.onFpsChange(props.fps === 2 ? 5 : props.fps === 5 ? 12 : 2)}
            title="Скорость анимации"
            aria-label={`Скорость: ${props.fps} кадров в секунду. Нажми для переключения`}
          >
            {props.fps} FPS
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            className="btn-kid p-1.5 sm:p-2 text-blue-500"
            onClick={props.onAddFrame}
            disabled={props.isPlaying}
            title="Новый кадр"
            aria-label="Новый кадр"
          >
            <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            className="btn-kid p-1.5 sm:p-2 text-orange-500"
            onClick={props.onCopyFrame}
            disabled={props.isPlaying}
            title="Копировать кадр"
            aria-label="Копировать текущий кадр"
          >
            <Copy className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            className="btn-kid p-1.5 sm:p-2 text-red-500"
            onClick={props.onDeleteFrame}
            disabled={props.isPlaying || props.frames.length <= 1}
            title="Удалить кадр"
            aria-label="Удалить текущий кадр"
          >
            <Trash className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-2 px-1 sm:px-2 snap-x">
        {props.frames.map((frame, index) => (
          <div
            key={frame.id}
            role="button"
            tabIndex={0}
            draggable={!props.isPlaying}
            onDragStart={(event) => props.onDragStart(event, index)}
            onDragOver={props.onDragOver}
            onDrop={(event) => props.onDrop(event, index)}
            onDragEnd={props.onDragEnd}
            className={cn(
              "relative h-full aspect-[4/3] bg-white border-2 sm:border-4 rounded-xl shrink-0 cursor-pointer snap-center transition-all overflow-hidden focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500",
              props.currentFrame === index
                ? "border-blue-500 scale-105 shadow-[0_0_0_3px_rgba(59,130,246,0.3)] sm:shadow-[0_0_0_4px_rgba(59,130,246,0.3)]"
                : "border-gray-300 hover:border-gray-400",
              props.draggedFrameIndex === index && "opacity-50 scale-95",
            )}
            onClick={() => {
              if (!props.isPlaying) props.onSelectFrame(index);
            }}
            onKeyDown={(event) => {
              if (!props.isPlaying && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                props.onSelectFrame(index);
              }
            }}
            aria-label={`Выбрать кадр ${index + 1}`}
          >
            <img src={frame.preview} alt={`Кадр ${index + 1}`} className="w-full h-full object-contain bg-white" />
            <div className="absolute bottom-1 right-1 bg-black text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded-md">
              {index + 1}
            </div>
          </div>
        ))}
        {!props.isPlaying && (
          <button
            className="h-full aspect-[4/3] border-2 sm:border-4 border-dashed border-gray-300 rounded-xl shrink-0 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-500 hover:bg-blue-50 transition-all"
            onClick={props.onAddFrame}
            aria-label="Добавить новый кадр"
            title="Добавить кадр"
          >
            <Plus className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        )}
      </div>
    </footer>
  );
}

