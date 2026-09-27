import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Простой загрузчик .env (без внешних зависимостей).
// Если рядом лежит файл .env — подставляет значения в process.env.
function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const CONFIG = {
port: parseInt(process.env.PORT || '3000', 10),
  mainColor: process.env.MAIN_COLOR || '#6c5ce7',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  // ИИ для конструктора презентаций на сайте (OpenAI-совместимый API)
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.AI_MODEL || ''
  },
  // Учётная запись администратора (создаётся при первом запуске).
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin12345',
  dirs: {
    root: __dirname,
    public: path.join(__dirname, 'public'),
    data: path.join(__dirname, 'data'),
    uploads: path.join(__dirname, 'uploads'),
    products: path.join(__dirname, 'uploads', 'products')
  }
};

export default CONFIG;