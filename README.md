# 👁️ Absensi AI Vision

Sistem aplikasi **absensi otomatis berbasis AI Vision**. Kamera mengenali wajah
anggota tim, lalu mencatat kehadiran secara otomatis ketika anggota
**mengangkat tangan** ✋ — tanpa sentuh, tanpa kartu, tanpa fingerprint.

```
Wajah dikenali  +  Tangan terangkat   ==>   Absensi tercatat ✓
```

## ✨ Fitur

- **Pengenalan wajah real-time** — mengenali setiap anggota tim yang menghadap kamera.
- **Deteksi angkat tangan** — kehadiran hanya tercatat saat anggota mengangkat tangan (mencegah salah catat saat lewat saja).
- **Registrasi mudah** — daftarkan wajah anggota cukup lewat kamera, bisa banyak sampel agar makin akurat.
- **Dashboard rekap** — lihat siapa yang sudah/belum hadir per tanggal, plus **export CSV**.
- **Anti-duplikat** — satu orang hanya tercatat sekali per hari.
- **Privasi** — seluruh pemrosesan AI berjalan di browser; data disimpan lokal di server Anda (file JSON).

## 🧠 Teknologi

| Bagian | Teknologi |
|---|---|
| Pengenalan wajah | [face-api.js](https://github.com/vladmandic/face-api) (TensorFlow.js) — descriptor wajah 128 dimensi |
| Deteksi angkat tangan | [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe) — posisi pergelangan tangan vs bahu |
| Backend | Node.js + Express (serverless-ready untuk Vercel) |
| Database | PostgreSQL (Vercel Postgres / Neon / Supabase) — fallback file JSON saat lokal |
| Frontend | HTML + CSS + JavaScript (tanpa framework) |

## 🚀 Menjalankan Secara Lokal

**Syarat:** Node.js v18+ dan browser modern (Chrome/Edge/Firefox) dengan webcam.

```bash
# 1. Install dependency
npm install

# 2. Jalankan server
npm start

# 3. Buka di browser
#    http://localhost:3000
```

> ⚠️ **Gunakan `http://localhost`** (bukan IP/`file://`). Browser hanya mengizinkan
> akses kamera pada `localhost` atau koneksi HTTPS.

Tanpa konfigurasi apa pun, secara lokal aplikasi memakai penyimpanan **file JSON**
(folder `data/`). Untuk memakai Postgres saat lokal, salin `.env.example` → `.env`
lalu isi `DATABASE_URL`.

---

## ☁️ Deploy Online ke Vercel (+ Database)

Aplikasi sudah disiapkan untuk Vercel: frontend disajikan sebagai static,
API berjalan sebagai serverless function (`api/index.js`), dan data disimpan di
**PostgreSQL**. Karena filesystem Vercel bersifat sementara, **database wajib**
dipakai di produksi.

### Langkah 1 — Push ke GitHub
Repo ini sudah di GitHub. Pastikan branch terbaru sudah ter-push.

### Langkah 2 — Import ke Vercel
1. Buka [vercel.com](https://vercel.com) → login dengan GitHub.
2. **Add New… → Project** → pilih repository ini → **Import**.
3. Biarkan setting default (tidak perlu build command khusus) → **Deploy**.

### Langkah 3 — Buat Database Postgres
**Cara termudah (Vercel Postgres):**
1. Di dashboard project Vercel → tab **Storage** → **Create Database** → **Postgres**.
2. Ikuti wizard → **Connect** ke project ini.
3. Vercel otomatis menambahkan environment variable koneksi (`POSTGRES_URL`, dll).

> Kode ini membaca variabel bernama **`DATABASE_URL`**. Jika Vercel hanya membuat
> `POSTGRES_URL`, tambahkan satu env var lagi bernama `DATABASE_URL` dengan nilai
> yang sama (Project → **Settings → Environment Variables**).

**Alternatif (Neon / Supabase):**
1. Buat database gratis di [neon.tech](https://neon.tech) atau [supabase.com](https://supabase.com).
2. Salin **connection string** (format `postgres://user:pass@host/db?sslmode=require`).
3. Di Vercel → **Settings → Environment Variables** → tambah `DATABASE_URL` = connection string tersebut.

### Langkah 4 — Redeploy
Setelah `DATABASE_URL` diset, buka tab **Deployments → Redeploy** agar variabel
terbaca. Tabel database (`members`, `attendance`) **dibuat otomatis** saat
pertama kali API dipanggil — tidak perlu migrasi manual.

### Langkah 5 — Pakai
Buka URL Vercel Anda (mis. `https://nama-app.vercel.app`). Karena Vercel pakai
HTTPS, akses kamera langsung diizinkan dari perangkat mana pun. 🎉

> 💡 Cek `https://nama-app.vercel.app/api/health` — bila menampilkan
> `"backend":"postgres"`, berarti database sudah aktif. Bila `"json"`, berarti
> `DATABASE_URL` belum terbaca (ulangi Langkah 3–4).

### Cron — auto absen-pulang harian

`vercel.json` mendaftarkan **Vercel Cron** yang berjalan tiap hari ~**00:00 WIB**
(`0 17 * * *` UTC) memanggil `GET /api/cron`. Tugasnya: menutup absensi hari
sebelumnya yang **lupa checkout**, dengan jam pulang sesuai jadwal
(17:00, atau 17:00 + sangsi bila terlambat).

- Cron job muncul di Vercel → **Settings → Cron Jobs** setelah deploy.
- **Opsional (disarankan):** set env `CRON_SECRET` (string acak) agar endpoint
  hanya bisa dipicu oleh cron Vercel. Vercel otomatis mengirim header
  `Authorization: Bearer <CRON_SECRET>` saat menjalankan cron.
- **Opsional:** `TZ_OFFSET_MINUTES` (default `420` = WIB/UTC+7) — sesuaikan
  bila zona waktu kantor berbeda.

> Catatan: finalisasi juga berjalan otomatis (lazy) setiap kali dashboard/halaman
> absensi dibuka, jadi data tetap akurat walau cron belum sempat jalan.

### Pemakaian

1. **Registrasi** (`/register.html`)
   Aktifkan kamera → ketik nama anggota → klik **Tangkap Wajah & Simpan**.
   Ulangi 2–3× per orang (sedikit beda sudut/ekspresi) untuk akurasi terbaik.

2. **Absensi** (`/attendance.html`)
   Klik **Mulai Absensi**. Anggota menghadap kamera (namanya muncul), lalu
   **angkat tangan** → absensi otomatis tercatat.

3. **Dashboard** (`/dashboard.html`)
   Pilih tanggal untuk melihat rekap kehadiran & yang belum hadir, atau export CSV.

## 🌐 Catatan Koneksi Internet

Model AI (face-api.js & MediaPipe) dimuat dari CDN saat pertama kali halaman
dibuka, jadi **butuh internet pada pemakaian awal**. Browser akan men-cache model
untuk pemakaian berikutnya.

Untuk operasi sepenuhnya offline, Anda bisa mengunduh berkas model dan
mengubah konstanta `MODEL_URL` di:
- `public/js/face.js` (model face-api.js) → arahkan ke folder lokal, mis. `/models`
- `public/js/pose.js` (model & wasm MediaPipe)

## 📁 Struktur Proyek

```
.
├── api/
│   └── index.js        # Entry serverless Vercel (mengekspor Express app)
├── lib/
│   ├── app.js          # Factory Express app + REST API (dipakai bersama)
│   ├── store.js        # Pemilih backend (Postgres bila ada DATABASE_URL)
│   ├── store-postgres.js # Backend PostgreSQL
│   └── store-json.js   # Backend file JSON (lokal)
├── server/
│   └── index.js        # Entry pengembangan lokal (npm start)
├── public/
│   ├── index.html      # Beranda
│   ├── register.html   # Registrasi wajah tim
│   ├── attendance.html # Absensi live (kamera)
│   ├── dashboard.html  # Rekap kehadiran
│   ├── css/style.css
│   └── js/
│       ├── common.js       # Helper API & toast
│       ├── face.js         # Modul pengenalan wajah
│       ├── pose.js         # Modul deteksi angkat tangan
│       ├── register.js
│       ├── attendance.js   # Logika inti: kenali wajah + angkat tangan
│       └── dashboard.js
├── vercel.json         # Konfigurasi routing Vercel
├── .env.example        # Contoh konfigurasi DATABASE_URL
└── data/               # Penyimpanan JSON lokal (dibuat otomatis)
```

## 🔌 REST API

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/members` | Daftar anggota + face descriptor |
| `POST` | `/api/members` | Tambah anggota `{name, role, descriptor}` |
| `POST` | `/api/members/:id/descriptors` | Tambah sampel wajah ke anggota |
| `DELETE` | `/api/members/:id` | Hapus anggota |
| `GET` | `/api/attendance?date=YYYY-MM-DD` | Rekap kehadiran (default: hari ini) |
| `POST` | `/api/attendance` | Catat kehadiran `{memberId}` |

## ⚙️ Penyetelan Akurasi

Semua dikonfigurasi di **`FACE.CONFIG`** (`public/js/face.js`):

| Setelan | Default | Keterangan |
|---|---|---|
| `detector` | `'ssd'` | `'ssd'` = SSD MobileNet v1 (akurat, disarankan kios). `'tiny'` = TinyFaceDetector (ringan untuk PC lemah). |
| `matchThreshold` | `0.48` | Ambang jarak; makin kecil makin ketat (kurangi salah kenal). |
| `minConsecutive` | `2` | Identitas harus dikenali N frame beruntun sebelum dicatat (cegah salah kenal sesaat). |
| `minFaceRatio` | `0.12` | Ukuran wajah minimum; wajah terlalu jauh diabaikan (descriptor jelek). |

Tips akurasi: daftarkan **2–3 sampel wajah per orang** (sedikit beda sudut/ekspresi),
pastikan pencahayaan cukup, dan wajah cukup dekat ke kamera saat registrasi.

- **Sensitivitas angkat tangan** — logika `handRaised` di `public/js/pose.js`.
- **Cooldown & anti-duplikat** — `COOLDOWN_MS` di `public/js/attendance.js`.

## 🟢 Operasi 24 Jam (kios)

Dirancang untuk menyala terus di pintu masuk:

- **Cadence adaptif** — deteksi melambat saat sepi (hemat CPU & panas), otomatis
  cepat lagi saat ada wajah.
- **Auto-recovery kamera** — jika webcam (mis. eksternal) terputus/macet, sistem
  menyambungkan ulang otomatis dengan backoff. Ada juga watchdog bila video beku.
- **Screen Wake Lock** — mencegah layar tidur; diminta ulang saat tab kembali aktif.
- **Auto-resume** — di mode kiosk, setelah reload/refresh kamera lanjut otomatis
  tanpa perlu tap lagi.
- **Reset harian** — tanggal & rekap disegarkan tiap ganti hari; absensi yang lupa
  checkout ditutup otomatis (lihat Cron di atas).

> Untuk PC kios berspesifikasi rendah, ubah `detector` ke `'tiny'` di
> `public/js/face.js` agar lebih ringan.

## 🔒 Privasi & Keamanan

Aplikasi ini menyimpan *face descriptor* (vektor angka), **bukan foto wajah**.
Tetap perlakukan data ini sebagai data pribadi: jalankan di jaringan tepercaya
dan minta persetujuan anggota tim sebelum registrasi.

---

Dibuat sebagai dasar yang bisa Anda kembangkan lebih lanjut (multi-lokasi,
login admin, integrasi HR, dsb.).
