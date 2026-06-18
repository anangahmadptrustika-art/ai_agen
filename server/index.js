'use strict';

/**
 * Entry point untuk pengembangan LOKAL (`npm start`).
 * Di Vercel, yang dipakai adalah api/index.js (serverless).
 */

// Muat variabel dari file .env bila ada (opsional, untuk lokal).
try { require('dotenv').config(); } catch (_) { /* dotenv opsional */ }

const { createApp, store } = require('../lib/app');

const app = createApp();
const PORT = process.env.PORT || 3000;

// Pastikan skema/tabel siap sebelum menerima request.
store.init().catch((err) => console.error('Gagal inisialisasi penyimpanan:', err.message));

app.listen(PORT, () => {
  console.log(`\n  Sistem Absensi AI Vision berjalan di:`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  Backend penyimpanan: ${store.backend}`);
  console.log('  Buka di browser yang mendukung kamera (Chrome/Edge/Firefox).');
  console.log('  Catatan: gunakan http://localhost agar akses kamera diizinkan.\n');
});
