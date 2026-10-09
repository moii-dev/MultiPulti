import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { X, Sparkles, Pencil, Trash2 } from "lucide-react";
import { DEFAULT_PROJECT_TITLE, MAX_PROJECT_TITLE_LENGTH } from "../domain/project";
import type { ProjectSummary } from "../types/editor";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}

export function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
  const [title, setTitle] = useState(DEFAULT_PROJECT_TITLE);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(DEFAULT_PROJECT_TITLE);
      setError(null);
      setIsSubmitting(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Название не может быть пустым");
      inputRef.current?.focus();
      return;
    }
    if (cleanTitle.length > MAX_PROJECT_TITLE_LENGTH) {
      setError(`Название не может быть длиннее ${MAX_PROJECT_TITLE_LENGTH} символов`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreate(cleanTitle);
    } catch (err) {
      console.error("Ошибка при создании мультика:", err);
      setError(err instanceof Error ? err.message : "Не удалось создать мультик");
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (!isSubmitting) onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-md border-4 sm:border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5 shrink-0">
          <h2 id="create-project-title" className="text-xl sm:text-2xl font-black uppercase text-black flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-500 fill-yellow-400" /> Новый мультик
          </h2>
          <button
            className="btn-kid p-2 text-red-500"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Закрыть окно создания мультика"
            title="Закрыть"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="create-project-input" className="text-sm font-bold text-gray-700">
            Как назовём твой мультик?
          </label>
          <input
            id="create-project-input"
            ref={inputRef}
            type="text"
            value={title}
            maxLength={MAX_PROJECT_TITLE_LENGTH}
            disabled={isSubmitting}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Название мультика"
            className="w-full bg-yellow-50 border-4 border-black rounded-2xl px-4 py-3 font-bold text-base sm:text-lg text-black focus:outline-none focus:ring-4 focus:ring-yellow-300 placeholder:text-gray-400"
          />
          <div className="flex justify-between items-center px-1">
            {error ? (
              <p role="alert" className="text-xs sm:text-sm font-bold text-red-600">
                {error}
              </p>
            ) : (
              <span />
            )}
            <span className="text-xs font-bold text-gray-500 shrink-0">
              {title.length}/{MAX_PROJECT_TITLE_LENGTH}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-kid px-4 py-2 sm:px-6 sm:py-2.5 font-bold text-gray-700 text-sm sm:text-base"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="btn-kid bg-yellow-400 hover:bg-yellow-300 text-black px-5 py-2 sm:px-7 sm:py-2.5 font-black text-sm sm:text-base disabled:opacity-50"
          >
            {isSubmitting ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RenameProjectModalProps {
  project: ProjectSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
}

export function RenameProjectModal({ project, isOpen, onClose, onRename }: RenameProjectModalProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && project) {
      setTitle(project.title);
      setError(null);
      setIsSubmitting(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Название не может быть пустым");
      inputRef.current?.focus();
      return;
    }
    if (cleanTitle.length > MAX_PROJECT_TITLE_LENGTH) {
      setError(`Название не может быть длиннее ${MAX_PROJECT_TITLE_LENGTH} символов`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onRename(project.id, cleanTitle);
      onClose();
    } catch (err) {
      console.error("Ошибка при переименовании мультика:", err);
      setError(err instanceof Error ? err.message : "Не удалось переименовать мультик");
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (!isSubmitting) onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-md border-4 sm:border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5 shrink-0">
          <h2 id="rename-project-title" className="text-xl sm:text-2xl font-black uppercase text-black flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-500" /> Переименовать
          </h2>
          <button
            className="btn-kid p-2 text-red-500"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Закрыть окно переименования"
            title="Закрыть"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="rename-project-input" className="text-sm font-bold text-gray-700">
            Новое название:
          </label>
          <input
            id="rename-project-input"
            ref={inputRef}
            type="text"
            value={title}
            maxLength={MAX_PROJECT_TITLE_LENGTH}
            disabled={isSubmitting}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Название мультика"
            className="w-full bg-blue-50 border-4 border-black rounded-2xl px-4 py-3 font-bold text-base sm:text-lg text-black focus:outline-none focus:ring-4 focus:ring-blue-300 placeholder:text-gray-400"
          />
          <div className="flex justify-between items-center px-1">
            {error ? (
              <p role="alert" className="text-xs sm:text-sm font-bold text-red-600">
                {error}
              </p>
            ) : (
              <span />
            )}
            <span className="text-xs font-bold text-gray-500 shrink-0">
              {title.length}/{MAX_PROJECT_TITLE_LENGTH}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-kid px-4 py-2 sm:px-6 sm:py-2.5 font-bold text-gray-700 text-sm sm:text-base"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="btn-kid bg-blue-400 hover:bg-blue-300 text-black px-5 py-2 sm:px-7 sm:py-2.5 font-black text-sm sm:text-base disabled:opacity-50"
          >
            {isSubmitting ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteProjectModalProps {
  project: ProjectSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}

export function DeleteProjectModal({ project, isOpen, onClose, onConfirm }: DeleteProjectModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !isSubmitting && project) {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!isOpen || !project) return null;

  const handleDelete = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(project.id);
      onClose();
    } catch (err) {
      console.error("Ошибка при удалении мультика:", err);
      setError(err instanceof Error ? err.message : "Не удалось удалить мультик");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-md border-4 sm:border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 id="delete-project-title" className="text-xl sm:text-2xl font-black uppercase text-red-600 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-red-500" /> Удалить «{project.title}»?
          </h2>
          <button
            className="btn-kid p-2 text-gray-500"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Закрыть окно подтверждения удаления"
            title="Закрыть"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <p className="text-base sm:text-lg font-bold text-gray-700 mb-2">
          Этот мультик будет удалён.
        </p>

        {error && (
          <p role="alert" className="text-sm font-bold text-red-600 mb-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-kid px-4 py-2 sm:px-6 sm:py-2.5 font-bold text-gray-700 text-sm sm:text-base"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="btn-kid bg-red-500 hover:bg-red-600 text-white px-5 py-2 sm:px-7 sm:py-2.5 font-black text-sm sm:text-base disabled:opacity-50"
          >
            {isSubmitting ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

