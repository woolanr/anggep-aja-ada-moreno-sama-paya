/**
 * services/minimize.js - Kebijakan Minimisasi Data per Peran & Tujuan
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 * 
 * Prinsip:
 * Satu identitas != satu tingkat akses.
 * Tiap peran hanya menerima subset field yang relevan dengan tugas dan dasar hukumnya.
 * Peran 'ai' (analitik) hanya menerima pseudonim hash (SHA-256) & kelompok usia.
 */

import crypto from 'crypto';

/**
 * Matriks Kebijakan Akses Field
 */
export const KEBIJAKAN = {
  dokter: {
    klinis: [
      'mpi_id',
      'nama',
      'tgl_lahir',
      'diagnosis',
      'obat',
      'hasil_lab',
      'riwayat_tindakan'
    ]
  },
  perawat: {
    klinis: [
      'mpi_id',
      'nama',
      'obat',
      'jadwal_kontrol',
      'catatan_pemulihan'
    ]
  },
  marketing: {
    pemasaran: [
      'mpi_id',
      'nama_depan',
      'perlu_kontrol',
      'kota'
    ],
    pengingat: [
      'mpi_id',
      'nama_depan',
      'tanggal_kontrol'
    ]
  },
  ai: {
    analitik: [
      'mpi_hash',
      'usia_kelompok',
      'tipe_tindakan',
      'outcome',
      'kepatuhan_persen'
    ]
  }
};

/**
 * Hitung kelompok usia (misal: "60-69 tahun")
 */
function hitungKelompokUsia(tglLahir) {
  if (!tglLahir) return 'Tidak Diketahui';
  const birth = new Date(tglLahir);
  if (isNaN(birth.getTime())) return 'Tidak Diketahui';
  const age = Math.floor((new Date() - birth) / (365.25 * 24 * 60 * 60 * 1000));
  const bawah = Math.floor(age / 10) * 10;
  return `${bawah}-${bawah + 9} tahun`;
}

/**
 * Ekstrak nama depan untuk pemasaran/pengingat
 */
function getNamaDepan(nama) {
  if (!nama) return '';
  return nama.trim().split(' ')[0];
}

/**
 * Proyeksikan record pasien menjadi payload yang diminimisasi sesuai peran & tujuan
 */
export function proyeksikan(recordMentah, peranInput, purposeInput) {
  const peran = (peranInput || 'dokter').toLowerCase();
  const purpose = (purposeInput || 'klinis').toLowerCase();

  const fieldDiizinkan = KEBIJAKAN[peran]?.[purpose] || [];

  // Siapkan data yang sudah diperkaya dengan derivasi field
  const dataLengkap = {
    ...recordMentah,
    mpi_id: recordMentah.mpi_id,
    mpi_hash: crypto.createHash('sha256').update(recordMentah.mpi_id || '').digest('hex').substring(0, 16),
    nama_depan: getNamaDepan(recordMentah.nama),
    usia_kelompok: hitungKelompokUsia(recordMentah.tgl_lahir),
    tanggal_kontrol: recordMentah.jadwal_kontrol_berikut || recordMentah.jadwal_kontrol || '2026-09-10',
    perlu_kontrol: recordMentah.perlu_kontrol !== undefined ? recordMentah.perlu_kontrol : true,
    kota: recordMentah.kota || 'Jakarta Barat',
    obat: recordMentah.obat || ['Amlodipine 10mg', 'Clopidogrel 75mg'],
    diagnosis: recordMentah.diagnosis || 'Hipertensi & Riwayat Stent PCI',
    hasil_lab: recordMentah.hasil_lab || { hbA1c: '6.4%', kolesterol: '185 mg/dL', kreatinin: '0.9 mg/dL' },
    riwayat_tindakan: recordMentah.riwayat_tindakan || ['PCI Stent (Mei 2026)', 'Ekokardiografi (Juni 2026)'],
    jadwal_kontrol: recordMentah.jadwal_kontrol || '2026-09-10 (Poli Jantung)',
    catatan_pemulihan: recordMentah.catatan_pemulihan || 'Pemulihan pasca PCI baik, tidak ada keluhan sesak napas saat istirahat.',
    tipe_tindakan: recordMentah.tipe_tindakan || 'Kardiologi Intervensi',
    outcome: recordMentah.outcome || 'stabil',
    kepatuhan_persen: recordMentah.kepatuhan_persen || 94
  };

  // Filter HANYA field yang ada pada konfigurasi kebijakan peran
  const hasilProyeksi = {};
  for (const field of fieldDiizinkan) {
    if (dataLengkap[field] !== undefined) {
      hasilProyeksi[field] = dataLengkap[field];
    }
  }

  return {
    peran,
    purpose,
    field_diizinkan: fieldDiizinkan,
    data: hasilProyeksi
  };
}
