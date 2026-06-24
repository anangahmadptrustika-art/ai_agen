'use strict';

/* Rekap bulanan + papan peringkat poin (siapa paling cepat datang). */

(() => {
  const fromDate = document.getElementById('fromDate');
  const toDate = document.getElementById('toDate');
  const showBtn = document.getElementById('showBtn');
  const exportBtn = document.getElementById('exportBtn');
  const rankRows = document.getElementById('rankRows');
  const rangeLabel = document.getElementById('rangeLabel');
  const statDays = document.getElementById('statDays');
  const statMembers = document.getElementById('statMembers');
  const statLate = document.getElementById('statLate');
  const championCard = document.getElementById('championCard');
  const championName = document.getElementById('championName');
  const championDetail = document.getElementById('championDetail');
  const championPts = document.getElementById('championPts');

  let leaderboard = [];

  function ymd(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  // Default: awal bulan ini s/d hari ini.
  (function setDefaults() {
    const now = new Date();
    fromDate.value = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    toDate.value = ymd(now);
  })();

  /* Hitung agregasi + poin dari daftar record. */
  function aggregate(records) {
    // Kelompokkan per tanggal untuk menentukan tercepat harian.
    const byDate = {};
    for (const r of records) (byDate[r.date] ||= []).push(r);

    const members = {}; // memberId -> stats
    const dates = Object.keys(byDate).sort();

    for (const date of dates) {
      // Urutkan dari yang paling pagi masuk.
      const day = byDate[date].slice().sort((a, b) =>
        (a.checkIn || a.timestamp).localeCompare(b.checkIn || b.timestamp)
      );
      day.forEach((r, idx) => {
        const id = r.memberId;
        const m = (members[id] ||= {
          id, name: r.name, role: r.role || '',
          hadir: 0, tepat: 0, telat: 0, tercepat: 0,
          totalLate: 0, sumCheckinMin: 0, points: 0,
        });
        const checkIn = r.checkIn || r.timestamp;
        const late = lateMinutesFrom(checkIn);
        const minOfDay = minutesOfDay(new Date(checkIn));

        m.hadir += 1;
        m.points += POINTS.hadir;
        m.sumCheckinMin += minOfDay;

        if (late <= 0) { m.tepat += 1; m.points += POINTS.tepatWaktu; }
        else { m.telat += 1; m.totalLate += late; if (late > 120) m.points += POINTS.telatBerat; }

        if (idx === 0) { m.tercepat += 1; m.points += POINTS.tercepat1; }
        else if (idx === 1) m.points += POINTS.tercepat2;
        else if (idx === 2) m.points += POINTS.tercepat3;
      });
    }

    const list = Object.values(members).map((m) => ({
      ...m,
      avgCheckin: m.hadir ? Math.round(m.sumCheckinMin / m.hadir) : 0,
    }));
    // Peringkat: poin tertinggi; bila seri, rata-rata masuk lebih pagi menang.
    list.sort((a, b) => b.points - a.points || a.avgCheckin - b.avgCheckin);
    return { list, dayCount: dates.length };
  }

  async function load() {
    const from = fromDate.value;
    const to = toDate.value;
    if (!from || !to) { toast('Tanggal kosong', 'Isi rentang tanggal.', 'warn'); return; }
    if (from > to) { toast('Rentang salah', 'Tanggal "dari" melebihi "sampai".', 'warn'); return; }

    rankRows.innerHTML = '<tr><td colspan="8" class="muted">Memuat…</td></tr>';
    try {
      const { records } = await API.getAttendanceRange(from, to);
      const { list, dayCount } = aggregate(records);
      leaderboard = list;

      statDays.textContent = dayCount;
      statMembers.textContent = list.length;
      statLate.textContent = list.reduce((s, m) => s + m.telat, 0);
      rangeLabel.textContent = `${from} s/d ${to}`;

      renderLeaderboard(list);
      renderChampion(list);
    } catch (err) {
      rankRows.innerHTML = `<tr><td colspan="8" class="muted">Gagal memuat: ${err.message}</td></tr>`;
    }
  }

  function renderChampion(list) {
    if (list.length === 0) { championCard.style.display = 'none'; return; }
    const c = list[0];
    championCard.style.display = 'flex';
    championName.textContent = c.name;
    championDetail.textContent =
      `${c.hadir} hari hadir · ${c.tercepat}× tercepat · rata-rata masuk ${minutesToHHMM(c.avgCheckin)}`;
    championPts.textContent = c.points;
  }

  function renderLeaderboard(list) {
    if (list.length === 0) {
      rankRows.innerHTML = '<tr><td colspan="8" class="muted">Tidak ada data pada rentang ini.</td></tr>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    rankRows.innerHTML = '';
    list.forEach((m, i) => {
      const tr = document.createElement('tr');

      const rankTd = document.createElement('td');
      const rb = document.createElement('span');
      rb.className = 'rank-badge' + (i < 3 ? ' top' : '');
      rb.textContent = i < 3 ? medals[i] : i + 1;
      rankTd.appendChild(rb);

      const nameTd = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.className = 'cell-person';
      wrap.appendChild(makeAvatar(m.name, 30));
      const nm = document.createElement('div');
      nm.className = 'kp-meta';
      const n1 = document.createElement('span'); n1.style.fontWeight = '700'; n1.textContent = m.name;
      const n2 = document.createElement('span'); n2.className = 'muted'; n2.style.fontSize = '12px'; n2.textContent = m.role || '-';
      nm.append(n1, n2);
      wrap.appendChild(nm);
      nameTd.appendChild(wrap);

      tr.append(
        rankTd, nameTd,
        cell(`${m.hadir} hari`),
        cell(`${m.tepat}×`),
        m.telat ? badge(`${m.telat}× · ${formatLate(m.totalLate)}`, 'absent') : cell('—'),
        cell(`${m.tercepat}×`),
        cell(minutesToHHMM(m.avgCheckin)),
        ptsCell(m.points),
      );
      rankRows.appendChild(tr);
    });
  }

  function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
  function ptsCell(v) { const td = document.createElement('td'); td.className = 'pts-cell'; td.textContent = v; return td; }
  function badge(text, cls) {
    const td = document.createElement('td');
    const b = document.createElement('span'); b.className = `badge ${cls}`; b.textContent = text;
    td.appendChild(b); return td;
  }

  function exportCSV() {
    if (leaderboard.length === 0) { toast('Tidak ada data', 'Tampilkan rekap dulu.', 'warn'); return; }
    const header = ['Peringkat', 'Nama', 'Jabatan', 'Hari Hadir', 'Tepat Waktu', 'Terlambat', 'Total Menit Telat', 'Kali Tercepat', 'Rata-rata Masuk', 'Poin'];
    const lines = [header.join(',')];
    leaderboard.forEach((m, i) => {
      const cells = [i + 1, m.name, m.role || '', m.hadir, m.tepat, m.telat, m.totalLate, m.tercepat, minutesToHHMM(m.avgCheckin), m.points];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-${fromDate.value}_sd_${toDate.value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showBtn.addEventListener('click', load);
  exportBtn.addEventListener('click', exportCSV);
  load();
})();
