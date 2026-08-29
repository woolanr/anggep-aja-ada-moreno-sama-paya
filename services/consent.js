/**
 * services/consent.js - Gerbang Persetujuan Pasien & Jejak Akses (Audit Log)
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 * 
 * Prinsip:
 * 1. Purpose 'klinis' memiliki dapat_dicabut = 0 (Basis hukum: Pelaksanaan Perjanjian Layanan Kesehatan)
 * 2. Tabel consents adalah APPEND-ONLY (tidak pernah di-update, selalu insert baru)
 * 3. Middleware gerbang(purpose) memeriksa izin dan SELALU mencatat ke access_log
 */

import { getDb } from '../db.js';

/**
 * Dapatkan informasi purpose dari database
 */
export function getPurpose(purposeId) {
  const db = getDb();
  return db.prepare('SELECT * FROM purposes WHERE id = ?').get(purposeId);
}

/**
 * Cek status consent terakhir pasien untuk purpose tertentu
 */
export function consentTerakhir(mpiId, purposeId) {
  const db = getDb();
  
  // Periksa apakah purpose tidak dapat dicabut (contoh: klinis)
  const purpose = getPurpose(purposeId);
  if (purpose && purpose.dapat_dicabut === 0) {
    return 1; // Selalu diizinkan secara hukum
  }

  // Ambil record consent terbaru (append-only)
  const latest = db.prepare(`
    SELECT diberikan FROM consents
    WHERE mpi_id = ? AND purpose = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(mpiId, purposeId);

  // Jika pasien belum pernah secara eksplisit mengubah consent, default adalah 1 (aktif saat registrasi)
  if (!latest) {
    return 1;
  }

  return latest.diberikan === 1 ? 1 : 0;
}

/**
 * Ambil semua status tujuan untuk seorang pasien
 */
export function getSemuaConsent(mpiId) {
  const db = getDb();
  const allPurposes = db.prepare('SELECT * FROM purposes ORDER BY id ASC').all();

  return allPurposes.map(p => {
    let status = 1;
    if (p.dapat_dicabut === 0) {
      status = 1;
    } else {
      const latest = db.prepare(`
        SELECT diberikan, waktu, versi FROM consents
        WHERE mpi_id = ? AND purpose = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(mpiId, p.id);

      status = latest ? (latest.diberikan === 1 ? 1 : 0) : 1;
    }

    return {
      purpose: p.id,
      nama: p.nama,
      basis_hukum: p.basis_hukum,
      dapat_dicabut: p.dapat_dicabut === 1,
      diberikan: status === 1
    };
  });
}

/**
 * Simpan persetujuan baru (Append-Only)
 */
export function catatConsent(mpiId, purposeId, diberikan, versi = 'v1.0') {
  const db = getDb();
  const purpose = getPurpose(purposeId);

  if (!purpose) {
    throw new Error(`Purpose '${purposeId}' tidak terdaftar.`);
  }

  if (purpose.dapat_dicabut === 0 && !diberikan) {
    throw new Error(`Tujuan '${purpose.nama}' tidak dapat dicabut karena berbasis hukum perjanjian layanan medis.`);
  }

  const waktu = new Date().toISOString();
  db.prepare(`
    INSERT INTO consents (mpi_id, purpose, diberikan, waktu, versi)
    VALUES (?, ?, ?, ?, ?)
  `).run(mpiId, purposeId, diberikan ? 1 : 0, waktu, versi);

  return {
    success: true,
    mpi_id: mpiId,
    purpose: purposeId,
    diberikan: !!diberikan,
    waktu,
    versi
  };
}

/**
 * Catat jejak akses ke access_log
 */
export function catatAkses({ aktor, peran, mpiId, purpose, fields, diizinkan }) {
  const db = getDb();
  const waktu = new Date().toISOString();
  const fieldsStr = Array.isArray(fields) ? JSON.stringify(fields) : (fields || null);

  db.prepare(`
    INSERT INTO access_log (waktu, aktor, peran, mpi_id, purpose, fields, diizinkan)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    waktu,
    aktor || 'Sistem Mandaya',
    peran || 'umum',
    mpiId || 'UNKNOWN',
    purpose || 'umum',
    fieldsStr,
    diizinkan ? 1 : 0
  );
}

/**
 * Middleware Gerbang Persetujuan Data
 * Digunakan pada SEMUA rute yang membaca data pasien
 */
export function gerbang(purposeExplicit = null) {
  return (req, res, next) => {
    const mpiId = req.params.mpiId || req.params.mpi_id || req.query.mpiId;
    const purposeId = purposeExplicit || req.query.purpose || 'klinis';
    const peran = (req.headers['x-peran'] || 'dokter').toLowerCase();
    const aktor = req.headers['x-aktor'] || `Staf (${peran})`;

    const purpose = getPurpose(purposeId);
    if (!purpose) {
      catatAkses({
        aktor,
        peran,
        mpiId: mpiId || 'UNKNOWN',
        purpose: purposeId,
        fields: [],
        diizinkan: false
      });
      return res.status(400).json({
        sukses: false,
        error: `Purpose '${purposeId}' tidak valid.`
      });
    }

    // 1. Jika basis hukum non-consent (dapat_dicabut === 0, seperti klinis) -> Lolos langsung
    if (purpose.dapat_dicabut === 0) {
      req.authContext = { aktor, peran, mpiId, purpose: purposeId, diizinkan: true };
      return next();
    }

    // 2. Cek consent terakhir pasien
    const statusConsent = consentTerakhir(mpiId, purposeId);
    const diizinkan = statusConsent === 1;

    if (!diizinkan) {
      // Catat kegagalan / pemblokiran akses ke log
      catatAkses({
        aktor,
        peran,
        mpiId,
        purpose: purposeId,
        fields: [],
        diizinkan: false
      });

      return res.status(403).json({
        sukses: false,
        error: 'Persetujuan (Consent) tidak diberikan oleh pasien untuk tujuan ini.',
        mpi_id: mpiId,
        purpose: purposeId,
        nama_tujuan: purpose.nama,
        basis_hukum: purpose.basis_hukum,
        status_persetujuan: 'dicabut_atau_tidak_diberikan'
      });
    }

    req.authContext = { aktor, peran, mpiId, purpose: purposeId, diizinkan: true };
    next();
  };
}

/**
 * Ambil riwayat access log untuk pasien tertentu
 */
export function getAccessLogs(mpiId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM access_log
    WHERE mpi_id = ?
    ORDER BY id DESC
    LIMIT 50
  `).all(mpiId);
}
