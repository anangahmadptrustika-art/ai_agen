'use strict';

/* Dashboard: rekap kehadiran per tanggal + daftar yang belum hadir + export CSV. */

(() => {
  const datePick = document.getElementById('datePick');
  const presentRows = document.getElementById('presentRows');
  const lateRows = document.getElementById('lateRows');
  const absentRows = document.getElementById('absentRows');
  const statPresent = document.getElementById('statPresent');
  const statLate = document.getElementById('statLate');
  const statTotal = document.getElementById('statTotal');
  const statAbsent = document.getElementById('statAbsent');
  const exportBtn = document.getElementById('exportBtn');

  // Keterlambatan (menit) dari sebuah record, dihitung dari jam masuk lokal.
  const recLate = (r) => lateMinutesFrom(r.checkIn || r.timestamp);

  let currentRecords = [];
  let currentDate = '';

  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  async function load(date) {
    currentDate = date;
    const [members, attendance] = await Promise.all([
      API.getMembers(),
      API.getAttendance(date),
    ]);
    currentRecords = attendance.records;

    const presentIds = new Set(currentRecords.map((r) => r.memberId));
    const absent = members.filter((m) => !presentIds.has(m.id));
    const lateRecords = currentRecords.filter((r) => recLate(r) > 0);

    statPresent.textContent = currentRecords.length;
    statTotal.textContent = members.length;
    statAbsent.textContent = absent.length;
    statLate.textContent = lateRecords.length;

    renderPresent(currentRecords);
    renderLate(lateRecords);
    renderAbsent(absent);
  }

  function renderPresent(records) {
    if (records.length === 0) {
      presentRows.innerHTML = '<tr><td colspan="6" class="muted">Belum ada kehadiran pada tanggal ini.</td></tr>';
      return;
    }
    const sorted = [...records].sort((a, b) =>
      (a.checkIn || a.timestamp).localeCompare(b.checkIn || b.timestamp)
    );
    presentRows.innerHTML = '';
    for (const r of sorted) {
      const checkIn = r.checkIn || r.timestamp;
      const late = recLate(r);
      const tr = document.createElement('tr');
      tr.append(
        personCell(r.name),
        textCell(r.role || '-'),
        textCell(formatTime(checkIn)),
        late > 0 ? badgeCell(formatLate(late), 'absent') : textCell('—'),
        textCell(r.checkOut ? formatTime(r.checkOut) : '—'),
        badgeCell(late > 0 ? 'Terlambat' : 'Tepat waktu', late > 0 ? 'absent' : 'present')
      );
      presentRows.appendChild(tr);
    }
  }

  function renderLate(records) {
    if (records.length === 0) {
      lateRows.innerHTML = '<tr><td colspan="4" class="muted">Tidak ada yang terlambat 🎉</td></tr>';
      return;
    }
    // Paling terlambat di atas.
    const sorted = [...records].sort((a, b) => recLate(b) - recLate(a));
    lateRows.innerHTML = '';
    for (const r of sorted) {
      const tr = document.createElement('tr');
      tr.append(
        personCell(r.name),
        textCell(r.role || '-'),
        textCell(formatTime(r.checkIn || r.timestamp)),
        badgeCell(formatLate(recLate(r)), 'absent')
      );
      lateRows.appendChild(tr);
    }
  }

  function renderAbsent(members) {
    if (members.length === 0) {
      absentRows.innerHTML = '<tr><td colspan="3" class="muted">Semua anggota sudah hadir 🎉</td></tr>';
      return;
    }
    absentRows.innerHTML = '';
    for (const m of members) {
      const tr = document.createElement('tr');
      tr.append(personCell(m.name), textCell(m.role || '-'), badgeCell('Belum hadir', 'absent'));
      absentRows.appendChild(tr);
    }
  }

  // Sel berisi avatar + nama.
  function personCell(name) {
    const td = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'cell-person';
    wrap.appendChild(makeAvatar(name, 30));
    const span = document.createElement('span');
    span.textContent = name;
    wrap.appendChild(span);
    td.appendChild(wrap);
    return td;
  }
  function textCell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }
  function badgeCell(text, cls) {
    const td = document.createElement('td');
    const b = document.createElement('span');
    b.className = `badge ${cls}`;
    b.textContent = text;
    td.appendChild(b);
    return td;
  }

  function exportCSV() {
    if (currentRecords.length === 0) {
      toast('Tidak ada data', 'Belum ada kehadiran untuk diekspor.', 'warn');
      return;
    }
    const header = ['Nama', 'Jabatan', 'Tanggal', 'Jam Masuk', 'Terlambat (menit)', 'Jam Pulang', 'Status', 'Metode'];
    const lines = [header.join(',')];
    for (const r of currentRecords) {
      const checkIn = r.checkIn || r.timestamp;
      const late = recLate(r);
      const cells = [
        r.name,
        r.role || '',
        r.date,
        formatTime(checkIn),
        late,
        r.checkOut ? formatTime(r.checkOut) : '',
        late > 0 ? 'Terlambat' : 'Tepat waktu',
        r.method,
      ];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `absensi-${currentDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  datePick.value = todayStr();
  datePick.addEventListener('change', () => load(datePick.value));
  exportBtn.addEventListener('click', exportCSV);
  load(datePick.value);

  // Segarkan otomatis tiap 15 detik bila melihat hari ini.
  setInterval(() => {
    if (datePick.value === todayStr()) load(datePick.value);
  }, 15000);
})();
