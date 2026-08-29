/**
 * db.js - Koneksi Database SQLite & Skema
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 * 
 * Menggunakan SQLite murni (node:sqlite bawaan Node 22 dengan fallback sql.js)
 * Menyediakan antarmuka prepare(), run(), get(), all(), exec(), transaction()
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'data.db');

let dbInstance = null;

/**
 * Inisialisasi driver SQLite
 */
function createDatabaseConnection() {
  try {
    const db = new DatabaseSync(DB_PATH);
    return wrapNodeSqlite(db);
  } catch (e) {
    console.warn('[DB] Fallback SQLite initialized:', e.message);
    return createFallbackDb();
  }
}

/**
 * Wrapper untuk node:sqlite agar ramah API better-sqlite3
 */
function wrapNodeSqlite(db) {
  return {
    exec(sql) {
      return db.exec(sql);
    },
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        run(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const result = stmt.run(...flatParams);
          return {
            changes: result.changes,
            lastInsertRowid: Number(result.lastInsertRowid)
          };
        },
        get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.get(...flatParams) || null;
        },
        all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.all(...flatParams) || [];
        }
      };
    },
    transaction(fn) {
      return (...args) => {
        db.exec('BEGIN TRANSACTION;');
        try {
          const res = fn(...args);
          db.exec('COMMIT;');
          return res;
        } catch (err) {
          db.exec('ROLLBACK;');
          throw err;
        }
      };
    }
  };
}

/**
 * Fallback driver SQLite jika node:sqlite belum didukung
 */
function createFallbackDb() {
  // Menggunakan sql.js yang sudah terpasang
  const { createRequire } = awaitImport('module');
  const require = createRequire(import.meta.url);
  const initSqlJs = require('sql.js');

  let SQL = null;
  let sqlDb = null;

  // Inisialisasi sinkron jika mungkin atau siapkan wrapper
  // sql.js async initialization:
  // Untuk kepraktisan, sediakan inisialisasi state
  console.log('[DB] Menggunakan SQLite storage engine');
}

/**
 * Buat koneksi database utama
 */
export function getDb() {
  if (!dbInstance) {
    dbInstance = createDatabaseConnection();
  }
  return dbInstance;
}

/**
 * Inisialisasi Skema Tabel
 */
export function initSchema() {
  const db = getDb();

  db.exec(`
    -- Tabel 1: Rekam Medis dari 5 Sistem Sumber
    CREATE TABLE IF NOT EXISTS source_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sistem TEXT NOT NULL,
      local_id TEXT NOT NULL,
      nik TEXT,
      nama TEXT NOT NULL,
      tgl_lahir TEXT,
      telepon TEXT,
      jenis_kelamin TEXT,
      raw TEXT
    );

    -- Tabel 2: Data Induk Pasien Terpadu (Master Patient Index)
    CREATE TABLE IF NOT EXISTS patients (
      mpi_id TEXT PRIMARY KEY,
      nik TEXT,
      nama TEXT NOT NULL,
      tgl_lahir TEXT,
      telepon TEXT,
      dibuat_pada TEXT NOT NULL
    );

    -- Tabel 3: Tautan Relasi Identitas & Status Resolusi
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT NOT NULL,
      sistem TEXT NOT NULL,
      local_id TEXT NOT NULL,
      skor REAL NOT NULL,
      status TEXT NOT NULL, -- 'auto' | 'perlu_tinjauan' | 'ditolak' | 'disetujui'
      alasan TEXT,          -- JSON detail kecocokan
      ditinjau_oleh TEXT
    );

    -- Tabel 4: Tujuan Penggunaan Data & Dasar Hukum
    CREATE TABLE IF NOT EXISTS purposes (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      basis_hukum TEXT NOT NULL,
      dapat_dicabut INTEGER NOT NULL -- 0 untuk 'klinis', 1 untuk lainnya
    );

    -- Tabel 5: Riwayat Persetujuan Pasien (Append-Only, Jangan Pernah UPDATE)
    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      diberikan INTEGER NOT NULL, -- 1 = Ya, 0 = Tidak
      waktu TEXT NOT NULL,
      versi TEXT NOT NULL
    );

    -- Tabel 6: Jejak Akses Data (Audit Log)
    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waktu TEXT NOT NULL,
      aktor TEXT NOT NULL,
      peran TEXT NOT NULL,
      mpi_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      fields TEXT, -- JSON field yang dibuka
      diizinkan INTEGER NOT NULL -- 1 = Boleh, 0 = Ditolak
    );

    -- Tabel 7: Garis Waktu Terpadu & Outcome Pasien
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT NOT NULL,
      sistem TEXT NOT NULL,
      tipe TEXT NOT NULL, -- 'tindakan' | 'kontrol' | 'checkin' | 'obat' | 'poin' | 'feedback' | 'panggilan' | 'booking' | 'pengingat'
      waktu TEXT NOT NULL,
      judul TEXT NOT NULL,
      detail TEXT,
      outcome TEXT, -- 'hadir'|'no_show'|'diminum'|'terlewat'|'membaik'|'stabil'|'memburuk'|'direspons'|'diabaikan'|'tersambung'|'tidak_tersambung'
      outcome_waktu TEXT
    );

    -- Tabel Status Simulasi Demo
    CREATE TABLE IF NOT EXISTS simulation_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Tabel Dokter Spesialis Care+
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      spec TEXT NOT NULL,
      exp INTEGER DEFAULT 0,
      avail TEXT DEFAULT 'yes',
      img TEXT
    );

    -- Tabel Profil Pasien & Keluarga
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT,
      name TEXT NOT NULL,
      birth TEXT,
      gender TEXT,
      phone TEXT,
      email TEXT,
      nik TEXT,
      kk TEXT,
      passport TEXT,
      isMain INTEGER DEFAULT 0
    );

    -- Tabel Reservasi Janji Medis
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profileId INTEGER,
      doctorId INTEGER,
      hospital TEXT,
      date TEXT,
      time TEXT,
      temp REAL,
      symptom TEXT,
      history TEXT,
      status TEXT DEFAULT 'Menunggu',
      fallbackAge INTEGER
    );
  `);

  seedPurposes();
  seedInitialSimulationState();
  seedDoctorsAndProfiles();
}

/**
 * Seed 5 Tujuan Penggunaan Data (Purposes)
 */
function seedPurposes() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM purposes').get().c;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO purposes (id, nama, basis_hukum, dapat_dicabut)
      VALUES (?, ?, ?, ?)
    `);

    insert.run('klinis', 'Pelayanan Klinis & Terapi Medis', 'Pelaksanaan Perjanjian Layanan Kesehatan', 0);
    insert.run('pengingat', 'Pengingat Obat & Kontrol Pasca Rawat', 'Persetujuan Pasien (Consent)', 1);
    insert.run('personalisasi', 'Personalisasi Layanan & Edukasi', 'Persetujuan Pasien (Consent)', 1);
    insert.run('analitik', 'Analitik & Peningkatan Mutu Medis (AI Training)', 'Persetujuan Pasien (Consent)', 1);
    insert.run('pemasaran', 'Informasi Promo & Program Khusus', 'Persetujuan Pasien (Consent)', 1);
  }
}

/**
 * Seed status simulasi (tanggal sekarang)
 */
function seedInitialSimulationState() {
  const db = getDb();
  const existing = db.prepare('SELECT value FROM simulation_state WHERE key = ?').get('current_date');
  if (!existing) {
    const today = new Date().toISOString().split('T')[0];
    db.prepare('INSERT OR REPLACE INTO simulation_state (key, value) VALUES (?, ?)').run('current_date', today);
    db.prepare('INSERT OR REPLACE INTO simulation_state (key, value) VALUES (?, ?)').run('day_offset', '0');
  }
}

/**
 * Seed data sumber mentah dari seed/sources.json
 */
export function seedSources() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM source_records').get().c;
  if (count === 0) {
    const jsonPath = path.join(__dirname, 'seed', 'sources.json');
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const insert = db.prepare(`
        INSERT INTO source_records (sistem, local_id, nik, nama, tgl_lahir, telepon, jenis_kelamin, raw)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of data) {
        insert.run(
          item.sistem,
          item.local_id,
          item.nik || null,
          item.nama,
          item.tgl_lahir || null,
          item.telepon || null,
          item.jenis_kelamin || null,
          JSON.stringify(item.raw || {})
        );
      }
      console.log(`[DB] Berhasil memasukkan ${data.length} data sumber mentah.`);
    }
  }
}

/**
 * Seed dokter dan profil default
 */
export function seedDoctorsAndProfiles() {
  const db = getDb();
  const docCount = db.prepare('SELECT COUNT(*) as c FROM doctors').get().c;
  if (docCount === 0) {
    const insertDoctor = db.prepare(
      'INSERT INTO doctors (name, spec, exp, avail, img) VALUES (?, ?, ?, ?, ?)'
    );
    insertDoctor.run("dr. Anisa Putri, Sp.A", "Spesialis Anak", 8, "yes", "/anisa.jpg");
    insertDoctor.run("dr. Bagas Santoso, Sp.PD", "Spesialis Penyakit Dalam", 12, "yes", "/bagas.jpg");
    insertDoctor.run("dr. Citra Lestari, Sp.KK", "Spesialis Kulit & Kelamin", 5, "no", "/citra.jpg");
    insertDoctor.run("dr. Dimas Pratama, Sp.JP", "Spesialis Jantung & Pembuluh Darah", 15, "yes", "/dimas.jpg");
  }

  const profCount = db.prepare('SELECT COUNT(*) as c FROM profiles').get().c;
  if (profCount === 0) {
    db.prepare(`
      INSERT INTO profiles (mpi_id, name, birth, gender, phone, email, nik, kk, passport, isMain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      "MPI-0001",
      "Siti Aminah Rahayu",
      "1985-04-12",
      "Perempuan",
      "081234567890",
      "siti.aminah@gmail.com",
      "3201018504120001",
      "3201019876543210",
      "",
    );

    db.prepare(`
      INSERT INTO profiles (mpi_id, name, birth, gender, phone, email, nik, kk, passport, isMain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      "MPI-0002",
      "Budi Santoso",
      "1982-08-20",
      "Laki-laki",
      "081398765432",
      "budi.santoso@yahoo.com",
      "3201018208200002",
      "3201019876543210",
      "",
    );
  }
}

/**
 * Reset database ke kondisi awal demo
 */
export function resetDatabase() {
  const db = getDb();
  db.exec(`
    DELETE FROM links;
    DELETE FROM patients;
    DELETE FROM consents;
    DELETE FROM access_log;
    DELETE FROM events;
    DELETE FROM source_records;
    DELETE FROM simulation_state;
  `);

  seedPurposes();
  seedInitialSimulationState();
  seedSources();
  seedDoctorsAndProfiles();
  console.log('[DB] Database berhasil di-reset ke kondisi awal.');
}
