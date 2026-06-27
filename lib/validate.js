'use strict';

/* Helper validasi input untuk mencegah data cacat / payload berbahaya. */

// Format tanggal YYYY-MM-DD yang valid (mencegah nilai aneh dipakai sebagai
// kunci objek / dikirim ke query, juga prototype-pollution via kunci tanggal).
function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Face descriptor harus tepat 128 angka berhingga (sesuai output face-api).
// Mencegah penyimpanan array raksasa / tipe tak terduga (storage DoS).
function isDescriptor(d) {
  return Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && Number.isFinite(n));
}

// Angka bulat dalam rentang [min, max] (untuk nowMinutes, lateMinutes, dst).
function intInRange(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

module.exports = { isYmd, isDescriptor, intInRange };
