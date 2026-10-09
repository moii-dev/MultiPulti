import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Sparkles, AlertCircle } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectModal, RenameProjectModal, DeleteProjectModal } from "./ProjectModals";
import { projectRepository } from "../services/projectRepository";
import { LOGO_URL } from "../constants/editor";
import { playPop, playAction, playSwoosh } from "../utils/audio";
import type { ProjectSummary } from "../types/editor";

interface HomeScreenProps { onOpenProject: (id: string) => void; startupError?: string | null; onRetryStartup?: () => Promise<void>; }

export function HomeScreen({ onOpenProject, startupError, onRetryStartup }: HomeScreenProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const operation = useRef(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await projectRepository.listProjects());
      setLoadFailed(false);
      setErrorMessage(null);
    } catch {
      setLoadFailed(true);
      setErrorMessage("Не удалось загрузить мультики. Попробуй ещё раз.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const handleCreate = async (title: string) => {
    const project = await projectRepository.createProject(title);
    playAction();
    setIsCreateOpen(false);
    onOpenProject(project.id || "current");
  };
  const handleRename = async (id: string, title: string) => {
    const updated = await projectRepository.renameProject(id, title);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, title: updated.title || title, updatedAt: updated.updatedAt || Date.now() } : p).sort((a, b) => b.updatedAt - a.updatedAt));
    playPop();
    setNotice("Название сохранено!");
  };
  const handleDuplicate = useCallback(async (id: string) => {
    if (operation.current) return;
    operation.current = true;
    setBusyProjectId(id);
    setErrorMessage(null);
    setNotice("Создаём копию…");
    try {
      const cloned = await projectRepository.duplicateProject(id);
      // The saved project already contains everything the card needs; no second database scan.
      const summary: ProjectSummary = {
        id: cloned.id!, title: cloned.title!, version: 2,
        createdAt: cloned.createdAt!, updatedAt: cloned.updatedAt!,
        frameCount: cloned.frames.length, preview: cloned.frames[0]?.preview || cloned.frames[0]?.bitmap || "",
      };
      setProjects(prev => [summary, ...prev]);
      setNotice("Копия готова!");
      playSwoosh();
    } catch {
      setNotice("");
      setErrorMessage("Не удалось создать копию. Открой меню мультика и попробуй ещё раз.");
    } finally { operation.current = false; setBusyProjectId(null); }
  }, []);
  const handleDelete = async (id: string) => {
    await projectRepository.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setNotice("Мультик удалён.");
    playSwoosh();
  };
  const handleOpen = useCallback((id: string) => { playAction(); onOpenProject(id); }, [onOpenProject]);
  const toggleMenu = useCallback((id: string) => setOpenMenuProjectId(prev => prev === id ? null : id), []);
  const closeMenu = useCallback(() => setOpenMenuProjectId(null), []);
  const openCreate = () => { playPop(); setIsCreateOpen(true); };

  return (
    <div className="home-screen font-sans text-gray-800">
      <header className="home-header bg-white border-b-4 border-black">
        <div className="home-brand">
          <img src={LOGO_URL} alt="" className="home-logo border-4 border-black rounded-2xl" />
          <div className="min-w-0">
            <h1 className="font-black tracking-wide text-black uppercase">Мульти-Пульти</h1>
            <p className="text-sm font-bold text-gray-600">Твоя мультстудия</p>
          </div>
        </div>
      </header>
      <main className="home-content" aria-busy={loading}>
        {startupError && <div role="alert" className="home-error bg-red-100 border-4 border-black rounded-2xl p-4 mb-6"><p className="font-bold text-red-900">{startupError}</p><button className="btn-kid px-4 py-2" onClick={async () => { await onRetryStartup?.(); await loadProjects(); }}>Повторить перенос</button></div>}
        <div className="home-section-heading">
          <h2 tabIndex={-1} data-home-focus className="text-2xl sm:text-3xl font-black text-black flex items-center gap-2">
            <Sparkles aria-hidden="true" className="w-6 h-6 text-amber-600 shrink-0" />
            Мои мультики
            {!loading && !loadFailed && <span className="text-base font-bold text-gray-600">({projects.length})</span>}
          </h2>
          {!loading && !loadFailed && projects.length > 0 && <button type="button" onClick={openCreate} className="btn-kid bg-yellow-300 hover:bg-yellow-200 px-5 py-3 text-black font-black gap-2"><Plus aria-hidden="true" className="w-5 h-5 stroke-[3]" />Создать мультик</button>}
        </div>
        {errorMessage && <div role="alert" className="home-error bg-red-100 border-4 border-black rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3 font-bold text-red-900"><AlertCircle aria-hidden="true" className="w-6 h-6 shrink-0" /><p>{errorMessage}</p></div>
          <button type="button" onClick={loadFailed ? loadProjects : () => setErrorMessage(null)} className="btn-kid px-4 py-2">{loadFailed ? "Повторить" : "Закрыть"}</button>
        </div>}
        <p role="status" aria-live="polite" className={notice ? "font-bold text-gray-700 mb-4" : "sr-only"}>{notice}</p>
        {loading ? <div role="status"><p className="font-bold mb-4">Загрузка мультиков…</p><div className="project-grid" aria-hidden="true">{[0, 1, 2, 3].map(i => <div key={i} className="project-skeleton"><div className="aspect-[4/3] bg-blue-100 border-b-4 border-black" /><div className="p-4"><div className="h-5 w-3/4 bg-blue-100 rounded-lg" /><div className="h-3 w-1/2 mt-3 bg-blue-100 rounded-lg" /></div></div>)}</div></div>
        : loadFailed ? null : projects.length === 0 ? <section className="home-empty bg-white border-4 border-black rounded-[20px] text-center">
          <div aria-hidden="true" className="empty-art">🎨</div>
          <h3 className="text-2xl sm:text-3xl font-black text-black">Здесь пока нет мультиков!</h3>
          <p className="text-base sm:text-lg font-bold text-gray-600 max-w-md">Создай свой первый мультик и оживи рисунки!</p>
          <button type="button" onClick={openCreate} className="btn-kid bg-yellow-300 hover:bg-yellow-200 px-4 sm:px-7 py-3 text-base sm:text-lg font-black text-black gap-2"><Plus aria-hidden="true" className="w-6 h-6 shrink-0 stroke-[3]" />Создать первый мультик</button>
        </section> : <div className="project-grid">{projects.map(project => <ProjectCard key={project.id} project={project} isMenuOpen={openMenuProjectId === project.id} busy={busyProjectId !== null} isCopying={busyProjectId === project.id} onOpen={handleOpen} onRename={setRenamingProject} onDuplicate={handleDuplicate} onDelete={setDeletingProject} onToggleMenu={toggleMenu} onCloseMenu={closeMenu} />)}</div>}
      </main>
      <CreateProjectModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onCreate={handleCreate} />
      <RenameProjectModal project={renamingProject} isOpen={Boolean(renamingProject)} onClose={() => setRenamingProject(null)} onRename={handleRename} />
      <DeleteProjectModal project={deletingProject} isOpen={Boolean(deletingProject)} onClose={() => setDeletingProject(null)} onConfirm={handleDelete} />
    </div>
  );
}
