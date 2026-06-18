'use strict';

const express = require('express');
const path = require('path');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

// Body JSON bisa besar karena memuat face descriptor (array float).
app.use(express.json({ limit: '5mb' }));

// Sajikan frontend statis.
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ------------------------------ API ------------------------------- */

// Daftar anggota tim (termasuk descriptor untuk pencocokan di klien).
app.get('/api/members', (req, res) => {
  res.json(store.getMembers());
});

// Tambah anggota baru hasil registrasi wajah.
app.post('/api/members', (req, res) => {
  try {
    const { name, role, descriptor } = req.body || {};
    const member = store.addMember({ name, role, descriptor });
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tambah sampel wajah baru ke anggota yang sudah ada (meningkatkan akurasi).
app.post('/api/members/:id/descriptors', (req, res) => {
  const { descriptor } = req.body || {};
  if (!Array.isArray(descriptor) || descriptor.length === 0) {
    return res.status(400).json({ error: 'Face descriptor tidak valid.' });
  }
  const member = store.addDescriptorToMember(req.params.id, descriptor);
  if (!member) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
  res.json(member);
});

// Hapus anggota.
app.delete('/api/members/:id', (req, res) => {
  const ok = store.deleteMember(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
  res.json({ ok: true });
});

// Daftar absensi (default: hari ini).
app.get('/api/attendance', (req, res) => {
  const date = req.query.date || store.todayString();
  res.json({ date, records: store.getAttendance(date) });
});

// Catat absensi (dipanggil saat wajah dikenali + tangan terangkat).
app.post('/api/attendance', (req, res) => {
  try {
    const { memberId, method } = req.body || {};
    if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi.' });
    const result = store.recordAttendance(memberId, method);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check.
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`\n  Sistem Absensi AI Vision berjalan di:`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log('  Buka di browser yang mendukung kamera (Chrome/Edge/Firefox).');
  console.log('  Catatan: gunakan http://localhost agar akses kamera diizinkan.\n');
});
