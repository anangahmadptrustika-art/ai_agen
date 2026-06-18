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
    const { records } = await API.getAttendance();
    presentToday.clear();
    records.forEach((r) => presentToday.add(r.memberId));
    renderPresent(records);
  }

  function renderPresent(records) {
    presentCount.textContent = records.length;
    if (records.length === 0) {
      presentList.innerHTML = '<p class="muted">Belum ada yang absen hari ini.</p>';
      return;
    }
    // Terbaru di atas.
    const sorted = [...records].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    presentList.innerHTML = '';
    for (const r of sorted) {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `
        <div class="meta">
          <span class="name"></span>
          <span class="role"></span>
        </div>
        <span class="badge present">✔ ${formatTime(r.timestamp)}</span>`;
      row.querySelector('.name').textContent = r.name;
      row.querySelector('.role').textContent = r.role || 'Hadir';
      presentList.appendChild(row);
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();

      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;

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

  async function maybeRecord(member) {
    const now = Date.now();
    const last = recentlyRecorded.get(member.id) || 0;
    if (now - last < COOLDOWN_MS) return;
    recentlyRecorded.set(member.id, now);

    if (presentToday.has(member.id)) return; // sudah hadir hari ini

    try {
      const result = await API.recordAttendance(member.id, 'hand-raise');
      if (result.status === 'recorded') {
        presentToday.add(member.id);
        toast('Absensi tercatat ✓', `${member.name} hadir.`, 'success');
        await loadPresentToday();
      } else if (result.status === 'already') {
        presentToday.add(member.id);
      }
    } catch (err) {
      toast('Gagal mencatat', err.message, 'error');
    }
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  window.addEventListener('beforeunload', () => stream && stream.getTracks().forEach((t) => t.stop()));

  init();
})();
