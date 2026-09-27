import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import CONFIG from '../config.js';

const DB_FILE = path.join(CONFIG.dirs.data, 'db.json');

export const DEFAULT_DB = {
  products: [
    {
      id: 'pres-biz-plan',
      title: 'Бизнес-план: шаблон презентации',
      type: 'presentation',
      category: 'presentation',
      description: 'Готовый шаблон корпоративной презентации для стартапа или отчёта.',
      price: 0,
      file: null,
      dateAdded: null,
      active: true
    },
    {
      id: 'pres-monthly-report',
      title: 'Ежемесячный отчёт: дизайн-шаблон',
      type: 'presentation',
      category: 'presentation',
      description: 'Аккуратная структура отчёта о продажах и метриках.',
      price: 0,
      file: null,
      dateAdded: null,
      active: true
    },
    {
      id: 'excel-budget',
      title: 'Таблица личного бюджета',
      type: 'excel',
      category: 'excel',
      description: 'Готовый Excel для учёта доходов и расходов с формулами.',
      price: 0,
      file: null,
      dateAdded: null,
      active: true
    },
    {
      id: 'excel-tracker',
      title: 'Трекер задач проекта',
      type: 'excel',
      category: 'excel',
      description: 'Таблица для ведения задач, сроков и статусов команды.',
      price: 0,
      file: null,
      dateAdded: null,
      active: true
    },
    {
      id: 'file-checklist',
      title: 'Чек-лист запуска продукта',
      type: 'file',
      category: 'file',
      description: 'Пошаговый набор задач перед запуском продукта.',
      price: 0,
      file: null,
      dateAdded: null,
      active: true
    }
  ],
  users: [],
  orders: [],
  sessions: [],
  // Категории продуктов, к которым даёт доступ тариф
  categories: [
    { key: 'presentation', label: 'Презентации', color: '#6c5ce7' },
    { key: 'excel', label: 'Таблицы Excel', color: '#00b894' },
    { key: 'file', label: 'Прочие файлы', color: '#e17055' }
  ],
  nextId: {
    product: 1000,
    user: 100,
    order: 5000
  }
};

let state = null;

export function ensureDb() {
  if (!fs.existsSync(CONFIG.dirs.data)) fs.mkdirSync(CONFIG.dirs.data, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
  }
}

export function loadDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  state = JSON.parse(raw);
  return state;
}

export function getDb() {
  if (!state) return loadDb();
  return state;
}

export function persist() {
  if (!state) return;
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function nextId(kind) {
  const db = getDb();
  db.nextId[kind] = (db.nextId[kind] || 1000) + 1;
  return db.nextId[kind];
}

// --- Хэширование паролей (scrypt, без внешних зависимостей) ---

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}