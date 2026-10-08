# MultiPulti 2.0 Refactor Report

## Что было не так

В исходной версии MultiPulti (1.0) присутствовал ряд фундаментальных проблем архитектуры и надежности:
1. **Монолитное неструктурированное состояние**: кадры хранились в виде плоских base64 DataURL строк в `localStorage`. Лимит в 5 МБ приводил к тихому падению автосохранения (`QuotaExceededError`) уже после нескольких кадров.
2. **Отсутствие модели объектов**: текст и стикеры моментально «впекались» в растр. Их нельзя было переместить, отредактировать или удалить после снятия фокуса без полной порчи фона.
3. **«Дырявый» Undo/Redo**: операция выделения создавала паразитные пустые кадры в истории. Отмена после выделения возвращала стёртый кадр. Ветвление истории после Undo приводило к рассинхронизации индексов.
4. **Утечка объектов между кадрами (Object Leaks)**: незафиксированный текст или перемещаемый стикер при переключении кадра или запуске анимации накладывался на чужие кадры.
5. **Ложные срабатывания контент-фильтра (False Positives)**: безопасные детские рисунки (божья коровка из-за красно-чёрных цветов, солнце и трава из-за хорд, математический плюс) ошибочно блокировались. При этом блокировка стирала всю историю Undo пользователя. Тяжёлый `getImageData` вызывался неконтролируемо.
6. **Ненадёжный импорт изображений**: отсутствие валидации MIME-типов, падения при ошибках декодирования, зависание при гигантских разрешениях (10000×10000), искажение пропорций (aspect ratio) и race conditions при быстром выборе нескольких файлов.
7. **Блокирующий экспорт GIF**: длительное кодирование наглухо фризило интерфейс без обратной связи и прогресса, а сбои декодирования кадров вызывали unhandled rejection.
8. **Мобильные и A11y проблемы**: элементы вылезали за пределы экрана на 360–390px, кнопки без текста не имели доступных имен (`aria-label`), модалки не закрывались по `Escape`, а текстовый DOM-инпут не масштабировался вместе с адаптивным canvas.

---

## Что исправлено

- Реализована **слоистая модель кадра (Frame Model)** с неизменяемыми стабильными UUID, массивом векторных объектов (`TextObject`, `StickerObject`, `RasterObject`) и растровым композитным превью.
- Полноценная **транзакционная изоляция незавершенных действий**: при переключении кадров, старте воспроизведения, очистке или импорте все pending-состояния атомарно коммитятся в свой кадр-владелец или сбрасываются.
- Переход на **IndexedDB (Local-first persistence)** с асинхронной дебоунс-очередью записи, защитой от превышения квоты и безопасной фоновой верификацией.
- Бесшовная **двухфазная миграция legacy localStorage**: старые проекты конвертируются в формат 2.0, а исходные данные удаляются только после успешной проверки целостности в IndexedDB.
- Полный пересмотр **эвристического фильтра содержимого**: сбалансированы веса, введена проверка плотности заполнения (Fill Density) для исключения хорд сплошных фигур, устранена ложная блокировка божьих коровок и плюсов, а откат заблокированного кадра больше не уничтожает историю Undo.
- Защищённый **пайплайн импорта картинок**: строгая валидация MIME, лимит 15 МБ, лимит 8192×8192, пропорциональное вписывание с центрированием (contain aspect-fit), сброс input value и токены защиты от race condition.
- Отзывчивый **экспорт GIF с индикатором прогресса**: уступка квантов времени главному потоку через `setTimeout(0)`, отображение процентов прогресса в Header, освобождение памяти `Image` и отложенный отзыв ObjectURL.
- **Адаптивный мобильный UI и A11y**: мобильная шторка-drawer для настроек инструмента на смартфонах (360–390px), компактный Timeline с переключателем FPS, семантика диалогов (`role="dialog"`, `aria-modal`), `Escape` для отмены/закрытия, фокусные стили и `aria-label` для всех кнопок.

---

## Новая архитектура

Архитектура MultiPulti 2.0 разделена на строгие несвязанные слои:

1. **Domain Layer (`src/domain/`)**:
   - Чистые функции без привязки к React и DOM.
   - `project.ts`: манипуляции с кадрами (создание, глубокое клонирование, удаление с защитой последнего кадра, перестановка).
   - `history.ts`: неизменяемое дерево истории с поддержкой ветвления (отсечение старых веток при рисовании после отмены).
   - `transaction.ts`: транзакции фиксации изменений текста, стикеров и выделений при переключении контекста.
2. **Canvas Rendering & Lifecycle (`src/canvas/`)**:
   - `frameRenderer.ts`: композиция растрового базового холста и оверлей-объектов, хит-тест по Z-индексу.
   - `pointerLifecycle.ts`: детерминированный конечный автомат для Pointer Events (отслеживание первичного указателя, предотвращение конфликтов мультитача, чистый rollback при отмене жеста).
   - `operations.ts`: чистая геометрия клиентских координат с учётом CSS-масштаба холста и пропорциональное вписывание aspect-fit.
3. **Services Layer (`src/services/`)**:
   - `projectRepository.ts`: отказоустойчивый слой работы с IndexedDB через промисифицированные транзакции.
   - `imageExport.ts`: браузерные контракты скачивания PNG и выгрузки файлов.
4. **React Hooks Layer (`src/hooks/`)**:
   - Узкоспециализированные хуки вместо монолитного стейта: `useFrames`, `useCanvasDrawing`, `useSelection`, `useTextTool`, `useStickerTool`, `useFrameHistory`, `useAnimationPlayback`, `useContentModeration`, `useProjectPersistence`, `useKeyboardShortcuts`.
5. **Presentation Layer (`src/components/`)**:
   - Презентационные компоненты со строгими интерфейсами: `DrawingStage`, `HeaderToolbar`, `Timeline`, `ToolsPanel`, `ToolSettingsPanel`, `EditorModals`.

---

## Frame model

```typescript
export interface Frame {
  id: string;              // Стабильный UUID кадра
  bitmap: string;          // Базовый фоновый растровый слой (DataURL PNG)
  preview: string;         // Композитное превью для таймлайна
  objects: CanvasObject[]; // Независимые редактируемые слои (Z-порядок)
}

export type CanvasObject = TextObject | StickerObject | RasterObject;
```
- Каждый кадр автономен: добавление, изменение или удаление объектов на кадре `N` не мутирует кадр `N+1`.
- При копировании кадра выполняется глубокое клонирование с генерацией новых идентификаторов для всех объектов.
- Порядок отрисовки строго детерминирован: базовый растр $\to$ объекты по массиву `objects` $\to$ активный временный оверлей взаимодействия.

---

## Editable objects

- **Текст**: хранится в векторе (`x, y, text, font, size, color, w, h`). Визуальный DOM-инпут позиционируется с абсолютной точностью поверх canvas, вычисляя кегль из реальных физических габаритов холста, а не от высоты viewport. Доступно повторное редактирование кликом по тексту.
- **Стикеры**: масштабируемые эмодзи с сохранением исходных координат и размера до фиксации.
- **Растровые патчи (`RasterObject`)**: позволяют накладывать штрихи поверх векторных объектов без деструктивного слияния всей сцены.

---

## Undo/Redo

- Реализована схема единых логических шагов истории.
- При начале выделения или перемещения объекта промежуточные пустые состояния **не** пушатся в историю.
- История фиксирует только завершённый результат (`commitFrames`).
- При нажатии `Undo` восстанавливается исходное положение объекта.
- При рисовании после нескольких `Undo` устаревшая ветка истории аккуратно отсекается, исключая рассинхронизацию.

---

## Selection transactions

- Выделение работает через временный слой без разрушения оригинального растра.
- Исходный битмап кадра сохраняется в `originalBitmap`.
- В случае отмены действия (клавиша `Escape`, сброс инструмента или ошибка) оригинальный растр мгновенно восстанавливается без дефектов.
- Фиксация перекраски, масштабирования или отражения происходит атомарно.

---

## Persistence / IndexedDB

- Проект хранится в хранилище `MultiPultiDB` (object store `projects`, ключ `current_project`).
- Запись происходит асинхронно через очередь `SaveQueue` с дебоунсом 400 мс.
- Поддерживается обработка ошибок `QuotaExceededError`: при исчерпании диска старая копия проекта сохраняется неповрежденной, а пользователь видит понятное предупреждение.
- При воспроизведении анимации автосохранение приостанавливается, чтобы не расходовать дисковый ввод-вывод.

---

## Legacy migration

- Реализован двухфазный механизм миграции со старого формата `localStorage` (`multipulti_autosave_v1`):
  1. Чтение и валидация структуры старого снимка.
  2. Преобразование каждого кадра в модель Frame 2.0.
  3. Сохранение в IndexedDB и проверка обратного чтения.
  4. Удаление ключа из `localStorage` только после 100% подтверждения успешной записи.
- Повреждённый JSON в `localStorage` не ломает приложение: ошибка перехватывается, старый файл не затирается, запускается чистый проект.

---

## Canvas interaction

- Взаимодействие с холстом стандартизировано на **Pointer Events** (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `lostpointercapture`).
- Реализован конечный автомат `PointerGestureState`:
  - Игнорирование вторичных пальцев/стилусов при активном рисовании.
  - Точное масштабирование клиентских координат холста через `calculateCanvasCoordinates` вне зависимости от CSS-ресайза.
  - Поддержка отмены жеста ластика с откатом базового слоя.
- Режим «Умный контур» (`Smart Shape`) распознаёт круги, эллипсы и прямые линии с учётом детской погрешности замыкания контура.

---

## Import/export

- **Импорт изображений**:
  - Проверка MIME-типа: допустимы только `image/*`.
  - Лимит размера файла: до 15 МБ.
  - Защита от гигантских размеров: не более 8192×8192 px.
  - Вписывание через чистую функцию `calculateAspectFitDimensions` с сохранением пропорций и белым фоном кадра 800×600.
  - Токены запросов `uploadRequestIdRef` предотвращают состояние гонки при быстром выборе нескольких файлов.
  - Очистка `input.value = ""` позволяет повторно загружать один и тот же файл.
- **Экспорт GIF**:
  - Асинхронное кодирование с `onProgress(current, total)` и отображением процента в UI.
  - `img.onerror` с отклонением Promise при повреждении кадра.
  - Освобождение памяти `Image` (`img.src = ''`) и backing store холста.
  - Неблокирующий UI за счёт уступки тиков `setTimeout(0)`.
- **Экспорт PNG**:
  - Гарантированный рендер чистого кадра без активных маркеров выделения и оверлеев.

---

## Content moderation

- Локальный эвристический фильтр анализирует **только зафиксированный кадр (committed Frame)** один раз при завершении штриха или импорте (тяжёлый `getImageData` не вызывается на `pointermove`).
- **Исключены ложные срабатывания**:
  - Изолированная чёрно-красная палитра ограничена 40 баллами (порог блокировки $\ge 60$): божья коровка, машина или красно-чёрные цветы больше не блокируются.
  - Добавлена проверка плотности заполнения (`boxDensity > 0.4`): сплошные круги, диски, солнце, трава больше не принимаются за пересекающиеся линии креста.
  - Одиночные ортогональные плюсы (+) дают слабый вес (20 баллов) и не блокируются.
  - Сплошные круглые объекты защищены от ложного флага симметрии тонких символов.
- В случае блокировки кадра восстанавливается чистый холст, но история отмен `Undo/Redo` сохраняется, чтобы ребёнок не терял всю предыдущую работу.

---

## Mobile and accessibility

- Адаптивная верстка: от 360px до 4K-мониторов.
- На мобильных экранах панель параметров сворачивается в боковую выдвижную шторку (`drawer`), открываемую по кнопке опций на панели инструментов.
- На таймлайне добавлена компактная кнопка выбора FPS для мобильных устройств.
- Все кнопки снабжены атрибутами `aria-label`.
- Модальные окна оснащены семантикой `role="dialog"`, `aria-modal="true"`, `aria-labelledby` и закрываются кликом по подложке или клавишей `Escape`.
- Стиль `:focus-visible` обеспечивает чёткую фиолетовую обводку для клавиатурной навигации.
- Стиль `.btn-kid:disabled` обеспечивает корректную обратную связь для неактивных кнопок.
- Сохранён фирменный детский визуальный язык MultiPulti: сочные цвета, толстые чёрные границы, крупные скругления и кнопка `.btn-kid`.

---

## Tests

Набор автоматических тестов расширен до **52 тестов** (Node.js Test Runner + tsx):

```text
✔ COORDINATES: 1:1 scale maps client coordinates directly to canvas space
✔ COORDINATES: CSS scaled down canvas (responsive/mobile) doubles internal coordinates
✔ COORDINATES: CSS scaled up canvas (large desktop / 4K) halves internal coordinates
✔ COORDINATES: Degenerate or unmounted rect (0 width or height) returns (0, 0) without NaN or Infinity
✔ COORDINATES: Pointer coordinates outside rect produce correct signed offsets for canvas clipping
✔ TEXT GEOMETRY: Visual DOM input font size is derived from rendered canvas rect, NOT viewport vh
✔ POINTER STATE MACHINE: Single primary pointer starts, tracks and finishes gesture cleanly
✔ POINTER STATE MACHINE: Gesture cancel or lost pointer capture resets all flags cleanly
✔ POINTER STATE MACHINE: Eraser gesture cancellation signals rollback requirement
✔ PENDING CANCELLATION: Switching frame during active gesture isolates frames without corrupting state
✔ PENDING CANCELLATION: Sticker move during gesture cancel leaves original sticker intact
✔ ASPECT RATIO FIT: Proportional letterboxing & pillarboxing inside 800x600 without distortion
✔ SMART SHAPE: Ellipse detected from rough circular loop; line detected from straight points; noise rejected
✔ IMPORT VALIDATION: Rejects invalid MIME types, oversized bytes (>15MB), oversized dimensions (>8192px)
✔ PENDING CANCELLATION: Canvas clear and playback toggle safely discard active pending state
✔ CONTENT FILTER [SAFE]: Colorful drawing (sun and grass) is not blocked
✔ CONTENT FILTER [SAFE]: Red-and-black ladybug is NOT blocked (false positive protection)
✔ CONTENT FILTER [SAFE]: Blue diagonal cross is NOT blocked without aggressive palette
✔ CONTENT FILTER [SAFE]: Orthogonal plus sign (+) is NOT blocked
✔ CONTENT FILTER [SAFE]: Small image (<300px) bypasses heavy heuristic safely
✔ CONTENT FILTER [BLOCKED]: Aggressive black-and-red diagonal cross is blocked
✔ CONTENT FILTER [BLOCKED]: Aggressive black-and-red chaotic scribble is blocked
✔ EXPORT: PNG export configures clean anchor download with correct filename pattern
✔ DRAW: draw -> undo -> redo works as single logical undo steps
✔ BRANCH: draw A -> draw B -> undo -> draw C -> redo B unavailable
✔ SELECTION: object at X -> move X to Y -> undo returns X -> redo returns Y (NO intermediate empty frame)
✔ TEXT: create text -> edit text -> undo -> redo
✔ FRAME ISOLATION: pending object on frame A -> switch frame B -> object not present in B
✔ FRAME OPERATIONS: add -> copy -> reorder -> delete -> undo all -> redo all
✔ PENDING: selection / text / sticker -> switch frame -> correct isolated results
✔ Frame JSON round trip retains stable IDs, text, sticker and raster layers
✔ objects of different frames are isolated
✔ copy frame deeply clones objects and generates new identities
✔ delete frame deletes its objects, preserves neighbors, guards last frame
✔ reorder moves the whole frame by identity
✔ editing an object retains paint order
✔ save/load/delete use IndexedDB and structured copies
✔ legacy migration keeps every selected snapshot frame and preferences; removes source only after verification
✔ legacy indices clamp without filtering or renumbering history
✔ corrupted legacy remains untouched and no project is written
✔ unknown schema and duplicate IDs are rejected
✔ corrupted IndexedDB data is reported and not replaced
✔ IndexedDB unavailable does not consume legacy source
✔ quota error rolls back save and preserves both previous project and legacy
✔ image decode failure leaves legacy intact
✔ verification failure after transaction keeps legacy source
✔ preferences failure after migration preserves source and recovers next launch
✔ valid IndexedDB project takes priority over corrupted legacy
✔ save queue orders writes and continues after failure
✔ text/sticker share renderer; semantic hit test chooses top object
✔ transaction abort is reported and old document survives
✔ sparse objects and legacy frames are rejected

Итого: 52 теста пройдено, 0 ошибок.
```

---

## Performance improvements

1. **Кэширование растровых слоёв**: `cacheRaster` и `pruneRasterCache` предотвращают повторное создание объектов Image при неизменных слоях.
2. **Динамический импорт GIF-энкодера**: библиотека `gifenc` вынесена в отдельный чанк (`gifExport-*.js`, 8 КБ), что уменьшило стартовый бандл.
3. **Устранение лишних чтений холста**: `getImageData` убран со всех обработчиков движения указателя (`pointermove`) и вызывается строго однократно на зафиксированный кадр.
4. **Оптимизация дерева зависимостей**: удален неиспользуемый `autoprefixer` (Tailwind 4 работает нативно), устранены дубликаты `vite` в `package.json`.
5. **Дебоунс сохранения**: IndexedDB не блокирует пользовательский ввод и не спамит диск благодаря дебоунсу 400 мс.

---

## Результаты

### `npm run lint`
```text
> multi-pulti@0.0.0 lint
> tsc --noEmit
(Код возврата 0 — ошибок типизации нет)
```

### `npm test`
```text
> multi-pulti@0.0.0 test
> tsx --test scripts/test-content-filter.ts scripts/test-project.ts scripts/test-history.ts scripts/test-canvas-interaction.ts

ℹ tests 52
ℹ suites 0
ℹ pass 52
ℹ fail 0
ℹ duration_ms 3022.363
```

### `npm run build`
```text
vite v6.4.2 building for production...
transforming...
✓ 1709 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                               0.88 kB │ gzip:   0.48 kB
dist/assets/MultiPulit-Logo-BopRmZcI.png  1,441.40 kB
dist/assets/index-BbQpBAQX.css               37.64 kB │ gzip:   6.98 kB
dist/assets/gifExport-DnqNYzq1.js             8.24 kB │ gzip:   3.74 kB
dist/assets/index-iSSmHSpT.js               332.22 kB │ gzip: 103.29 kB
✓ built in 3.88s
```

---

## Remaining technical debt

1. **Размер логотипа в ассетах**: PNG-логотип занимает 1.44 МБ в `dist/assets`. Конвертация в оптимизированный WebP/SVG сократит вес до ~80 КБ.
2. **Квантование GIF в главном потоке**: хотя текущая реализация уступает тики главному потоку через `setTimeout(0)`, для 100+ кадров будет полезно вынести вычисления в Web Worker.
3. **Хранение только одного проекта**: текущая схема IndexedDB ориентирована на хранение одной активной рабочей сессии, без галереи нескольких проектов.

---

## Future improvements

Все будущие улучшения детально зафиксированы в [`FUTURE_IMPROVEMENTS.md`](file:///c:/Users/MOII/source/repos/MultiPulti/FUTURE_IMPROVEMENTS.md):
- **Onion Skin (Калька)**: отображение предыдущего кадра с настраиваемой прозрачностью.
- **Web Worker GIF Export**: вынос квантования палитры в фоновый поток.
- **WebP/AVIF Asset Optimization**: сжатие графики сборки.
- **Аудиодорожки к кадрам**: запись голоса и детские звуковые эффекты.
- **Экспорт в MP4/WebM**: видео-экспорт через MediaRecorder.
- **Менеджер проектов**: создание и переключение между несколькими мультфильмами.
- **Волшебные кисти**: радужная кисть и кисть-звёздочки.

---

## Краткая сводка

- **Сколько файлов изменено**: **21 файл** (включая компоненты UI, хуки, утилиты, персистентность, тесты, документацию и конфигурацию).
- **Сколько тестов добавлено/работает**: **52 теста** (все 52 успешно проходят, охватывая историю, транзакции, кадры, IndexedDB, модерацию, импорт/экспорт и геометрию).
- **Какие критические баги исправлены**:
  - Утечка объектов и оверлеев между кадрами при смене кадра и проигрывании;
  - Потеря истории Undo при срабатывании фильтра контента;
  - Ложные блокировки безопасных рисунков (божьи коровки, математические и медицинские плюсы, сплошные формы);
  - Зависание и поломка кадров при импорте больших или некорректных картинок;
  - Блокировка главного потока и отсутствие прогресса при экспорте GIF;
  - Ошибки переполнения `localStorage` при длительной анимации (переход на IndexedDB);
  - Ломающаяся мобильная верстка на узких экранах (360–390px);
  - Отсутствие доступности для скринридеров и клавиатурной навигации (`aria-label`, модальная семантика, `Escape`).
- **Успешно ли прошли проверки**: **Да, все проверки (`lint`, `test`, `build`) завершились со статусом 0**.
- **Что осталось делать в MultiPulti 2.1**: реализация Onion Skin (кальки), сжатие графических ассетов и вынос длинного GIF-экспорта в Web Worker.

