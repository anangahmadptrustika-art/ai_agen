'use strict';

/* Helper bersama: pemanggilan API, toast, navigasi aktif. */

const API = {
  async getMembers() {
    const r = await fetch('/api/members');
    return r.json();
  },
  async addMember(payload) {
    const r = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal menambah anggota');
    return r.json();
  },
  async addDescriptor(id, descriptor) {
    const r = await fetch(`/api/members/${id}/descriptors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor }),
    });
    if (!r.ok) throw new Error('Gagal menambah sampel wajah');
    return r.json();
  },
  async deleteMember(id) {
    const r = await fetch(`/api/members/${id}`, { method: 'DELETE' });
    return r.ok;
  },
  async getAttendance(date) {
    const q = date ? `?date=${date}` : '';
    const r = await fetch(`/api/attendance${q}`);
    return r.json();
  },
  async recordAttendance(memberId, method, date) {
    const r = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, method, date }),
    });
    if (!r.ok) throw new Error('Gagal mencatat absensi');
    return r.json();
  },
};

/* Toast notifikasi sederhana. */
function toast(title, message = '', type = 'info', ms = 3200) {
  let area = document.querySelector('.toast-area');
  if (!area) {
    area = document.createElement('div');
    area.className = 'toast-area';
    document.body.appendChild(area);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<strong></strong>${message ? '<span></span>' : ''}`;
  el.querySelector('strong').textContent = title;
  if (message) el.querySelector('span').textContent = message;
  area.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* Tandai menu navigasi yang aktif sesuai halaman. */
function markActiveNav() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === path) a.classList.add('active');
  });
}

/* ----------------------------- Tema ----------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch (_) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a1120' : '#ffffff');
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', toggleTheme);
}

/* --------------------------- Avatar inisial --------------------------- */
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  let s = (parts[0] && parts[0][0]) || '?';
  if (parts.length > 1) s += parts[parts.length - 1][0];
  return s.toUpperCase();
}
function avatarHue(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
/* Buat elemen avatar (warna konsisten berdasarkan nama). */
function makeAvatar(name, size) {
  const el = document.createElement('div');
  el.className = 'avatar';
  if (size) el.style.setProperty('--avatar-size', size + 'px');
  const hue = avatarHue(name);
  el.style.background = `linear-gradient(135deg, hsl(${hue} 68% 55%), hsl(${(hue + 38) % 360} 70% 46%))`;
  el.textContent = initials(name);
  return el;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

document.addEventListener('DOMContentLoaded', () => {
  markActiveNav();
  initThemeToggle();
});
