'use strict';

/**
 * Pemilih backend penyimpanan.
 * - Jika DATABASE_URL diset  -> pakai PostgreSQL (produksi/Vercel).
 * - Jika tidak               -> pakai file JSON (pengembangan lokal).
 */

const store = process.env.DATABASE_URL
  ? require('./store-postgres')
  : require('./store-json');

if (process.env.NODE_ENV !== 'test') {
  console.log(`[absensi] Backend penyimpanan: ${store.backend}`);
}

module.exports = store;
