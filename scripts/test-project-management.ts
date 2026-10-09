import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import {
  createFrame,
  generateCopyTitle,
  validateProjectTitle,
  MAX_PROJECT_TITLE_LENGTH,
} from '../src/domain/project';
import { createProjectRepository } from '../src/services/projectRepository';
import type { TextObject, StickerObject, Project } from '../src/types/editor';

const bitmap = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function setup() {
  const local = new MemoryStorage();
  const factory = new IDBFactory();
  return { local, factory, repo: createProjectRepository(() => factory, () => local) };
}

function createSampleProject(title = 'Космос'): Project {
  const frame1 = createFrame(bitmap);
  const textObj: TextObject = {
    kind: 'text',
    id: 'text-1',
    text: 'Ракета',
    font: 'Nunito',
    size: 32,
    color: '#FF0000',
    x: 50,
    y: 50,
    w: 120,
    h: 40,
  };
  const stickerObj: StickerObject = {
    kind: 'sticker',
    id: 'sticker-1',
    emoji: '🚀',
    x: 200,
    y: 150,
    size: 48,
  };
  frame1.objects = [textObj, stickerObj];

  const frame2 = createFrame(bitmap);
  return {
    id: 'proj-1',
    title,
    version: 2,
    frames: [frame1, frame2],
    currentFrameId: frame1.id,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

// ==================== 1. СОЗДАНИЕ (CREATION) ====================

test('CREATE: Создание проекта с указанным именем', async () => {
  const { repo } = setup();
  const project = await repo.createProject('  Приключения кота  ');
  assert.equal(project.title, 'Приключения кота');
  assert.ok(project.id);
  assert.equal(project.frames.length, 1);
  assert.ok(project.frames[0].id);
  assert.equal(project.currentFrameId, project.frames[0].id);

  const loaded = await repo.loadProject(project.id);
  assert.ok(loaded);
  assert.equal(loaded?.id, project.id);
  assert.equal(loaded?.title, 'Приключения кота');
});

test('CREATE: Создание с именем по умолчанию («Новый мультик»)', async () => {
  const { repo } = setup();
  const project = await repo.createProject();
  assert.equal(project.title, 'Новый мультик');
  assert.ok(project.id);

  const list = await repo.listProjects();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Новый мультик');
});

test('CREATE: Отклонение пустого названия и пробелов', async () => {
  const { repo } = setup();
  await assert.rejects(repo.createProject(''), /пустым/);
  await assert.rejects(repo.createProject('    '), /пустым/);
  assert.throws(() => validateProjectTitle('   '), /пустым/);
  assert.throws(() => validateProjectTitle(''), /пустым/);
});

test('CREATE: Лимит длины названия проекта (максимум 50 символов)', () => {
  assert.equal(validateProjectTitle('a'.repeat(MAX_PROJECT_TITLE_LENGTH)), 'a'.repeat(50));
  assert.throws(() => validateProjectTitle('a'.repeat(MAX_PROJECT_TITLE_LENGTH + 1)), /50/);
});

test('CREATE: Не теряет уже существующие проекты при создании нового', async () => {
  const { repo } = setup();
  const p1 = await repo.createProject('Первый');
  const p2 = await repo.createProject('Второй');
  const p3 = await repo.createProject('Третий');

  const list = await repo.listProjects();
  assert.equal(list.length, 3);
  const titles = list.map((p) => p.title);
  assert.ok(titles.includes('Первый'));
  assert.ok(titles.includes('Второй'));
  assert.ok(titles.includes('Третий'));

  // Загружаем каждый отдельно
  assert.equal((await repo.loadProject(p1.id))?.title, 'Первый');
  assert.equal((await repo.loadProject(p2.id))?.title, 'Второй');
  assert.equal((await repo.loadProject(p3.id))?.title, 'Третий');
});

// ==================== 2. ПЕРЕИМЕНОВАНИЕ (RENAME) ====================

test('RENAME: Название успешно изменяется и обновляет updatedAt', async () => {
  const { repo } = setup();
  const project = await repo.createProject('Старое имя');
  const originalUpdatedAt = project.updatedAt ?? 0;

  // Подождём пару миллисекунд для гарантии изменения времени
  await new Promise((r) => setTimeout(r, 10));

  const renamed = await repo.renameProject(project.id, '  Новое имя  ');
  assert.equal(renamed.title, 'Новое имя');
  assert.ok((renamed.updatedAt ?? 0) >= originalUpdatedAt);

  // Frames и объекты не изменились
  assert.deepEqual(renamed.frames, project.frames);

  const loaded = await repo.loadProject(project.id);
  assert.equal(loaded?.title, 'Новое имя');
});

test('RENAME: Пробелы по краям удаляются', async () => {
  const { repo } = setup();
  const project = await repo.createProject('Проект');
  const renamed = await repo.renameProject(project.id, '   Супер мультик   ');
  assert.equal(renamed.title, 'Супер мультик');
});

test('RENAME: Пустое название отклоняется и не меняет проект', async () => {
  const { repo } = setup();
  const project = await repo.createProject('Неизменное имя');
  await assert.rejects(repo.renameProject(project.id, ''), /пустым/);
  await assert.rejects(repo.renameProject(project.id, '   '), /пустым/);

  const loaded = await repo.loadProject(project.id);
  assert.equal(loaded?.title, 'Неизменное имя');
});

test('RENAME: Ошибка repository при несуществующем ID', async () => {
  const { repo } = setup();
  await assert.rejects(repo.renameProject('non-existent-id', 'Новое имя'), /не найден/);
});

// ==================== 3. КОПИРОВАНИЕ (DUPLICATE) ====================

test('DUPLICATE: Создаётся независимая копия с новым Project ID и новыми Frame/Object IDs', async () => {
  const { repo } = setup();
  const sample = createSampleProject('Космос');
  await repo.saveProject(sample);

  const copy = await repo.duplicateProject(sample.id);

  // Новый Project ID
  assert.notEqual(copy.id, sample.id);
  assert.ok(copy.id);

  // Независимые Frame IDs
  assert.equal(copy.frames.length, sample.frames.length);
  assert.notEqual(copy.frames[0].id, sample.frames[0].id);
  assert.notEqual(copy.frames[1].id, sample.frames[1].id);

  // Новые Object IDs
  assert.notEqual(copy.frames[0].objects[0].id, sample.frames[0].objects[0].id);
  assert.notEqual(copy.frames[0].objects[1].id, sample.frames[0].objects[1].id);

  // Содержимое совпадает
  assert.equal(copy.frames[0].bitmap, sample.frames[0].bitmap);
  assert.equal((copy.frames[0].objects[0] as TextObject).text, 'Ракета');
  assert.equal((copy.frames[0].objects[1] as StickerObject).emoji, '🚀');
});

test('DUPLICATE: Изменение копии не влияет на оригинал (нет shared references)', async () => {
  const { repo } = setup();
  const sample = createSampleProject('Космос');
  await repo.saveProject(sample);

  const copy = await repo.duplicateProject(sample.id);

  // Мутируем копию
  (copy.frames[0].objects[0] as TextObject).text = 'Мутированный текст в копии';
  copy.frames[0].bitmap = 'data:image/png;base64,mutated';
  await repo.saveProject(copy);

  // Оригинал остался нетронутым
  const loadedOriginal = await repo.loadProject(sample.id);
  assert.equal((loadedOriginal?.frames[0].objects[0] as TextObject).text, 'Ракета');
  assert.equal(loadedOriginal?.frames[0].bitmap, sample.frames[0].bitmap);
});

test('DUPLICATE: Генерация имён «Космос — копия», «Космос — копия 2», «Космос — копия 3»', () => {
  const title1 = generateCopyTitle('Космос', ['Космос']);
  assert.equal(title1, 'Космос — копия');

  const title2 = generateCopyTitle('Космос', ['Космос', 'Космос — копия']);
  assert.equal(title2, 'Космос — копия 2');

  const title3 = generateCopyTitle('Космос', ['Космос', 'Космос — копия', 'Космос — копия 2']);
  assert.equal(title3, 'Космос — копия 3');

  // Копирование уже существующей копии
  const title4 = generateCopyTitle('Космос — копия', ['Космос', 'Космос — копия']);
  assert.equal(title4, 'Космос — копия 2');
});

test('DUPLICATE: Карточка копии появляется в списке и сортируется по updatedAt', async () => {
  const { repo } = setup();
  const original = await repo.createProject('Мультик 1');
  await new Promise((r) => setTimeout(r, 10));

  const copy = await repo.duplicateProject(original.id);
  assert.equal(copy.title, 'Мультик 1 — копия');

  const list = await repo.listProjects();
  assert.equal(list.length, 2);
  // Самый свежий проект должен быть первым
  assert.equal(list[0].id, copy.id);
  assert.equal(list[1].id, original.id);
});

test('DUPLICATE: Ошибка копирования несуществующего проекта', async () => {
  const { repo } = setup();
  await assert.rejects(repo.duplicateProject('missing-id'), /не найден/);
});

// ==================== 4. УДАЛЕНИЕ (DELETE) ====================

test('DELETE: Подтверждённое удаление убирает только выбранный проект', async () => {
  const { repo } = setup();
  const p1 = await repo.createProject('Останется 1');
  const p2 = await repo.createProject('Будет удалён');
  const p3 = await repo.createProject('Останется 2');

  assert.equal((await repo.listProjects()).length, 3);

  await repo.deleteProject(p2.id);

  const list = await repo.listProjects();
  assert.equal(list.length, 2);
  assert.ok(!list.some((p) => p.id === p2.id));
  assert.ok(list.some((p) => p.id === p1.id));
  assert.ok(list.some((p) => p.id === p3.id));

  assert.equal(await repo.loadProject(p2.id), null);
  assert.ok(await repo.loadProject(p1.id));
  assert.ok(await repo.loadProject(p3.id));
});

test('DELETE: Повторное удаление уже отсутствующего проекта обрабатывается безопасно', async () => {
  const { repo } = setup();
  const p = await repo.createProject('Тест');
  await repo.deleteProject(p.id);
  // Повторное удаление не бросает исключений
  await assert.doesNotReject(repo.deleteProject(p.id));
  await assert.doesNotReject(repo.deleteProject('random-non-existent-id'));
});

// ==================== 5. СПИСОК И СОРТИРОВКА ====================

test('LIST: listProjects возвращает корректную структуру и сортирует по дате изменения', async () => {
  const { repo } = setup();
  const p1 = await repo.createProject('Старый');
  await new Promise((r) => setTimeout(r, 10));
  await repo.createProject('Средний');
  await new Promise((r) => setTimeout(r, 10));
  await repo.createProject('Свежий');

  let list = await repo.listProjects();
  assert.equal(list[0].title, 'Свежий');
  assert.equal(list[1].title, 'Средний');
  assert.equal(list[2].title, 'Старый');

  // Переименовываем Старый — он должен подняться на первое место
  await new Promise((r) => setTimeout(r, 10));
  await repo.renameProject(p1.id, 'Обновлённый старый');

  list = await repo.listProjects();
  assert.equal(list[0].title, 'Обновлённый старый');
  assert.equal(list[1].title, 'Свежий');
  assert.equal(list[2].title, 'Средний');
});
