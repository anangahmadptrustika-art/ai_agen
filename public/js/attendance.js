'use strict';

/*
 * Halaman absensi live. Alur per frame deteksi:
 *  1) face-api.js  -> deteksi semua wajah + kenali identitas (cocokkan ke anggota)
 *  2) MediaPipe Pose -> deteksi orang yang mengangkat tangan
 *  3) Asosiasikan tangan terangkat ke wajah terdekat (berdasarkan posisi X)
 *  4) Jika wajah dikenali + tangan terangkat -> catat absensi (1x/hari, ada cooldown)
 */

(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const faceDot = document.getElementById('faceDot');
  const faceStatus = document.getElementById('faceStatus');
  const handDot = document.getElementById('handDot');
  const handStatus = document.getElementById('handStatus');
  const bootMsg = document.getElementById('bootMsg');
  const presentList = document.getElementById('presentList');
  const presentCount = document.getElementById('presentCount');
  const totalMembers = document.getElementById('totalMembers');
  const todayLabel = document.getElementById('todayLabel');
  const flash = document.getElementById('flash');
  const flashIco = document.getElementById('flashIco');
  const flashTitle = document.getElementById('flashTitle');
  const flashName = document.getElementById('flashName');
  const flashTime = document.getElementById('flashTime');
  const flashLate = document.getElementById('flashLate');
  const stage = document.getElementById('stage');
  const cameraSelect = document.getElementById('cameraSelect');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const fsToggle = document.getElementById('fsToggle');
  let flashTimer = null;
  let currentDeviceId = (() => { try { return localStorage.getItem('cameraId'); } catch (_) { return null; } })();

  let stream = null;
  let running = false;
  let rafId = null;
  let matcher = null;
  let labelToMember = {};
  let lastDetectTs = 0;

  // Cooldown agar absensi yang baru dicatat tidak dipicu berulang.
  const recentlyRecorded = new Map(); // memberId -> timestamp
  const COOLDOWN_MS = 10000;
  const DETECT_INTERVAL_MS = 250; // jeda antar siklus deteksi berat

  const presentToday = new Set(); // memberId yang sudah hadir hari ini

  // Tanggal lokal perangkat (YYYY-MM-DD). Dikirim ke server agar konsisten
  // dengan zona waktu pengguna, bukan zona waktu server (Vercel = UTC).
  function localDate() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function setFace(text, state) {
    faceStatus.textContent = text;
    faceDot.className = `dot ${state || ''}`;
  }
  function setHand(text, state) {
    handStatus.textContent = text;
    handDot.className = `dot ${state || ''}`;
  }

  async function init() {
    todayLabel.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    await loadPresentToday();
    // Tampilkan jumlah anggota terdaftar (matcher dibangun saat tombol Mulai ditekan).
    const members = await API.getMembers();
    totalMembers.textContent = `Anggota terdaftar: ${members.length}`;
  }

  async function loadPresentToday() {
    const { records } = await API.getAttendance(localDate());
    presentToday.clear();
    records.forEach((r) => presentToday.add(r.memberId));
    renderPresent(records);
  }

  function renderPresent(records) {
    presentCount.textContent = records.length;
    if (records.length === 0) {
      presentList.innerHTML = '<div class="empty"><span class="ico">🙌</span>Belum ada yang absen hari ini.</div>';
      return;
    }
    // Terbaru di atas.
    const sorted = [...records].sort((a, b) =>
      (b.checkIn || b.timestamp).localeCompare(a.checkIn || a.timestamp)
    );
    presentList.innerHTML = '';
    for (const r of sorted) {
      const checkIn = r.checkIn || r.timestamp;
      const late = lateMinutesFrom(checkIn);

      const row = document.createElement('div');
      row.className = 'member-row';

      const person = document.createElement('div');
      person.className = 'person';
      person.appendChild(makeAvatar(r.name));
      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = r.name;
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = late > 0 ? `Terlambat ${formatLate(late)}` : (r.role || 'Tepat waktu');
      meta.append(name, role);
      person.appendChild(meta);

      const badges = document.createElement('div');
      badges.className = 'row';
      badges.style.gap = '6px';
      const inBadge = document.createElement('span');
      inBadge.className = 'badge ' + (late > 0 ? 'absent' : 'present');
      inBadge.textContent = `${late > 0 ? '⏰' : '✔'} ${formatTime(checkIn)}`;
      badges.appendChild(inBadge);
      if (r.checkOut) {
        const outBadge = document.createElement('span');
        outBadge.className = 'badge';
        outBadge.textContent = `🏁 ${formatTime(r.checkOut)}`;
        badges.appendChild(outBadge);
      }

      row.append(person, badges);
      presentList.appendChild(row);
    }
  }

  // Buka kamera (deviceId opsional untuk memilih webcam tertentu/eksternal).
  async function openCamera(deviceId) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (deviceId) videoConstraints.deviceId = { exact: deviceId };
    else videoConstraints.facingMode = 'user';

    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    video.srcObject = stream;
    await video.play();
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    // Simpan deviceId aktual yang dipakai agar bisa diingat untuk kios.
    const track = stream.getVideoTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    if (settings.deviceId) {
      currentDeviceId = settings.deviceId;
      try { localStorage.setItem('cameraId', currentDeviceId); } catch (_) {}
    }
  }

  // Isi dropdown daftar kamera (label muncul setelah izin diberikan).
  async function populateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      if (cams.length === 0) return;
      cameraSelect.innerHTML = '';
      cams.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = c.deviceId;
        opt.textContent = c.label || `Kamera ${i + 1}`;
        cameraSelect.appendChild(opt);
      });
      if (currentDeviceId) cameraSelect.value = currentDeviceId;
      cameraSelect.disabled = false;
    } catch (err) {
      console.warn('enumerateDevices gagal:', err.message);
    }
  }

  // Ganti kamera saat sedang berjalan.
  async function switchCamera(deviceId) {
    currentDeviceId = deviceId;
    try { localStorage.setItem('cameraId', deviceId); } catch (_) {}
    if (!running) return;
    try {
      bootMsg.textContent = 'Mengganti kamera…';
      await openCamera(deviceId);
      bootMsg.textContent = '';
      toast('Kamera diganti', 'Sumber kamera berhasil diubah.', 'success', 2500);
    } catch (err) {
      toast('Gagal ganti kamera', err.message, 'error', 4000);
    }
  }

  async function start() {
    startBtn.disabled = true;
    try {
      bootMsg.textContent = 'Memuat model AI vision (sekali saja, mohon tunggu)…';
      setFace('Memuat model…', 'warn');
      await FACE.load((m) => (bootMsg.textContent = m));
      await POSE.load((m) => (bootMsg.textContent = m));

      bootMsg.textContent = 'Meminta izin kamera…';
      await openCamera(currentDeviceId);
      await populateCameras();
      navigator.mediaDevices.addEventListener &&
        navigator.mediaDevices.addEventListener('devicechange', populateCameras);

      const members = await API.getMembers();
      const built = FACE.buildMatcher(members);
      matcher = built.matcher;
      labelToMember = built.labelToMember;
      totalMembers.textContent = `Anggota terdaftar: ${members.length}`;

      if (!matcher) {
        toast('Belum ada data wajah', 'Daftarkan tim dulu di menu Registrasi.', 'warn', 5000);
      }

      running = true;
      startBtn.classList.add('hide');
      stopBtn.classList.remove('hide');
      bootMsg.textContent = '';
      setFace('Mendeteksi…', 'on');
      tick();
    } catch (err) {
      console.error(err);
      bootMsg.textContent = '';
      setFace('Gagal memulai', 'off');
      toast('Gagal memulai', err.message || 'Periksa izin kamera.', 'error', 5000);
      startBtn.disabled = false;
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    startBtn.classList.remove('hide');
    startBtn.disabled = false;
    stopBtn.classList.add('hide');
    setFace('Berhenti', '');
    setHand('Tangan: -', '');
    clearTimeout(flashTimer);
    flash.classList.add('hide');
    const ctx = overlay.getContext('2d');
    ctx && ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  async function tick() {
    if (!running) return;

    const now = performance.now();
    if (now - lastDetectTs >= DETECT_INTERVAL_MS && video.videoWidth) {
      lastDetectTs = now;
      await processFrame(now);
    }
    rafId = requestAnimationFrame(tick);
  }

  async function processFrame(timestampMs) {
    // 1) Deteksi wajah + identitas.
    const faces = await FACE.detectAll(video);

    // 2) Deteksi pose (angkat tangan).
    let people = [];
    try {
      people = POSE.detect(video, timestampMs);
    } catch (_) { /* MediaPipe kadang butuh frame valid; abaikan error sesaat */ }

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const W = overlay.width;
    const H = overlay.height;

    const anyHandRaised = people.some((p) => p.handRaised);
    setHand(anyHandRaised ? 'Tangan: TERANGKAT ✋' : 'Tangan: turun', anyHandRaised ? 'on' : '');

    // Identifikasi tiap wajah.
    const recognized = [];
    for (const f of faces) {
      const box = f.detection.box;
      let label = 'Tak dikenal';
      let member = null;
      let color = '#f59e0b';

      if (matcher) {
        const best = matcher.findBestMatch(f.descriptor);
        if (best.label !== 'unknown') {
          member = labelToMember[best.label];
          if (member) {
            label = member.name;
            color = '#22c55e';
          }
        }
      }

      // Cek apakah ada tangan terangkat yang "milik" wajah ini.
      const faceCenterX = (box.x + box.width / 2) / W;
      const handForThisFace = isHandRaisedNear(people, faceCenterX);

      recognized.push({ box, label, member, handRaised: handForThisFace });
      drawFace(ctx, box, label, color, handForThisFace);

      // Catat absensi bila dikenali + tangan terangkat.
      if (member && handForThisFace) {
        maybeRecord(member);
      }
    }

    if (faces.length === 0) {
      setFace('Tidak ada wajah', 'warn');
    } else {
      const known = recognized.filter((r) => r.member).length;
      setFace(`Terdeteksi ${faces.length} wajah (${known} dikenali)`, 'on');
    }
  }

  // Apakah ada orang dengan tangan terangkat yang posisinya dekat dengan wajah ini?
  function isHandRaisedNear(people, faceCenterX) {
    let bestDist = Infinity;
    let raised = false;
    for (const p of people) {
      const dist = Math.abs(p.centerX - faceCenterX);
      if (dist < bestDist) {
        bestDist = dist;
        raised = p.handRaised;
      }
    }
    // Toleransi jarak horizontal 25% lebar frame.
    return bestDist < 0.25 ? raised : false;
  }

  function drawFace(ctx, box, label, color, handRaised) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    const text = handRaised ? `${label}  ✋` : label;
    ctx.font = '600 16px system-ui, sans-serif';
    const padX = 8;
    const tw = ctx.measureText(text).width + padX * 2;
    const ty = box.y > 26 ? box.y - 24 : box.y + box.height;
    ctx.fillStyle = color;
    ctx.fillRect(box.x, ty, tw, 24);
    ctx.fillStyle = '#06283d';
    ctx.fillText(text, box.x + padX, ty + 17);
  }

  // Tampilkan overlay besar "ABSEN BERHASIL" di atas kamera.
  function showFlash({ title, name, time, lateMinutes = 0, type = 'success' }) {
    flash.classList.toggle('out', type === 'out');
    flashIco.textContent = type === 'out' ? '🏁' : '✓';
    flashTitle.textContent = title;
    flashName.textContent = name;
    flashTime.textContent = time ? `Pukul ${time}` : '';

    if (lateMinutes > 0) {
      flashLate.textContent = `⏰ TERLAMBAT ${formatLate(lateMinutes)}`;
      flashLate.classList.remove('hide');
    } else {
      flashLate.classList.add('hide');
    }

    flash.classList.remove('hide');
    // restart animasi
    flash.style.animation = 'none';
    void flash.offsetWidth;
    flash.style.animation = '';

    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flash.classList.add('hide'), 3600);
  }

  async function maybeRecord(member) {
    const now = Date.now();
    const last = recentlyRecorded.get(member.id) || 0;
    if (now - last < COOLDOWN_MS) return;
    recentlyRecorded.set(member.id, now);

    // Tentukan fase berdasarkan waktu lokal: >= 17:00 dianggap absen pulang.
    const nowDate = new Date();
    const phase = minutesOfDay(nowDate) >= WORK.END ? 'out' : 'in';
    const lateMinutes = Math.max(0, minutesOfDay(nowDate) - WORK.START);

    try {
      const result = await API.recordAttendance({
        memberId: member.id,
        date: localDate(),
        time: nowDate.toISOString(),
        phase,
        lateMinutes,
        method: 'hand-raise',
      });

      if (result.status === 'checkin') {
        presentToday.add(member.id);
        const late = result.record.lateMinutes || 0;
        const checkIn = result.record.checkIn || result.record.timestamp;
        showFlash({
          title: 'ABSEN BERHASIL',
          name: member.name,
          time: formatTime(checkIn),
          lateMinutes: late,
          type: 'success',
        });
        await loadPresentToday();
      } else if (result.status === 'checkout') {
        showFlash({
          title: 'ABSEN PULANG BERHASIL',
          name: member.name,
          time: formatTime(result.record.checkOut || nowDate.toISOString()),
          type: 'out',
        });
        await loadPresentToday();
      } else if (result.status === 'already_in') {
        presentToday.add(member.id);
        toast('Anda sudah absen', `${member.name}, belum waktunya pulang (jam pulang ${WORK.endLabel}).`, 'warn', 4200);
      } else if (result.status === 'already_out') {
        toast('Sudah lengkap', `${member.name} sudah absen masuk & pulang hari ini.`, 'info');
      }
    } catch (err) {
      toast('Gagal mencatat', err.message, 'error');
    }
  }

  /* --------------------------- Layar penuh (kiosk) -------------------------- */
  function isFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }
  function toggleFullscreen() {
    if (!isFullscreen()) {
      const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (req) req.call(stage).catch((e) => toast('Layar penuh gagal', e.message, 'error'));
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }
  function updateFsUI() {
    const fs = Boolean(isFullscreen());
    document.body.classList.toggle('is-fullscreen', fs);
    if (fullscreenBtn) fullscreenBtn.textContent = fs ? '🡼 Keluar Layar Penuh' : '⛶ Layar Penuh';
  }

  /* ------------------------------ Wiring ------------------------------ */
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  fsToggle.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFsUI);
  document.addEventListener('webkitfullscreenchange', updateFsUI);

  cameraSelect.addEventListener('change', () => {
    const id = cameraSelect.value;
    if (running) switchCamera(id);
    else {
      currentDeviceId = id;
      try { localStorage.setItem('cameraId', id); } catch (_) {}
    }
  });

  window.addEventListener('beforeunload', () => stream && stream.getTracks().forEach((t) => t.stop()));

  init();
})();
