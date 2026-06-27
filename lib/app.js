'use strict';

/**
 * Factory aplikasi Express (tanpa app.listen).
 * Dipakai bersama oleh:
 *  - server/index.js  (pengembangan lokal: menambahkan app.listen)
 *  - api/index.js     (serverless function di Vercel)
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { isYmd, isDescriptor, intInRange } = require('./validate');

// Offset zona waktu kantor (menit) untuk perhitungan "hari ini" di sisi server.
const TZ_OFFSET_MIN = parseInt(process.env.TZ_OFFSET_MINUTES || '420', 10);

// Kata sandi aplikasi (opsional). Bila diset, seluruh API data wajib menyertakan
// header X-App-Token yang cocok. Bila kosong, proteksi dimatikan (kompatibel lama).
const APP_PASSWORD = process.env.APP_PASSWORD || '';

function officeToday() {
  const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Perbandingan string tahan timing-attack.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Middleware proteksi password (opsional).
function requireAuth(req, res, next) {
  if (!APP_PASSWORD) return next();
  const token = req.get('x-app-token') || (req.query && req.query.token) || '';
  if (token && safeEqual(token, APP_PASSWORD)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Rate limiter sederhana per-IP (best-effort; di serverless bersifat per-instance).
const rlHits = new Map();
function rateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    let e = rlHits.get(ip);
    if (!e || now - e.ts > 60000) { e = { count: 0, ts: now }; rlHits.set(ip, e); }
    e.count++;
    if (rlHits.size > 5000) rlHits.clear(); // jaga pemakaian memori
    if (e.count > maxPerMin) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan, coba lagi nanti.' });
    }
    next();
  };
}

function createApiRouter() {
  const router = express.Router();

  router.get('/members', requireAuth, async (req, res) => {
    try {
      res.json(await store.getMembers());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/members', requireAuth, rateLimit(30), async (req, res) => {
    try {
      const { name, role, descriptor } = req.body || {};
      if (!isDescriptor(descriptor)) {
        return res.status(400).json({ error: 'Face descriptor tidak valid (harus 128 angka).' });
      }
      if (typeof name !== 'string' || !name.trim() || name.length > 120) {
        return res.status(400).json({ error: 'Nama tidak valid.' });
      }
      if (role != null && (typeof role !== 'string' || role.length > 120)) {
        return res.status(400).json({ error: 'Jabatan tidak valid.' });
      }
      const member = await store.addMember({ name, role, descriptor });
      res.status(201).json(member);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/members/:id/descriptors', requireAuth, rateLimit(30), async (req, res) => {
    try {
      const { descriptor } = req.body || {};
      if (!isDescriptor(descriptor)) {
        return res.status(400).json({ error: 'Face descriptor tidak valid (harus 128 angka).' });
      }
      const member = await store.addDescriptorToMember(req.params.id, descriptor);
      if (!member) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      res.json(member);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/members/:id', requireAuth, rateLimit(30), async (req, res) => {
    try {
      const ok = await store.deleteMember(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/attendance', requireAuth, async (req, res) => {
    try {
      const date = req.query.date || store.todayString();
      if (req.query.date && !isYmd(req.query.date)) {
        return res.status(400).json({ error: 'Format tanggal tidak valid.' });
      }
      const today = req.query.today;
      if (today && isYmd(today)) await store.finalizeStaleCheckouts(today);
      res.json({ date, records: await store.getAttendance(date) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/attendance/range', requireAuth, async (req, res) => {
    try {
      const { from, to, today } = req.query;
      if (!isYmd(from) || !isYmd(to)) {
        return res.status(400).json({ error: 'Parameter from & to harus tanggal YYYY-MM-DD.' });
      }
      if (today && isYmd(today)) await store.finalizeStaleCheckouts(today);
      const records = await store.getAttendanceRange(from, to);
      res.json({ from, to, records });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/attendance', requireAuth, rateLimit(120), async (req, res) => {
    try {
      const { memberId, method, date, time, nowMinutes, lateMinutes } = req.body || {};
      if (typeof memberId !== 'string' || !memberId) {
        return res.status(400).json({ error: 'memberId wajib diisi.' });
      }
      if (date != null && !isYmd(date)) {
        return res.status(400).json({ error: 'Format tanggal tidak valid.' });
      }
      if (nowMinutes != null && !intInRange(nowMinutes, 0, 1440)) {
        return res.status(400).json({ error: 'nowMinutes tidak valid.' });
      }
      if (lateMinutes != null && !intInRange(lateMinutes, 0, 100000)) {
        return res.status(400).json({ error: 'lateMinutes tidak valid.' });
      }
      if (method != null && (typeof method !== 'string' || method.length > 40)) {
        return res.status(400).json({ error: 'method tidak valid.' });
      }
      if (date && isYmd(date)) await store.finalizeStaleCheckouts(date);
      const result = await store.recordAttendance(memberId, { method, date, time, nowMinutes, lateMinutes });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Vercel Cron (~00:00 WIB). Dilindungi CRON_SECRET (bukan APP_PASSWORD) karena
  // dipanggil oleh Vercel dengan header Authorization: Bearer <CRON_SECRET>.
  router.get('/cron', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.authorization || '';
      const expected = `Bearer ${secret}`;
      if (auth.length !== expected.length || !safeEqual(auth, expected)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    try {
      const cutoff = officeToday();
      const finalized = await store.finalizeStaleCheckouts(cutoff);
      res.json({ ok: true, cutoff, finalized });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Health check terbuka (tidak memuat data sensitif).
  router.get('/health', (req, res) =>
    res.json({ ok: true, backend: store.backend, protected: Boolean(APP_PASSWORD), time: new Date().toISOString() })
  );

  return router;
}

function createApp() {
  const app = express();

  // Security headers (juga di-set di vercel.json untuk file statis).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });

  // Batasi ukuran body (descriptor wajah hanya ~2KB; 256kb sudah longgar).
  app.use(express.json({ limit: '256kb' }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const api = createApiRouter();
  app.use('/api', api);
  // Fallback bila platform menghapus prefix "/api" sebelum sampai ke fungsi.
  app.use('/', api);

  return app;
}

module.exports = { createApp, store };
