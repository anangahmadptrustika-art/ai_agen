'use strict';

/* Halaman registrasi: aktifkan kamera, tangkap descriptor wajah, simpan ke server. */

(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const faceDot = document.getElementById('faceDot');
  const faceStatus = document.getElementById('faceStatus');
  const startBtn = document.getElementById('startCam');
  const captureBtn = document.getElementById('capture');
  const nameInput = document.getElementById('name');
  const roleInput = document.getElementById('role');
  const memberList = document.getElementById('memberList');
  const countBadge = document.getElementById('count');

  let stream = null;
  let detectLoop = null;
  let lastDetection = null; // hasil deteksi terakhir (untuk tombol simpan)

  function setStatus(text, state) {
    faceStatus.textContent = text;
    faceDot.className = `dot ${state || ''}`;
  }

  async function startCamera() {
    try {
      setStatus('Memuat model AI…', 'warn');
      await FACE.load((msg) => setStatus(msg, 'warn'));

      setStatus('Meminta izin kamera…', 'warn');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      startBtn.textContent = 'Kamera Aktif';
      startBtn.disabled = true;
      sizeOverlay();
      loop();
    } catch (err) {
      console.error(err);
      setStatus('Gagal mengakses kamera/model', 'off');
      toast('Kamera gagal', err.message || 'Periksa izin kamera browser.', 'error', 5000);
    }
  }

  function sizeOverlay() {
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
  }

  function loop() {
    clearInterval(detectLoop);
    detectLoop = setInterval(detectOnce, 350);
  }

  async function detectOnce() {
    if (!video.videoWidth) return;
    const res = await FACE.detectSingle(video);
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (res) {
      lastDetection = res;
      drawBox(ctx, res.detection.box, '#22c55e');
      setStatus('Wajah terdeteksi — siap disimpan', 'on');
      captureBtn.disabled = false;
    } else {
      lastDetection = null;
      setStatus('Arahkan wajah ke kamera', 'warn');
      captureBtn.disabled = true;
    }
  }

  function drawBox(ctx, box, color) {
    // Koordinat deteksi sudah dalam piksel video; canvas berukuran sama.
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }

  async function capture() {
    const name = nameInput.value.trim();
    if (!name) {
      toast('Nama kosong', 'Isi nama anggota terlebih dahulu.', 'warn');
      nameInput.focus();
      return;
    }
    if (!lastDetection) {
      toast('Wajah tidak terdeteksi', 'Hadapkan wajah ke kamera.', 'warn');
      return;
    }

    captureBtn.disabled = true;
    captureBtn.innerHTML = '<span class="loader"></span> Menyimpan…';

    const descriptor = Array.from(lastDetection.descriptor);

    try {
      // Cek apakah nama sudah ada -> tambahkan sampel; jika belum -> buat baru.
      const members = await API.getMembers();
      const existing = members.find(
        (m) => m.name.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        await API.addDescriptor(existing.id, descriptor);
        toast('Sampel ditambahkan', `Sampel wajah baru untuk ${name}.`, 'success');
      } else {
        await API.addMember({ name, role: roleInput.value, descriptor });
        toast('Anggota tersimpan', `${name} berhasil didaftarkan.`, 'success');
        nameInput.value = '';
        roleInput.value = '';
      }
      await refreshMembers();
    } catch (err) {
      toast('Gagal menyimpan', err.message, 'error');
    } finally {
      captureBtn.disabled = false;
      captureBtn.innerHTML = '📸 Tangkap Wajah & Simpan';
    }
  }

  async function refreshMembers() {
    const members = await API.getMembers();
    countBadge.textContent = members.length;
    if (members.length === 0) {
      memberList.innerHTML = '<p class="muted">Belum ada anggota terdaftar.</p>';
      return;
    }
    memberList.innerHTML = '';
    for (const m of members) {
      const row = document.createElement('div');
      row.className = 'member-row';
      const samples = (m.descriptors || []).length;
      row.innerHTML = `
        <div class="meta">
          <span class="name"></span>
          <span class="role"></span>
        </div>
        <button class="btn danger" data-id="${m.id}">Hapus</button>`;
      row.querySelector('.name').textContent = m.name;
      row.querySelector('.role').textContent =
        `${m.role || 'Tanpa jabatan'} · ${samples} sampel wajah`;
      row.querySelector('button').addEventListener('click', () => removeMember(m.id, m.name));
      memberList.appendChild(row);
    }
  }

  async function removeMember(id, name) {
    if (!confirm(`Hapus ${name} dari daftar?`)) return;
    await API.deleteMember(id);
    toast('Dihapus', `${name} dihapus dari daftar.`, 'info');
    refreshMembers();
  }

  startBtn.addEventListener('click', startCamera);
  captureBtn.addEventListener('click', capture);

  refreshMembers();
})();
