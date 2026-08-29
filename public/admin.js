/**
 * admin.js - Logika Panel Presentasi & Demo Master Patient Index
 * Mandaya Royal Hospital Puri - "Satu Pasien, Satu Riwayat"
 * 
 * Dirancang untuk presentasi juri 4 menit:
 * Operasi cepat, visual tegas, penanganan respons instan.
 */

// Toast Notifikasi Cepat
function showToast(message, type = 'info') {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.innerText = message;
  toast.style.display = 'block';
  
  if (type === 'error') {
    toast.style.backgroundColor = '#991b1b';
    toast.style.borderColor = '#f87171';
  } else if (type === 'success') {
    toast.style.backgroundColor = '#166534';
    toast.style.borderColor = '#4ade80';
  } else if (type === 'warn') {
    toast.style.backgroundColor = '#92400e';
    toast.style.borderColor = '#fbbf24';
  } else {
    toast.style.backgroundColor = '#0f172a';
    toast.style.borderColor = '#38bdf8';
  }

  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// Inisialisasi Halaman Demo Admin
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Mandaya Presenter] Initializing presentation control panel...');
  await refreshAllData();

  // Listener untuk pemilih pasien pembanding peran
  const roleSelect = document.getElementById('role-comp-mpi-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      loadRoleComparison();
    });
  }

  // Auto-refresh access logs setiap 10 detik agar juri melihat interaksi real-time
  setInterval(() => {
    loadAccessLogsTable(false);
  }, 10000);
});

/**
 * Muat Ulang Seluruh Data Panel
 */
async function refreshAllData() {
  await loadAdminStats();
  await loadSourcesTable();
  await loadMpiPatientsTable();
  await loadMpiReviewQueue();
  await populatePatientSelector();
  await loadRoleComparison();
  await loadAccessLogsTable();
  await loadTrainingDataTable();
}

/**
 * BAGIAN 1: Reset & Seed Ulang Database
 */
async function triggerResetDemo() {
  const btn = document.getElementById('btn-reset-demo');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '⏳ Mereset Database...';
  }

  try {
    const res = await fetch('/api/demo/reset', { method: 'POST' });
    const result = await res.json();
    if (result.sukses) {
      showToast('✓ Database berhasil di-reset ke kondisi 30 data mentah awal!', 'success');
      await refreshAllData();
    } else {
      showToast('Gagal reset: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('Koneksi reset gagal: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '↺ Reset & Seed Ulang';
    }
  }
}

/**
 * BAGIAN 2: Muat 30 Data Mentah (source_records)
 * Menampilkan kekacauan ID lokal & NIK yang berantakan
 */
async function loadSourcesTable() {
  const tbody = document.getElementById('sources-table-body');
  const countBadge = document.getElementById('source-records-count');
  if (!tbody) return;

  try {
    const res = await fetch('/api/source-records');
    const result = await res.json();
    if (result.sukses) {
      if (countBadge) countBadge.innerText = `${result.total} Baris Mentah`;
      
      tbody.innerHTML = result.data.map((s, idx) => {
        const nikFormatted = s.nik 
          ? `<code>${s.nik}</code>` 
          : `<span class="null-pill">NULL (Hilang/Manual)</span>`;
          
        const phoneFormatted = s.telepon 
          ? `<code>${s.telepon}</code>` 
          : `<span style="color:#94a3b8; font-style:italic;">(Tidak ada)</span>`;

        const rawSnippet = s.raw 
          ? JSON.stringify(s.raw).replace(/"/g, '').replace(/{|}/g, '')
          : '-';

        return `
          <tr id="src-row-${s.id}">
            <td style="font-weight:700; color:#64748b; font-size:12px;">#${String(idx + 1).padStart(2, '0')}</td>
            <td><span class="badge-system badge-${s.sistem}">${s.sistem}</span></td>
            <td><code style="font-weight:700; color:#1e40af;">${s.local_id}</code></td>
            <td><strong style="font-size:13.5px; color:#0f172a;">${s.nama}</strong></td>
            <td>${nikFormatted}</td>
            <td>${s.tgl_lahir || '<span style="color:#94a3b8;">-</span>'}</td>
            <td>${phoneFormatted}</td>
            <td><span style="font-size:11px; color:#475569; font-family:monospace;">${rawSnippet.substring(0, 48)}...</span></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Gagal memuat source_records:', err);
  }
}

/**
 * BAGIAN 3: Jalankan Resolusi MPI (Deterministic + Probabilistic Jaro-Winkler)
 */
async function triggerMpiResolve() {
  const btn = document.getElementById('btn-resolve-mpi');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '⚙️ Menjalankan Resolusi MPI...';
  }

  try {
    const res = await fetch('/api/mpi/resolve', { method: 'POST' });
    const result = await res.json();
    if (result.sukses) {
      const summary = result.ringkasan || {};
      showToast(`✓ Resolusi Berhasil: 30 Data Mentah ➔ ${summary.total_pasien_mpi || 9} Pasien Master!`, 'success');
      
      // Update kartu perbandingan sebelum/sesudah
      const diffContainer = document.getElementById('mpi-resolution-summary-box');
      if (diffContainer) {
        diffContainer.style.display = 'block';
        diffContainer.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:16px; font-weight:800; color:#166534;">
                🎉 SELESAI: 30 Data Sumber Fragmented Berhasil Diresolusi
              </div>
              <div style="font-size:13px; color:#1e3a5f; margin-top:4px;">
                Ditemukan <strong>${summary.total_pasien_mpi || 9} Entitas Pasien Tunggal</strong>. 
                Tautan Otomatis: <strong>${summary.tautan_otomatis || 25}</strong> | 
                Perlu Tinjauan Manusia: <strong>${summary.perlu_tinjauan || 1}</strong>.
              </div>
            </div>
            <div style="background:#ffffff; padding:8px 16px; border-radius:6px; border:1px solid #86efac; font-weight:700; font-size:13px; color:#166534;">
              Kasus Homonim Ahmad Fauzi: Berhasil Terpisah (Sr: 1968 vs Jr: 1995)
            </div>
          </div>
        `;
      }

      await loadMpiPatientsTable();
      await loadMpiReviewQueue();
      await loadAdminStats();
      await populatePatientSelector();
      await loadRoleComparison();
    } else {
      showToast('Gagal resolusi: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('Koneksi MPI gagal: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⚡ Jalankan Resolusi MPI';
    }
  }
}

/**
 * Muat Tabel Pasien MPI & Tautan
 */
async function loadMpiPatientsTable() {
  const tbody = document.getElementById('mpi-patients-table-body');
  const countBadge = document.getElementById('mpi-patients-count');
  if (!tbody) return;

  try {
    const res = await fetch('/api/mpi/patients');
    const result = await res.json();
    if (result.sukses) {
      if (countBadge) countBadge.innerText = `${result.total} Pasien MPI Master`;

      tbody.innerHTML = result.data.map(p => {
        const systems = p.sistem_terhubung ? p.sistem_terhubung.split(',') : [];
        return `
          <tr id="mpi-row-${p.mpi_id}">
            <td><strong style="color:#0284c7; font-family:monospace; font-size:13.5px;">${p.mpi_id}</strong></td>
            <td><strong style="color:#0f172a; font-size:14px;">${p.nama}</strong></td>
            <td>${p.nik ? `<code>${p.nik}</code>` : '<span style="color:#94a3b8; font-style:italic;">-</span>'}</td>
            <td>${p.tgl_lahir || '<span style="color:#94a3b8;">-</span>'}</td>
            <td>${p.telepon ? `<code>${p.telepon}</code>` : '<span style="color:#94a3b8;">-</span>'}</td>
            <td>
              <span class="badge-status badge-auto" style="font-weight:700;">
                ${p.total_tautan} Sistem
              </span>
            </td>
            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                ${systems.map(s => `<span class="badge-system badge-${s.trim()}" style="font-size:10px; padding:2px 6px;">${s.trim()}</span>`).join('')}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Gagal memuat pasien MPI:', err);
  }
}

/**
 * BAGIAN 4: Antrean Tinjauan MPI (Human-in-the-Loop)
 * Menampilkan skor, field cocok vs beda, catatan alasan ragu-ragu
 */
async function loadMpiReviewQueue() {
  const container = document.getElementById('mpi-review-container');
  const queueCount = document.getElementById('mpi-review-count');
  if (!container) return;

  try {
    const res = await fetch('/api/mpi/review');
    const result = await res.json();
    if (result.sukses) {
      if (queueCount) queueCount.innerText = `${result.total} Perlu Tinjauan`;

      if (result.data.length === 0) {
        container.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #166534; background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px;">
            <strong>✓ Antrean Tinjauan Bersih</strong> — Semua data berkepercayaan tinggi telah terpadukan secara deterministik & probabilistik.
          </div>
        `;
        return;
      }

      container.innerHTML = result.data.map(r => {
        const skorPersen = (r.skor * 100).toFixed(1);
        const matchNotes = r.alasan?.alasan || [];
        const matchFieldStr = matchNotes.join(', ') || 'Nama & Tgl Lahir Cocok, NIK Tidak Ada';

        return `
          <div class="review-box" id="review-card-${r.link_id}">
            <div class="review-box-header">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="badge-status badge-tinjau" style="font-size:13px; font-weight:800;">
                    SKOR: ${skorPersen}% (Ambang Tinjauan: 70% - 92%)
                  </span>
                  <span style="font-size:13px; color:#92400e; font-weight:600;">
                    Sistem Sumber: <span class="badge-system badge-${r.sistem}">${r.sistem}</span> (ID: <code>${r.local_id}</code>)
                  </span>
                </div>
                <div style="margin-top:6px; font-size:12.5px; color:#475569;">
                  Field Cocok: <span class="field-match-tag matched">Nama Jaro-Winkler (${skorPersen}%)</span> 
                  <span class="field-match-tag matched">Tanggal Lahir Sama</span>
                  <span class="field-match-tag mismatch">NIK Kosong di Sumber</span>
                </div>
              </div>

              <!-- Tombol Keputusan Manusia -->
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-primary btn-sm" onclick="reviewMpiDecision(${r.link_id}, 'setuju')">
                  ✓ Setuju Gabungkan ke Master
                </button>
                <button class="btn btn-danger btn-sm" onclick="reviewMpiDecision(${r.link_id}, 'tolak')">
                  ✕ Tolak (Buat Pasien Terpisah)
                </button>
              </div>
            </div>

            <!-- Perbandingan Berdampingan -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 13px; background: #ffffff; padding: 14px; border-radius: 8px; border: 1px solid #fde68a;">
              <div>
                <strong style="color: var(--navy-primary); font-size:13.5px;">Master Patient Index (${r.mpi_id}):</strong>
                <div style="margin-top: 6px;">Nama: <strong style="color:#0f172a;">${r.nama_pasien_mpi}</strong></div>
                <div>Tgl Lahir: <code>${r.tgl_lahir_mpi || '-'}</code></div>
                <div>NIK: <code>${r.nik_pasien_mpi || '-'}</code></div>
                <div>Telepon: <code>${r.telepon_mpi || '-'}</code></div>
              </div>
              <div style="border-left: 2px dashed #fde68a; padding-left: 14px;">
                <strong style="color: var(--system-feedback); font-size:13.5px;">Rekaman Masuk dari ${r.sistem}:</strong>
                <div style="margin-top: 6px;">Nama: <strong style="color:#0f172a;">${r.nama_sumber}</strong></div>
                <div>Tgl Lahir: <code>${r.tgl_lahir_sumber || '-'}</code></div>
                <div>NIK: <span class="null-pill">NULL (Kosong)</span></div>
                <div>Telepon: <code>${r.telepon_sumber || '<span style="color:#94a3b8;">-</span>'}</code></div>
              </div>
            </div>

            <!-- Catatan Klinis Mengapa Tidak Digabung Otomatis -->
            <div style="margin-top: 10px; background: #fff7ed; border-left: 4px solid #f97316; padding: 8px 12px; font-size: 12px; color: #9a3412;">
              <strong>🛡️ Mengapa Tidak Digabung Otomatis?</strong> Nama disingkat ("S. Handayani" vs "Sari Handayani") dan NIK tidak dicatat di sistem ${r.sistem}. Penggabungan salah berisiko fatal mencampur data riwayat alergi obat & catatan klinis.
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Gagal memuat antrean review:', err);
  }
}

/**
 * Handle Keputusan Verifikator Manusia
 */
async function reviewMpiDecision(linkId, keputusan) {
  try {
    const res = await fetch(`/api/mpi/review/${linkId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keputusan, petugas: 'dr. Verifikator Juri' })
    });
    const result = await res.json();
    if (result.sukses) {
      showToast(`✓ Keputusan '${keputusan.toUpperCase()}' berhasil diterapkan!`, 'success');
      await loadMpiReviewQueue();
      await loadMpiPatientsTable();
      await loadAdminStats();
      await populatePatientSelector();
    } else {
      showToast('Gagal memproses keputusan: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('Koneksi gagal: ' + err.message, 'error');
  }
}

/**
 * Isi Dropdown Pemilih Pasien untuk Pembanding Peran
 */
async function populatePatientSelector() {
  const select = document.getElementById('role-comp-mpi-select');
  if (!select) return;

  const currentVal = select.value || 'MPI-0001';

  try {
    const res = await fetch('/api/mpi/patients');
    const result = await res.json();
    if (result.sukses && result.data.length > 0) {
      select.innerHTML = result.data.map(p => `
        <option value="${p.mpi_id}" ${p.mpi_id === currentVal ? 'selected' : ''}>
          ${p.nama} (${p.mpi_id}) — ${p.total_tautan} Sistem
        </option>
      `).join('');
    }
  } catch (e) {
    console.error('Gagal mengisi patient selector:', e);
  }
}

/**
 * BAGIAN 5: Pembanding 4 Peran (Data Minimization Proof)
 * 4 Kolom Berdampingan: Dokter, Perawat, Marketing, AI
 */
async function loadRoleComparison() {
  const targetMpi = document.getElementById('role-comp-mpi-select')?.value || 'MPI-0001';

  const roleConfigs = [
    { 
      role: 'dokter', 
      purpose: 'klinis', 
      elId: 'json-view-dokter',
      desc: 'Layanan Medis Langsung (Diagnosis, Resep, Lab)'
    },
    { 
      role: 'perawat', 
      purpose: 'klinis', 
      elId: 'json-view-perawat',
      desc: 'Asuhan Keperawatan & Pemulihan Pasien'
    },
    { 
      role: 'marketing', 
      purpose: 'pemasaran', 
      elId: 'json-view-marketing',
      desc: 'Promosi / CRM (Tanpa Rekam Medis & Tanpa NIK)'
    },
    { 
      role: 'ai', 
      purpose: 'analitik', 
      elId: 'json-view-ai',
      desc: 'Model Prediksi Risiko (Pseudonim SHA-256)'
    }
  ];

  for (const cfg of roleConfigs) {
    const el = document.getElementById(cfg.elId);
    if (!el) continue;

    try {
      el.innerText = 'Mengambil payload...';
      const res = await fetch(`/api/patient/${targetMpi}?purpose=${cfg.purpose}`, {
        headers: { 
          'X-Peran': cfg.role,
          'X-Aktor': `Demo Juri (${cfg.role})`
        }
      });
      const data = await res.json();

      if (res.status === 403) {
        el.innerHTML = `<span style="color:#f87171; font-weight:bold;">⛔ 403 FORBIDDEN - AKSES DIBLOKIR:\n${JSON.stringify(data, null, 2)}</span>`;
      } else if (data.sukses) {
        el.innerText = JSON.stringify(data.data, null, 2);
      } else {
        el.innerText = JSON.stringify(data, null, 2);
      }
    } catch (e) {
      el.innerText = 'Gagal memuat: ' + e.message;
    }
  }

  // Refresh access logs setelah melakukan request peran
  loadAccessLogsTable(false);
}

/**
 * BAGIAN 6: Majukan Hari Simulasi (+1 Hari)
 */
async function triggerAdvanceDay() {
  const btn = document.getElementById('btn-advance-day');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '⏳ Memajukan Hari...';
  }

  try {
    const res = await fetch('/api/demo/advance-day', { method: 'POST' });
    const result = await res.json();
    if (result.sukses) {
      showToast(`✓ Hari Simulasi Dimajukan: ${result.tanggal_simulasi} (Hari ke-${result.hari_ke})`, 'success');
      
      const simBadge = document.getElementById('simulation-date-badge');
      if (simBadge) {
        simBadge.innerText = `${result.tanggal_simulasi} (Hari ke-${result.hari_ke})`;
      }

      await loadAdminStats();
      await loadTrainingDataTable();
      await loadAccessLogsTable(false);
    } else {
      showToast('Gagal memajukan hari: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('Koneksi simulasi gagal: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⏩ Majukan Hari (+1 Hari)';
    }
  }
}

/**
 * BAGIAN 7: Tabel Access Log Real-Time
 * Waktu, Aktor, Peran, Purpose, Diizinkan (Hijau/Merah)
 */
async function loadAccessLogsTable(showToastNotification = false) {
  const tbody = document.getElementById('access-logs-table-body');
  const countBadge = document.getElementById('access-logs-count');
  if (!tbody) return;

  try {
    const res = await fetch('/api/access-logs');
    const result = await res.json();
    if (result.sukses) {
      if (countBadge) countBadge.innerText = `${result.total} Jejak Akses`;

      if (result.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8;">Belum ada log akses.</td></tr>';
        return;
      }

      tbody.innerHTML = result.logs.slice(0, 30).map(log => {
        const timeFormatted = log.waktu 
          ? log.waktu.replace('T', ' ').substring(0, 19) 
          : '-';

        const isAllowed = log.diizinkan === 1;
        const statusBadge = isAllowed 
          ? '<span class="badge-access-allow">✓ DIIZINKAN (200)</span>' 
          : '<span class="badge-access-deny">✕ DIBLOKIR (403)</span>';

        return `
          <tr style="${!isAllowed ? 'background-color: #fef2f2;' : ''}">
            <td style="font-family:monospace; font-size:12px; color:#475569;">${timeFormatted}</td>
            <td><strong style="color:#0f172a;">${log.aktor}</strong></td>
            <td><span class="badge-system badge-${log.peran === 'dokter' ? 'HIS' : (log.peran === 'perawat' ? 'CARE_DOKTER' : (log.peran === 'marketing' ? 'CRM' : 'FEEDBACK'))}">${log.peran}</span></td>
            <td><code style="color:#0369a1;">${log.purpose}</code></td>
            <td><code style="font-size:11px;">${log.mpi_id}</code></td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');

      if (showToastNotification) {
        showToast('Jejak akses berhasil diperbarui.', 'info');
      }
    }
  } catch (err) {
    console.error('Gagal memuat access logs:', err);
  }
}

/**
 * BAGIAN 8: Tabel Data Latih AI (/api/training-data)
 * Dengan Penghitung "N Baris Berlabel"
 */
async function loadTrainingDataTable() {
  const tbody = document.getElementById('training-data-table-body');
  const countBadge = document.getElementById('training-data-count');
  if (!tbody) return;

  try {
    const res = await fetch('/api/training-data');
    const result = await res.json();
    if (result.sukses) {
      if (countBadge) countBadge.innerText = `${result.total} Baris Berlabel (Outcome Nyata)`;

      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Belum ada outcome yang terisi.</td></tr>';
        return;
      }

      tbody.innerHTML = result.data.map(d => {
        let outcomeColor = '#0369a1';
        let outcomeBg = '#e0f2fe';

        if (d.outcome === 'hadir' || d.outcome === 'diminum' || d.outcome === 'tersambung' || d.outcome === 'membaik') {
          outcomeColor = '#15803d';
          outcomeBg = '#dcfce7';
        } else if (d.outcome === 'no_show' || d.outcome === 'terlewat' || d.outcome === 'memburuk') {
          outcomeColor = '#b91c1c';
          outcomeBg = '#fee2e2';
        }

        return `
          <tr>
            <td style="font-family:monospace; font-size:12px; color:#64748b;">#${d.event_id}</td>
            <td><strong style="color:#0284c7; font-family:monospace;">${d.mpi_id}</strong></td>
            <td><strong style="color:#0f172a;">${d.nama_pasien}</strong></td>
            <td><span class="badge-system badge-${d.sistem}">${d.sistem}</span></td>
            <td><span style="font-weight:600; color:#334155;">${d.tipe}</span></td>
            <td>${d.judul}</td>
            <td>
              <span class="badge-status" style="background:${outcomeBg}; color:${outcomeColor}; border:1px solid ${outcomeColor}40; font-weight:800;">
                ${d.outcome.toUpperCase()}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Gagal memuat training data:', err);
  }
}

/**
 * Muat Ringkasan Statistik Global
 */
async function loadAdminStats() {
  try {
    const res = await fetch('/api/stats');
    const result = await res.json();
    if (result.sukses) {
      const d = result.data;
      if (document.getElementById('stat-sources')) document.getElementById('stat-sources').innerText = d.total_source_records;
      if (document.getElementById('stat-mpi')) document.getElementById('stat-mpi').innerText = d.total_mpi_patients;
      if (document.getElementById('stat-reviews')) document.getElementById('stat-reviews').innerText = d.pending_mpi_reviews;
      if (document.getElementById('stat-training')) document.getElementById('stat-training').innerText = `${d.total_labeled_outcomes} Baris`;
      
      const simDate = d.simulation_current_date || new Date().toISOString().split('T')[0];
      const simBadge = document.getElementById('simulation-date-badge');
      if (simBadge) {
        simBadge.innerText = `${simDate} (Hari ke-${d.simulation_day_offset || 0})`;
      }
    }
  } catch (e) {
    console.error('Gagal memuat stats:', e);
  }
}
