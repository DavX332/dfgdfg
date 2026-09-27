import fs from 'fs';
import path from 'path';
import CONFIG from './config.js';
import { getDb, persist, nextId, newToken, hashPassword, verifyPassword } from './lib/db.js';
import * as ai from './lib/ai.js';
import { buildPptx } from './lib/presenter.js';

// ---------------- Хелперы ----------------

function ok(res, data) {
  res.json({ ok: true, ...data });
}

function fail(res, status, message) {
  res.status(status).json({ ok: false, error: message });
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, isAdmin: !!u.isAdmin, createdAt: u.createdAt };
}

function findSession(db, token) {
  if (!token) return null;
  const s = db.sessions.find((x) => x.token === token);
  if (!s) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}

function categoryLabel(db, key) {
  const c = db.categories.find((x) => x.key === key);
  return c ? c.label : key;
}

// ---------------- Роутер ----------------

export default function api(app, multer) {
  const publicFile = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, CONFIG.dirs.products),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '';
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      }
    }),
    limits: { fileSize: 250 * 1024 * 1024 }
  });

  const db = getDb();

  // ---------- Аутентификация ----------

  app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password) return fail(res, 400, 'Укажите email и пароль');
    if (String(password).length < 6) return fail(res, 400, 'Пароль должен быть не короче 6 символов');
    const mail = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email === mail)) return fail(res, 409, 'Пользователь с таким email уже существует');
    const user = {
      id: nextId('user'),
      email: mail,
      name: (name || '').trim() || mail.split('@')[0],
      passwordHash: hashPassword(password),
      isAdmin: false,
      subscriptions: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    const token = newToken();
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    persist();
    ok(res, { token, user: publicUser(user) });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();
    const user = db.users.find((u) => u.email === mail);
    if (!user || !verifyPassword(password || '', user.passwordHash)) {
      return fail(res, 401, 'Неверный email или пароль');
    }
    const token = newToken();
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    persist();
    ok(res, { token, user: publicUser(user) });
  });

  app.post('/api/logout', (req, res) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    db.sessions = db.sessions.filter((s) => s.token !== token);
    persist();
    ok(res, {});
  });

  app.get('/api/me', (req, res) => {
    const user = findSession(db, (req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!user) return fail(res, 401, 'Не авторизован');
    ok(res, { user: publicUser(user) });
  });

  // ---------- Каталог ----------

  app.get('/api/catalog', (req, res) => {
    ok(res, {
      products: db.products
        .filter((p) => p.active)
        .map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          category: p.category,
          categoryLabel: categoryLabel(db, p.category),
          description: p.description,
          hasFile: !!p.file,
          dateAdded: p.dateAdded
        })),
      categories: db.categories
    });
  });

  // ---------- Конструктор презентаций (ИИ) ----------

  app.post('/api/ai/present', async (req, res) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = findSession(db, token);
    if (!user) return fail(res, 401, 'Войдите в аккаунт, чтобы создавать презентации');
    const { topic, criteria } = req.body || {};
    if (!topic || String(topic).trim().length < 5) {
      return fail(res, 400, 'Укажите тему презентации (минимум 5 символов)');
    }
    const criter = String(criteria || '').trim();
    const title = String(topic).trim();

    try {
      const sys = [
        'Ты — профессиональный автор детальных деловых презентаций.',
        'Отвечай ТОЛЬКО валидным JSON без пояснений, в формате:',
        '{"title":"Название","subtitle":"Подзаголовок","slides":[{"title":"Заголовок слайда","bullets":["Пункт 1","Пункт 2"],"note":"Тезис для докладчика"}]}',
        'Требования к содержанию:',
        '1) 7-12 содержательных слайдов; первый — «Введение», последний — «Итоги и выводы».',
        '2) Каждый bullet — ПОЛНОЕ предложение из 8-18 слов с фактами, цифрами и конкретикой, а не короткая фраза.',
        '3) На каждом слайде 4-6 bullet\'ов — слайд должен быть содержательным и подробным.',
        '4) В поле note дай 1-2 предложения, что докладчик должен сказать голосом.',
        '5) Пиши конкретно, по делу, с цифрами и примерами — избегай воды.'
      ].join(' ');

      const userMsg = `Тема презентации: ${title}\nКритерии и пожелания: ${criter || 'нет (выбери сам)'}`;
      const raw = await ai.chat([
        { role: 'system', content: sys },
        { role: 'user', content: userMsg }
      ], { maxTokens: 7000, temperature: 0.6 });

      const plan = JSON.parse(extractJson(raw));
      if (!plan || !Array.isArray(plan.slides) || !plan.slides.length) {
        throw new Error('ИИ вернул неверную структуру');
      }

      const id = 'gen-' + nextId('order');
      const storedName = `${id}.pptx`;
      const filePath = path.join(CONFIG.dirs.products, storedName);
      await buildPptx({
        title: plan.title || title,
        subtitle: plan.subtitle || '',
        slides: plan.slides
      }, filePath);

      if (!user.generated) user.generated = [];
      user.generated.push({
        id,
        topic: title,
        criteria: criter,
        file: { stored: storedName, name: `${sanitizeFileName(title)}.pptx`, size: fs.statSync(filePath).size },
        createdAt: new Date().toISOString()
      });
      persist();

      ok(res, {
        id,
        fileName: user.generated.find((g) => g.id === id).file.name,
        slides: plan.slides.length
      });
    } catch (err) {
      console.error('[ИИ] ошибка генерации:', err.message);
      if (err.code === 'AI_NOT_CONFIGURED' || err.code === 'AI_ERROR' || err.code === 'AI_EMPTY') {
        return fail(res, 502, err.message);
      }
      fail(res, 502, 'Не удалось сгенерировать презентацию. Попробуйте изменить формулировку.');
    }
  });

  app.get('/api/ai/present/:id/download', (req, res) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = findSession(db, token);
    if (!user) return fail(res, 401, 'Войдите в аккаунт');
    const gen = (user.generated || []).find((g) => g.id === req.params.id);
    if (!gen) return fail(res, 404, 'Презентация не найдена');
    const fp = path.join(CONFIG.dirs.products, gen.file.stored);
    if (!fs.existsSync(fp)) return fail(res, 404, 'Файл отсутствует на сервере');
    res.download(fp, gen.file.name);
  });

  app.get('/api/ai/my', (req, res) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = findSession(db, token);
    if (!user) return fail(res, 401, 'Войдите в аккаунт');
    ok(res, {
      presentations: (user.generated || [])
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((g) => ({
          id: g.id,
          topic: g.topic,
          fileName: g.file.name,
          createdAt: g.createdAt
        }))
    });
  });

  // ---------- Личный кабинет ----------

  app.get('/api/account', (req, res) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = findSession(db, token);
    if (!user) return fail(res, 401, 'Не авторизован');
    const files = db.products
      .filter((p) => p.active && p.file)
      .map((p) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        category: p.category,
        categoryLabel: categoryLabel(db, p.category),
        fileName: p.file.name,
        size: p.file.size
      }));
    ok(res, { user: publicUser(user), files });
  });

  app.get('/api/file/:id/download', (req, res) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = findSession(db, token);
    if (!user) return fail(res, 401, 'Войдите в аккаунт');
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product || !product.file) return fail(res, 404, 'Файл не найден');
    const fp = path.join(CONFIG.dirs.products, product.file.stored);
    if (!fs.existsSync(fp)) return fail(res, 404, 'Файл отсутствует на сервере');
    res.download(fp, product.file.name);
  });

  // ---------- Админка ----------

  function authorizeAdmin(req, res) {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = findSession(db, token);
    if (!user || !user.isAdmin) {
      fail(res, 403, 'Нет прав администратора');
      return null;
    }
    return user;
  }

  app.get('/api/admin/report', (req, res) => {
    const admin = authorizeAdmin(req, res);
    if (!admin) return;
    ok(res, {
      stats: {
        users: db.users.length,
        products: db.products.filter((p) => p.active).length,
        files: db.products.filter((p) => p.file).length
      }
    });
  });

  app.get('/api/admin/products', (req, res) => {
    const admin = authorizeAdmin(req, res);
    if (!admin) return;
    ok(res, { products: db.products, categories: db.categories });
  });

  app.post('/api/admin/products', (req, res) => {
    const admin = authorizeAdmin(req, res);
    if (!admin) return;
    const { title, type, category, description, isFree } = req.body || {};
    if (!title) return fail(res, 400, 'Укажите название');
    const product = {
      id: 'p-' + nextId('product'),
      title: String(title),
      type: type || 'file',
      category: category || 'file',
      description: description || '',
      isFree: !!isFree,
      price: 0,
      file: null,
      dateAdded: new Date().toISOString(),
      active: true
    };
    db.products.push(product);
    persist();
    ok(res, { product });
  });

  app.post('/api/admin/products/:id/upload', publicFile.single('file'), (req, res) => {
    const admin = authorizeAdmin(req, res);
    if (!admin) return;
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product) return fail(res, 404, 'Продукт не найден');
    if (!req.file) return fail(res, 400, 'Файл не загружен');
    // удаляем предыдущий файл
    if (product.file) {
      const old = path.join(CONFIG.dirs.products, product.file.stored);
      if (fs.existsSync(old)) fs.unlink(old, () => {});
    }
    product.file = {
      stored: req.file.filename,
      name: req.file.originalname,
      size: req.file.size,
      updatedAt: new Date().toISOString()
    };
    persist();
    ok(res, { file: product.file });
  });

  app.delete('/api/admin/products/:id', (req, res) => {
    const admin = authorizeAdmin(req, res);
    if (!admin) return;
    const idx = db.products.findIndex((p) => p.id === req.params.id);
    if (idx < 0) return fail(res, 404, 'Продукт не найден');
    const [removed] = db.products.splice(idx, 1);
    if (removed.file) {
      const old = path.join(CONFIG.dirs.products, removed.file.stored);
      if (fs.existsSync(old)) fs.unlink(old, () => {});
    }
    persist();
    ok(res, {});
  });
}

// Извлекает JSON из ответа ИИ (даже если он обёрнут в ```json ... ``` )
function extractJson(text) {
  const s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON не найден в ответе ИИ');
  return candidate.slice(start, end + 1);
}

function sanitizeFileName(name) {
  return String(name || 'presentation')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .slice(0, 60) || 'presentation';
}