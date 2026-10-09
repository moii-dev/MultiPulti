import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ProjectSummary } from "../types/editor";

interface ProjectCardProps {
  key?: string;
  project: ProjectSummary;
  isMenuOpen: boolean;
  busy: boolean;
  isCopying: boolean;
  onOpen: (id: string) => void;
  onRename: (project: ProjectSummary) => void;
  onDuplicate: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
}
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function formatFrameCount(count: number) {
  const last = count % 10, hundred = count % 100;
  return `${count} ${hundred >= 11 && hundred <= 19 ? "кадров" : last === 1 ? "кадр" : last >= 2 && last <= 4 ? "кадра" : "кадров"}`;
}

export const ProjectCard = memo(function ProjectCard({ project, isMenuOpen, busy, isCopying, onOpen, onRename, onDuplicate, onDelete, onToggleMenu, onCloseMenu }: ProjectCardProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const menuId = `project-menu-${project.id}`;
  const restoreTrigger = () => buttonRef.current?.focus({ preventScroll: true });

  useLayoutEffect(() => {
    if (!isMenuOpen) return;
    const place = () => {
      const trigger = buttonRef.current, menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const width = menu.offsetWidth, height = menu.offsetHeight;
      const margin = 12;
      const top = rect.top >= height + margin + 8 ? rect.top - height - 8 : rect.bottom + 8;
      setPosition({ left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)), top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)) });
    };
    place();
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    // Reposition on scroll, including scroll events queued by focusing the trigger.
    const scroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) place(); };
    window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", scroll, true); };
  }, [isMenuOpen, onCloseMenu]);
  useEffect(() => {
    if (!isMenuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) onCloseMenu();
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [isMenuOpen, onCloseMenu]);

  return <article className="project-card" aria-busy={isCopying}>
    <button type="button" disabled={busy} onClick={() => onOpen(project.id)} className="project-open" aria-label={`Открыть мультик «${project.title}»`} aria-describedby={`project-frames-${project.id} project-updated-${project.id}`}>
      <div className="project-preview">
        {project.preview && failedPreview !== project.preview ? <img src={project.preview} alt="" loading="lazy" decoding="async" onError={() => setFailedPreview(project.preview)} /> : <div className="flex flex-col items-center gap-2 text-gray-600"><span aria-hidden="true" className="text-5xl">🎨</span><span className="text-sm font-bold">Рисунки ждут тебя!</span></div>}
        <span id={`project-frames-${project.id}`} className="project-frame-count">{formatFrameCount(project.frameCount)}</span>
      </div>
      <div className="project-details">
        <h3 className="text-lg font-black text-black line-clamp-2 break-words" title={project.title}>{project.title}</h3>
        <p id={`project-updated-${project.id}`} className="text-xs font-bold text-gray-600 mt-1">Изменён {dateFormatter.format(project.updatedAt)}</p>
        {isCopying && <p className="text-sm font-bold mt-2">Создаём копию…</p>}
      </div>
    </button>
    <button ref={buttonRef} type="button" disabled={busy} className="btn-kid project-menu-trigger hover:bg-yellow-200" onClick={() => onToggleMenu(project.id)} aria-label={`Действия для «${project.title}»`} aria-haspopup="menu" aria-expanded={isMenuOpen} aria-controls={isMenuOpen ? menuId : undefined}><MoreHorizontal aria-hidden="true" className="w-6 h-6" /></button>
    {isMenuOpen && createPortal(<div id={menuId} ref={menuRef} role="menu" aria-label={`Меню проекта ${project.title}`} className="project-menu" style={position} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== buttonRef.current) onCloseMenu();
    }} onKeyDown={event => {
      const items = Array.from((event.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>('button'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        restoreTrigger(); onCloseMenu();
      }
    }}>
      <button role="menuitem" type="button" onClick={() => { restoreTrigger(); onCloseMenu(); onRename(project); }}><Pencil aria-hidden="true" className="w-5 h-5 text-blue-700" />Переименовать</button>
      <button role="menuitem" type="button" onClick={() => { restoreTrigger(); onCloseMenu(); onDuplicate(project.id); }}><Copy aria-hidden="true" className="w-5 h-5 text-green-700" />Создать копию</button>
      <div role="separator" className="border-t-2 border-gray-200 my-1" />
      <button role="menuitem" type="button" className="text-red-700" onClick={() => { restoreTrigger(); onCloseMenu(); onDelete(project); }}><Trash2 aria-hidden="true" className="w-5 h-5" />Удалить</button>
    </div>, document.body)}
  </article>;
});
