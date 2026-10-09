import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X, Sparkles, Pencil, Trash2 } from "lucide-react";
import { DEFAULT_PROJECT_TITLE, MAX_PROJECT_TITLE_LENGTH } from "../domain/project";
import type { ProjectSummary } from "../types/editor";

// Native dialogs provide keyboard focus containment and make the background inert.
function ProjectDialog({ isOpen, onClose, busy, titleId, children }: { isOpen: boolean; onClose: () => void; busy: boolean; titleId: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isOpen) {
      setClosing(false);
      if (!dialog.open) {
        returnFocus.current = document.activeElement as HTMLElement;
        dialog.showModal();
      }
    } else if (dialog.open) {
      setClosing(true);
      timer = setTimeout(() => {
        dialog.close();
        const target = returnFocus.current;
        if (target?.isConnected && !target.matches(':disabled')) target.focus();
        else document.querySelector<HTMLElement>('[data-home-focus]')?.focus();
        setClosing(false);
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
    }
    return () => clearTimeout(timer);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);
  return <dialog ref={ref} tabIndex={-1} aria-labelledby={titleId} aria-busy={busy} className={`project-dialog ${closing ? 'is-closing' : ''}`} onKeyDown={event => {
    if (closing) { event.preventDefault(); return; }
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget as HTMLDialogElement;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
  }} onCancel={event => { event.preventDefault(); if (!busy && !closing) onClose(); }} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) && !busy && !closing) onClose();
  }}>{children}</dialog>;
}
function CloseButton({ onClose, busy }: { onClose: () => void; busy: boolean }) {
  return <button type="button" className="btn-kid p-2 shrink-0 text-gray-700" onClick={onClose} disabled={busy} aria-label="Закрыть окно"><X aria-hidden="true" className="w-5 h-5" /></button>;
}

function NameProjectModal({ isOpen, onClose, project, onSubmit }: { isOpen: boolean; onClose: () => void; project?: ProjectSummary | null; onSubmit: (title: string) => Promise<void> }) {
  const rename = project !== undefined;
  const prefix = rename ? 'rename-project' : 'create-project';
  const [title, setTitle] = useState(DEFAULT_PROJECT_TITLE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    setTitle(project?.title || DEFAULT_PROJECT_TITLE);
    setError(null); setBusy(false); lock.current = false;
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, project?.id]);
  const submit = async () => {
    if (lock.current) return;
    const clean = title.trim();
    if (!clean) { setError('Придумай название для мультика.'); input.current?.focus(); return; }
    if (clean.length > MAX_PROJECT_TITLE_LENGTH) { setError(`Выбери название до ${MAX_PROJECT_TITLE_LENGTH} символов.`); return; }
    lock.current = true; setBusy(true); setError(null);
    try { await onSubmit(clean); onClose(); }
    catch { setError(rename ? 'Не удалось сохранить название. Попробуй ещё раз.' : 'Не удалось создать мультик. Попробуй ещё раз.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ProjectDialog isOpen={isOpen} onClose={onClose} busy={busy} titleId={`${prefix}-title`}>
    <div className="flex justify-between items-start gap-3 mb-5">
      <h2 id={`${prefix}-title`} className="text-xl sm:text-2xl font-black text-black flex items-center gap-2 min-w-0 break-words">{rename ? <Pencil aria-hidden="true" className="w-5 h-5 text-blue-700 shrink-0" /> : <Sparkles aria-hidden="true" className="w-6 h-6 text-amber-600 shrink-0" />}{rename ? 'Переименовать' : 'Новый мультик'}</h2>
      <CloseButton onClose={onClose} busy={busy} />
    </div>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor={`${prefix}-input`} className="block text-sm font-bold text-gray-700 mb-2">{rename ? 'Новое название' : 'Как назовём твой мультик?'}</label>
      <input id={`${prefix}-input`} ref={input} value={title} maxLength={MAX_PROJECT_TITLE_LENGTH} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? `${prefix}-error` : undefined} onChange={event => { setTitle(event.target.value); setError(null); }} className={`w-full border-4 border-black rounded-2xl px-3 py-3 font-bold text-base text-black ${rename ? 'bg-blue-50' : 'bg-yellow-50'}`} />
      <div className="flex justify-between items-start gap-2 mt-2 min-h-5">
        <p id={`${prefix}-error`} role={error ? 'alert' : undefined} className="text-sm font-bold text-red-700">{error}</p>
        <span className="text-xs font-bold text-gray-600 shrink-0">{title.length}/{MAX_PROJECT_TITLE_LENGTH}</span>
      </div>
      <div className="project-dialog-actions">
        <button type="button" onClick={onClose} disabled={busy} className="btn-kid px-4 py-2 text-gray-700">Отмена</button>
        <button type="submit" disabled={busy || !title.trim()} className={`btn-kid px-4 py-2 text-black ${rename ? 'bg-blue-300 hover:bg-blue-200' : 'bg-yellow-300 hover:bg-yellow-200'}`}>{busy ? rename ? 'Сохранение…' : 'Создание…' : error ? 'Повторить' : rename ? 'Сохранить' : 'Создать'}</button>
      </div>
    </form>
  </ProjectDialog>;
}

export function CreateProjectModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (title: string) => Promise<void> }) {
  return <NameProjectModal isOpen={isOpen} onClose={onClose} onSubmit={onCreate} />;
}
export function RenameProjectModal({ project, isOpen, onClose, onRename }: { project: ProjectSummary | null; isOpen: boolean; onClose: () => void; onRename: (id: string, title: string) => Promise<void> }) {
  return <NameProjectModal project={project} isOpen={isOpen} onClose={onClose} onSubmit={title => project ? onRename(project.id, title) : Promise.resolve()} />;
}
export function DeleteProjectModal({ project, isOpen, onClose, onConfirm }: { project: ProjectSummary | null; isOpen: boolean; onClose: () => void; onConfirm: (id: string) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const lastProject = useRef(project);
  if (project) lastProject.current = project;
  useEffect(() => {
    if (!isOpen) return;
    setError(null); setBusy(false); lock.current = false;
    cancel.current?.focus();
  }, [isOpen]);
  const remove = async () => {
    if (lock.current || !project) return;
    lock.current = true; setBusy(true); setError(null);
    try { await onConfirm(project.id); onClose(); }
    catch { setError('Не удалось удалить мультик. Попробуй ещё раз.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ProjectDialog isOpen={isOpen} onClose={onClose} busy={busy} titleId="delete-project-title">
    <div className="flex justify-between items-start gap-3 mb-4">
      <h2 id="delete-project-title" className="text-xl sm:text-2xl font-black text-red-700 flex items-center gap-2"><Trash2 aria-hidden="true" className="w-6 h-6 shrink-0" />Удалить мультик?</h2>
      <CloseButton onClose={onClose} busy={busy} />
    </div>
    <p className="font-black text-black break-words mb-3">«{lastProject.current?.title}»</p>
    <p className="font-bold text-gray-700">Все его рисунки будут удалены. Вернуть их не получится.</p>
    {error && <p role="alert" className="text-sm font-bold text-red-700 mt-3">{error}</p>}
    <div className="project-dialog-actions">
      <button ref={cancel} type="button" onClick={onClose} disabled={busy} className="btn-kid px-4 py-2 text-gray-700">Отмена</button>
      <button type="button" onClick={remove} disabled={busy} className="btn-kid bg-red-700 hover:bg-red-800 text-white px-4 py-2">{busy ? 'Удаление…' : error ? 'Повторить' : 'Удалить'}</button>
    </div>
  </ProjectDialog>;
}
