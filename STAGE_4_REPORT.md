# Stage 4 report

## Что вынесено из App.tsx

В рамках этапа 4 проведена декомпозиция монолитного `App.tsx` (1650 строк). Код разделён на самостоятельные предметные области (домены) без создания единого «god-hook»:

1. **[`useSelection`](file:///c:/Users/MOII/source/repos/MultiPulti/src/hooks/useSelection.ts)**:
   - Хранение и жизненный цикл активного растрового выделения (`activeSelection`).
   - Операции трансформации: масштабирование (`scaleSelection`), горизонтальное отражение (`flipSelection`), перекрашивание (`tintSelection`).
   - Удаление и сброс выделения (`deleteSelection`, `clearSelection`).
   - Коммит изменений выделения в растровый слой кадра (`commitSelectionChange`).

2. **[`useTextTool`](file:///c:/Users/MOII/source/repos/MultiPulti/src/hooks/useTextTool.ts)**:
   - Состояние текстового инструмента: `activeText`, `textInput`, `selectedFont`.
   - Коммит текста в семантические объекты кадра (`commitTextChange`).
   - Удаление и сброс текстового объекта (`deleteText`, `clearText`).

3. **[`useStickerTool`](file:///c:/Users/MOII/source/repos/MultiPulti/src/hooks/useStickerTool.ts)**:
   - Состояние инструмента стикеров: `activeSticker`, `selectedSticker`.
   - Коммит стикера в семантические объекты кадра (`commitStickerChange`).
   - Удаление и сброс стикера (`deleteSticker`, `clearSticker`).

4. **[`useFrames`](file:///c:/Users/MOII/source/repos/MultiPulti/src/hooks/useFrames.ts)**:
   - CRUD-операции над кадрами: добавление пустого кадра (`addFrame`), дублирование (`copyFrame`), удаление (`deleteFrame`), очистка (`clearCanvas`).
   - Перестановка кадров таймлайна (drag-and-drop: `handleDragStart`, `handleDragOver`, `handleDrop`, `handleDragEnd`).
   - Синхронизация растровых слоёв и объектов с `mainCanvas` и `baseCanvas` через асинхронный loader с защитой от гонок и отменой устаревших запросов.
   - Кеширование и prune растровых слоёв кадра.
   - Экспорт в PNG/GIF (`savePng`, `saveGif`) и импорт изображения (`handleImageUpload`).

5. **[`useCanvasDrawing`](file:///c:/Users/MOII/source/repos/MultiPulti/src/hooks/useCanvasDrawing.ts)**:
   - Полный жизненный цикл указателя (pointer events): `handlePointerDown`, `handlePointerMove`, `handlePointerUp`, `handlePointerCancel`, `handleLostPointerCapture`.
   - Обработка жестов инструментов: кисть (сглаживание, умный контур, зеркалирование), ластик (с возможностью полного отката), фигуры, заливка, пипетка.
   - Обработка жестов выделения (click select, rect select, drag), текста и стикера (move, resize).
   - Отрисовка временного оверлея (`redrawOverlayState`, `clearOverlayCanvas`).
   - Контекстное меню (`handleContextMenu`).

6. **[`pointerLifecycle.ts`](file:///c:/Users/MOII/source/repos/MultiPulti/src/canvas/pointerLifecycle.ts)** и **[`operations.ts`](file:///c:/Users/MOII/source/repos/MultiPulti/src/canvas/operations.ts)**:
   - Чистая машина состояний жестов указателя: `startPointerGesture`, `updatePointerGesture`, `finishPointerGesture`, `cancelPointerGesture`.
   - Чистые функции вычисления экранных координат (`calculateCanvasCoordinates`) и геометрии DOM input текста относительно rendered canvas (`calculateTextInputGeometry`).

---

## Новая структура editor logic

```
src/
├── canvas/
│   ├── frameRenderer.ts         # Композиция кадра, семантический hit-test, кеш растров
│   ├── operations.ts            # Геометрия координат, фигуры, сглаживание, расчет размера текста
│   └── pointerLifecycle.ts      # Чистая машина состояний pointer lifecycle
├── domain/
│   ├── history.ts               # Управление undo/redo историей
│   ├── project.ts               # CRUD кадров и объектов
│   └── transaction.ts           # Резолвер транзакций и pending state
├── hooks/
│   ├── useAnimationPlayback.ts  # Воспроизведение анимации
│   ├── useCanvasDrawing.ts      # Pointer interaction, инструменты рисования, overlay
│   ├── useContentModeration.ts  # Анализ содержимого холста
│   ├── useFrameHistory.ts       # Документ и история кадров
│   ├── useFrames.ts             # Операции над кадрами, синхронизация с Canvas, экспорт/импорт
│   ├── useKeyboardShortcuts.ts  # Глобальные горячие клавиши
│   ├── useProjectLoader.ts      # Загрузка и инициализация проекта
│   ├── useProjectPersistence.ts # Фоновое сохранение проекта в IndexedDB
│   ├── useSelection.ts          # Состояние и трансформации выделения
│   ├── useStickerTool.ts        # Состояние и операции со стикерами
│   └── useTextTool.ts           # Состояние и операции с текстом
├── components/
│   ├── DrawingStage.tsx         # Сцена холста, оверлей, адаптивный DOM text input
│   ├── HeaderToolbar.tsx        # Верхняя панель
│   ├── Timeline.tsx             # Таймлайн кадров
│   ├── ToolsPanel.tsx           # Выбор инструмента
│   ├── ToolSettingsPanel.tsx    # Настройки активного инструмента
│   └── EditorModals.tsx         # Модальные окна (палитра, стикеры, шаблоны, контекстное меню)
└── App.tsx                      # Тонкий координатор между доменами и UI
```

### State ownership:
- **Project state** (`frames`, `history`, `historyIndex`, `currentFrame`): управляется `useFrameHistory` и координируется `useFrames`.
- **UI state** (`tool`, `brushSize`, `color`, `selectedShape`, `assistMode`, `symmetryMode`, `recentColors`, `favoriteColors`, `feedback`): находится в `App.tsx` и передаётся в соответствующие компоненты.
- **Transient tool state** (`isDrawingRef`, `pointsRef`, `isMovingSelectionRef`, `isBoxSelectingRef`, `isMovingTextRef`, `isMovingStickerRef`, `isResizingStickerRef`, `activePointerIdRef`): инкапсулировано внутри `useCanvasDrawing`.
- **Canvas refs** (`mainCanvasRef`, `baseCanvasRef`, `overlayCanvasRef`, `loadedFrameIdRef`): инстанциированы в координаторе `App` и передаются в canvas-хуки.
- **Modal state** (`showColorModal`, `showStickerPanel`, `showTemplatesPanel`, `contextMenu`): управляется координатором `App.tsx`.

---

## Canvas pointer lifecycle

Проведён полный аудит жизненного цикла pointer:
1. **Primary Pointer Isolation**:
   - Отслеживается `activePointerIdRef`. При наличии активного жеста любые события от вторичных касаний/перьев отсекаются, предотвращая конфликт multi-touch и стилуса.
   - Для мыши разрешена только основная кнопка (`button === 0`).
2. **Pointer Capture**:
   - `setPointerCapture(e.pointerId)` вызывается на оверлее при `pointerdown`.
   - `releasePointerCapture(e.pointerId)` безопасно снимается при `pointerup` и `pointercancel`.
   - Добавлен обработчик `onLostPointerCapture` на оверлей холста, вызывающий полный сброс активного жеста.
3. **Безопасная обработка нештатных ситуаций**:
   - **Выход указателя за пределы холста**: захват указателя сохраняет поток событий `pointermove` и `pointerup`; координаты переводятся корректно, рисование естественно клипуется холстом.
   - **Отпускание вне холста**: благодаря `setPointerCapture`, событие `pointerup` доставляется и завершает жест штатно.
   - **Смена инструмента во время жеста**: `handleSetTool` фиксирует незавершённые изменения (`commitPendingChanges`), сбрасывает флаги жеста и переключает инструмент.
   - **Переключение кадра / добавление / удаление**: завершает или отменяет жест, предотвращая утечку активного состояния между кадрами.
   - **Открытие модального окна**: освобождает capture и отменяет жест.
   - **Воспроизведение (Playback)**: полностью блокирует pointerdown и интерактивное редактирование.
   - Ни в одном сценарии редактор не остаётся с `isDrawing = true`, `isMovingSelection = true` или `isBoxSelecting = true`.
4. **Eraser Rollback при Cancel**:
   - В случае отмены жеста ластика (`pointercancel` или `lostpointercapture`), повреждённый растровый слой восстанавливается из `baseCanvasRef` без записи испорченного состояния в кадр.

---

## Selection architecture

- **Click Select**: ищет семантический объект (`hitObject`), активный текст или связную компоненту пикселей (`findConnectedObject`). При клике на пустую область переходит в box select.
- **Box Select**: `isBoxSelectingRef = true`. На оверлее рисуется пунктирный прямоугольник. При `pointerup` вызывается `findObjectInRect` и создаётся `ActiveSelection`.
- **Транзакции и Overlay**:
  - При выделении пиксели извлекаются в `ActiveSelection.canvas`, а исходный битмап сохраняется в `ActiveSelection.originalBitmap`.
  - Временное перемещение и контур отображаются исключительно на слое оверлея (`overlayCanvas`), не мутируя `baseCanvas` до коммита.
  - При отсутствии движения (`hasSelectionChanged = false`) коммит восстанавливает исходный `originalBitmap` без добавления промежуточного пустого кадра в историю.
  - При отмене (`cancelPendingChanges` / `cancelSelection`) восстанавливается `originalBitmap` и перерисовываются объекты кадра.
- **Трансформации**:
  - `scaleSelection`, `flipSelection`, `tintSelection` модифицируют canvas выделения и коммитят новое состояние через `commitSelectionChange`.

---

## Text/sticker architecture

1. **Единая архитектурная модель**:
   - `ActiveText` и `ActiveSticker` хранят `ownerFrameId`, позицию, размер и параметры отображения.
   - До коммита объекты живут в оверлее и изолированы от нижележащего растра кадра.
   - При смене кадра или переключении инструмента `commitPendingChanges` применяет их строго к их `ownerFrameId`.
2. **Адаптивный DOM Text Input**:
   - Устранена рассинхронизация с viewport `vh`.
   - В [`operations.ts`](file:///c:/Users/MOII/source/repos/MultiPulti/src/canvas/operations.ts) добавлена функция `calculateTextInputGeometry`.
   - В [`DrawingStage.tsx`](file:///c:/Users/MOII/source/repos/MultiPulti/src/components/DrawingStage.tsx) реальный размер холста отслеживается через `ResizeObserver`.
   - Размер шрифта DOM `<input>` вычисляется как `Math.round(activeText.size * (renderedCanvasHeight / CANVAS_HEIGHT))px`.
   - В результате вводимый в DOM input текст пиксель-в-пиксель совпадает по размеру и положению с растровой отрисовкой Canvas `fillText`.

---

## Размер App.tsx до/после

| Метрика | До этапа 4 | После этапа 4 | Изменение |
| :--- | :---: | :---: | :---: |
| **Строк в `src/App.tsx`** | **1650** | **484** | **-1166 строк (-70.7%)** |
| Структура | Монолитная реализация всего редактора | Чистый координатор доменных хуков | Модульная архитектура |

---

## Добавленные тесты

В [`scripts/test-canvas-interaction.ts`](file:///c:/Users/MOII/source/repos/MultiPulti/scripts/test-canvas-interaction.ts) добавлено 11 новых тестов:
1. `COORDINATES: 1:1 scale maps client coordinates directly to canvas space`
2. `COORDINATES: CSS scaled down canvas (responsive/mobile) doubles internal coordinates`
3. `COORDINATES: CSS scaled up canvas (large desktop / 4K) halves internal coordinates`
4. `COORDINATES: Degenerate or unmounted rect (0 width or height) returns (0, 0) without NaN or Infinity`
5. `COORDINATES: Pointer coordinates outside rect produce correct signed offsets for canvas clipping`
6. `TEXT GEOMETRY: Visual DOM input font size is derived from rendered canvas rect, NOT viewport vh`
7. `POINTER STATE MACHINE: Single primary pointer starts, tracks and finishes gesture cleanly`
8. `POINTER STATE MACHINE: Gesture cancel or lost pointer capture resets all flags cleanly`
9. `POINTER STATE MACHINE: Eraser gesture cancellation signals rollback requirement`
10. `PENDING CANCELLATION: Switching frame during active gesture isolates frames without corrupting state`
11. `PENDING CANCELLATION: Sticker move during gesture cancel leaves original sticker intact`

Все предыдущие 29 тестов (`test-project.ts`, `test-history.ts`, `test-content-filter.ts`) полностью сохранены и выполняются без ошибок. Общее число тестов: **40**.

---

## Результаты lint/test/build

### 1. `npm run lint` (`tsc --noEmit`)
```
> multi-pulti@0.0.0 lint
> tsc --noEmit
(0 ошибок, код завершения 0)
```

### 2. `npm test`
```
> multi-pulti@0.0.0 test
> tsx scripts/test-content-filter.ts && tsx --test scripts/test-project.ts scripts/test-history.ts scripts/test-canvas-interaction.ts

content filter: safe drawing allowed, aggressive cross blocked
png export: download link configured and triggered
✔ COORDINATES: 1:1 scale maps client coordinates directly to canvas space (2.84ms)
✔ COORDINATES: CSS scaled down canvas (responsive/mobile) doubles internal coordinates (0.31ms)
✔ COORDINATES: CSS scaled up canvas (large desktop / 4K) halves internal coordinates (0.28ms)
✔ COORDINATES: Degenerate or unmounted rect (0 width or height) returns (0, 0) without NaN or Infinity (0.31ms)
✔ COORDINATES: Pointer coordinates outside rect produce correct signed offsets for canvas clipping (0.24ms)
✔ TEXT GEOMETRY: Visual DOM input font size is derived from rendered canvas rect, NOT viewport vh (0.39ms)
✔ POINTER STATE MACHINE: Single primary pointer starts, tracks and finishes gesture cleanly (1.53ms)
✔ POINTER STATE MACHINE: Gesture cancel or lost pointer capture resets all flags cleanly (0.27ms)
✔ POINTER STATE MACHINE: Eraser gesture cancellation signals rollback requirement (0.24ms)
✔ PENDING CANCELLATION: Switching frame during active gesture isolates frames without corrupting state (1.35ms)
✔ PENDING CANCELLATION: Sticker move during gesture cancel leaves original sticker intact (0.31ms)
✔ DRAW: draw -> undo -> redo works as single logical undo steps (2.41ms)
✔ BRANCH: draw A -> draw B -> undo -> draw C -> redo B unavailable (2.02ms)
✔ SELECTION: object at X -> move X to Y -> undo returns X -> redo returns Y (NO intermediate empty frame) (0.49ms)
✔ TEXT: create text -> edit text -> undo -> redo (0.58ms)
✔ FRAME ISOLATION: pending object on frame A -> switch frame B -> object not present in B (0.52ms)
✔ FRAME OPERATIONS: add -> copy -> reorder -> delete -> undo all -> redo all (0.64ms)
✔ PENDING: selection / text / sticker -> switch frame -> correct isolated results (0.59ms)
✔ Frame JSON round trip retains stable IDs, text, sticker and raster layers (3.35ms)
✔ objects of different frames are isolated (0.44ms)
✔ copy frame deeply clones objects and generates new identities (0.37ms)
✔ delete frame deletes its objects, preserves neighbors, guards last frame (0.29ms)
✔ reorder moves the whole frame by identity (0.35ms)
✔ editing an object retains paint order (0.62ms)
✔ save/load/delete use IndexedDB and structured copies (27.33ms)
✔ legacy migration keeps every selected snapshot frame and preferences; removes source only after verification (4.48ms)
✔ legacy indices clamp without filtering or renumbering history (0.91ms)
✔ corrupted legacy remains untouched and no project is written (6.56ms)
✔ unknown schema and duplicate IDs are rejected (0.70ms)
✔ corrupted IndexedDB data is reported and not replaced (4.49ms)
✔ IndexedDB unavailable does not consume legacy source (1.03ms)
✔ quota error rolls back save and preserves both previous project and legacy (5.09ms)
✔ image decode failure leaves legacy intact (1.76ms)
✔ verification failure after transaction keeps legacy source (2.17ms)
✔ preferences failure after migration preserves source and recovers next launch (3.32ms)
✔ valid IndexedDB project takes priority over corrupted legacy (1.83ms)
✔ save queue orders writes and continues after failure (1.13ms)
✔ text/sticker share renderer; semantic hit test chooses top object (0.74ms)
✔ transaction abort is reported and old document survives (5.25ms)
✔ sparse objects and legacy frames are rejected (0.78ms)
ℹ tests 40
ℹ pass 40
ℹ fail 0
```

### 3. `npm run build`
```
> multi-pulti@0.0.0 build
> vite build

vite v6.4.2 building for production...
✓ 1709 modules transformed.
dist/index.html                               0.88 kB │ gzip:   0.48 kB
dist/assets/MultiPulit-Logo-BopRmZcI.png  1,441.40 kB
dist/assets/index-VcWKRIdA.css               31.64 kB │ gzip:   6.38 kB
dist/assets/gifExport-BKd7C7cl.js             7.81 kB │ gzip:   3.48 kB
dist/assets/index-B2eHkhyw.js               322.75 kB │ gzip: 100.70 kB
✓ built in 4.78s
```

---

## Что ещё требует полировки

1. **Размер `useCanvasDrawing.ts`**:
   Хук содержит все обработчики инструментов (кисть, ластик, фигуры, заливка, выделение, пипетка). На следующем этапе можно выделить отдельные tool strategies (`tools/brushTool.ts`, `tools/eraserTool.ts`, `tools/shapeTool.ts`, `tools/fillTool.ts`), оставив хук диспетчером событий.
2. **Ассет логотипа**:
   Файл `MultiPulit-Logo.png` занимает 1.44 MB в бандле; его можно сконвертировать в оптимизированный WebP/PNG (~40-60 KB).
3. **Прямой rAF-батчинг при перетаскивании**:
   При очень высокой частоте опроса указателя (геймерские мыши 1000 Гц) обновление оверлея можно оборачивать в `requestAnimationFrame` для отсечения избыточных вызовов отрисовки в пределах одного кадра дисплея.
4. **Доступность (Accessibility)**:
   Добавление явных `aria-labels` на элементы управления таймлайна и фокус-менеджмента для клавиатурной навигации.

