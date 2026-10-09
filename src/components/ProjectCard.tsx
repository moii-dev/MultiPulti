import { useEffect, useRef, type MouseEvent, type KeyboardEvent } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ProjectSummary } from "../types/editor";

interface ProjectCardProps {
  key?: string;
  project: ProjectSummary;
  isMenuOpen: boolean;
  onOpen: (id: string) => void;
  onRename: (project: ProjectSummary) => void;
  onDuplicate: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
}

function formatFrameCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} кадров`;
  if (mod10 === 1) return `${count} кадр`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} кадра`;
  return `${count} кадров`;
}

function formatDate(timestamp: number): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ProjectCard({
  project,
  isMenuOpen,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onToggleMenu,
  onCloseMenu,
}: ProjectCardProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onCloseMenu();
      }
    };
    window.addEventListener("pointerdown", handleOutsideClick);
    return () => window.removeEventListener("pointerdown", handleOutsideClick);
  }, [isMenuOpen, onCloseMenu]);

  // Close menu on Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseMenu();
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen, onCloseMenu]);

  const handleCardClick = () => {
    onOpen(project.id);
  };

  const handleMenuButtonClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleMenu(project.id);
  };

  const handleMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseMenu();
      buttonRef.current?.focus();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            handleCardClick();
          }
        }
      }}
      className="bg-white rounded-3xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer flex flex-col overflow-hidden text-left relative select-none group"
      aria-label={`Открыть мультик «${project.title}»`}
    >
      {/* Thumbnail area */}
      <div className="aspect-[4/3] bg-amber-50 border-b-4 border-black relative overflow-hidden flex items-center justify-center">
        {project.preview ? (
          <img
            src={project.preview}
            alt={`Превью ${project.title}`}
            className="w-full h-full object-contain bg-white"
          />
        ) : (
          <div className="text-4xl">🎨</div>
        )}

        {/* Frame count badge */}
        <span className="absolute bottom-2 left-2 bg-yellow-300 border-2 border-black rounded-xl px-2 py-0.5 text-xs font-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          {formatFrameCount(project.frameCount)}
        </span>
      </div>

      {/* Card details */}
      <div className="p-3 sm:p-4 flex items-center justify-between gap-2 relative">
        <div className="flex-1 min-w-0">
          <h3
            className="text-lg sm:text-xl font-black text-black truncate tracking-wide"
            title={project.title}
          >
            {project.title}
          </h3>
          <p className="text-xs font-bold text-gray-500 mt-0.5">
            {formatDate(project.updatedAt)}
          </p>
        </div>

        {/* Three dots menu button */}
        <div className="relative shrink-0">
          <button
            ref={buttonRef}
            type="button"
            className="btn-kid p-2 text-black hover:bg-yellow-200 transition-colors"
            onClick={handleMenuButtonClick}
            aria-label={`Действия для «${project.title}»`}
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            title="Меню"
          >
            <MoreHorizontal className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Context Dropdown Menu */}
          {isMenuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Меню проекта ${project.title}`}
              onKeyDown={handleMenuKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] py-1.5 px-1.5 z-30 min-w-[190px] flex flex-col gap-1"
            >
              <button
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseMenu();
                  onRename(project);
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-black text-sm text-black flex items-center gap-2 hover:bg-yellow-100 hover:text-black transition-colors"
              >
                <Pencil className="w-4 h-4 text-blue-600" />
                <span>Переименовать</span>
              </button>

              <button
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseMenu();
                  onDuplicate(project.id);
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-black text-sm text-black flex items-center gap-2 hover:bg-yellow-100 hover:text-black transition-colors"
              >
                <Copy className="w-4 h-4 text-green-600" />
                <span>Создать копию</span>
              </button>

              <div className="h-0.5 bg-gray-200 my-0.5 mx-1" />

              <button
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseMenu();
                  onDelete(project);
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-black text-sm text-red-600 flex items-center gap-2 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>Удалить</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
