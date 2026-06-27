# 🔒 Keamanan Aplikasi

Ringkasan audit keamanan & cara mengamankan aplikasi absensi ini.

## Hasil audit

| Area | Status |
|---|---|
| SQL Injection | ✅ Aman — semua query memakai parameter ($1, $2, …), tidak ada string interpolation. |
| XSS (skrip jahat lewat nama) | ✅ Aman — nama/jabatan dirender via `textContent`, bukan `innerHTML`. |
| Dependency rentan | ✅ `npm audit` = 0 kerentanan (hanya express, pg, dotenv). |
| Validasi input | ✅ Descriptor wajib 128 angka; tanggal wajib format YYYY-MM-DD; angka dibatasi rentang. |
| Ukuran payload | ✅ Body dibatasi 256KB (cegah payload raksasa). |
| Security headers | ✅ `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS. |
| Rate limiting | ✅ Pembatas dasar per-IP pada endpoint tulis (best-effort di serverless). |
| Rahasia (secret) | ✅ Lewat environment variable, `.env` di-`gitignore`, tidak ada di kode/commit. |
| Proteksi data (auth) | ⚠️ **Perlu Anda aktifkan** — lihat di bawah. |

## ⚠️ WAJIB: Aktifkan kata sandi aplikasi (`APP_PASSWORD`)

Tanpa ini, **siapa pun yang tahu URL bisa** melihat data kehadiran dan **mengunduh
data wajah (biometrik)** lewat `/api/members`, menghapus anggota, atau memalsukan
absensi. Aplikasi menyimpan *face descriptor* (vektor angka, bukan foto) — tetap
data pribadi yang harus dilindungi.

**Cara mengaktifkan:**
1. Vercel → project → **Settings → Environment Variables**
2. Tambah **`APP_PASSWORD`** = kata sandi kuat (acak, panjang)
3. **Redeploy**

Setelah aktif:
- Semua endpoint data (`/api/members`, `/api/attendance`, dst.) menolak akses
  tanpa kata sandi (HTTP 401).
- Saat pertama membuka aplikasi/kiosk, browser meminta kata sandi **satu kali**,
  lalu disimpan di perangkat itu (tidak perlu diketik ulang).
- Cek status: `/api/health` akan menampilkan `"protected": true`.

> Catatan: file statis (HTML/CSS/JS) tetap publik — tidak masalah karena **tidak
> memuat data**. Yang dilindungi adalah API datanya.

## Lindungi endpoint cron (`CRON_SECRET`)

Agar `/api/cron` (penutup absensi harian) hanya bisa dipicu oleh Vercel Cron:
1. Tambah env **`CRON_SECRET`** = teks acak.
2. Redeploy. Vercel otomatis mengirim `Authorization: Bearer <CRON_SECRET>`.

## Catatan tambahan

- **`/api/status`** sengaja terbuka untuk pemantauan eksternal; hanya memuat info
  ringan (commit, region, memori). Tidak ada data pribadi.
- **Rate limit** di serverless bersifat per-instance (best-effort). Untuk proteksi
  DDoS yang kuat, aktifkan **Vercel Firewall / WAF** di dashboard.
- **HTTPS** dipakai otomatis oleh Vercel (data terenkripsi saat transit).
- Selalu perlakukan data wajah sesuai aturan privasi; minta persetujuan tim,
  dan hapus data anggota yang sudah tidak bekerja.

## Checklist produksi

- [ ] `APP_PASSWORD` diset (kunci akses data)
- [ ] `CRON_SECRET` diset
- [ ] `DATABASE_URL` diset (data persisten di Postgres)
- [ ] Vercel Firewall diaktifkan (opsional, anti-DDoS)
