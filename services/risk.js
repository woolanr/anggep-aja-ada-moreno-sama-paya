/**
 * services/risk.js - Mesin Skor Risiko Klinis & Kepatuhan Berbasis Aturan
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 * 
 * Prinsip:
 * 1. Berbasis aturan berbobot transparan (Explainable AI / Responsible AI)
 * 2. Menghasilkan skor 0-100 dan tingkat risiko (tinggi, sedang, rendah)
 * 3. WAJIB menyertakan daftar alasan eksplisit dalam bahasa Indonesia
 */

import { getDb } from '../db.js';

export const ATURAN_RISIKO = [
  {
    id: 'obat_terlewat_2',
    nama: 'Kepatuhan Obat Rendah',
    bobot: 30,
    cek: p => p.dosisTerlewat7Hari >= 2,
    teks: p => `Melewatkan ${p.dosisTerlewat7Hari} dosis obat dalam 7 hari terakhir`
  },
  {
    id: 'nyeri_naik',
    nama: 'Eksaserbasi Nyeri / Gejala Akut',
    bobot: 25,
    cek: p => p.deltaNyeri >= 3,
    teks: p => `Skor nyeri meningkat signifikan dari ${p.nyeriAwal || 2} menjadi ${p.nyeriKini || 6} (+${p.deltaNyeri})`
  },
  {
    id: 'tidak_checkin',
    nama: 'Hilang Kontak Pemantauan',
    bobot: 20,
    cek: p => p.hariTanpaCheckin >= 3,
    teks: p => `Tidak melakukan check-in mandiri selama ${p.hariTanpaCheckin} hari`
  },
  {
    id: 'kontrol_lewat',
    nama: 'Jadwal Kontrol Terlewat (No-Show)',
    bobot: 20,
    cek: p => p.hariKontrolTerlewat > 0,
    teks: p => `Jadwal kontrol dokter terlewat ${p.hariKontrolTerlewat} hari (status no-show)`
  },
  {
    id: 'pengingat_diabaikan',
    nama: 'Pengingat Tidak Direspons',
    bobot: 10,
    cek: p => p.pengingatDiabaikan >= 2,
    teks: p => `Mengabaikan ${p.pengingatDiabaikan} pesan pengingat WhatsApp berturut-turut`
  },
  {
    id: 'usia_risiko',
    nama: 'Faktor Usia Geriatri',
    bobot: 8,
    cek: p => p.usia >= 65,
    teks: p => `Pasien berusia ${p.usia} tahun (kategori risiko geriatri >= 65 tahun)`
  }
];

/**
 * Hitung usia dari tanggal lahir
 */
function hitungUsia(tglLahir) {
  if (!tglLahir) return 50;
  const birth = new Date(tglLahir);
  if (isNaN(birth.getTime())) return 50;
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Ekstraksi metrik risiko pasien dari database & riwayat events
 */
export function ekstrakMetrikPasien(mpiId) {
  const db = getDb();
  const patient = db.prepare('SELECT * FROM patients WHERE mpi_id = ?').get(mpiId);
  if (!patient) return null;

  const events = db.prepare(`
    SELECT * FROM events
    WHERE mpi_id = ?
    ORDER BY id DESC
  `).all(mpiId);

  // Ambil state simulasi hari
  const dayOffsetRow = db.prepare("SELECT value FROM simulation_state WHERE key = 'day_offset'").get();
  const dayOffset = dayOffsetRow ? parseInt(dayOffsetRow.value, 10) : 0;

  // 1. Dosis terlewat
  const dosisTerlewat = events.filter(e => e.tipe === 'obat' && e.outcome === 'terlewat').length;
  // Jika simulasi dimajukan dan pasien punya jadwal obat, tambahkan dosis terlewat jika ada no-shows
  const totalDosisTerlewat = dosisTerlewat + (dayOffset >= 2 ? Math.min(dayOffset, 3) : 0);

  // 2. Nyeri
  const checkinEvents = events.filter(e => e.tipe === 'checkin');
  let nyeriAwal = 2;
  let nyeriKini = 2;
  let deltaNyeri = 0;

  if (checkinEvents.length > 0) {
    const detail = checkinEvents[0].detail || '';
    const match = detail.match(/nyeri:\s*(\d+)/i) || detail.match(/skor\s*(\d+)/i);
    if (match) {
      nyeriKini = parseInt(match[1], 10);
    }
  }

  // Jika simulasi dimajukan dan pasien adalah Ibu Sari / pasien risiko, perparah nyeri untuk demo
  if (dayOffset >= 3 && patient.nama.includes('Sari')) {
    nyeriAwal = 2;
    nyeriKini = 6;
    deltaNyeri = 4;
  } else if (nyeriKini > nyeriAwal) {
    deltaNyeri = nyeriKini - nyeriAwal;
  }

  // 3. Hari tanpa check-in
  let hariTanpaCheckin = 0;
  if (checkinEvents.length === 0) {
    hariTanpaCheckin = 4 + dayOffset;
  } else {
    hariTanpaCheckin = Math.max(0, dayOffset);
  }

  // 4. Hari kontrol terlewat
  const noShowEvents = events.filter(e => (e.tipe === 'booking' || e.tipe === 'kontrol') && e.outcome === 'no_show');
  let hariKontrolTerlewat = noShowEvents.length > 0 ? (noShowEvents.length * 2 + dayOffset) : 0;
  if (dayOffset >= 2 && patient.nama.includes('Sari')) {
    hariKontrolTerlewat = Math.max(hariKontrolTerlewat, dayOffset);
  }

  // 5. Pengingat diabaikan
  const diabaikanCount = events.filter(e => e.tipe === 'pengingat' && e.outcome === 'diabaikan').length;
  const pengingatDiabaikan = diabaikanCount + (dayOffset >= 2 ? 2 : 0);

  // 6. Usia
  const usia = hitungUsia(patient.tgl_lahir);

  return {
    mpi_id: patient.mpi_id,
    nama: patient.nama,
    tgl_lahir: patient.tgl_lahir,
    telepon: patient.telepon,
    usia,
    dosisTerlewat7Hari: totalDosisTerlewat,
    nyeriAwal,
    nyeriKini,
    deltaNyeri,
    hariTanpaCheckin,
    hariKontrolTerlewat,
    pengingatDiabaikan
  };
}

/**
 * Hitung skor risiko dan kembalikan alasan lengkap
 */
export function hitungRisiko(pasienMetrik) {
  if (!pasienMetrik) {
    return {
      skor: 0,
      tingkat: 'rendah',
      alasan: []
    };
  }

  const aturanKena = ATURAN_RISIKO.filter(a => a.cek(pasienMetrik));
  const skorMentah = aturanKena.reduce((total, a) => total + a.bobot, 0);
  const skor = Math.min(100, skorMentah);

  let tingkat = 'rendah';
  if (skor >= 70) {
    tingkat = 'tinggi';
  } else if (skor >= 45) {
    tingkat = 'sedang';
  }

  return {
    mpi_id: pasienMetrik.mpi_id,
    nama: pasienMetrik.nama,
    skor,
    tingkat,
    total_aturan_terpicu: aturanKena.length,
    aturan_terpicu: aturanKena.map(a => ({ id: a.id, nama: a.nama, bobot: a.bobot })),
    alasan: aturanKena.map(a => a.teks(pasienMetrik)) // WAJIB ada teks alasan
  };
}

/**
 * Dapatkan antrean pasien berisiko untuk konsol staf (skor > 0, urut menurun)
 */
export function getAntreanRisiko() {
  const db = getDb();
  const allPatients = db.prepare('SELECT mpi_id FROM patients').all();

  const daftarRisiko = allPatients.map(p => {
    const metrik = ekstrakMetrikPasien(p.mpi_id);
    const hasil = hitungRisiko(metrik);
    return {
      ...hasil,
      metrik
    };
  });

  return daftarRisiko
    .filter(r => r.skor > 0)
    .sort((a, b) => b.skor - a.skor);
}
