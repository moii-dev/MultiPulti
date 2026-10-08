# Stage 2 report

## Новая модель данных

Введена устойчивая доменная модель проекта с версионированием схемы (`version: 2`) в `src/types/editor.ts` и чистыми операциями в `src/domain/project.ts`:

```ts
export type CanvasObject = TextObject | StickerObject | RasterLayer;

export interface Frame {
  id: string;
  bitmap: string;
  objects: CanvasObject[];
  /** Скомпонованное превью для таймлайна и экспорта */
  preview: string;
}

export interface Project {
  version: 2;
  frames: Frame[];
  currentFrameId: string;
}
```

Дискриминированное объединение объектов `CanvasObject`:
- **`TextObject`** (`kind: "text"`): `id`, `text`, `font`, `size`, `color`, `x`, `y`, `w`, `h`.
- **`StickerObject`** (`kind: "sticker"`): `id`, `emoji`, `x`, `y`, `size`.
- **`RasterLayer`** (`kind: "raster"`): `id`, `bitmap`. Позволяет штрихам кисти/фигурам ложиться поверх текста без преждевременного необратимого уплощения (flattening) векторных объектов.

---

## Как устроен Frame

1. **Устойчивые идентификаторы:** каждый кадр имеет `id: crypto.randomUUID()`. Идентичность кадра больше не привязана к индексу массива, что исключает рассинхронизацию при перестановке, добавлении или удалении.
2. **Растровая основа:** поле `bitmap` хранит базовый растровый слой (холст). Кистевые штрихи и фон остаются быстрыми растрами без перевода тысяч точек в векторные структуры.
3. **Изолированный список объектов:** `objects` хранит только редактируемые сущности конкретного кадра.
4. **Композитное превью:** поле `preview` формируется функцией `composeFrame` (растр + наложенные объекты) и используется таймлайном и генератором GIF/PNG, гарантируя, что экспорт и предпросмотр не зависят от глобального состояния оверлея.

---

## Как хранятся text/sticker objects

1. **Локальность:** объекты принадлежат строго массиву `objects` своего `Frame`. Глобальная таблица `placedTexts` в `App.tsx` и эвристика 30%-пересечения в `ToolSettingsPanel.tsx` полностью удалены.
2. **Семантический Hit Testing:** функция `hitObject(ctx, frame, x, y)` в `src/canvas/frameRenderer.ts` находит объект конкретного кадра по его реальным границам и шрифтовым метрикам.
3. **Редактирование после перезагрузки:** при загрузке кадра из хранилища текст и стикеры восстанавливают свои свойства (`font`, `color`, `size`, `emoji`, `x`, `y`) и могут быть выбраны инструментом `select`, `text` или `sticker` для перемещения или изменения.
4. **Глубокое копирование кадра (`copyFrame`):** использует `structuredClone(frame)` с генерацией нового UUID для кадра и новых UUID для каждого вложенного объекта. Изменения в копии кадра не влияют на оригинал.
5. **Удаление кадра (`deleteFrame`):** удаляет кадр вместе со всеми его объектами; соседние кадры не затрагиваются. Присутствует защита от удаления единственного последнего кадра.
6. **Перестановка (`reorderFrame`):** перемещает кадр целиком со всеми объектами на новую позицию по его `id`.

---

## IndexedDB architecture

Слой изоляции данных вынесен в `src/services/projectRepository.ts`:

- **База данных:** `multipulti` (версия 1), хранилище объектов `projects`.
- **Ключ:** проект сохраняется под ключом `"current"`.
- **Интерфейс репозитория:**
  - `loadProject(): Promise<Project | null>` — загрузка, валидация структуры и проверка декодирования изображений.
  - `saveProject(project: Project): Promise<void>` — валидация схемы перед записью и атомарная транзакция.
  - `deleteProject(): Promise<void>` — удаление проекта из хранилища.
  - `migrateLegacyProject(): Promise<Project | null>` — миграция из старого `localStorage`.
- **Сериализация и защита от гонок:** функция `createSaveQueue` сериализует асинхронные записи цепочкой Promise, исключая перезапись новой ревизии старой транзакцией.
- **Autosave:** хук `src/hooks/useProjectPersistence.ts` выполняет дебаунс 600 мс и сохраняет проект в IndexedDB асинхронно, не блокируя UI и события рисования. Сохранение не триггерится при тиках воспроизведения (`isPlaying`).
- **Легковесные Preferences:** `localStorage` используется только для ключа `multipulti_preferences` (списки `favoriteColors`, `recentColors`, `fps`, `currentFrameId`). Тяжёлые base64-строки и история в `localStorage` больше не попадают.

---

## Legacy migration

При первом запуске новой версии:
1. Репозиторий проверяет наличие старого ключа `multipulti_state` в `localStorage`.
2. Если в IndexedDB уже есть валидный проект, он считается авторитетным; миграция не затирает существующие данные.
3. Валидируется старое состояние (`history`, `historyIndex`, массив растровых `frames`).
4. Индексы клампятся (защита от выхода за пределы массива без исключений).
5. Кадры выбранного снимка истории конвертируются в новую модель `Frame` с присвоением устойчивых UUID и пустым списком объектов `objects: []`.
6. Новый проект записывается в IndexedDB и верифицируется повторным чтением с декодированием растров.
7. Пользовательские цвета переносятся в `multipulti_preferences`.
8. **Только после подтверждённой успешной записи и проверки** ключ `multipulti_state` удаляется из `localStorage`.
9. При любой ошибке (невалидный JSON, повреждённые растры, недоступность IndexedDB, превышение квоты) исходный ключ `multipulti_state` остаётся нетронутым, а автосохранение блокируется флагом `writable: false`, предотвращая перезапись повреждённого состояния пустым холстом.

---

## Добавленные тесты

В `scripts/test-project.ts` на базе `node:test` и `fake-indexeddb` реализовано 22 теста:

1. `Frame JSON round trip retains stable IDs, text, sticker and raster layers` — сериализация/десериализация и валидация.
2. `objects of different frames are isolated` — изоляция объектов между кадрами A и B.
3. `copy frame deeply clones objects and generates new identities` — глубокое клонирование и генерация новых ID.
4. `delete frame deletes its objects, preserves neighbors, guards last frame` — удаление кадра и защита последнего.
5. `reorder moves the whole frame by identity` — перенос кадра целиком по ID.
6. `editing an object retains paint order` — сохранение порядка слоёв при изменении объекта.
7. `save/load/delete use IndexedDB and structured copies` — сохранение, загрузка и удаление в IndexedDB.
8. `legacy migration keeps every selected snapshot frame and preferences; removes source only after verification` — корректная миграция и удаление старых данных только после верификации.
9. `legacy indices clamp without filtering or renumbering history` — клампинг индексов старой истории.
10. `corrupted legacy remains untouched and no project is written` — сохранение повреждённых исходных данных без перезаписи.
11. `unknown schema and duplicate IDs are rejected` — строгая валидация версии схемы и дубликатов ID.
12. `corrupted IndexedDB data is reported and not replaced` — обработка повреждений внутри IndexedDB.
13. `IndexedDB unavailable does not consume legacy source` — защита старых данных при недоступности IndexedDB.
14. `quota error rolls back save and preserves both previous project and legacy` — откат при `QuotaExceededError`.
15. `image decode failure leaves legacy intact` — защита от повреждённых base64 картинок при миграции.
16. `verification failure after transaction keeps legacy source` — откат при сбое пост-верификации.
17. `preferences failure after migration preserves source and recovers next launch` — идемпотентность при сбое записи preferences.
18. `valid IndexedDB project takes priority over corrupted legacy` — приоритет валидного проекта над мусором в localStorage.
19. `save queue orders writes and continues after failure` — корректный порядок очереди сохранения при сбоях.
20. `text/sticker share renderer; semantic hit test chooses top object` — проверка общего рендерера и hit-тестирования.
21. `transaction abort is reported and old document survives` — выживание документа при аборте транзакции.
22. `sparse objects and legacy frames are rejected` — защита от разреженных массивов.

---

## Результаты проверок

- **`npm run lint`**
  ```text
  > multi-pulti@0.0.0 lint
  > tsc --noEmit
  // Выполнено без ошибок (Exit code 0)
  ```
- **`npm test`**
  ```text
  > multi-pulti@0.0.0 test
  > tsx scripts/test-content-filter.ts && tsx --test scripts/test-project.ts

  content filter: safe drawing allowed, aggressive cross blocked
  png export: download link configured and triggered
  ✔ 22 tests passed, 0 failed (Exit code 0)
  ```
- **`npm run build`**
  ```text
  > multi-pulti@0.0.0 build
  > vite build

  ✓ 1702 modules transformed.
  ✓ built in 2.90s (Exit code 0)
  ```

---

## Известные ограничения

1. **Композиция растровых инструментов с объектами:** при рисовании кистью поверх текста создаётся растровый оверлей (`RasterLayer`), чтобы штрих визуально перекрывал текст, сохраняя текст редактируемым. Однако ластик (`eraser`), заливка (`fill`) и растровое выделение (`select`) сейчас выполняют уплощение кадра (`saveCanvasSnapshot`), так как для растрового стирания требуется запечённый пиксельный буфер. Полноценная транзакционная модель выделения запланирована на последующих этапах.
2. **Транзакции pointer interaction:** жизненный цикл жестов и выделения пока остаётся в рамках текущего `App.tsx`; масштабное разделение `App.tsx` и вынос `useCanvasInteraction` намеренно отложены до этапа interaction refactoring согласно границам этапа.

