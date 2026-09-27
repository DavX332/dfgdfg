// Общие хелперы для магазина (авторизация, API-запросы)
const API = {
  token() { return localStorage.getItem('token') || ''; },
  setToken(t) { localStorage.setItem('token', t); },
  clear() { localStorage.removeItem('token'); },

  async req(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token()) headers['Authorization'] = 'Bearer ' + this.token();
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Ошибка запроса');
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(url) { return this.req('GET', url); },
  post(url, body) { return this.req('POST', url, body); },
  del(url) { return this.req('DELETE', url); },

  async upload(url, file) {
    const fd = new FormData();
    fd.append('file', file);
    const headers = {};
    if (this.token()) headers['Authorization'] = 'Bearer ' + this.token();
    const res = await fetch(url, { method: 'POST', headers, body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
    return data;
  }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU');
}

function fmtSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
}

const TYPE_META = {
  presentation: { icon: '📊', label: 'Презентация', color: '#6c5ce7' },
  excel: { icon: '📗', label: 'Таблица Excel', color: '#00b894' },
  file: { icon: '📄', label: 'Файл', color: '#e17055' }
};

async function getMe() {
  if (!API.token()) return null;
  try {
    const r = await API.get('/api/me');
    return r.user;
  } catch { return null; }
}

function renderAuth() {
  const user = JSON.parse(localStorage.getItem('me') || 'null');
  const wrap = document.querySelector('.nav-auth');
  if (!wrap) return;
  if (user) {
    wrap.innerHTML = `
      <a class="btn ghost small" href="account.html">Кабинет</a>
      <button class="btn ghost small" onclick="logout()">Выйти</button>`;
  } else {
    wrap.innerHTML = `
      <a class="btn ghost small" href="auth.html?mode=login">Войти</a>
      <button class="btn small" onclick="location.href='auth.html?mode=register'">Регистрация</button>`;
  }
}

async function logout() {
  try { await API.post('/api/logout', {}); } catch {}
  localStorage.removeItem('token');
  localStorage.removeItem('me');
  location.href = 'index.html';
}

// Показ сообщения на js-страницах кабинета/админки
function toast(msg, ok = true) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('success', ok);
  el.classList.toggle('error', !ok);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4000);
}