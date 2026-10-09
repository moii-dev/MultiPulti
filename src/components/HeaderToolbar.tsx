import type { ChangeEvent, RefObject } from "react";
import { ArrowLeft, Download, Image as ImageIcon, Redo, Save, Trash, Undo } from "lucide-react";

interface HeaderToolbarProps {
  logoUrl: string;
  projectTitle?: string;
  onBackToHome?: () => void;
  historyIndex: number;
  historyLength: number;
  isPlaying: boolean;
  isExporting: boolean;
  exportProgress?: { current: number; total: number } | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUndo: () => void;
  onRedo: () => void;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onSavePng: () => void;
  onSaveGif: () => void;
}

export function HeaderToolbar({
  logoUrl,
  projectTitle,
  onBackToHome,
  historyIndex,
  historyLength,
  isPlaying,
  isExporting,
  exportProgress,
  fileInputRef,
  onUndo,
  onRedo,
  onImageUpload,
  onClear,
  onSavePng,
  onSaveGif,
}: HeaderToolbarProps) {
  return (
    <header className="min-h-14 lg:h-16 bg-white border-b-4 border-black flex flex-wrap lg:flex-nowrap gap-2 items-center justify-between px-2 sm:px-4 py-2 lg:py-0 shrink-0 z-10 shadow-sm">
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            className="btn-kid p-1.5 sm:p-2 px-2 sm:px-3 text-black flex items-center gap-1 text-xs sm:text-sm font-black mr-0.5 sm:mr-1"
            title="Все мультики"
            aria-label="Вернуться ко всем мультикам"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 stroke-[3]" />
            <span className="hidden md:inline">Мультики</span>
          </button>
        )}
        <div
          className={`flex items-center gap-2 ${onBackToHome ? "cursor-pointer" : ""}`}
          onClick={onBackToHome}
          title={onBackToHome ? "Все мультики" : undefined}
        >
          <img
            src={logoUrl}
            alt="Логотип Мульти-Пульти"
            className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl border-2 sm:border-4 border-black object-cover shadow-sm"
          />
          <div className="hidden sm:flex flex-col">
            <h1
              className="text-base sm:text-lg font-black tracking-wider text-black uppercase leading-tight"
              style={{ WebkitTextStroke: "1px white" }}
            >
              Мульти-Пульти
            </h1>
            {projectTitle && (
              <span
                className="text-xs font-bold text-gray-500 truncate max-w-[120px] md:max-w-[200px]"
                title={projectTitle}
              >
                {projectTitle}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          className="btn-kid p-1.5 sm:p-2 text-blue-600"
          onClick={onUndo}
          disabled={historyIndex === 0 || isPlaying}
          title="Отменить"
          aria-label="Отменить последнее действие"
        >
          <Undo className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <button
          className="btn-kid p-1.5 sm:p-2 text-blue-600"
          onClick={onRedo}
          disabled={historyIndex === historyLength - 1 || isPlaying}
          title="Повторить"
          aria-label="Повторить отменённое действие"
        >
          <Redo className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <div className="w-0.5 sm:w-1 h-6 sm:h-8 bg-gray-300 mx-0.5 sm:mx-1 rounded-full" />
        <button
          className="btn-kid p-1.5 sm:p-2 text-green-600"
          onClick={() => fileInputRef.current?.click()}
          title="Загрузить картинку"
          aria-label="Загрузить картинку"
        >
          <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload} />
        <button
          className="btn-kid p-1.5 sm:p-2 text-red-600"
          onClick={onClear}
          title="Очистить холст"
          aria-label="Очистить холст"
        >
          <Trash className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <button
          className="btn-kid p-1.5 sm:p-2 text-purple-600"
          onClick={onSavePng}
          title="Сохранить картинку"
          aria-label="Сохранить картинку в формате PNG"
        >
          <Download className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <button
          className="btn-kid p-1.5 sm:p-2 px-2.5 sm:px-4 text-pink-600 flex items-center gap-1 sm:gap-2"
          onClick={onSaveGif}
          disabled={isExporting}
          title="Сохранить мультик в GIF"
          aria-label="Сохранить мультик в GIF"
        >
          {isExporting ? (
            <span className="animate-pulse text-xs sm:text-sm font-black">
              {exportProgress && exportProgress.total > 0
                ? `${Math.round((exportProgress.current / exportProgress.total) * 100)}%`
                : "⏳..."}
            </span>
          ) : (
            <>
              <Save className="w-5 h-5 sm:w-6 sm:h-6" /> <span className="hidden sm:inline">GIF</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

