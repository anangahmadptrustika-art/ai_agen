'use strict';

/* Dashboard: rekap kehadiran per tanggal + daftar yang belum hadir + export CSV. */

(() => {
  const datePick = document.getElementById('datePick');
  const presentRows = document.getElementById('presentRows');
  const absentRows = document.getElementById('absentRows');
  const statPresent = document.getElementById('statPresent');
  const statTotal = document.getElementById('statTotal');
  const statAbsent = document.getElementById('statAbsent');
  const exportBtn = document.getElementById('exportBtn');

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

    statPresent.textContent = currentRecords.length;
    statTotal.textContent = members.length;
    statAbsent.textContent = absent.length;

    renderPresent(currentRecords);
    renderAbsent(absent);
  }

  function renderPresent(records) {
    if (records.length === 0) {
      presentRows.innerHTML = '<tr><td colspan="4" class="muted">Belum ada kehadiran pada tanggal ini.</td></tr>';
      return;
    }
    const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    presentRows.innerHTML = '';
    for (const r of sorted) {
      const tr = document.createElement('tr');
      const method = r.method === 'hand-raise' ? 'Angkat tangan' : r.method;
      tr.append(
        personCell(r.name),
        textCell(r.role || '-'),
        textCell(formatTime(r.timestamp)),
        badgeCell(method, 'role')
      );
      presentRows.appendChild(tr);
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
    const header = ['Nama', 'Jabatan', 'Tanggal', 'Jam', 'Metode'];
    const lines = [header.join(',')];
    for (const r of currentRecords) {
      const cells = [r.name, r.role || '', r.date, formatTime(r.timestamp), r.method];
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
