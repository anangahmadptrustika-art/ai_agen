'use strict';

/**
 * Serverless handler untuk Vercel.
 * Vercel akan memanggil modul ini untuk setiap request ke /api/*
 * (lihat aturan rewrite di vercel.json).
 *
 * Express app diekspor langsung sebagai handler (req, res).
 */

const { createApp } = require('../lib/app');

const app = createApp();

module.exports = app;
