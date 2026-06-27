'use strict';

/* Helper bersama: pemanggilan API, toast, navigasi aktif. */

/* ----------------------- Proteksi password opsional ------------------- */
/* Bila server mengaktifkan APP_PASSWORD, request akan 401 sampai token diisi.
   Token disimpan di localStorage dan dikirim sebagai header X-App-Token. */
let appToken = (() => { try { return localStorage.getItem('appToken') || ''; } catch (_) { return ''; } })();

async function authFetch(url, opts = {}) {
  const withToken = (tok) => {
    const headers = Object.assign({}, opts.headers || {});
    if (tok) headers['X-App-Token'] = tok;
    return fetch(url, Object.assign({}, opts, { headers }));
  };
  let res = await withToken(appToken);
  if (res.status === 401) {
    const entered = window.prompt('Aplikasi terkunci. Masukkan kata sandi aplikasi:');
    if (entered) {
      appToken = entered;
      try { localStorage.setItem('appToken', appToken); } catch (_) {}
      res = await withToken(appToken);
      if (res.status === 401) {
        try { localStorage.removeItem('appToken'); } catch (_) {}
        appToken = '';
      }
    }
  }
  return res;
}

const API = {
  async getMembers() {
    const r = await authFetch('/api/members');
    if (!r.ok) throw new Error('Gagal memuat anggota');
    return r.json();
  },
  async addMember(payload) {
    const r = await authFetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal menambah anggota');
    return r.json();
  },
  async addDescriptor(id, descriptor) {
    const r = await authFetch(`/api/members/${id}/descriptors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor }),
    });
    if (!r.ok) throw new Error('Gagal menambah sampel wajah');
    return r.json();
  },
  async deleteMember(id) {
    const r = await authFetch(`/api/members/${id}`, { method: 'DELETE' });
    return r.ok;
  },
  async getAttendance(date) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    // Kirim tanggal lokal "hari ini" agar server bisa auto-tutup absensi
    // hari sebelumnya yang lupa checkout.
    params.set('today', localDateStr());
    const r = await authFetch(`/api/attendance?${params.toString()}`);
    if (!r.ok) throw new Error('Gagal memuat absensi');
    return r.json();
  },
  async getAttendanceRange(from, to) {
    const params = new URLSearchParams({ from, to, today: localDateStr() });
    const r = await authFetch(`/api/attendance/range?${params.toString()}`);
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat rekap');
    return r.json();
  },
  async recordAttendance(payload) {
    const r = await authFetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('Gagal mencatat absensi');
    return r.json();
  },
};

/* --------------------- Konfigurasi jam kerja -------------------------- */
/* Ubah di sini bila jam kantor berbeda. Format: menit sejak tengah malam. */
const WORK = {
  START: 8 * 60,   // 08:00 — jam masuk
  END: 17 * 60,    // 17:00 — jam pulang
  startLabel: '08:00',
  endLabel: '17:00',
};

/* Menit sejak tengah malam dari sebuah Date (waktu lokal perangkat). */
function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}
/* Keterlambatan (menit) dari jam masuk, berdasar waktu check-in lokal. */
function lateMinutesFrom(iso) {
  const m = minutesOfDay(new Date(iso));
  return Math.max(0, m - WORK.START);
}
/* Format durasi menit jadi teks ramah: "45 menit" / "1 jam 15 menit". */
function formatLate(mins) {
  mins = Math.round(mins);
  if (mins <= 0) return 'Tepat waktu';
  if (mins < 60) return `${mins} menit`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} jam ${m} menit` : `${h} jam`;
}

/* ----------------------- Sangsi keterlambatan ------------------------- */
/* Tanpa toleransi. Sangsi (jam) = ceil(menit/60) + 1, ditambah ke 17:00.
   Telat jam ke-1 -> sangsi 2 jam (pulang 19:00); jam ke-2 -> 3 jam (20:00). */
function sanctionHours(lateMinutes) {
  return lateMinutes > 0 ? Math.ceil(lateMinutes / 60) + 1 : 0;
}
function allowedCheckoutMinutes(lateMinutes) {
  return WORK.END + sanctionHours(lateMinutes) * 60;
}
function minutesToHHMM(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/* Tanggal lokal perangkat (YYYY-MM-DD). */
function localDateStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
/* Jam paling awal boleh absen pulang (mis. "19:00"). */
function allowedCheckoutLabel(lateMinutes) {
  return minutesToHHMM(allowedCheckoutMinutes(lateMinutes));
}

/* --------------------------- Sistem Poin ------------------------------ */
/* Penilaian untuk rekap: makin cepat datang & makin disiplin, makin tinggi. */
const POINTS = {
  hadir: 1,          // hadir hari itu
  tepatWaktu: 2,     // masuk <= 08:00
  tercepat1: 5,      // tercepat ke-1 hari itu
  tercepat2: 3,      // tercepat ke-2
  tercepat3: 1,      // tercepat ke-3
  telatBerat: -1,    // terlambat > 120 menit
  overtime: 5,       // hadir di hari Sabtu/Minggu (nilai tambahan)
};

/* --------------------------- Akhir pekan ------------------------------ */
/* True bila tanggal (YYYY-MM-DD) jatuh pada Sabtu atau Minggu. */
function isWeekend(dateStr) {
  if (!dateStr) return false;
  const p = String(dateStr).split('-').map(Number);
  const wd = new Date(p[0], p[1] - 1, p[2]).getDay(); // 0=Minggu, 6=Sabtu
  return wd === 0 || wd === 6;
}

/* Keterlambatan efektif sebuah record: di akhir pekan = 0 (overtime). */
function attendanceLate(record) {
  if (!record) return 0;
  if (isWeekend(record.date)) return 0;
  return lateMinutesFrom(record.checkIn || record.timestamp);
}

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
