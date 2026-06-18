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
| Backend | Node.js + Express |
| Penyimpanan | File JSON (tanpa database/native dependency) |
| Frontend | HTML + CSS + JavaScript (tanpa framework) |

## 🚀 Cara Menjalankan

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
├── server/
│   ├── index.js        # Express server + REST API
│   └── store.js        # Penyimpanan JSON (members & attendance)
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
└── data/               # Data tersimpan di sini (dibuat otomatis)
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

- **Ambang pengenalan wajah** — `MATCH_THRESHOLD` di `public/js/face.js`
  (default `0.5`; makin kecil makin ketat).
- **Sensitivitas angkat tangan** — logika `handRaised` di `public/js/pose.js`
  (default: pergelangan tangan di atas garis bahu).
- **Cooldown & anti-duplikat** — `COOLDOWN_MS` di `public/js/attendance.js`.

## 🔒 Privasi & Keamanan

Aplikasi ini menyimpan *face descriptor* (vektor angka), **bukan foto wajah**.
Tetap perlakukan data ini sebagai data pribadi: jalankan di jaringan tepercaya
dan minta persetujuan anggota tim sebelum registrasi.

---

Dibuat sebagai dasar yang bisa Anda kembangkan lebih lanjut (multi-lokasi,
login admin, integrasi HR, dsb.).
