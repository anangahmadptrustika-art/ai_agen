# 🖥️ Panduan Kios 24 Jam (Windows + RTX 3050)

Panduan menyiapkan PC sebagai kios absensi yang menyala terus di pintu masuk.
Spesifikasi RTX 3050 + RAM 16GB sudah lebih dari cukup — detektor **SSD MobileNet**
akan dipercepat GPU (WebGL), akurasi tinggi tetap ringan.

Ganti `NAMA-APP` dengan domain Vercel Anda (mis. `ai-agen-1t5u`).

---

## ✅ Checklist sebelum aktif 24 jam

1. **Database aktif** — buka `https://NAMA-APP.vercel.app/api/health` → harus `"backend":"postgres"`.
2. **Cron aktif** — Vercel → Settings → Cron Jobs → ada `/api/cron` (`0 17 * * *`).
   Disarankan set env **`CRON_SECRET`** lalu redeploy.
3. **Registrasi tim** — daftarkan **2–3 sampel wajah per orang** (sudut/ekspresi beda),
   wajah cukup dekat & pencahayaan baik. Ini paling menentukan akurasi.
4. **Webcam dipilih** — buka **Absensi** biasa dulu, pilih webcam (eksternal bila ada)
   dari dropdown. Pilihan tersimpan otomatis dan dipakai di mode Kiosk.

---

## 1. Setelan daya Windows (WAJIB untuk 24 jam)

Agar PC & layar tidak tidur:

```powershell
# Jalankan di PowerShell (Admin)
powercfg /change standby-timeout-ac 0      # PC tidak pernah sleep (saat dicolok listrik)
powercfg /change monitor-timeout-ac 0      # layar tidak pernah mati
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off
```

Juga: **Settings → System → Power → Screen & sleep** → set semua ke **Never**.
(Aplikasi juga memakai *Screen Wake Lock* sebagai lapis tambahan.)

## 2. Pastikan akselerasi GPU Chrome menyala

Chrome → `chrome://settings/system` → **"Use graphics acceleration when available"** = ON.
Cek di `chrome://gpu` → "WebGL" harus *Hardware accelerated*. (RTX 3050 akan dipakai.)

## 3. Beri izin kamera satu kali

Buka `https://NAMA-APP.vercel.app/attendance.html?kiosk=1` di Chrome → **Allow** kamera.
Setelah diizinkan, mode kiosk bisa **mulai otomatis tanpa tap** saat boot berikutnya.

## 4. Jalankan mode kios

### Cara mudah (F11)
Buka menu **🖥️ Kiosk** di aplikasi → tap **Mulai Mode Kiosk** → tekan **F11**
(fullscreen browser). Selesai.

### Cara permanen (Chrome --kiosk, hands-free saat boot)
Buat **shortcut** dengan target berikut (sesuaikan path Chrome):

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required --user-data-dir="C:\kiosk-profile" "https://NAMA-APP.vercel.app/attendance.html?kiosk=1"
```

- `--kiosk` → layar penuh borderless (tanpa tab/address bar)
- `--user-data-dir` → profil khusus agar izin kamera diingat permanen
- Karena izin sudah diberikan (langkah 3), kamera **menyala otomatis** tanpa tap.

Keluar kiosk: **Alt+F4**.

## 5. Auto-start saat PC menyala (opsional)

Tekan `Win+R` → ketik `shell:startup` → Enter → letakkan **shortcut** di atas ke
folder Startup. PC kini langsung masuk mode absensi setiap dinyalakan.

---

## 🔄 Yang sudah otomatis (tidak perlu disentuh)

| Fitur | Perilaku |
|---|---|
| **Deteksi adaptif** | Melambat saat sepi (hemat GPU/listrik), cepat saat ada orang |
| **Auto-recovery kamera** | Webcam tercabut/hang → nyambung lagi otomatis |
| **Wake Lock** | Layar tidak tidur |
| **Reset harian** | Rekap & tanggal disegarkan tiap ganti hari |
| **Auto absen-pulang** | Yang lupa checkout ditutup otomatis (cron 00:00 / saat dibuka) |
| **Reload pemeliharaan** | Otomatis refresh ~**04:00** untuk bersihkan memori (lalu lanjut sendiri) |

> Jam reload pemeliharaan bisa diubah di `public/js/attendance.js`
> (`KIOSK_RELOAD_HOUR`).

---

## 🛠️ Troubleshooting

- **Kamera tidak muncul / hitam** → pastikan webcam tidak dipakai aplikasi lain;
  sistem akan mencoba menyambung ulang otomatis. Cek juga pilihan kamera di dropdown.
- **Berat / panas** (kalau pakai PC lain yang lemah) → ubah `detector: 'ssd'` jadi
  `'tiny'` di `public/js/face.js`. Di RTX 3050 tetap pakai `'ssd'`.
- **Sering salah kenal** → tambah sampel wajah per orang, atau perkecil
  `matchThreshold` (mis. `0.45`) di `public/js/face.js`.
- **Model lama muncul** setelah update → refresh `Ctrl+Shift+R`.
