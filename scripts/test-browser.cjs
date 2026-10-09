const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const shots = process.env.TEST_SCREENSHOTS;

test('real browser release audit (isolated storage)', { timeout: 180000 }, async t => {
  const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  let page = await context.newPage();
  const errors = [];
  const watch = p => {
    p.setDefaultTimeout(12000);
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Ошибка загрузки мультика')) errors.push(m.text()); });
  };
  watch(page); context.on('page', watch);
  // External font availability is separate from application behavior.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  page.setDefaultTimeout(12000);
  const button = name => page.getByRole('button', { name, exact: true });
  const menuItem = name => page.getByRole('menuitem', { name, exact: true });
  const home = async () => { await button('Вернуться ко всем мультикам').click(); await page.getByRole('heading', { name: /Мои мультики/ }).waitFor(); };
  const create = async title => {
    await button(await button('Создать первый мультик').isVisible() ? 'Создать первый мультик' : 'Создать мультик').click();
    await page.getByRole('textbox').fill(title);
    await button('Создать').click();
    await page.locator('canvas').first().waitFor();
    await page.waitForFunction(() => document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1, 1).data[3] > 0);
  };
  const data = async () => page.evaluate(async () => (await import('/src/services/projectRepository.ts')).projectRepository.loadProject());
  const stroke = async (x = .25, y = .3, endX = .6, endY = .55) => {
    const rect = await page.locator('canvas').nth(1).boundingBox();
    await page.mouse.move(rect.x + rect.width*x, rect.y + rect.height*y);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width*endX, rect.y + rect.height*endY, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Отменить последнее действие"]').disabled);
  };
  const snapshot = async () => page.locator('canvas').first().evaluate(c => c.toDataURL());
  const shot = async name => { if (shots) { await fs.mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${name}.png`), animations: 'disabled' }); } };
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.match(await page.title(), /Мульти/);
    await button('Создать первый мультик').waitFor();
    await shot('empty-1440');

    await t.test('brush, undo/redo, immediate exit, autosave, independent projects, reload and reopened page', async () => {
      await create('А');
      const blank = await snapshot();
      await stroke();
      const painted = await snapshot(); assert.notEqual(painted, blank);
      await button('Отменить последнее действие').click();
      await page.waitForFunction(expected => document.querySelector('canvas').toDataURL() === expected, blank);
      await button('Повторить отменённое действие').click();
      await page.waitForFunction(expected => document.querySelector('canvas').toDataURL() === expected, painted);
      await home();
      const a = await data(); assert.notEqual(a.frames[0].bitmap, blank);
      await create('Б'); await home();
      const b = await data(); assert.equal(b.frames.length, 1); assert.notEqual(a.id, b.id);
      await button('Открыть мультик «А»').click();
      await page.waitForFunction(expected => document.querySelector('canvas')?.toDataURL() === expected, painted);
      assert.equal(await button('Отменить последнее действие').isDisabled(), true);
      await button('Новый кадр').click();
      await page.getByRole('button', { name: 'Выбрать кадр 2', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[aria-label="Копировать текущий кадр"]').disabled);
      await page.waitForTimeout(80);
      await stroke(.2,.7,.7,.7);
      await page.waitForFunction(async () => {
        const p = await (await import('/src/services/projectRepository.ts')).projectRepository.loadProject();
        return p.frames.length === 2 && p.frames[1].bitmap !== p.frames[0].bitmap;
      });
      await home(); await page.reload();
      await button('Открыть мультик «А»').click();
      await page.getByRole('button', { name: 'Выбрать кадр 2', exact: true }).waitFor();
      await home();
      const next = await context.newPage(); await page.close();
      // Read persisted data in a newly opened document using the same isolated profile.
      await next.goto(origin, { waitUntil: 'domcontentloaded' }); await next.getByRole('button', { name: 'Открыть мультик «А»', exact: true }).waitFor();
      page = next;
    });

    await t.test('project menu rename, long title copy, independent copy and confirmed delete', async () => {
      await button('Действия для «Б»').click(); await menuItem('Переименовать').click();
      const title = 'Оченьдлинноеназваниемультика'.repeat(2).slice(0, 50);
      await page.getByRole('textbox').fill(title); await button('Сохранить').click();
      await button(`Открыть мультик «${title}»`).waitFor();
      await button(`Действия для «${title}»`).click(); await menuItem('Создать копию').click();
      await page.getByText('Копия готова!', { exact: true }).waitFor();
      const summaries = await page.evaluate(async () => (await import('/src/services/projectRepository.ts')).projectRepository.listProjects());
      const copy = summaries.find(p => p.title.endsWith(' — копия'));
      assert.ok(copy); assert.ok(copy.title.length <= 50);
      await button(`Открыть мультик «${copy.title}»`).click();
      await page.locator('canvas').first().waitFor(); await page.waitForTimeout(80); await stroke(); await home();
      const original = await page.evaluate(async id => (await import('/src/services/projectRepository.ts')).projectRepository.loadProject(id), summaries.find(p => p.title === title).id);
      assert.equal(original.frames[0].bitmap, (await page.evaluate(async () => (await import('/src/domain/project.ts')).BLANK_FRAME_BITMAP)));
      await button(`Действия для «${copy.title}»`).click(); await menuItem('Удалить').click();
      await page.getByRole('dialog', { name: 'Удалить мультик?' }).waitFor();
      await button('Отмена').click(); await button(`Открыть мультик «${copy.title}»`).waitFor();
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      await button(`Действия для «${copy.title}»`).click(); await menuItem('Удалить').click(); await button('Удалить').click();
      await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 2);
      await page.reload(); await button(`Открыть мультик «${title}»`).waitFor();
    });

    await t.test('eraser, fill, shape, semantic text/sticker, frame operations, playback and PNG/GIF', async () => {
      await button('Открыть мультик «А»').click(); await page.locator('canvas').first().waitFor(); await page.waitForTimeout(80);
      await button('Выбрать кадр 1').click(); await page.waitForTimeout(80);
      const before = await snapshot();
      await button('Ластик').click(); await stroke(); assert.notEqual(await snapshot(), before);
      await button('Заливка').click(); await page.locator('canvas').nth(1).click({ position: { x: 20, y: 20 } });
      assert.notEqual(await snapshot(), before);
      await button('Фигуры').click(); await button('Квадрат').click(); await stroke(.2, .2, .5, .6);
      await button('Текст').click(); await page.locator('canvas').nth(1).click({ position: { x: 140, y: 140 } });
      await page.locator('main input').fill('Привет');
      assert.equal(await page.evaluate(() => {
        const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented;
      }), true);
      await page.locator('main input').press('Enter');
      await button('Стикер').click(); await button('Выбрать стикер ⭐').click();
      await page.locator('canvas').nth(1).click({ position: { x: 380, y: 240 } });
      await button('Кисть').click();
      await button('Копировать текущий кадр').click();
      await button('Выбрать кадр 3').waitFor();
      await button('Удалить текущий кадр').click();
      assert.equal(await button('Выбрать кадр 3').count(), 0);
      await button('Запустить просмотр мультика').click(); await button('Остановить просмотр мультика').waitFor();
      await button('Остановить просмотр мультика').click();
      const pngPromise = page.waitForEvent('download'); await button('Сохранить картинку в формате PNG').click();
      const png = await pngPromise; assert.match(png.suggestedFilename(), /\.png$/); assert.equal(await png.failure(), null);
      const gifPromise = page.waitForEvent('download', { timeout: 30000 }); await button('Сохранить мультик в GIF').click();
      const gif = await gifPromise; const bytes = await fs.readFile(await gif.path()); assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
      await home(); const p = await data();
      assert.ok(p.frames.some(f => f.objects.some(o => o.kind === 'text' && o.text === 'Привет')));
      assert.ok(p.frames.some(f => f.objects.some(o => o.kind === 'sticker')));
    });

    await t.test('moving a raster object removes its old position; undo and redo preserve the drawing', async () => {
      await create('Перемещение'); await stroke(.2,.2,.4,.2); const initial = await snapshot();
      await button('Переместить').click(); await stroke(.3,.2,.3,.6);
      await button('Кисть').click(); await page.waitForTimeout(80);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(240,120,1,1).data]), [255,255,255,255]);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(240,360,1,1).data]), [0,0,0,255]);
      await button('Переместить').click(); await stroke(.3,.6,.3,.8); await button('Кисть').click(); await page.waitForTimeout(80);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(240,360,1,1).data]), [255,255,255,255]);
      // Return to the first move before checking its undo/redo boundary.
      await button('Отменить последнее действие').click(); await page.waitForTimeout(80);
      const moved = await snapshot(); await button('Отменить последнее действие').click();
      await page.waitForFunction(expected => document.querySelector('canvas').toDataURL() === expected, initial);
      await button('Повторить отменённое действие').click();
      await page.waitForFunction(expected => document.querySelector('canvas').toDataURL() === expected, moved);
      await home();
    });

    await t.test('moving paint above a text object keeps semantic text and all raster layers through reload', async () => {
      await create('Слои');
      await button('Текст').click(); await page.locator('canvas').nth(1).click({ position: { x: 100, y: 150 } });
      await page.locator('main input').fill('Текст'); await page.locator('main input').press('Enter');
      await button('Кисть').click(); await stroke(.55,.3,.7,.3);
      await button('Переместить').click(); await stroke(.62,.3,.62,.65); await button('Кисть').click();
      await home(); const stored = await data();
      assert.ok(stored.frames[0].objects.some(o => o.kind === 'text' && o.text === 'Текст'));
      assert.ok(stored.frames[0].objects.some(o => o.kind === 'raster'));
      await page.reload(); await button('Открыть мультик «Слои»').click(); await page.locator('canvas').first().waitFor(); await page.waitForTimeout(100);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(496,180,1,1).data]), [255,255,255,255]);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(496,390,1,1).data]), [0,0,0,255]);
      await home();
    });

    await t.test('image import, immediate exit after import, malformed file, save failure retained and retry', async () => {
      await button('Открыть мультик «А»').click(); await page.locator('canvas').first().waitFor(); await page.waitForTimeout(80);
      const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 24; c.height = 24; const ctx = c.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 24, 24); return c.toDataURL().split(',')[1]; });
      await page.locator('input[type=file]').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
      await home(); const imported = await data();
      assert.equal(imported.frames.find(f => f.id === imported.currentFrameId).objects.length, 0);
      await button('Открыть мультик «А»').click(); await page.locator('canvas').first().waitFor(); await page.waitForTimeout(80);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(400,300,1,1).data]), [255,0,0,255]);
      await page.locator('input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
      await page.getByRole('alert').filter({ hasText: 'Не удалось открыть файл изображения' }).waitFor();
      const beforeRejected = (await data()).frames;
      await page.locator('input[type=file]').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
      await page.getByRole('alert').filter({ hasText: 'Файл слишком большой' }).waitFor();
      const dimensions = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 8193; c.height = 1; return c.toDataURL().split(',')[1]; });
      await page.locator('input[type=file]').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(dimensions, 'base64') });
      await page.getByRole('alert').filter({ hasText: 'Разрешение изображения слишком велико' }).waitFor();
      assert.deepEqual((await data()).frames, beforeRejected);
      const largeImage = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 4096; c.height = 2048; const ctx = c.getContext('2d'); ctx.fillStyle = 'blue'; ctx.fillRect(0,0,c.width,c.height); return c.toDataURL().split(',')[1]; });
      await page.locator('input[type=file]').setInputFiles({ name: 'photo-size.png', mimeType: 'image/png', buffer: Buffer.from(largeImage,'base64') });
      await home(); await button('Открыть мультик «А»').click(); await page.locator('canvas').first().waitFor();
      await page.waitForFunction(() => document.querySelector('canvas').getContext('2d').getImageData(400,300,1,1).data[2] === 255);
      assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(400,300,1,1).data]), [0,0,255,255]);
      await page.evaluate(() => { window.auditPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
      await stroke(.1, .8, .8, .8); const edited = await snapshot();
      await button('Вернуться ко всем мультикам').click();
      await page.getByRole('alert').filter({ hasText: 'Ошибка сохранения' }).waitFor();
      assert.equal(await page.locator('canvas').count(), 2); assert.equal(await snapshot(), edited);
      await page.evaluate(() => { IDBObjectStore.prototype.put = window.auditPut; delete window.auditPut; });
      await home(); await button('Открыть мультик «А»').click();
      await page.waitForFunction(expected => document.querySelector('canvas')?.toDataURL() === expected, edited);
      await home();
    });

    await t.test('missing project navigation and damaged record do not block healthy projects', async () => {
      await page.evaluate(async () => {
        const repo = (await import('/src/services/projectRepository.ts')).projectRepository;
        const summaries = await repo.listProjects();
        const id = summaries.find(p => p.title === 'А').id;
        window.auditMissing = await repo.loadProject(id);
        await repo.deleteProject(id);
      });
      await button('Открыть мультик «А»').click(); await page.getByText('Не удалось найти выбранный мультик', { exact: true }).waitFor();
      await page.evaluate(async () => { await (await import('/src/services/projectRepository.ts')).projectRepository.saveProject(window.auditMissing); delete window.auditMissing; });
      await button('Мои мультики').click();
      await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
          const r = indexedDB.open('multipulti', 1); r.onsuccess = () => { const db = r.result; const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ title: {}, version: 2, frames: null, updatedAt: Infinity }, 'damaged'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
        });
      });
      await page.reload(); await page.getByText('Не удалось прочитать данные', { exact: true }).waitFor();
      await button('Открыть мультик «А»').click(); await page.locator('canvas').first().waitFor(); await home();
    });

    await t.test('six requested viewports: home, project dialog, editor and no horizontal overflow', async () => {
      for (const [width, height] of [[320,700],[390,844],[768,1024],[1180,820],[1440,900],[1920,1080]]) {
        await page.setViewportSize({ width, height }); await shot(`home-${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `home overflow ${width}`);
        await button('Создать мультик').click(); await page.getByRole('dialog', { name: 'Новый мультик' }).waitFor(); await shot(`dialog-${width}`);
        const box = await page.getByRole('dialog', { name: 'Новый мультик' }).boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
        await button('Отмена').click(); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        await button('Открыть мультик «А»').click(); await page.locator('canvas').first().waitFor(); await page.waitForTimeout(80); await shot(`editor-${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `editor overflow ${width}`);
        const canvas = await page.locator('canvas').first().boundingBox(); assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.x + canvas.width <= width);
        if (width < 768) {
          await button('Настройки инструмента').click(); await page.getByRole('dialog', { name: 'Настройки инструмента' }).waitFor();
          await button('Красный').click(); await button('Закрыть настройки').click();
        }
        await home();
      }
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.deepEqual(errors, []);
    });

    await t.test('real IndexedDB migration from current plus a different localStorage project is repeatable', async () => {
      const migrationContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
      await migrationContext.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
      const previousPage = page; page = await migrationContext.newPage(); watch(page);
      try {
        await page.goto(origin, { waitUntil: 'domcontentloaded' }); await button('Создать первый мультик').waitFor();
        await page.evaluate(async () => {
          const { createNewProject } = await import('/src/domain/project.ts');
          const old = createNewProject('Старый IDB'); delete old.id;
          localStorage.setItem('multipulti_state', JSON.stringify({ history: [{ frames: [old.frames[0].bitmap, old.frames[0].bitmap] }], currentFrame: 1 }));
          await new Promise(resolve => {
            const r = indexedDB.open('multipulti', 1); r.onsuccess = () => { const db = r.result; const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(old, 'current'); tx.oncomplete = () => { db.close(); resolve(); }; };
          });
        });
        await page.reload(); await button('Открыть мультик «Старый IDB»').waitFor(); await button('Открыть мультик «Мой мультик»').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('multipulti_state')), null);
        await page.reload(); await button('Открыть мультик «Мой мультик»').waitFor(); assert.equal(await page.locator('.project-card').count(), 2);
        await create('Новый после обновления'); await home(); assert.equal(await page.locator('.project-card').count(), 3);
        await button('Открыть мультик «Мой мультик»').click(); await button('Выбрать кадр 2').waitFor(); await home();
      } finally { page = previousPage; await migrationContext.close(); }
    });

    await t.test('mobile touch input draws and saves; tool settings are reachable', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await mobile.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
      const previousPage = page; page = await mobile.newPage(); watch(page);
      try {
        await page.goto(origin, { waitUntil: 'domcontentloaded' }); await button('Создать первый мультик').waitFor(); await create('Сенсорный мультик');
        await button('Настройки инструмента').tap(); await button('Красный').tap(); await button('Закрыть настройки').tap();
        const rect = await page.locator('canvas').nth(1).boundingBox();
        await page.touchscreen.tap(rect.x + rect.width*.5, rect.y + rect.height*.5);
        await page.waitForFunction(() => !document.querySelector('[aria-label="Отменить последнее действие"]').disabled);
        await button('Вернуться ко всем мультикам').tap(); await button('Открыть мультик «Сенсорный мультик»').waitFor();
        await button('Открыть мультик «Сенсорный мультик»').tap(); await page.locator('canvas').first().waitFor();
        await page.waitForFunction(() => document.querySelector('canvas').getContext('2d').getImageData(0,0,1,1).data[3] > 0);
        assert.deepEqual(await page.locator('canvas').first().evaluate(c => [...c.getContext('2d').getImageData(400,300,1,1).data]), [255,59,48,255]);
      } finally { page = previousPage; await mobile.close(); }
    });

    await t.test('50 projects in real IndexedDB and 100 frames render; repeated tool switches stay responsive', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const timing = await page.evaluate(async () => {
        const { createNewProject, copyFrame } = await import('/src/domain/project.ts'); const repo = (await import('/src/services/projectRepository.ts')).projectRepository;
        const start = performance.now();
        for (let n = 0; n < 50; n++) { const p = createNewProject(`Нагрузка ${n}`); if (n === 49) p.frames = Array.from({ length: 100 }, () => copyFrame(p.frames[0])); p.currentFrameId = p.frames[0].id; await repo.saveProject(p); }
        const listStart = performance.now(); const summaries = await repo.listProjects();
        return { count: summaries.length, saveMs: Math.round(listStart-start), listMs: Math.round(performance.now()-listStart) };
      });
      console.log('Real IndexedDB load:', JSON.stringify(timing)); assert.ok(timing.count >= 50);
      await page.reload(); await button('Открыть мультик «Нагрузка 49»').waitFor(); await shot('home-50-projects');
      await button('Открыть мультик «Нагрузка 49»').click(); await button('Выбрать кадр 100').waitFor();
      for (let n = 0; n < 10; n++) { await button('Кисть').click(); await button('Ластик').click(); await button('Фигуры').click(); }
      await button('Кисть').click(); await home(); assert.deepEqual(errors, []);
    });
  } finally { await context.close(); await browser.close(); }
});

test('production build: drawing survives a full browser restart', { skip: !process.env.TEST_PRODUCTION_ORIGIN, timeout: 90000 }, async () => {
  const tempRoot = path.resolve(os.tmpdir());
  const profile = await fs.mkdtemp(path.join(tempRoot, 'multipulti-release-'));
  assert.ok(path.resolve(profile).startsWith(tempRoot + path.sep));
  let context;
  const errors = [];
  async function open() {
    context = await chromium.launchPersistentContext(profile, { channel: process.env.TEST_BROWSER_CHANNEL || 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    const p = await context.newPage(); p.setDefaultTimeout(12000);
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(process.env.TEST_PRODUCTION_ORIGIN, { waitUntil: 'domcontentloaded' });
    return p;
  }
  try {
    let p = await open();
    const b = name => p.getByRole('button', { name, exact: true });
    await b('Создать первый мультик').click(); await p.getByRole('textbox').fill('Production'); await b('Создать').click();
    await p.locator('canvas').first().waitFor(); await p.waitForTimeout(100);
    const rect = await p.locator('canvas').nth(1).boundingBox();
    await p.mouse.move(rect.x + rect.width*.2, rect.y + rect.height*.3); await p.mouse.down();
    await p.mouse.move(rect.x + rect.width*.7, rect.y + rect.height*.6, { steps: 10 }); await p.mouse.up();
    const painted = await p.locator('canvas').first().evaluate(c => c.toDataURL());
    await b('Новый кадр').click(); await b('Вернуться ко всем мультикам').click();
    await b('Открыть мультик «Production»').waitFor();
    await context.close(); context = undefined;
    p = await open(); await b('Открыть мультик «Production»').click(); await b('Выбрать кадр 2').waitFor(); await b('Выбрать кадр 1').click();
    await p.waitForFunction(expected => document.querySelector('canvas')?.toDataURL() === expected, painted);
    const download = p.waitForEvent('download'); await b('Сохранить мультик в GIF').click();
    const bytes = await fs.readFile(await (await download).path()); assert.equal(bytes.subarray(0,6).toString(), 'GIF89a');
    if (shots) await p.screenshot({ path: path.join(shots, 'production-1440.png') });
    assert.deepEqual(errors, []);
  } finally {
    await context?.close();
    // This is a uniquely generated test profile under the verified temporary root.
    assert.ok(path.resolve(profile).startsWith(tempRoot + path.sep));
    await fs.rm(profile, { recursive: true, force: true });
  }
});
