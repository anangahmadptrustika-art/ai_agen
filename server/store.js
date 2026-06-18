'use strict';

/**
 * Penyimpanan data sederhana berbasis file JSON.
 * Dipakai supaya aplikasi bisa berjalan tanpa database eksternal
 * maupun dependency native (mis. better-sqlite3).
 *
 * Struktur file:
 *   data/members.json     -> daftar anggota tim + face descriptor
 *   data/attendance.json  -> catatan absensi
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

function ensureFile(file, fallback) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
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
  // Tulis atomik: tulis ke file sementara lalu rename.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function todayString(date = new Date()) {
  // Format tanggal lokal YYYY-MM-DD (bukan UTC) supaya sesuai zona waktu pengguna.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ----------------------------- MEMBERS ----------------------------- */

function getMembers() {
  return readJson(MEMBERS_FILE, []);
}

function addMember({ name, role, descriptor }) {
  if (!name || typeof name !== 'string') {
    throw new Error('Nama anggota wajib diisi.');
  }
  if (!Array.isArray(descriptor) || descriptor.length === 0) {
    throw new Error('Face descriptor tidak valid.');
  }

  const members = getMembers();
  const member = {
    id: crypto.randomUUID(),
    name: name.trim(),
    role: (role || '').trim(),
    // Simpan satu atau lebih descriptor untuk satu orang (multi-sample).
    descriptors: [descriptor],
    createdAt: new Date().toISOString(),
  };
  members.push(member);
  writeJson(MEMBERS_FILE, members);
  return member;
}

function addDescriptorToMember(id, descriptor) {
  const members = getMembers();
  const member = members.find((m) => m.id === id);
  if (!member) return null;
  if (!Array.isArray(member.descriptors)) member.descriptors = [];
  member.descriptors.push(descriptor);
  writeJson(MEMBERS_FILE, members);
  return member;
}

function deleteMember(id) {
  const members = getMembers();
  const next = members.filter((m) => m.id !== id);
  const removed = next.length !== members.length;
  if (removed) writeJson(MEMBERS_FILE, next);
  return removed;
}

/* --------------------------- ATTENDANCE ---------------------------- */

function getAttendance(date) {
  const records = readJson(ATTENDANCE_FILE, []);
  if (!date) return records;
  return records.filter((r) => r.date === date);
}

/**
 * Catat absensi anggota. Aturan: satu orang hanya tercatat sekali per hari.
 * Mengembalikan { status: 'recorded' | 'already', record }.
 */
function recordAttendance(memberId, method = 'hand-raise') {
  const members = getMembers();
  const member = members.find((m) => m.id === memberId);
  if (!member) {
    throw new Error('Anggota tidak ditemukan.');
  }

  const now = new Date();
  const date = todayString(now);
  const records = readJson(ATTENDANCE_FILE, []);

  const existing = records.find(
    (r) => r.memberId === memberId && r.date === date
  );
  if (existing) {
    return { status: 'already', record: existing };
  }

  const record = {
    id: crypto.randomUUID(),
    memberId,
    name: member.name,
    role: member.role || '',
    date,
    timestamp: now.toISOString(),
    method,
  };
  records.push(record);
  writeJson(ATTENDANCE_FILE, records);
  return { status: 'recorded', record };
}

module.exports = {
  todayString,
  getMembers,
  addMember,
  addDescriptorToMember,
  deleteMember,
  getAttendance,
  recordAttendance,
};
