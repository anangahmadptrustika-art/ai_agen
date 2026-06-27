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
const { WORK_START, allowedCheckoutMinutes } = require('./worktime');
const { isDescriptor } = require('./validate');

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
      // Migrasi aman untuk tabel lama: tambah kolom check-out & keterlambatan.
      // `ts` berperan sebagai jam masuk (check-in).
      await pool.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;`);
      await pool.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0;`);
      await pool.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkin_minutes INTEGER;`);
      await pool.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS auto_checkout BOOLEAN NOT NULL DEFAULT false;`);
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

function toIso(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

function mapRecord(row) {
  const checkIn = toIso(row.ts);
  return {
    id: row.id,
    memberId: row.member_id,
    name: row.name,
    role: row.role || '',
    date: row.date, // sudah string 'YYYY-MM-DD' karena di-cast di query
    checkIn,
    checkOut: toIso(row.check_out),
    lateMinutes: row.late_minutes || 0,
    autoCheckout: Boolean(row.auto_checkout),
    timestamp: checkIn, // alias kompatibel
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
  if (!isDescriptor(descriptor)) throw new Error('Face descriptor tidak valid (harus 128 angka).');
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
  if (!isDescriptor(descriptor)) throw new Error('Face descriptor tidak valid (harus 128 angka).');
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

// Daftar kolom yang dibaca untuk satu record absensi.
const REC_COLS = `id, member_id, name, role, to_char(date, 'YYYY-MM-DD') AS date, ts, check_out, late_minutes, checkin_minutes, auto_checkout, method`;

async function getAttendance(date) {
  await init();
  if (date) {
    const { rows } = await getPool().query(
      `SELECT ${REC_COLS} FROM attendance WHERE date = $1 ORDER BY ts ASC`,
      [date]
    );
    return rows.map(mapRecord);
  }
  const { rows } = await getPool().query(
    `SELECT ${REC_COLS} FROM attendance ORDER BY ts ASC`
  );
  return rows.map(mapRecord);
}

// Ambil semua record dalam rentang tanggal [from, to] (inklusif).
async function getAttendanceRange(from, to) {
  await init();
  const { rows } = await getPool().query(
    `SELECT ${REC_COLS} FROM attendance
       WHERE date >= $1 AND date <= $2
       ORDER BY date ASC, ts ASC`,
    [from, to]
  );
  return rows.map(mapRecord);
}

/*
 * Catat absensi dengan logika check-in (masuk) & check-out (pulang) + sangsi.
 * opts: { method, date, time(ISO), nowMinutes, lateMinutes }
 *   nowMinutes  = menit-hari waktu lokal klien (untuk cek kelayakan pulang)
 *   lateMinutes = keterlambatan saat check-in (disimpan)
 * Status kembalian:
 *   'checkin'     -> baru absen masuk
 *   'checkout'    -> baru absen pulang
 *   'already_in'  -> sudah absen masuk, belum boleh pulang (kena sangsi/jam pulang)
 *   'already_out' -> sudah absen masuk & pulang
 */
async function recordAttendance(memberId, opts = {}) {
  await init();
  const pool = getPool();
  const { method = 'hand-raise', date } = opts;
  const time = opts.time || new Date().toISOString();
  const lateMinutes = Number.isFinite(opts.lateMinutes) ? opts.lateMinutes : 0;
  const nowMinutes = Number.isFinite(opts.nowMinutes) ? opts.nowMinutes : null;

  const memberRes = await pool.query('SELECT id, name, role FROM members WHERE id = $1', [memberId]);
  const member = memberRes.rows[0];
  if (!member) throw new Error('Anggota tidak ditemukan.');

  const day = date || todayString();
  const id = crypto.randomUUID();

  // Coba sisipkan sebagai absen MASUK (gagal diam-diam bila sudah ada hari itu).
  const insert = await pool.query(
    `INSERT INTO attendance (id, member_id, name, role, date, ts, late_minutes, checkin_minutes, method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (member_id, date) DO NOTHING
     RETURNING ${REC_COLS}`,
    [id, memberId, member.name, member.role || '', day, time, lateMinutes, nowMinutes, method]
  );

  if (insert.rows[0]) {
    return { status: 'checkin', record: mapRecord(insert.rows[0]) };
  }

  // Sudah ada record hari itu.
  const cur = (await pool.query(
    `SELECT ${REC_COLS} FROM attendance WHERE member_id = $1 AND date = $2`,
    [memberId, day]
  )).rows[0];

  if (cur.check_out) {
    return { status: 'already_out', record: mapRecord(cur) };
  }

  // Absen pulang hanya boleh sejak jam pulang (17:00) — di hari kerja
  // ditambah sangsi. Sebelum itu, yang sudah absen masuk tidak bisa absen lagi.
  const allowed = allowedCheckoutMinutes(cur.late_minutes || 0);
  if (nowMinutes !== null && nowMinutes >= allowed) {
    const upd = await pool.query(
      `UPDATE attendance SET check_out = $3 WHERE member_id = $1 AND date = $2 RETURNING ${REC_COLS}`,
      [memberId, day, time]
    );
    return { status: 'checkout', record: mapRecord(upd.rows[0]) };
  }

  // Sudah absen masuk, tapi belum boleh pulang (kena sangsi / belum jam pulang).
  return { status: 'already_in', record: mapRecord(cur) };
}

/*
 * Auto absen-pulang untuk hari-hari SEBELUM `beforeDate` yang lupa checkout.
 * Jam pulang di-set sesuai jadwal (17:00 + sangsi berdasarkan keterlambatan).
 * Stempel waktu dihitung relatif terhadap check-in agar konsisten zona waktu.
 */
async function finalizeStaleCheckouts(beforeDate) {
  if (!beforeDate) return 0;
  await init();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, ts, late_minutes, checkin_minutes
       FROM attendance
      WHERE date < $1 AND check_out IS NULL`,
    [beforeDate]
  );
  let n = 0;
  for (const r of rows) {
    const late = r.late_minutes || 0;
    const checkinMin = r.checkin_minutes != null ? r.checkin_minutes : WORK_START + late;
    const deltaMin = Math.max(0, allowedCheckoutMinutes(late) - checkinMin);
    const iso = new Date(new Date(r.ts).getTime() + deltaMin * 60000).toISOString();
    await pool.query(
      `UPDATE attendance SET check_out = $2, auto_checkout = true WHERE id = $1`,
      [r.id, iso]
    );
    n++;
  }
  return n;
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
  getAttendanceRange,
  recordAttendance,
  finalizeStaleCheckouts,
};
