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

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

document.addEventListener('DOMContentLoaded', markActiveNav);
