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
      res.json({ date, records: await store.getAttendance(date) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/attendance', async (req, res) => {
    try {
      const { memberId, method, date, time, nowMinutes, lateMinutes } = req.body || {};
      if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi.' });
      const result = await store.recordAttendance(memberId, { method, date, time, nowMinutes, lateMinutes });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
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
