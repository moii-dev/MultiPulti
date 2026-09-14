import type { ChangeEvent, RefObject } from "react";
import { Download, Image as ImageIcon, Redo, Save, Trash, Undo } from "lucide-react";

interface HeaderToolbarProps {
  logoUrl: string;
  historyIndex: number;
  historyLength: number;
  isPlaying: boolean;
  isExporting: boolean;
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
  historyIndex,
  historyLength,
  isPlaying,
  isExporting,
  fileInputRef,
  onUndo,
  onRedo,
  onImageUpload,
  onClear,
  onSavePng,
  onSaveGif,
}: HeaderToolbarProps) {
  return (
    <header className="h-16 bg-white border-b-4 border-black flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
      <div className="flex items-center gap-2">
        <img src={logoUrl} alt="Мульти-Пульти" className="h-12 w-12 rounded-2xl border-4 border-black object-cover shadow-sm" />
        <h1 className="text-xl font-black tracking-wider text-black uppercase hidden sm:block" style={{ WebkitTextStroke: "1px white" }}>
          Мульти-Пульти
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-kid p-2 text-blue-600" onClick={onUndo} disabled={historyIndex === 0 || isPlaying} title="Отменить">
          <Undo className="w-6 h-6" />
        </button>
        <button className="btn-kid p-2 text-blue-600" onClick={onRedo} disabled={historyIndex === historyLength - 1 || isPlaying} title="Повторить">
          <Redo className="w-6 h-6" />
        </button>
        <div className="w-1 h-8 bg-gray-300 mx-1 rounded-full" />
        <button className="btn-kid p-2 text-green-600" onClick={() => fileInputRef.current?.click()} title="Загрузить картинку">
          <ImageIcon className="w-6 h-6" />
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload} />
        <button className="btn-kid p-2 text-red-600" onClick={onClear} title="Очистить холст">
          <Trash className="w-6 h-6" />
        </button>
        <button className="btn-kid p-2 text-purple-600" onClick={onSavePng} title="Сохранить картинку">
          <Download className="w-6 h-6" />
        </button>
        <button className="btn-kid p-2 px-4 text-pink-600 flex items-center gap-2" onClick={onSaveGif} disabled={isExporting}>
          {isExporting ? <span className="animate-pulse">⏳...</span> : <><Save className="w-6 h-6" />{" "}<span className="hidden sm:inline">GIF</span></>}
        </button>
      </div>
    </header>
  );
}

