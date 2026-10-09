import { useEffect, useRef, useState } from 'react';
import { BookTemplate, Check, FlipHorizontal, Palette, Settings, Smile, Wand2, X } from "lucide-react";
import { AVAILABLE_FONTS, BASIC_COLORS, BRUSH_SIZES, SHAPES, TOOLS, type FontName } from "../constants/editor";
import type { ActiveSelection, ActiveSticker, ActiveText, ShapeId, ToolId } from "../types/editor";
import { cn } from "../utils/cn";

interface ToolSettingsPanelProps {
  tool: ToolId;
  activeSelection: ActiveSelection | null;
  activeText: ActiveText | null;
  activeSticker: ActiveSticker | null;
  customHue: number;
  color: string;
  selectedShape: ShapeId;
  brushSize: number;
  selectedFont: FontName;
  textInput: string;
  assistMode: boolean;
  symmetryMode: boolean;
  activeTemplate: string | null;
  selectedSticker: string;
  onScaleSelection: (factor: number) => void;
  onFlipSelection: () => void;
  onSelectionHueChange: (hue: number) => void;
  onSelectionColorChange: (color: string) => void;
  onShapeChange: (shape: ShapeId) => void;
  onBrushSizeChange: (size: number) => void;
  onTextChange: (text: string) => void;
  onFontChange: (font: FontName) => void;
  onToggleAssist: () => void;
  onToggleSymmetry: () => void;
  onOpenTemplates: () => void;
  onOpenColors: () => void;
  onColorChange: (color: string) => void;
  onOpenStickers: () => void;
  onFinalizeSticker: () => void;
  onCancelSticker: () => void;
}

export function ToolSettingsPanel(props: ToolSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);
  const content = <>
      <div className="bg-white py-3 sm:py-4 px-3 sm:px-4 border-b-4 border-black mb-3 sm:mb-4 sticky top-0 z-10 shadow-sm flex items-center justify-between">
        <span className="font-black text-base sm:text-lg uppercase tracking-wider text-black">
          {props.tool === "pipette" ? "Цвет" : TOOLS.find((option) => option.id === props.tool)?.label}
        </span>
      </div>
      <div className="flex flex-col gap-6 px-3">
        {props.tool === "select" && (
          <div className="flex flex-col gap-6">
            {!props.activeSelection && !props.activeText ? (
              <div className="text-center text-sm font-bold text-gray-500 mt-4 px-2">Нажми на штрих или обведи весь предмет рамкой, затем перетащи.</div>
            ) : props.activeSelection && !props.activeText ? (
              <>
                <div className="flex flex-col gap-3">
                  <SettingsLabel>Размер</SettingsLabel>
                  <div className="flex justify-center gap-4">
                    <button className="btn-kid p-3 text-2xl font-black w-14 h-14" onClick={() => props.onScaleSelection(0.9)} title="Уменьшить" aria-label="Уменьшить выделенный объект">-</button>
                    <button className="btn-kid p-3 text-2xl font-black w-14 h-14" onClick={() => props.onScaleSelection(1.1)} title="Увеличить" aria-label="Увеличить выделенный объект">+</button>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <SettingsLabel>Отразить</SettingsLabel>
                  <div className="flex justify-center gap-4">
                    <button className="btn-kid p-3 flex items-center justify-center text-blue-600 w-14 h-14" onClick={props.onFlipSelection} title="По горизонтали" aria-label="Отразить объект по горизонтали">
                      <FlipHorizontal className="w-8 h-8" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-3 items-center">
                  <SettingsLabel>Перекрасить (Свой цвет)</SettingsLabel>
                  <div className="w-full px-2 mb-2">
                    <input type="range" min="0" max="360" value={props.customHue} onChange={(event) => props.onSelectionHueChange(Number(event.target.value))} className="color-slider w-full h-8 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none" style={{ background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)" }} aria-label="Выбрать оттенок цвета" />
                  </div>
                  <div className="grid grid-cols-4 gap-2 w-full px-2">
                    {BASIC_COLORS.map((item) => (
                      <button key={item.hex} className="w-full aspect-square rounded-full border-4 border-black hover:-translate-y-1 transition-transform" style={{ backgroundColor: item.hex }} onClick={() => props.onSelectionColorChange(item.hex)} aria-label={item.name} title={item.name} />
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
        {props.tool === "shape" && (
          <div className="flex flex-col gap-3">
            <SettingsLabel>Выбери фигуру</SettingsLabel>
            <div className="grid grid-cols-2 gap-2">
              {SHAPES.map((shape) => (
                <button key={shape.id} className={cn("btn-kid min-h-16 p-2 flex flex-col items-center justify-center gap-1", props.selectedShape === shape.id && "btn-kid-active ring-2 ring-blue-500")} onClick={() => props.onShapeChange(shape.id)} title={shape.label} aria-label={shape.label}>
                  <shape.icon className="w-7 h-7" />
                  <span className="text-[9px] font-black leading-none">{shape.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {["brush", "eraser", "shape"].includes(props.tool) && (
          <div className="flex flex-col gap-3">
            <SettingsLabel>Толщина</SettingsLabel>
            <div className="flex flex-wrap gap-2 justify-center">
              {BRUSH_SIZES.map((size) => (
                <button key={size.id} className={cn("btn-kid p-2 rounded-2xl w-14 h-14 flex items-center justify-center", props.brushSize === size.size && "btn-kid-active ring-2 ring-blue-500")} onClick={() => props.onBrushSizeChange(size.size)} title={`Толщина: ${size.label}`} aria-label={`Толщина: ${size.label}`}>
                  <div className="bg-black rounded-full" style={{ width: size.size, height: size.size }} />
                </button>
              ))}
            </div>
          </div>
        )}
        {(props.tool === "text" || (props.tool === "select" && props.activeText)) && (
          <div className="flex flex-col gap-3">
            <SettingsLabel>Текст</SettingsLabel>
            <div className="px-2">
              <textarea value={props.activeText?.text ?? props.textInput} onChange={(event) => props.onTextChange(event.target.value)} className="w-full h-24 p-2 rounded-xl border-4 border-black font-bold outline-none resize-none" placeholder="Введи текст..." aria-label="Текст надписи" />
            </div>
            <SettingsLabel>Шрифт</SettingsLabel>
            <div className="flex flex-col gap-2">
              {AVAILABLE_FONTS.map((font) => (
                <button key={font} className={cn("btn-kid p-3 font-bold text-lg text-left", props.selectedFont === font && "btn-kid-active ring-2 ring-blue-500")} style={{ fontFamily: font }} onClick={() => props.onFontChange(font)} aria-label={`Шрифт ${font}`}>
                  Aa Бб Вв
                </button>
              ))}
            </div>
          </div>
        )}
        {["brush", "eraser"].includes(props.tool) && (
          <div className="flex flex-col gap-3">
            <SettingsLabel>Магия</SettingsLabel>
            <div className="flex flex-col gap-2">
              {props.tool === "brush" && (
                <button className={cn("btn-kid p-3 flex items-center justify-start gap-3 w-full", props.assistMode && "bg-purple-100 border-purple-400 text-purple-600")} onClick={props.onToggleAssist} title="Умный помощник (сглаживание и ровные фигуры)" aria-label="Умный контур (сглаживание и фигуры)">
                  <Wand2 className="w-6 h-6 shrink-0" />
                  <span className="text-xs font-bold leading-none text-left whitespace-nowrap">Умный контур</span>
                </button>
              )}
              <button className={cn("btn-kid p-3 flex items-center justify-start gap-3 w-full", props.symmetryMode && "bg-blue-100 border-blue-400 text-blue-600")} onClick={props.onToggleSymmetry} title="Симметричное рисование" aria-label="Симметричное рисование">
                <FlipHorizontal className="w-6 h-6 shrink-0" />
                <span className="text-xs font-bold leading-none text-left">Симметрия</span>
              </button>
              <button className={cn("btn-kid p-3 flex items-center justify-start gap-3 w-full", props.activeTemplate && "bg-green-100 border-green-400 text-green-600")} onClick={() => { setOpen(false); props.onOpenTemplates(); }} title="Шаблоны для обводки" aria-label="Шаблоны для обводки">
                <BookTemplate className="w-6 h-6 shrink-0" />
                <span className="text-xs font-bold leading-none text-left">Шаблоны</span>
              </button>
            </div>
          </div>
        )}
        {["brush", "eraser", "text"].includes(props.tool) && <hr className="border-2 border-gray-200 rounded-full opacity-50" />}
        {(["brush", "fill", "shape", "text"].includes(props.tool) || (props.tool === "select" && props.activeText)) && (
          <div className="flex flex-col gap-3 items-center">
            <SettingsLabel>Цвет</SettingsLabel>
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center transition-colors" style={{ backgroundColor: props.color }} />
              <button className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 border-4 border-black shadow-sm hover:scale-110 active:scale-95 transition-transform" onClick={() => { setOpen(false); props.onOpenColors(); }} title="Больше цветов" aria-label="Открыть полную палитру цветов">
                <Palette className="w-5 h-5 text-pink-500" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 w-full">
              {BASIC_COLORS.map((item) => (
                <button key={item.hex} title={item.name} aria-label={item.name} className={cn("w-full aspect-square rounded-full border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all", props.color === item.hex && "scale-110 shadow-none translate-y-[2px] ring-4 ring-blue-400 ring-offset-2")} style={{ backgroundColor: item.hex }} onClick={() => props.onColorChange(item.hex)} />
              ))}
            </div>
          </div>
        )}
        {props.tool === "sticker" && (
          <div className="flex flex-col items-center gap-3">
            <SettingsLabel>Выбран</SettingsLabel>
            <button className="text-6xl hover:scale-110 transition-transform p-4 rounded-3xl bg-white border-4 border-blue-200 w-full flex justify-center shadow-sm" onClick={() => { setOpen(false); props.onOpenStickers(); }} title="Выбрать другой стикер" aria-label={`Выбран стикер ${props.selectedSticker}. Нажми для выбора другого`}>
              {props.selectedSticker}
            </button>
            <button className="btn-kid w-full py-3 bg-blue-100 flex gap-2 justify-center mt-2" onClick={() => { setOpen(false); props.onOpenStickers(); }} aria-label="Выбрать другой стикер">
              <Smile className="w-5 h-5" /> Изменить
            </button>
            {props.activeSticker && (
              <div className="flex flex-col gap-2 w-full mt-4">
                <button className="btn-kid !bg-green-500 hover:!bg-green-400 text-white py-3 flex justify-center items-center gap-2 text-lg" onClick={props.onFinalizeSticker} aria-label="Подтвердить стикер">
                  <Check className="w-6 h-6" /> ОК
                </button>
                <button className="btn-kid !bg-red-500 hover:!bg-red-400 text-white py-3 flex justify-center items-center gap-2 text-lg" onClick={props.onCancelSticker} aria-label="Отменить стикер">
                  <X className="w-6 h-6" /> Отмена
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>;
  return <>
    <button type="button" className="btn-kid absolute top-2 right-2 z-30 md:hidden px-3 py-2 text-sm gap-2" onClick={() => setOpen(true)} aria-label="Настройки инструмента"><Settings className="w-5 h-5" />Настройки</button>
    <aside className="bg-blue-50/50 hidden md:flex flex-col pt-0 pb-6 overflow-y-auto no-scrollbar shrink-0 z-30 w-60">{content}</aside>
    <dialog ref={dialog} className="tool-settings-dialog" aria-label="Настройки инструмента" onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <button type="button" className="btn-kid p-2 ml-auto mb-2" aria-label="Закрыть настройки" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
      <div>{content}</div>
    </dialog>
  </>;
}

function SettingsLabel({ children }: { children: string }) {
  return <div className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wider">{children}</div>;
}
