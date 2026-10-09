import { TOOLS } from "../constants/editor";
import type { ToolId } from "../types/editor";
import { cn } from "../utils/cn";

interface ToolsPanelProps {
  tool: ToolId;
  hasActiveSticker: boolean;
  onSelectTool: (tool: ToolId) => void;
  onOpenStickers: () => void;
}

export function ToolsPanel({
  tool,
  hasActiveSticker,
  onSelectTool,
  onOpenStickers,
}: ToolsPanelProps) {
  return (
    <aside className="w-14 sm:w-[88px] bg-white flex flex-col items-center py-2 sm:py-4 gap-1.5 sm:gap-2 overflow-y-auto no-scrollbar shrink-0 z-30">
      <div className="flex flex-col gap-1.5 sm:gap-2 w-full px-1 sm:px-2 items-center">
        {TOOLS.map((option) => (
          <button
            key={option.id}
            className={cn(
              "btn-kid w-11 h-11 sm:w-16 sm:h-16 flex flex-col items-center justify-center gap-0.5 p-1 relative",
              tool === option.id && "btn-kid-active ring-2 sm:ring-4 ring-yellow-400 ring-offset-1 sm:ring-offset-2",
            )}
            onClick={() => {
              onSelectTool(option.id);
              if (option.id === "sticker" && !hasActiveSticker) onOpenStickers();
            }}
            title={option.label}
            aria-label={option.label}
          >
            <option.icon className="w-5 h-5 sm:w-7 sm:h-7 shrink-0" />
            <span className="w-full truncate text-[7px] sm:text-[9px] font-black leading-none">{option.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

