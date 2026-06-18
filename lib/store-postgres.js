'use strict';

/**
 * Backend penyimpanan berbasis PostgreSQL.
 * Aktif ketika environment variable DATABASE_URL diset.
 * Portabel: bisa dipakai dengan Vercel Postgres, Neon, Supabase, Railway, dll.
 *
 * Catatan serverless: pool koneksi di-cache pada globalThis agar tidak
 * membuat koneksi baru di setiap invokasi fungsi (mencegah "too many clients").
 */

const crypto = require('crypto');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

// Aktifkan SSL untuk koneksi remote (Neon/Supabase/dll), nonaktif untuk localhost.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || '');
const sslOption = isLocal ? false : { rejectUnauthorized: false };

function getPool() {
  if (!globalThis.__absensiPool) {
    globalThis.__absensiPool = new Pool({
      connectionString,
      ssl: sslOption,
      max: 3,
      idleTimeoutMillis: 10000,
    });
  }
  return globalThis.__absensiPool;
}

function todayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Buat tabel bila belum ada. Dijalankan sekali (hasilnya di-cache).
async function init() {
  if (!globalThis.__absensiInit) {
    globalThis.__absensiInit = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS members (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          role        TEXT NOT NULL DEFAULT '',
          descriptors JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS attendance (
          id        TEXT PRIMARY KEY,
          member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          name      TEXT NOT NULL,
          role      TEXT NOT NULL DEFAULT '',
          date      DATE NOT NULL,
          ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
          method    TEXT NOT NULL DEFAULT 'hand-raise',
          UNIQUE (member_id, date)
        );
      `);
    })();
  }
  return globalThis.__absensiInit;
}

function mapMember(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role || '',
    descriptors: row.descriptors || [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function mapRecord(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    name: row.name,
    role: row.role || '',
    date: row.date, // sudah string 'YYYY-MM-DD' karena di-cast di query
    timestamp: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
    method: row.method,
  };
}

async function getMembers() {
  await init();
  const { rows } = await getPool().query(
    'SELECT id, name, role, descriptors, created_at FROM members ORDER BY created_at ASC'
  );
  return rows.map(mapMember);
}

async function addMember({ name, role, descriptor }) {
  await init();
  if (!name || typeof name !== 'string') throw new Error('Nama anggota wajib diisi.');
  if (!Array.isArray(descriptor) || descriptor.length === 0) {
    throw new Error('Face descriptor tidak valid.');
  }
  const id = crypto.randomUUID();
  const { rows } = await getPool().query(
    `INSERT INTO members (id, name, role, descriptors)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, name, role, descriptors, created_at`,
    [id, name.trim(), (role || '').trim(), JSON.stringify([descriptor])]
  );
  return mapMember(rows[0]);
}

async function addDescriptorToMember(id, descriptor) {
  await init();
  const { rows } = await getPool().query(
    `UPDATE members
       SET descriptors = descriptors || $2::jsonb
     WHERE id = $1
     RETURNING id, name, role, descriptors, created_at`,
    [id, JSON.stringify([descriptor])]
  );
  return rows[0] ? mapMember(rows[0]) : null;
}

async function deleteMember(id) {
  await init();
  const res = await getPool().query('DELETE FROM members WHERE id = $1', [id]);
  return res.rowCount > 0;
}

async function getAttendance(date) {
  await init();
  if (date) {
    const { rows } = await getPool().query(
      `SELECT id, member_id, name, role, to_char(date, 'YYYY-MM-DD') AS date, ts, method
         FROM attendance WHERE date = $1 ORDER BY ts ASC`,
      [date]
    );
    return rows.map(mapRecord);
  }
  const { rows } = await getPool().query(
    `SELECT id, member_id, name, role, to_char(date, 'YYYY-MM-DD') AS date, ts, method
       FROM attendance ORDER BY ts ASC`
  );
  return rows.map(mapRecord);
}

async function recordAttendance(memberId, method = 'hand-raise', date) {
  await init();
  const pool = getPool();

  const memberRes = await pool.query('SELECT id, name, role FROM members WHERE id = $1', [memberId]);
  const member = memberRes.rows[0];
  if (!member) throw new Error('Anggota tidak ditemukan.');

  const day = date || todayString();
  const id = crypto.randomUUID();

  const insert = await pool.query(
    `INSERT INTO attendance (id, member_id, name, role, date, method)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (member_id, date) DO NOTHING
     RETURNING id, member_id, name, role, to_char(date, 'YYYY-MM-DD') AS date, ts, method`,
    [id, memberId, member.name, member.role || '', day, method]
  );

  if (insert.rows[0]) {
    return { status: 'recorded', record: mapRecord(insert.rows[0]) };
  }

  // Sudah ada -> ambil record yang sudah tercatat hari itu.
  const existing = await pool.query(
    `SELECT id, member_id, name, role, to_char(date, 'YYYY-MM-DD') AS date, ts, method
       FROM attendance WHERE member_id = $1 AND date = $2`,
    [memberId, day]
  );
  return { status: 'already', record: mapRecord(existing.rows[0]) };
}

module.exports = {
  backend: 'postgres',
  todayString,
  init,
  getMembers,
  addMember,
  addDescriptorToMember,
  deleteMember,
  getAttendance,
  recordAttendance,
};
