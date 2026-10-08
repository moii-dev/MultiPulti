import type { Dispatch, PointerEvent, RefObject, SetStateAction } from "react";
import { Check, Palette, Pipette, Star, Trash, X } from "lucide-react";
import { BASIC_COLORS, STICKERS, TEMPLATES } from "../constants/editor";
import type { EditorContextMenu } from "../types/editor";
import { cn } from "../utils/cn";

interface TemplatePickerProps {
  isOpen: boolean;
  activeTemplate: string | null;
  onSelect: (template: string | null) => void;
  onClose: () => void;
}

export function TemplatePicker({ isOpen, activeTemplate, onSelect, onClose }: TemplatePickerProps) {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-picker-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-2xl border-4 sm:border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 id="template-picker-title" className="text-xl sm:text-2xl font-black uppercase text-black">
            Выбери шаблон
          </h2>
          <button className="btn-kid p-2 text-red-500" onClick={onClose} aria-label="Закрыть выбор шаблонов" title="Закрыть">
            <X className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <TemplateButton active={activeTemplate === null} icon="❌" label="Без шаблона" mutedIcon onClick={() => onSelect(null)} />
          {TEMPLATES.map((template) => <TemplateButton key={template.id} active={activeTemplate === template.id} icon={template.icon} label={template.label} onClick={() => onSelect(template.id)} />)}
        </div>
      </div>
    </div>
  );
}

function TemplateButton({ active, icon, label, mutedIcon = false, onClick }: { key?: string; active: boolean; icon: string; label: string; mutedIcon?: boolean; onClick: () => void }) {
  return <button className={cn("flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-4 transition-all hover:scale-105", active ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300")} onClick={onClick} aria-label={`Шаблон: ${label}`}><div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-2xl", mutedIcon ? "bg-gray-100" : "bg-blue-100")}>{icon}</div><span className="font-bold text-sm">{label}</span></button>;
}

interface StickerPickerProps {
  isOpen: boolean;
  selectedSticker: string;
  onSelect: (sticker: string) => void;
  onClose: () => void;
}

export function StickerPicker({ isOpen, selectedSticker, onSelect, onClose }: StickerPickerProps) {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-picker-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-2xl border-4 sm:border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 id="sticker-picker-title" className="text-xl sm:text-2xl font-black uppercase text-black">
            Выбери стикер
          </h2>
          <button className="btn-kid p-2 text-red-500" onClick={onClose} aria-label="Закрыть выбор стикеров" title="Закрыть">
            <X className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 flex flex-col gap-6 pr-2">
          {STICKERS.map((group) => (
            <div key={group.category}>
              <h3 className="text-lg sm:text-xl font-bold mb-3 text-gray-700 border-b-4 border-gray-200 pb-1">
                {group.category}
              </h3>
              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                {group.items.map((emoji) => (
                  <button
                    key={emoji}
                    className={cn(
                      "text-3xl sm:text-4xl hover:scale-110 transition-transform p-2 rounded-xl hover:bg-gray-100 flex items-center justify-center aspect-square",
                      selectedSticker === emoji && "bg-blue-100 ring-4 ring-blue-500",
                    )}
                    onClick={() => onSelect(emoji)}
                    aria-label={`Выбрать стикер ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ColorPickerProps {
  isOpen: boolean;
  color: string;
  favoriteColors: string[];
  recentColors: string[];
  hue: number;
  saturation: number;
  value: number;
  squareRef: RefObject<HTMLDivElement | null>;
  setHue: Dispatch<SetStateAction<number>>;
  setSaturation: Dispatch<SetStateAction<number>>;
  setValue: Dispatch<SetStateAction<number>>;
  toHex: (hue: number, saturation: number, value: number) => string;
  onSelectColor: (color: string) => void;
  onConfirmColor: (color: string) => void;
  onToggleFavorite: (color: string) => void;
  onActivatePipette: () => void;
  onClose: () => void;
}

export function ColorPickerModal(props: ColorPickerProps) {
  if (!props.isOpen) return null;
  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const square = props.squareRef.current;
    if (!square) return;
    const rect = square.getBoundingClientRect();
    props.setSaturation(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)));
    props.setValue(Math.max(0, Math.min(100, 100 - ((event.clientY - rect.top) / rect.height) * 100)));
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="color-picker-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="bg-white rounded-3xl p-4 sm:p-6 w-full max-w-3xl border-4 sm:border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 sm:mb-6 shrink-0">
          <h2 id="color-picker-title" className="text-xl sm:text-2xl font-black uppercase text-black flex items-center gap-2">
            <Palette className="w-6 h-6 sm:w-8 sm:h-8 text-pink-500" /> Палитра цветов
          </h2>
          <button className="btn-kid p-2 text-red-500" onClick={props.onClose} aria-label="Закрыть палитру цветов" title="Закрыть">
            <X className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6 overflow-y-auto pr-1 sm:pr-2">
          <div className="flex-1 flex flex-col gap-4 sm:gap-6">
            <div className="flex items-center gap-4 bg-gray-100 p-3 sm:p-4 rounded-2xl border-4 border-gray-200">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 border-black shadow-md shrink-0" style={{ backgroundColor: props.color }} />
              <div className="flex-1"><div className="text-base sm:text-lg font-bold">Текущий цвет</div></div>
              <button className="btn-kid p-2 sm:p-3 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors" onClick={props.onActivatePipette} title="Взять цвет с рисунка" aria-label="Пипетка (выбрать цвет с холста)"><Pipette className="w-6 h-6 sm:w-8 sm:h-8" /></button>
              <button className={cn("btn-kid p-2 sm:p-3 transition-colors", props.favoriteColors.includes(props.color) ? "text-yellow-500 bg-yellow-50 border-yellow-400" : "text-gray-400")} onClick={() => props.onToggleFavorite(props.color)} title="В любимые" aria-label={props.favoriteColors.includes(props.color) ? "Удалить из любимых цветов" : "Добавить в любимые цвета"}><Star className={cn("w-6 h-6 sm:w-8 sm:h-8", props.favoriteColors.includes(props.color) && "fill-current")} /></button>
            </div>
            {props.favoriteColors.length > 0 && <ColorGroup title="Любимые цвета" colors={props.favoriteColors} onSelect={props.onSelectColor} favorite />}
            {props.recentColors.length > 0 && <ColorGroup title="Недавние" colors={props.recentColors} onSelect={props.onSelectColor} />}
            <ColorGroup title="Основные" colors={BASIC_COLORS.map((item) => item.hex)} colorNames={Object.fromEntries(BASIC_COLORS.map((item) => [item.hex, item.name]))} onSelect={props.onSelectColor} />
          </div>
          <div className="flex-1 flex flex-col gap-3 sm:gap-4 bg-blue-50 p-4 sm:p-6 rounded-3xl border-4 border-blue-200">
            <h3 className="text-lg sm:text-xl font-bold text-center text-blue-800">Создать свой цвет</h3>
            <div ref={props.squareRef} className="w-full aspect-square rounded-2xl border-4 border-black relative touch-none cursor-crosshair overflow-hidden shadow-inner" style={{ backgroundColor: `hsl(${props.hue}, 100%, 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateFromPointer(event); }} onPointerMove={(event) => { if (event.buttons > 0) updateFromPointer(event); }}>
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, #fff, transparent)" }} /><div className="absolute inset-0" style={{ background: "linear-gradient(to top, #000, transparent)" }} />
              <div className="absolute w-6 h-6 border-4 border-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${props.saturation}%`, top: `${100 - props.value}%`, backgroundColor: props.toHex(props.hue, props.saturation, props.value) }} />
            </div>
            <div className="flex flex-col gap-1 sm:gap-2 mt-1 sm:mt-2"><label className="text-xs sm:text-sm font-bold text-gray-600 uppercase tracking-wider">Радуга</label><input type="range" min="0" max="360" value={props.hue} onChange={(event) => props.setHue(Number(event.target.value))} className="color-slider w-full h-8 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)" }} aria-label="Выбрать оттенок цвета" /></div>
            <button className="btn-kid !bg-green-500 hover:!bg-green-400 text-white py-3 sm:py-4 mt-2 sm:mt-4 text-lg sm:text-xl flex items-center justify-center gap-2" onClick={() => props.onConfirmColor(props.toHex(props.hue, props.saturation, props.value))} aria-label="Выбрать созданный цвет"><Check className="w-6 h-6 sm:w-8 sm:h-8" /> Выбрать</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorGroup({ title, colors, colorNames, onSelect, favorite = false }: { title: string; colors: readonly string[]; colorNames?: Record<string, string>; onSelect: (color: string) => void; favorite?: boolean }) {
  return <div><h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3 flex items-center gap-2 text-gray-700">{favorite && <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />}{title}</h3><div className="flex flex-wrap gap-2 sm:gap-3">{colors.map((color, index) => <button key={`${color}-${index}`} title={colorNames?.[color]} aria-label={colorNames?.[color] ?? `Цвет ${color}`} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-3 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all" style={{ backgroundColor: color }} onClick={() => onSelect(color)} />)}</div></div>;
}

export function SelectionContextMenu({ menu, onDelete }: { menu: EditorContextMenu | null; onDelete: (target: EditorContextMenu["target"]) => void }) {
  if (!menu) return null;
  return (
    <div
      role="menu"
      className="fixed z-50 bg-white border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        role="menuitem"
        className="px-6 py-3 font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors focus:outline-none"
        onClick={() => onDelete(menu.target)}
        aria-label="Удалить объект"
      >
        <Trash className="w-5 h-5" /> Удалить
      </button>
    </div>
  );
}
