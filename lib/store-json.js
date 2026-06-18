'use strict';

/**
 * Backend penyimpanan berbasis file JSON.
 * Dipakai untuk pengembangan lokal saat DATABASE_URL tidak diset.
 * Semua fungsi dibuat async agar antarmukanya sama dengan backend Postgres.
 *
 * Catatan: backend ini TIDAK cocok untuk serverless/Vercel karena
 * filesystem-nya ephemeral. Di produksi gunakan Postgres (DATABASE_URL).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WORK_START, allowedCheckoutMinutes } = require('./worktime');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

function ensureFile(file, fallback) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}

function readJson(file, fallback) {
  ensureFile(file, fallback);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || 'null') ?? fallback;
  } catch (err) {
    console.error(`Gagal membaca ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  ensureFile(file, data);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function todayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function init() {
  ensureFile(MEMBERS_FILE, []);
  ensureFile(ATTENDANCE_FILE, []);
}

async function getMembers() {
  return readJson(MEMBERS_FILE, []);
}

async function addMember({ name, role, descriptor }) {
  if (!name || typeof name !== 'string') throw new Error('Nama anggota wajib diisi.');
  if (!Array.isArray(descriptor) || descriptor.length === 0) {
    throw new Error('Face descriptor tidak valid.');
  }
  const members = readJson(MEMBERS_FILE, []);
  const member = {
    id: crypto.randomUUID(),
    name: name.trim(),
    role: (role || '').trim(),
    descriptors: [descriptor],
    createdAt: new Date().toISOString(),
  };
  members.push(member);
  writeJson(MEMBERS_FILE, members);
  return member;
}

async function addDescriptorToMember(id, descriptor) {
  const members = readJson(MEMBERS_FILE, []);
  const member = members.find((m) => m.id === id);
  if (!member) return null;
  if (!Array.isArray(member.descriptors)) member.descriptors = [];
  member.descriptors.push(descriptor);
  writeJson(MEMBERS_FILE, members);
  return member;
}

async function deleteMember(id) {
  const members = readJson(MEMBERS_FILE, []);
  const next = members.filter((m) => m.id !== id);
  const removed = next.length !== members.length;
  if (removed) writeJson(MEMBERS_FILE, next);
  return removed;
}

async function getAttendance(date) {
  const records = readJson(ATTENDANCE_FILE, []);
  if (!date) return records;
  return records.filter((r) => r.date === date);
}

async function recordAttendance(memberId, opts = {}) {
  const members = readJson(MEMBERS_FILE, []);
  const member = members.find((m) => m.id === memberId);
  if (!member) throw new Error('Anggota tidak ditemukan.');

  const { method = 'hand-raise', date } = opts;
  const time = opts.time || new Date().toISOString();
  const lateMinutes = Number.isFinite(opts.lateMinutes) ? opts.lateMinutes : 0;
  const nowMinutes = Number.isFinite(opts.nowMinutes) ? opts.nowMinutes : null;
  const day = date || todayString();
  const records = readJson(ATTENDANCE_FILE, []);

  const existing = records.find((r) => r.memberId === memberId && r.date === day);

  if (!existing) {
    const record = {
      id: crypto.randomUUID(),
      memberId,
      name: member.name,
      role: member.role || '',
      date: day,
      checkIn: time,
      checkOut: null,
      lateMinutes,
      checkinMinutes: nowMinutes,
      autoCheckout: false,
      timestamp: time, // alias kompatibel
      method,
    };
    records.push(record);
    writeJson(ATTENDANCE_FILE, records);
    return { status: 'checkin', record };
  }

  if (existing.checkOut) {
    return { status: 'already_out', record: existing };
  }

  // Boleh pulang bila waktu lokal sudah melewati jam pulang + sangsi.
  const allowed = allowedCheckoutMinutes(existing.lateMinutes || 0);
  if (nowMinutes !== null && nowMinutes >= allowed) {
    existing.checkOut = time;
    writeJson(ATTENDANCE_FILE, records);
    return { status: 'checkout', record: existing };
  }

  return { status: 'already_in', record: existing };
}

async function finalizeStaleCheckouts(beforeDate) {
  if (!beforeDate) return 0;
  const records = readJson(ATTENDANCE_FILE, []);
  let n = 0;
  for (const r of records) {
    if (r.date < beforeDate && !r.checkOut) {
      const late = r.lateMinutes || 0;
      const checkinMin = r.checkinMinutes != null ? r.checkinMinutes : WORK_START + late;
      const deltaMin = Math.max(0, allowedCheckoutMinutes(late) - checkinMin);
      const base = new Date(r.checkIn || r.timestamp).getTime();
      r.checkOut = new Date(base + deltaMin * 60000).toISOString();
      r.autoCheckout = true;
      n++;
    }
  }
  if (n > 0) writeJson(ATTENDANCE_FILE, records);
  return n;
}

module.exports = {
  backend: 'json',
  todayString,
  init,
  getMembers,
  addMember,
  addDescriptorToMember,
  deleteMember,
  getAttendance,
  recordAttendance,
  finalizeStaleCheckouts,
};
