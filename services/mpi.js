/**
 * services/mpi.js - Mesin Master Patient Index (MPI)
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 * 
 * Mengimplementasikan:
 * 1. Pencocokan Deterministik (NIK sama persis -> Skor 1.0)
 * 2. Pencocokan Probabilistik Berbobot:
 *    - Nama: 0.35 (Jaro-Winkler)
 *    - Tanggal Lahir: 0.30 (Exact)
 *    - Telepon: 0.25 (8 digit terakhir)
 *    - Jenis Kelamin: 0.10 (Exact)
 *    - Normalisasi bobot dinamis untuk field yang tersedia
 * 3. Ambang Keputusan:
 *    - >= 0.92: 'auto' (Tautkan otomatis)
 *    - 0.70 - 0.92: 'perlu_tinjauan' (Antrean tinjauan manusia)
 *    - < 0.70: Buat entri pasien MPI baru
 */

import { getDb } from '../db.js';

/**
 * Hitung Jaro Similarity antara dua string
 */
function jaroDistance(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  if (str1 === str2) return 1.0;

  const len1 = str1.length;
  const len2 = str2.length;
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let numMatches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (matches2[j]) continue;
      if (str1[i] !== str2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      numMatches++;
      break;
    }
  }

  if (numMatches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) {
      k++;
    }
    if (str1[i] !== str2[k]) {
      transpositions++;
    }
    k++;
  }

  const m = numMatches;
  return (m / len1 + m / len2 + (m - transpositions / 2) / m) / 3.0;
}

/**
 * Hitung Jaro-Winkler Similarity (dengan bonus awalan 4 karakter)
 */
export function jaroWinkler(s1, s2) {
  const jaro = jaroDistance(s1, s2);
  if (jaro < 0.7) return jaro;

  const str1 = (s1 || '').toLowerCase().trim();
  const str2 = (s2 || '').toLowerCase().trim();

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(str1.length, str2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (str1[i] === str2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  const p = 0.1; // Scaling factor
  return Number((jaro + prefix * p * (1.0 - jaro)).toFixed(4));
}

/**
 * Normalisasi nomor telepon (ambil 8 digit terakhir)
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return digits;
  return digits.slice(-8);
}

/**
 * Bandingkan dua record identitas dan hasilkan skor kecocokan serta rincian alasan
 */
export function bandingkanIdentitas(source, patient) {
  // Aturan 1: NIK sama persis -> Skor 1.0 (Deterministik)
  if (source.nik && patient.nik && source.nik.trim() !== '' && source.nik.trim() === patient.nik.trim()) {
    return {
      skor: 1.0,
      metode: 'deterministik',
      status: 'auto',
      alasan: {
        nik_match: true,
        skor_total: 1.0,
        keterangan: 'NIK identik (Pencocokan Deterministik)',
        komponen: { nik: 1.0 }
      }
    };
  }

  // Aturan 2: Pencocokan Probabilistik Berbobot
  const bobotKonfigurasi = {
    nama: 0.35,
    tgl_lahir: 0.30,
    telepon: 0.25,
    jenis_kelamin: 0.10
  };

  let bobotTersedia = 0.0;
  let skorTertimbang = 0.0;
  const rincian = {};

  // 1. Nama (Jaro-Winkler)
  if (source.nama && patient.nama) {
    const skorNama = jaroWinkler(source.nama, patient.nama);
    bobotTersedia += bobotKonfigurasi.nama;
    skorTertimbang += skorNama * bobotKonfigurasi.nama;
    rincian.nama = {
      nilai_sumber: source.nama,
      nilai_pasien: patient.nama,
      skor: skorNama,
      bobot: bobotKonfigurasi.nama
    };
  }

  // 2. Tanggal Lahir (Exact match)
  if (source.tgl_lahir && patient.tgl_lahir) {
    const cocokTgl = source.tgl_lahir.trim() === patient.tgl_lahir.trim();
    const skorTgl = cocokTgl ? 1.0 : 0.0;
    bobotTersedia += bobotKonfigurasi.tgl_lahir;
    skorTertimbang += skorTgl * bobotKonfigurasi.tgl_lahir;
    rincian.tgl_lahir = {
      nilai_sumber: source.tgl_lahir,
      nilai_pasien: patient.tgl_lahir,
      skor: skorTgl,
      bobot: bobotKonfigurasi.tgl_lahir
    };
  }

  // 3. Telepon (8 digit terakhir)
  const phoneSrc = normalizePhone(source.telepon);
  const phonePat = normalizePhone(patient.telepon);
  if (phoneSrc && phonePat) {
    const cocokTelp = phoneSrc === phonePat;
    const skorTelp = cocokTelp ? 1.0 : 0.0;
    bobotTersedia += bobotKonfigurasi.telepon;
    skorTertimbang += skorTelp * bobotKonfigurasi.telepon;
    rincian.telepon = {
      nilai_sumber: source.telepon,
      nilai_pasien: patient.telepon,
      skor: skorTelp,
      bobot: bobotKonfigurasi.telepon
    };
  }

  // 4. Jenis Kelamin (Exact match)
  if (source.jenis_kelamin && patient.jenis_kelamin) {
    const cocokJk = source.jenis_kelamin.trim().toUpperCase() === patient.jenis_kelamin.trim().toUpperCase();
    const skorJk = cocokJk ? 1.0 : 0.0;
    bobotTersedia += bobotKonfigurasi.jenis_kelamin;
    skorTertimbang += skorJk * bobotKonfigurasi.jenis_kelamin;
    rincian.jenis_kelamin = {
      nilai_sumber: source.jenis_kelamin,
      nilai_pasien: patient.jenis_kelamin,
      skor: skorJk,
      bobot: bobotKonfigurasi.jenis_kelamin
    };
  }

  // Normalisasi skor terhadap bobot field yang tersedia
  const skorAkhir = bobotTersedia > 0 ? Number((skorTertimbang / bobotTersedia).toFixed(4)) : 0.0;

  let status = 'baru';
  if (skorAkhir >= 0.92) {
    status = 'auto';
  } else if (skorAkhir >= 0.70) {
    status = 'perlu_tinjauan';
  } else {
    status = 'baru';
  }

  return {
    skor: skorAkhir,
    metode: 'probabilistik',
    status,
    alasan: {
      nik_match: false,
      skor_total: skorAkhir,
      bobot_tersedia: Number(bobotTersedia.toFixed(2)),
      komponen: rincian
    }
  };
}

/**
 * Format ID Pasien MPI (MPI-0001, MPI-0002, ...)
 */
function generateMpiId(index) {
  return `MPI-${String(index).padStart(4, '0')}`;
}

/**
 * Jalankan proses resolusi Master Patient Index untuk semua data sumber
 */
export function jalankanResolusiMPI() {
  const db = getDb();

  // Bersihkan hasil resolusi sebelumnya untuk idempotensi proses
  db.exec(`
    DELETE FROM links;
    DELETE FROM patients;
  `);

  const sources = db.prepare('SELECT * FROM source_records ORDER BY id ASC').all();
  if (sources.length === 0) {
    return {
      status: 'success',
      total_sumber: 0,
      total_pasien_mpi: 0,
      perlu_tinjauan: 0,
      hasil: []
    };
  }

  let mpiCounter = 0;
  const hasilResolusi = [];

  for (const record of sources) {
    const existingPatients = db.prepare('SELECT * FROM patients').all();

    let kandidatTerbaik = null;
    let skorTertinggi = -1;
    let hasilKecocokanTerbaik = null;

    // Bandingkan dengan seluruh pasien MPI yang sudah terbentuk
    for (const patient of existingPatients) {
      const match = bandingkanIdentitas(record, patient);
      if (match.skor > skorTertinggi) {
        skorTertinggi = match.skor;
        kandidatTerbaik = patient;
        hasilKecocokanTerbaik = match;
      }
    }

    if (kandidatTerbaik && skorTertinggi >= 0.92) {
      // Ambang >= 0.92: Tautkan otomatis ke pasien yang ada
      db.prepare(`
        INSERT INTO links (mpi_id, sistem, local_id, skor, status, alasan, ditinjau_oleh)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        kandidatTerbaik.mpi_id,
        record.sistem,
        record.local_id,
        skorTertinggi,
        'auto',
        JSON.stringify(hasilKecocokanTerbaik.alasan),
        'SYSTEM_MPI_AUTO'
      );

      // Lengkapi data master jika ada field pasien yang masih kosong
      db.prepare(`
        UPDATE patients SET
          nik = COALESCE(nik, ?),
          tgl_lahir = COALESCE(tgl_lahir, ?),
          telepon = COALESCE(telepon, ?)
        WHERE mpi_id = ?
      `).run(record.nik, record.tgl_lahir, record.telepon, kandidatTerbaik.mpi_id);

      hasilResolusi.push({
        source_id: record.id,
        sistem: record.sistem,
        local_id: record.local_id,
        mpi_id: kandidatTerbaik.mpi_id,
        skor: skorTertinggi,
        status: 'auto'
      });

    } else if (kandidatTerbaik && skorTertinggi >= 0.70 && skorTertinggi < 0.92) {
      // Ambang 0.70 - 0.92: Masuk antrean tinjauan manusia (human-in-the-loop)
      db.prepare(`
        INSERT INTO links (mpi_id, sistem, local_id, skor, status, alasan, ditinjau_oleh)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        kandidatTerbaik.mpi_id,
        record.sistem,
        record.local_id,
        skorTertinggi,
        'perlu_tinjauan',
        JSON.stringify(hasilKecocokanTerbaik.alasan),
        null
      );

      hasilResolusi.push({
        source_id: record.id,
        sistem: record.sistem,
        local_id: record.local_id,
        mpi_id: kandidatTerbaik.mpi_id,
        skor: skorTertinggi,
        status: 'perlu_tinjauan'
      });

    } else {
      // Skor < 0.70: Buat Pasien MPI Baru
      mpiCounter++;
      const newMpiId = generateMpiId(mpiCounter);
      const dibuatPada = new Date().toISOString();

      db.prepare(`
        INSERT INTO patients (mpi_id, nik, nama, tgl_lahir, telepon, dibuat_pada)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        newMpiId,
        record.nik || null,
        record.nama,
        record.tgl_lahir || null,
        record.telepon || null,
        dibuatPada
      );

      db.prepare(`
        INSERT INTO links (mpi_id, sistem, local_id, skor, status, alasan, ditinjau_oleh)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newMpiId,
        record.sistem,
        record.local_id,
        1.0,
        'auto',
        JSON.stringify({
          nik_match: !!record.nik,
          skor_total: 1.0,
          keterangan: 'Penciptaan Pasien Master Baru (Inisiasi)',
          komponen: {}
        }),
        'SYSTEM_MPI_INIT'
      );

      hasilResolusi.push({
        source_id: record.id,
        sistem: record.sistem,
        local_id: record.local_id,
        mpi_id: newMpiId,
        skor: 1.0,
        status: 'auto_baru'
      });
    }
  }

  // Seed default events untuk pasien-pasien teridentifikasi agar siap demo
  seedTimelineEvents();

  const totalPasien = db.prepare('SELECT COUNT(*) as c FROM patients').get().c;
  const totalPerluTinjauan = db.prepare("SELECT COUNT(*) as c FROM links WHERE status = 'perlu_tinjauan'").get().c;

  return {
    status: 'success',
    total_sumber: sources.length,
    total_pasien_mpi: totalPasien,
    perlu_tinjauan: totalPerluTinjauan,
    hasil: hasilResolusi
  };
}

/**
 * Seed initial timeline events untuk pasien agar timeline dan demo lengkap
 */
function seedTimelineEvents() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM events').get().c;
  if (count > 0) return;

  const sari = db.prepare("SELECT mpi_id FROM patients WHERE nama LIKE '%Sari%' LIMIT 1").get();
  if (sari) {
    const mpiId = sari.mpi_id;
    const insertEvent = db.prepare(`
      INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertEvent.run(
      mpiId, 'HIS', 'tindakan', '2026-05-10 10:00:00',
      'Pemasangan Stent Jantung (PCI)',
      'Tindakan PCI pada Left Anterior Descending Artery oleh dr. Adrian Sp.JP',
      'stabil', '2026-05-12 09:00:00'
    );

    insertEvent.run(
      mpiId, 'CARE_DOKTER', 'obat', '2026-08-25 08:00:00',
      'Pemberian Resep Amlodipine 10mg & Clopidogrel 75mg',
      'Aturan minum: 1 tablet pagi hari sesudah makan',
      'diminum', '2026-08-25 08:30:00'
    );

    insertEvent.run(
      mpiId, 'CRM', 'pengingat', '2026-08-26 09:00:00',
      'Pengingat Jadwal Kontrol Rutin Kardiologi',
      'Notifikasi WhatsApp konfirmasi kehadiran kontrol tanggal 28 Agustus 2026',
      'direspons', '2026-08-26 10:15:00'
    );

    insertEvent.run(
      mpiId, 'LOYALITAS', 'poin', '2026-08-26 10:15:00',
      '+50 Poin Kepatuhan Mandaya Care',
      'Poin diberikan atas kepatuhan konfirmasi kontrol & minum obat tepat waktu',
      null, null
    );

    insertEvent.run(
      mpiId, 'FEEDBACK', 'feedback', '2026-08-27 14:00:00',
      'Survei Kepuasan Pasien Pasca Rawat',
      'Skor NPS 9/10: Layanan dokter dan perawat ramah serta cepat tanggap',
      'membaik', '2026-08-27 14:00:00'
    );

    insertEvent.run(
      mpiId, 'CARE_DOKTER', 'checkin', '2026-08-28 07:30:00',
      'Check-in Harian Pasien Mandiri',
      'Keluhan dada: Tidak ada. Tekanan darah: 130/82 mmHg. Skor nyeri: 1',
      'stabil', '2026-08-28 07:30:00'
    );
  }
}
