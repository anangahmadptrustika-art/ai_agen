'use strict';

/**
 * Aturan jam kerja & sangsi keterlambatan (dipakai backend).
 * Logika waktu-hari memakai menit sejak tengah malam; nilai waktu lokal
 * dikirim oleh klien (nowMinutes) agar konsisten dengan zona waktu pengguna.
 */

const WORK_START = 8 * 60;  // 08:00 — jam masuk
const WORK_END = 17 * 60;   // 17:00 — jam pulang normal

/*
 * Sangsi (dalam jam) berdasarkan keterlambatan.
 * Tidak ada toleransi: terlambat berapa pun > 0 kena sangsi.
 *   terlambat 1..60 menit  (jam ke-1) -> 2 jam
 *   terlambat 61..120 menit (jam ke-2) -> 3 jam
 * Rumus: ceil(menit/60) + 1.
 */
function sanctionHours(lateMinutes) {
  return lateMinutes > 0 ? Math.ceil(lateMinutes / 60) + 1 : 0;
}

/* Menit-hari paling awal seseorang boleh absen pulang (17:00 + sangsi). */
function allowedCheckoutMinutes(lateMinutes) {
  return WORK_END + sanctionHours(lateMinutes) * 60;
}

/* True bila tanggal (YYYY-MM-DD) jatuh pada Sabtu atau Minggu. */
function isWeekend(dateStr) {
  if (!dateStr) return false;
  const p = String(dateStr).split('-').map(Number);
  const wd = new Date(p[0], p[1] - 1, p[2]).getDay(); // 0=Minggu, 6=Sabtu
  return wd === 0 || wd === 6;
}

// Jeda minimum (menit) antara absen masuk & pulang di akhir pekan (overtime),
// agar tidak langsung ter-checkout oleh deteksi berikutnya.
const WEEKEND_MIN_GAP_MINUTES = 30;

module.exports = {
  WORK_START,
  WORK_END,
  WEEKEND_MIN_GAP_MINUTES,
  sanctionHours,
  allowedCheckoutMinutes,
  isWeekend,
};
