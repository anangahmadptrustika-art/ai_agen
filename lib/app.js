'use strict';

/**
 * Factory aplikasi Express (tanpa app.listen).
 * Dipakai bersama oleh:
 *  - server/index.js  (pengembangan lokal: menambahkan app.listen)
 *  - api/index.js     (serverless function di Vercel)
 */

const express = require('express');
const path = require('path');
const store = require('./store');

// Offset zona waktu kantor (menit) untuk perhitungan "hari ini" di sisi server.
// Default 420 = WIB (UTC+7). Bisa diubah lewat env TZ_OFFSET_MINUTES.
const TZ_OFFSET_MIN = parseInt(process.env.TZ_OFFSET_MINUTES || '420', 10);

// Tanggal "hari ini" menurut zona waktu kantor (YYYY-MM-DD).
function officeToday() {
  const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createApiRouter() {
  const router = express.Router();

  router.get('/members', async (req, res) => {
    try {
      res.json(await store.getMembers());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/members', async (req, res) => {
    try {
      const { name, role, descriptor } = req.body || {};
      const member = await store.addMember({ name, role, descriptor });
      res.status(201).json(member);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/members/:id/descriptors', async (req, res) => {
    try {
      const { descriptor } = req.body || {};
      if (!Array.isArray(descriptor) || descriptor.length === 0) {
        return res.status(400).json({ error: 'Face descriptor tidak valid.' });
      }
      const member = await store.addDescriptorToMember(req.params.id, descriptor);
      if (!member) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      res.json(member);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/members/:id', async (req, res) => {
    try {
      const ok = await store.deleteMember(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/attendance', async (req, res) => {
    try {
      const date = req.query.date || store.todayString();
      // Auto-tutup absensi hari sebelumnya yang lupa checkout.
      const today = req.query.today;
      if (today) await store.finalizeStaleCheckouts(today);
      res.json({ date, records: await store.getAttendance(date) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rekap rentang tanggal (untuk halaman Rekap bulanan).
  router.get('/attendance/range', async (req, res) => {
    try {
      const { from, to, today } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'Parameter from & to wajib diisi.' });
      if (today) await store.finalizeStaleCheckouts(today);
      const records = await store.getAttendanceRange(from, to);
      res.json({ from, to, records });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/attendance', async (req, res) => {
    try {
      const { memberId, method, date, time, nowMinutes, lateMinutes } = req.body || {};
      if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi.' });
      // Tutup otomatis absensi hari-hari sebelumnya yang belum checkout.
      if (date) await store.finalizeStaleCheckouts(date);
      const result = await store.recordAttendance(memberId, { method, date, time, nowMinutes, lateMinutes });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Dipanggil oleh Vercel Cron (lihat vercel.json) ~00:00 WIB setiap hari.
  // Menutup absensi hari-hari sebelumnya yang lupa checkout, walau tidak ada
  // yang membuka aplikasi. Dapat juga dipanggil manual untuk pengujian.
  router.get('/cron', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const cutoff = officeToday();
      const finalized = await store.finalizeStaleCheckouts(cutoff);
      res.json({ ok: true, cutoff, finalized });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/health', (req, res) =>
    res.json({ ok: true, backend: store.backend, time: new Date().toISOString() })
  );

  return router;
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Sajikan frontend statis (untuk mode lokal; di Vercel ditangani layer statis).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const api = createApiRouter();
  app.use('/api', api);
  // Fallback: bila platform sudah menghapus prefix "/api" sebelum sampai ke fungsi.
  app.use('/', api);

  return app;
}

module.exports = { createApp, store };
