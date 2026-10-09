import { useState, useEffect, useCallback } from "react";
import { Plus, Sparkles, AlertCircle } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectModal, RenameProjectModal, DeleteProjectModal } from "./ProjectModals";
import { projectRepository } from "../services/projectRepository";
import { LOGO_URL } from "../constants/editor";
import { playPop, playAction, playSwoosh } from "../utils/audio";
import type { ProjectSummary } from "../types/editor";

interface HomeScreenProps {
  onOpenProject: (id: string) => void;
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);

  // Card menu state: only one menu open at any time
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

  // Loading projects from repository
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const list = await projectRepository.listProjects();
      setProjects(list);
      setErrorMessage(null);
    } catch (err) {
      console.error("Ошибка загрузки списка мультиков:", err);
      setErrorMessage("Не удалось загрузить список мультиков. Проверьте IndexedDB.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Create Project handler
  const handleCreate = async (title: string) => {
    playAction();
    const newProject = await projectRepository.createProject(title);
    setIsCreateOpen(false);
    // Open the newly created project in editor immediately
    onOpenProject(newProject.id || "current");
  };

  // Rename Project handler
  const handleRename = async (id: string, newTitle: string) => {
    playPop();
    const updated = await projectRepository.renameProject(id, newTitle);
    // Update local list without full page reload
    setProjects((prev) =>
      prev
        .map((p) =>
          p.id === id
            ? { ...p, title: updated.title || newTitle, updatedAt: updated.updatedAt || Date.now() }
            : p
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
    setRenamingProject(null);
  };

  // Duplicate Project handler
  const handleDuplicate = async (id: string) => {
    playPop();
    try {
      const cloned = await projectRepository.duplicateProject(id);
      playSwoosh();
      const updatedList = await projectRepository.listProjects();
      setProjects(updatedList);
    } catch (err) {
      console.error("Ошибка создания копии:", err);
      setErrorMessage(err instanceof Error ? err.message : "Не удалось создать копию мультика");
    }
  };

  // Delete Project handler
  const handleDelete = async (id: string) => {
    playSwoosh();
    try {
      await projectRepository.deleteProject(id);
      // Immediately remove card from UI
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setDeletingProject(null);
    } catch (err) {
      console.error("Ошибка удаления мультика:", err);
      setErrorMessage(err instanceof Error ? err.message : "Не удалось удалить мультик");
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f9ff] flex flex-col font-sans text-gray-800">
      {/* Header */}
      <header className="h-16 sm:h-20 bg-white border-b-4 border-black flex items-center justify-between px-4 sm:px-8 shrink-0 z-10 shadow-sm sticky top-0">
        <div className="flex items-center gap-3">
          <img
            src={LOGO_URL}
            alt="Логотип Мульти-Пульти"
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-4 border-black object-cover shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          />
          <div>
            <h1
              className="text-2xl sm:text-3xl font-black tracking-wider text-black uppercase"
              style={{ WebkitTextStroke: "1px white" }}
            >
              Мульти-Пульти
            </h1>
            <p className="text-xs font-bold text-gray-600 hidden sm:block">
              Твоя студия анимации
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            playPop();
            setIsCreateOpen(true);
          }}
          className="btn-kid bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-base font-black flex items-center gap-2 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          aria-label="Создать новый мультик"
        >
          <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
          <span>Новый мультик</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 flex flex-col">
        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="bg-red-100 border-4 border-red-500 rounded-2xl p-4 text-red-900 font-bold mb-6 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(239,68,68,0.5)]"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="btn-kid px-3 py-1 text-xs text-red-700 bg-white ml-4 shrink-0"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* Section Title */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-black text-black flex items-center gap-2 uppercase tracking-wide">
            <Sparkles className="w-6 h-6 text-yellow-500 fill-yellow-400" />
            Мои мультики
            {!loading && (
              <span className="text-base text-gray-500 font-bold lowercase">
                ({projects.length})
              </span>
            )}
          </h2>
        </div>

        {/* Loading state */}
        {loading ? (
          <div role="status" className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <div className="animate-bounce text-5xl mb-4">🎬</div>
            <p className="text-xl font-black text-gray-700">Загрузка мультиков…</p>
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 text-center bg-white/80 rounded-3xl border-4 border-dashed border-gray-400 p-8 my-auto">
            <div className="text-6xl sm:text-7xl mb-4">🎨</div>
            <h3 className="text-2xl sm:text-3xl font-black text-black mb-2">
              Здесь пока нет мультиков!
            </h3>
            <p className="text-base sm:text-lg font-bold text-gray-600 max-w-md mb-6">
              Нажми на кнопку ниже, чтобы создать свой первый мультфильм и оживить рисунки!
            </p>
            <button
              type="button"
              onClick={() => {
                playPop();
                setIsCreateOpen(true);
              }}
              className="btn-kid bg-yellow-400 hover:bg-yellow-300 text-black px-8 py-3.5 text-lg font-black flex items-center gap-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
              <span>Создать первый мультик</span>
            </button>
          </div>
        ) : (
          /* Projects Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isMenuOpen={openMenuProjectId === project.id}
                onOpen={(id) => {
                  playAction();
                  onOpenProject(id);
                }}
                onRename={(p) => setRenamingProject(p)}
                onDuplicate={handleDuplicate}
                onDelete={(p) => setDeletingProject(p)}
                onToggleMenu={(id) =>
                  setOpenMenuProjectId((prev) => (prev === id ? null : id))
                }
                onCloseMenu={() => setOpenMenuProjectId(null)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />

      <RenameProjectModal
        project={renamingProject}
        isOpen={Boolean(renamingProject)}
        onClose={() => setRenamingProject(null)}
        onRename={handleRename}
      />

      <DeleteProjectModal
        project={deletingProject}
        isOpen={Boolean(deletingProject)}
        onClose={() => setDeletingProject(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

