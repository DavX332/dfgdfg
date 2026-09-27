import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';
import CONFIG from './config.js';
import { getDb, persist, nextId, hashPassword } from './lib/db.js';
import api from './api.js';

// В системе могут быть заданы переменные прокси (HTTP_PROXY/HTTPS_PROXY), ведущие
// на неработающий локальный прокси (напр. 127.0.0.1:10809). Игнорируем их внутри
// приложения, чтобы вызовы к ИИ и ЮKassa шли напрямую. На системные настройки не влияем.
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy']) {
  delete process.env[k];
}

// --- монтируем папки ---
for (const dir of [CONFIG.dirs.data, CONFIG.dirs.uploads, CONFIG.dirs.products]) {
  fs.mkdirSync(dir, { recursive: true });
}

// --- инициализация БД + админ ---
const db = getDb();
if (!db.admin) {
  db.admin = { email: CONFIG.adminEmail, passwordHash: hashPassword(CONFIG.adminPassword) };
  persist();
  console.log(`\n  Админ создан: ${CONFIG.adminEmail} / пароль: ${CONFIG.adminPassword}`);
  console.log('  Обязательно смените пароль после первого входа!\n');
}
// админ также доступен как пользователь
if (!db.users.some((u) => u.email === db.admin.email)) {
  db.users.push({
    id: 'admin',
    email: db.admin.email,
    name: 'Администратор',
    passwordHash: db.admin.passwordHash,
    isAdmin: true,
    subscriptions: [],
    createdAt: new Date().toISOString()
  });
  persist();
}

const app = express();

// raw body для проверки подписи вебхука + JSON
app.use(express.json({ limit: '2mb' }));

// статика
app.use(express.static(CONFIG.dirs.public));

// API
api(app, multer);

// обработка ошибок JSON-парсера
app.use((err, req, res, next) => {
  if (err) {
    console.error('Ошибка:', err.message);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
  next();
});

app.listen(CONFIG.port, () => {
  console.log('==========================================');
  console.log(`  Магазин запущен: http://localhost:${CONFIG.port}`);
  console.log(`  (http://localhost:${CONFIG.port})`);
  console.log('  Админ-панель: /admin.html');
  console.log('==========================================');
});