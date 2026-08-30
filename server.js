/**
 * server.js - Server Utama Express
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 *
 * Melayani API RESTful & File Statis Frontend (public/)
 * Port: 3000 (0.0.0.0)
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, initSchema, seedSources, resetDatabase } from "./db.js";
import { jalankanResolusiMPI } from "./services/mpi.js";
import {
  gerbang,
  getSemuaConsent,
  catatConsent,
  getAccessLogs,
  catatAkses,
} from "./services/consent.js";
import { proyeksikan } from "./services/minimize.js";
import {
  hitungRisiko,
  getAntreanRisiko,
  ekstrakMetrikPasien,
} from "./services/risk.js";
import {
  getOrCreateLoyaltyAccount,
  generatePointPrescriptions,
  getRewardsCatalog,
  redeemPointReward,
  getFamilyHealthPool,
  transferToFamilyPool,
  toggleAutoUsePoints,
  calculateAutoUseDiscount,
  getMissionsAndQuizzes,
  submitHealthQuiz,
  incrementCareStreak,
} from "./services/loyalty.js";
import {
  getPatientActivePathway,
  setPatientPathwayPhase,
  submitCheckinResponse,
  getNursePriorityQueue,
  updateNurseQueueStatus,
  CARE_PATHWAY_TEMPLATES,
} from "./services/mira.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware parsing JSON
app.use(express.json());

// Inisialisasi Database & Skema saat startup
initSchema();
seedSources();

// Log request sederhana
app.use((req, res, next) => {
  res.setHeader("X-Powered-By", "Mandaya Royal Hospital Puri Data Engine");
  next();
});

// ==========================================
// 1. ENDPOINT MASTER PATIENT INDEX (MPI)
// ==========================================

/**
 * POST /api/mpi/resolve - Jalankan resolusi semua source_records
 */
app.post("/api/mpi/resolve", (req, res) => {
  try {
    const hasil = jalankanResolusiMPI();
    res.json({
      sukses: true,
      pesan: `Resolusi MPI selesai. ${hasil.total_sumber} data mentah diresolusi menjadi ${hasil.total_pasien_mpi} Pasien MPI.`,
      ringkasan: hasil,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/mpi/patients - Daftar pasien MPI + jumlah tautan
 */
app.get("/api/mpi/patients", (req, res) => {
  try {
    const db = getDb();
    const patients = db
      .prepare(
        `
      SELECT 
        p.mpi_id,
        p.nik,
        p.nama,
        p.tgl_lahir,
        p.telepon,
        p.dibuat_pada,
        COUNT(l.id) AS total_tautan,
        GROUP_CONCAT(DISTINCT l.sistem) AS sistem_terhubung
      FROM patients p
      LEFT JOIN links l ON p.mpi_id = l.mpi_id
      GROUP BY p.mpi_id
      ORDER BY p.mpi_id ASC
    `,
      )
      .all();

    // Ambil detail tautan untuk setiap pasien
    const hasil = patients.map((p) => {
      const links = db
        .prepare(
          `
        SELECT id, sistem, local_id, skor, status, alasan, ditinjau_oleh
        FROM links
        WHERE mpi_id = ?
        ORDER BY id ASC
      `,
        )
        .all(p.mpi_id);

      return {
        ...p,
        links: links.map((l) => ({
          ...l,
          alasan: l.alasan ? JSON.parse(l.alasan) : null,
        })),
      };
    });

    res.json({ sukses: true, total: hasil.length, data: hasil });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/mpi/review - Antrean perlu_tinjauan
 */
app.get("/api/mpi/review", (req, res) => {
  try {
    const db = getDb();
    const reviews = db
      .prepare(
        `
      SELECT 
        l.id AS link_id,
        l.mpi_id,
        l.sistem,
        l.local_id,
        l.skor,
        l.status,
        l.alasan,
        p.nama AS nama_pasien_mpi,
        p.nik AS nik_pasien_mpi,
        p.tgl_lahir AS tgl_lahir_mpi,
        p.telepon AS telepon_mpi,
        s.nama AS nama_sumber,
        s.nik AS nik_sumber,
        s.tgl_lahir AS tgl_lahir_sumber,
        s.telepon AS telepon_sumber,
        s.jenis_kelamin AS jk_sumber,
        s.raw AS raw_sumber
      FROM links l
      JOIN patients p ON l.mpi_id = p.mpi_id
      LEFT JOIN source_records s ON l.sistem = s.sistem AND l.local_id = s.local_id
      WHERE l.status = 'perlu_tinjauan'
      ORDER BY l.skor DESC
    `,
      )
      .all();

    const hasil = reviews.map((r) => ({
      ...r,
      alasan: r.alasan ? JSON.parse(r.alasan) : null,
      raw_sumber: r.raw_sumber ? JSON.parse(r.raw_sumber) : null,
    }));

    res.json({ sukses: true, total: hasil.length, data: hasil });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/mpi/review/:id - Berikan keputusan manusia (setuju | tolak)
 */
app.post("/api/mpi/review/:id", (req, res) => {
  try {
    const linkId = req.params.id;
    const { keputusan, petugas = "dr. Staf Verifikator" } = req.body;

    if (!["setuju", "tolak"].includes(keputusan)) {
      return res.status(400).json({
        sukses: false,
        error: "Keputusan harus bernilai 'setuju' atau 'tolak'.",
      });
    }

    const db = getDb();
    const link = db.prepare("SELECT * FROM links WHERE id = ?").get(linkId);
    if (!link) {
      return res
        .status(404)
        .json({ sukses: false, error: "Tautan tidak ditemukan." });
    }

    const statusBaru = keputusan === "setuju" ? "disetujui" : "ditolak";

    db.prepare(
      `
      UPDATE links 
      SET status = ?, ditinjau_oleh = ?
      WHERE id = ?
    `,
    ).run(
      statusBaru,
      `${petugas} (${new Date().toLocaleTimeString()})`,
      linkId,
    );

    // Jika ditolak, buat pasien MPI independen baru untuk source record tersebut
    if (keputusan === "tolak") {
      const sourceRecord = db
        .prepare(
          "SELECT * FROM source_records WHERE sistem = ? AND local_id = ?",
        )
        .get(link.sistem, link.local_id);
      if (sourceRecord) {
        const countPasien =
          db.prepare("SELECT COUNT(*) as c FROM patients").get().c + 1;
        const newMpiId = `MPI-${String(countPasien).padStart(4, "0")}`;

        db.prepare(
          `
          INSERT INTO patients (mpi_id, nik, nama, tgl_lahir, telepon, dibuat_pada)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).run(
          newMpiId,
          sourceRecord.nik || null,
          sourceRecord.nama,
          sourceRecord.tgl_lahir || null,
          sourceRecord.telepon || null,
          new Date().toISOString(),
        );

        // Buat link ke pasien baru
        db.prepare(
          `
          INSERT INTO links (mpi_id, sistem, local_id, skor, status, alasan, ditinjau_oleh)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          newMpiId,
          sourceRecord.sistem,
          sourceRecord.local_id,
          1.0,
          "auto",
          JSON.stringify({
            keterangan: "Dibuat terpisah pasca penolakan tinjauan manual",
          }),
          petugas,
        );
      }
    }

    res.json({
      sukses: true,
      pesan: `Tautan #${linkId} berhasil diubah statusnya menjadi '${statusBaru}'.`,
      link_id: linkId,
      status: statusBaru,
      ditinjau_oleh: petugas,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 2. ENDPOINT CONSENT & AUDIT ACCESS LOG
// ==========================================

/**
 * GET /api/consent/:mpiId - Status consent semua tujuan
 */
app.get("/api/consent/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const consents = getSemuaConsent(mpiId);
    res.json({ sukses: true, mpi_id: mpiId, consents });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/consent/:mpiId - Simpan perubahan consent (Append-Only)
 */
app.post("/api/consent/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const { purpose, diberikan } = req.body;

    if (purpose === undefined || diberikan === undefined) {
      return res.status(400).json({
        sukses: false,
        error: "Field 'purpose' dan 'diberikan' (boolean) wajib diisi.",
      });
    }

    const hasil = catatConsent(mpiId, purpose, diberikan);
    res.json({ sukses: true, data: hasil });
  } catch (err) {
    res.status(400).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/access-logs - Semua jejak akses untuk panel admin
 */
app.get("/api/access-logs", (req, res) => {
  try {
    const db = getDb();
    const logs = db
      .prepare("SELECT * FROM access_log ORDER BY id DESC LIMIT 100")
      .all();
    res.json({ sukses: true, total: logs.length, logs });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/access-log/:mpiId - Jejak akses pembukaan data pasien
 */
app.get("/api/access-log/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const logs = getAccessLogs(mpiId);
    res.json({ sukses: true, mpi_id: mpiId, total: logs.length, logs });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 3. ENDPOINT PASIEN TERMINIMISASI (GERBANG CONSENT + PERAN)
// ==========================================

/**
 * GET /api/patient/:mpiId?purpose=X - Membaca data pasien terproyeksi
 * Header: X-Peran: dokter | perawat | marketing | ai
 */
app.get("/api/patient/:mpiId", gerbang(), (req, res) => {
  try {
    const { mpiId } = req.params;
    const purpose = req.query.purpose || "klinis";
    const peran = (req.headers["x-peran"] || "dokter").toLowerCase();
    const db = getDb();

    const patient = db
      .prepare("SELECT * FROM patients WHERE mpi_id = ?")
      .get(mpiId);
    if (!patient) {
      return res
        .status(404)
        .json({
          sukses: false,
          error: `Pasien dengan MPI ID '${mpiId}' tidak ditemukan.`,
        });
    }

    // Ambil rekam medis & event pendukung untuk proyeksi
    const events = db
      .prepare("SELECT * FROM events WHERE mpi_id = ? ORDER BY id DESC")
      .all(mpiId);
    const sourceRecords = db
      .prepare(
        `
      SELECT s.* FROM source_records s
      JOIN links l ON s.sistem = l.sistem AND s.local_id = l.local_id
      WHERE l.mpi_id = ? AND l.status IN ('auto', 'disetujui')
    `,
      )
      .all(mpiId);

    // Kumpulkan rekam medis
    let rawMerged = {};
    for (const sr of sourceRecords) {
      if (sr.raw) {
        try {
          rawMerged = { ...rawMerged, ...JSON.parse(sr.raw) };
        } catch (e) {}
      }
    }

    const fullRecord = {
      mpi_id: patient.mpi_id,
      nama: patient.nama,
      nik: patient.nik,
      tgl_lahir: patient.tgl_lahir,
      telepon: patient.telepon,
      ...rawMerged,
    };

    // Lakukan Proyeksi Sesuai Peran & Purpose
    const proyeksi = proyeksikan(fullRecord, peran, purpose);

    // Catat field yang berhasil dibuka ke Access Log
    catatAkses({
      aktor: req.headers["x-aktor"] || `Staf (${peran})`,
      peran,
      mpiId,
      purpose,
      fields: proyeksi.field_diizinkan,
      diizinkan: true,
    });

    res.json({
      sukses: true,
      mpi_id: mpiId,
      peran,
      purpose,
      field_diizinkan: proyeksi.field_diizinkan,
      data: proyeksi.data,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 4. ENDPOINT GARIS WAKTU TERPADU & OUTCOME
// ==========================================

/**
 * GET /api/timeline/:mpiId - Semua event terurut dengan lencana sistem asal
 */
app.get("/api/timeline/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const db = getDb();
    const events = db
      .prepare(
        `
      SELECT * FROM events
      WHERE mpi_id = ?
      ORDER BY waktu DESC, id DESC
    `,
      )
      .all(mpiId);

    res.json({
      sukses: true,
      mpi_id: mpiId,
      total_event: events.length,
      events,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/events - Catat event baru
 */
app.post("/api/events", (req, res) => {
  try {
    const { mpi_id, sistem, tipe, judul, detail, outcome, waktu } = req.body;

    if (!mpi_id || !sistem || !tipe || !judul) {
      return res.status(400).json({
        sukses: false,
        error: "Field 'mpi_id', 'sistem', 'tipe', dan 'judul' wajib diisi.",
      });
    }

    const db = getDb();
    const eventTime =
      waktu || new Date().toISOString().replace("T", " ").substring(0, 19);
    const outcomeTime = outcome ? eventTime : null;

    const result = db
      .prepare(
        `
      INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        mpi_id,
        sistem,
        tipe,
        eventTime,
        judul,
        detail || "",
        outcome || null,
        outcomeTime,
      );

    res.json({
      sukses: true,
      event_id: result.lastInsertRowid,
      pesan: "Event berhasil dicatat.",
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * PATCH /api/events/:id/outcome - Isi/perbarui hasil outcome event
 */
app.patch("/api/events/:id/outcome", (req, res) => {
  try {
    const eventId = req.params.id;
    const { outcome } = req.body;

    if (!outcome) {
      return res
        .status(400)
        .json({ sukses: false, error: "Field 'outcome' wajib disertakan." });
    }

    const db = getDb();
    const waktuSekarang = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    const update = db
      .prepare(
        `
      UPDATE events
      SET outcome = ?, outcome_waktu = ?
      WHERE id = ?
    `,
      )
      .run(outcome, waktuSekarang, eventId);

    if (update.changes === 0) {
      return res
        .status(404)
        .json({ sukses: false, error: "Event tidak ditemukan." });
    }

    res.json({
      sukses: true,
      event_id: eventId,
      outcome,
      outcome_waktu: waktuSekarang,
      pesan: "Hasil outcome berhasil dicatat dan masuk ke data latih AI.",
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/training-data - Semua event yang outcome-nya sudah terisi
 */
app.get("/api/training-data", (req, res) => {
  try {
    const db = getDb();
    const trainingData = db
      .prepare(
        `
      SELECT 
        e.id AS event_id,
        e.mpi_id,
        p.nama AS nama_pasien,
        p.tgl_lahir,
        e.sistem,
        e.tipe,
        e.waktu,
        e.judul,
        e.detail,
        e.outcome,
        e.outcome_waktu
      FROM events e
      JOIN patients p ON e.mpi_id = p.mpi_id
      WHERE e.outcome IS NOT NULL AND e.outcome != ''
      ORDER BY e.outcome_waktu DESC, e.id DESC
    `,
      )
      .all();

    res.json({
      sukses: true,
      deskripsi:
        "Data latih terlabeli (closed learning loop) dari interaksi nyata pasien",
      total: trainingData.length,
      data: trainingData,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 5. ENDPOINT SKOR RISIKO & ANTREAN STAF
// ==========================================

/**
 * GET /api/risk/queue - Pasien dengan skor risiko > 0, urut menurun
 */
app.get("/api/risk/queue", (req, res) => {
  try {
    const antrean = getAntreanRisiko();
    res.json({
      sukses: true,
      total: antrean.length,
      antrean,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 5B. ENDPOINTS MANDAYA CAREPOINT (MODUL 1: LOYALITAS MEDIS)
// ==========================================

/**
 * GET /api/loyalty/account/:mpiId - Informasi akun CarePoint, tier, streak, saldo & riwayat
 */
app.get("/api/loyalty/account/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const account = getOrCreateLoyaltyAccount(mpiId);
    res.json({ sukses: true, data: account });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/loyalty/prescriptions/:mpiId - Point Prescription Engine
 */
app.get("/api/loyalty/prescriptions/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const data = generatePointPrescriptions(mpiId);
    res.json({ sukses: true, data });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/loyalty/rewards - Katalog Care Rewards & Lifestyle Rewards (Micro-burn)
 */
app.get("/api/loyalty/rewards", (req, res) => {
  try {
    const rewards = getRewardsCatalog();
    res.json({ sukses: true, total: rewards.length, data: rewards });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/loyalty/redeem - Penukaran reward & Post-Redemption Next-Best-Action
 */
app.post("/api/loyalty/redeem", (req, res) => {
  try {
    const { mpiId = "MPI-0001", rewardId } = req.body;
    if (!rewardId) {
      return res
        .status(400)
        .json({ sukses: false, error: "Field 'rewardId' wajib diisi." });
    }
    const hasil = redeemPointReward(mpiId, rewardId);
    res.json(hasil);
  } catch (err) {
    res.status(400).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/loyalty/family-pool/:poolId - Data Family Health Pool & Anggota
 */
app.get("/api/loyalty/family-pool/:poolId", (req, res) => {
  try {
    const { poolId } = req.params;
    const pool = getFamilyHealthPool(poolId);
    res.json({ sukses: true, data: pool });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/loyalty/family-pool/transfer - Transfer / Gabungkan poin ke Family Health Pool
 */
app.post("/api/loyalty/family-pool/transfer", (req, res) => {
  try {
    const { mpiId = "MPI-0001", points } = req.body;
    const hasil = transferToFamilyPool(mpiId, points);
    res.json(hasil);
  } catch (err) {
    res.status(400).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/loyalty/auto-use - Toggle Auto-Use My Points
 */
app.post("/api/loyalty/auto-use", (req, res) => {
  try {
    const { mpiId = "MPI-0001", enabled } = req.body;
    const hasil = toggleAutoUsePoints(mpiId, enabled);
    res.json(hasil);
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/loyalty/auto-use/quote - Hitung diskon poin otomatis untuk booking/transaksi
 */
app.get("/api/loyalty/auto-use/quote", (req, res) => {
  try {
    const mpiId = req.query.mpiId || "MPI-0001";
    const price = parseInt(req.query.price || "350000", 10);
    const quote = calculateAutoUseDiscount(mpiId, price);
    res.json({ sukses: true, data: quote });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/loyalty/missions/:mpiId - Misi Gamifikasi & Kuis Kesehatan Harian
 */
app.get("/api/loyalty/missions/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const missions = getMissionsAndQuizzes(mpiId);
    res.json({ sukses: true, data: missions });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/loyalty/quiz/submit - Kirim jawaban kuis kesehatan & klaim poin
 */
app.post("/api/loyalty/quiz/submit", (req, res) => {
  try {
    const { mpiId = "MPI-0001", quizId, selectedOption } = req.body;
    const hasil = submitHealthQuiz(mpiId, quizId, selectedOption);
    res.json(hasil);
  } catch (err) {
    res.status(400).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/loyalty/streak/increment - Tingkatkan Care Streak harian
 */
app.post("/api/loyalty/streak/increment", (req, res) => {
  try {
    const { mpiId = "MPI-0001" } = req.body;
    const hasil = incrementCareStreak(mpiId);
    res.json(hasil);
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 5C. ENDPOINTS MIRA (MODUL 2: RECOVERY ASSISTANT & FOLLOW-UP)
// ==========================================

/**
 * GET /api/mira/pathway/:mpiId - Dapatkan Care Pathway aktif pasien, template DPJP, dan jadwal check-in
 */
app.get("/api/mira/pathway/:mpiId", (req, res) => {
  try {
    const { mpiId } = req.params;
    const data = getPatientActivePathway(mpiId);
    res.json({ sukses: true, data });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/mira/pathway/set-phase - Simulasi ganti template pathway atau lompat hari pemulihan
 */
app.post("/api/mira/pathway/set-phase", (req, res) => {
  try {
    const {
      mpiId = "MPI-0001",
      pathwayId = "pasca_pci_jantung",
      targetDay = 3,
    } = req.body;
    const data = setPatientPathwayPhase(
      mpiId,
      pathwayId,
      parseInt(targetDay, 10),
    );
    res.json({
      sukses: true,
      pesan: `Pathway & hari pemulihan berhasil diatur ke hari H+${targetDay}`,
      data,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/mira/checkin - Submit respons check-in pasien (One-tap response + Triase Engine + Loyalty Bridge)
 */
app.post("/api/mira/checkin", (req, res) => {
  try {
    const {
      mpiId = "MPI-0001",
      pathwayId,
      phaseId,
      responseOption,
      patientNotes = "",
    } = req.body;
    if (!pathwayId || !phaseId || !responseOption) {
      return res
        .status(400)
        .json({
          sukses: false,
          error:
            "Field 'pathwayId', 'phaseId', dan 'responseOption' wajib diisi.",
        });
    }
    const hasil = submitCheckinResponse(
      mpiId,
      pathwayId,
      phaseId,
      responseOption,
      patientNotes,
    );
    res.json(hasil);
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/mira/nurse-queue - Antrean prioritas triase perawat & case manager
 */
app.get("/api/mira/nurse-queue", (req, res) => {
  try {
    const filterLevel = req.query.level || "all";
    const filterStatus = req.query.status || "all";
    const data = getNursePriorityQueue(filterLevel, filterStatus);
    res.json({ sukses: true, data });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/mira/nurse-queue/action - Tindakan perawat (tele-nurse call, eskalasi DPJP, disposisi homecare, resolve)
 */
app.post("/api/mira/nurse-queue/action", (req, res) => {
  try {
    const {
      queueId,
      actionType,
      notes = "",
      nurseName = "Ns. Ratih Wardani, S.Kep",
    } = req.body;
    if (!queueId || !actionType) {
      return res
        .status(400)
        .json({
          sukses: false,
          error: "Field 'queueId' dan 'actionType' wajib diisi.",
        });
    }
    const hasil = updateNurseQueueStatus(queueId, actionType, notes, nurseName);
    res.json(hasil);
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/mira/templates - Daftar semua Care Pathway Templates
 */
app.get("/api/mira/templates", (req, res) => {
  try {
    res.json({
      sukses: true,
      templates: Object.values(CARE_PATHWAY_TEMPLATES),
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 6. ENDPOINT DEMO & SIMULASI
// ==========================================

/**
 * POST /api/demo/reset - Hapus DB & seed ulang dari kondisi awal
 */
app.post("/api/demo/reset", (req, res) => {
  try {
    resetDatabase();
    res.json({
      sukses: true,
      pesan: "Database berhasil di-reset ke kondisi awal demo.",
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * POST /api/demo/advance-day - Majukan simulasi +1 hari
 */
app.post("/api/demo/advance-day", (req, res) => {
  try {
    const db = getDb();

    // Ambil offset saat ini
    const offsetRow = db
      .prepare("SELECT value FROM simulation_state WHERE key = 'day_offset'")
      .get();
    const currentOffset = offsetRow ? parseInt(offsetRow.value, 10) : 0;
    const newOffset = currentOffset + 1;

    db.prepare(
      "INSERT OR REPLACE INTO simulation_state (key, value) VALUES ('day_offset', ?)",
    ).run(String(newOffset));

    // Hitung tanggal baru
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + newOffset);
    const dateStr = baseDate.toISOString().split("T")[0];
    db.prepare(
      "INSERT OR REPLACE INTO simulation_state (key, value) VALUES ('current_date', ?)",
    ).run(dateStr);

    // Otomatis picu event dosis terlewat atau no_show untuk pasien risiko jika belum ada
    const sari = db
      .prepare("SELECT mpi_id FROM patients WHERE nama LIKE '%Sari%' LIMIT 1")
      .get();
    if (sari) {
      const timeStr = `${dateStr} 08:00:00`;
      db.prepare(
        `
        INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
        VALUES (?, 'CARE_DOKTER', 'obat', ?, 'Jadwal Obat Pagi (Amlodipine 10mg)', 'Dosis obat pagi tidak dikonfirmasi pasien', 'terlewat', ?)
      `,
      ).run(sari.mpi_id, timeStr, timeStr);

      if (newOffset >= 2) {
        db.prepare(
          `
          INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
          VALUES (?, 'CRM', 'pengingat', ?, 'Pengingat Obat Harian #2 via WhatsApp', 'Pesan tidak dibaca dalam 24 jam', 'diabaikan', ?)
        `,
        ).run(sari.mpi_id, timeStr, timeStr);
      }
    }

    const antreanRisiko = getAntreanRisiko();

    res.json({
      sukses: true,
      hari_ke: newOffset,
      tanggal_simulasi: dateStr,
      pesan: `Simulasi berhasil dimajukan +1 hari (Hari ke-${newOffset}). Efek no-show & obat terlewat aktif.`,
      pasien_berisiko_aktif: antreanRisiko.length,
      antrean_teratas: antreanRisiko.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

// ==========================================
// 7. ENDPOINTS TAMBAHAN UNTUK DEMO & DASHBOARD
// ==========================================

/**
 * GET /api/source-records - Melihat 30 data mentah dari 5 sistem
 */
app.get("/api/source-records", (req, res) => {
  try {
    const db = getDb();
    const records = db
      .prepare("SELECT * FROM source_records ORDER BY id ASC")
      .all();
    res.json({
      sukses: true,
      total: records.length,
      data: records.map((r) => ({
        ...r,
        raw: r.raw ? JSON.parse(r.raw) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /api/stats - Ringkasan metrik dashboard
 */
app.get("/api/stats", (req, res) => {
  try {
    const db = getDb();
    const totalSources = db
      .prepare("SELECT COUNT(*) as c FROM source_records")
      .get().c;
    const totalPatients = db
      .prepare("SELECT COUNT(*) as c FROM patients")
      .get().c;
    const totalLinks = db.prepare("SELECT COUNT(*) as c FROM links").get().c;
    const pendingReviews = db
      .prepare(
        "SELECT COUNT(*) as c FROM links WHERE status = 'perlu_tinjauan'",
      )
      .get().c;
    const totalLogs = db
      .prepare("SELECT COUNT(*) as c FROM access_log")
      .get().c;
    const totalEvents = db.prepare("SELECT COUNT(*) as c FROM events").get().c;
    const totalOutcomes = db
      .prepare(
        "SELECT COUNT(*) as c FROM events WHERE outcome IS NOT NULL AND outcome != ''",
      )
      .get().c;

    const dayOffsetRow = db
      .prepare("SELECT value FROM simulation_state WHERE key = 'day_offset'")
      .get();
    const dayOffset = dayOffsetRow ? parseInt(dayOffsetRow.value, 10) : 0;
    const curDateRow = db
      .prepare("SELECT value FROM simulation_state WHERE key = 'current_date'")
      .get();
    const curDate = curDateRow
      ? curDateRow.value
      : new Date().toISOString().split("T")[0];

    res.json({
      sukses: true,
      data: {
        total_source_records: totalSources,
        total_mpi_patients: totalPatients,
        total_links: totalLinks,
        pending_mpi_reviews: pendingReviews,
        total_access_logs: totalLogs,
        total_events: totalEvents,
        total_labeled_outcomes: totalOutcomes,
        simulation_day_offset: dayOffset,
        simulation_current_date: curDate,
      },
    });
  } catch (err) {
    res.status(500).json({ sukses: false, error: err.message });
  }
});

/**
 * GET /fhir/Patient/:id - Bukti Resource FHIR R4 Standar Kanonikal
 */
app.get("/fhir/Patient/:id", (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const patient = db
      .prepare("SELECT * FROM patients WHERE mpi_id = ?")
      .get(id);

    if (!patient) {
      return res
        .status(404)
        .json({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "not-found",
              diagnostics: "Patient not found",
            },
          ],
        });
    }

    const identifiers = [];
    if (patient.nik) {
      identifiers.push({
        system: "https://dukcapil.kemendagri.go.id/nik",
        value: patient.nik,
        use: "official",
      });
    }
    identifiers.push({
      system: "https://mandayahospitalgroup.com/fhir/mpi-id",
      value: patient.mpi_id,
      use: "usual",
    });

    const fhirPatient = {
      resourceType: "Patient",
      id: patient.mpi_id,
      meta: {
        lastUpdated: new Date().toISOString(),
        source: "Mandaya-MPI-Engine",
      },
      identifier: identifiers,
      active: true,
      name: [
        {
          use: "official",
          text: patient.nama,
        },
      ],
      gender: "female",
      birthDate: patient.tgl_lahir,
      telecom: patient.telepon
        ? [{ system: "phone", value: patient.telepon, use: "mobile" }]
        : [],
    };

    res.json(fhirPatient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. ENDPOINTS DOKTER, PROFIL & RESERVASI (CARE+)
// ==========================================

const toProfile = (row) => ({ ...row, isMain: !!row.isMain });

app.get("/api/doctors", (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare("SELECT * FROM doctors ORDER BY id ASC").all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/doctors/:id", (req, res) => {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM doctors WHERE id = ?")
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: "Dokter tidak ditemukan" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/doctors", (req, res) => {
  try {
    const { name, spec, exp, avail, img } = req.body;
    if (!name || !spec)
      return res.status(400).json({ error: "name & spec wajib diisi" });
    const db = getDb();
    const info = db
      .prepare(
        "INSERT INTO doctors (name, spec, exp, avail, img) VALUES (?,?,?,?,?)",
      )
      .run(name, spec, exp || 0, avail || "yes", img || null);
    res
      .status(201)
      .json(
        db
          .prepare("SELECT * FROM doctors WHERE id = ?")
          .get(info.lastInsertRowid),
      );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/profiles", (req, res) => {
  try {
    const db = getDb();
    res.json(
      db
        .prepare("SELECT * FROM profiles ORDER BY isMain DESC, id ASC")
        .all()
        .map(toProfile),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/profiles", (req, res) => {
  try {
    const { name, birth, gender, phone, email, nik, kk, passport, mpi_id } =
      req.body;
    if (!name || name.trim().length < 3)
      return res.status(400).json({ error: "Nama minimal 3 karakter" });
    if (!/^[0-9]{10,14}$/.test(phone || ""))
      return res
        .status(400)
        .json({ error: "Nomor HP tidak valid (10-14 digit)" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ""))
      return res.status(400).json({ error: "Email tidak valid" });
    if (!/^[0-9]{16}$/.test(nik || ""))
      return res.status(400).json({ error: "NIK harus 16 digit" });
    if (!/^[0-9]{16}$/.test(kk || ""))
      return res.status(400).json({ error: "No. KK harus 16 digit" });

    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO profiles (mpi_id, name, birth, gender, phone, email, nik, kk, passport, isMain)
       VALUES (?,?,?,?,?,?,?,?,?,0)`,
      )
      .run(
        mpi_id || "MPI-0001",
        name.trim(),
        birth,
        gender,
        phone.trim(),
        email.trim(),
        nik.trim(),
        kk.trim(),
        (passport || "").trim(),
      );

    res
      .status(201)
      .json(
        toProfile(
          db
            .prepare("SELECT * FROM profiles WHERE id = ?")
            .get(info.lastInsertRowid),
        ),
      );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/profiles/:id", (req, res) => {
  try {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(req.params.id);
    if (!existing)
      return res.status(404).json({ error: "Profil tidak ditemukan" });
    const { name, birth, gender, phone, email, nik, kk, passport, mpi_id } =
      req.body;
    db.prepare(
      `UPDATE profiles SET mpi_id=?, name=?, birth=?, gender=?, phone=?, email=?, nik=?, kk=?, passport=? WHERE id=?`,
    ).run(
      mpi_id ?? existing.mpi_id,
      name ?? existing.name,
      birth ?? existing.birth,
      gender ?? existing.gender,
      phone ?? existing.phone,
      email ?? existing.email,
      nik ?? existing.nik,
      kk ?? existing.kk,
      passport ?? existing.passport,
      req.params.id,
    );
    res.json(
      toProfile(
        db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id),
      ),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/profiles/:id", (req, res) => {
  try {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(req.params.id);
    if (!existing)
      return res.status(404).json({ error: "Profil tidak ditemukan" });
    if (existing.isMain)
      return res
        .status(400)
        .json({ error: "Profil utama tidak boleh dihapus" });
    db.prepare("DELETE FROM profiles WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings", (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare("SELECT * FROM bookings ORDER BY id DESC").all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/bookings", (req, res) => {
  try {
    const {
      profileId,
      doctorId,
      hospital,
      date,
      time,
      temp,
      symptom,
      history,
      fallbackAge,
    } = req.body;
    const today = new Date().toISOString().split("T")[0];

    if (!profileId)
      return res.status(400).json({ error: "Profil pasien wajib dipilih" });
    if (!doctorId)
      return res.status(400).json({ error: "Dokter wajib dipilih" });
    if (!hospital)
      return res.status(400).json({ error: "Rumah sakit wajib dipilih" });
    if (!date || date < today)
      return res.status(400).json({ error: "Tanggal tidak valid" });
    if (!time) return res.status(400).json({ error: "Jam wajib dipilih" });
    if (
      temp !== null &&
      temp !== undefined &&
      temp !== "" &&
      (temp < 30 || temp > 45)
    )
      return res.status(400).json({ error: "Suhu harus antara 30–45°C" });
    if (!symptom || symptom.trim().length < 10)
      return res.status(400).json({ error: "Keluhan minimal 10 karakter" });

    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO bookings (profileId, doctorId, hospital, date, time, temp, symptom, history, status, fallbackAge)
       VALUES (?,?,?,?,?,?,?,?, 'Menunggu', ?)`,
      )
      .run(
        profileId,
        doctorId,
        hospital,
        date,
        time,
        temp || null,
        symptom.trim(),
        (history || "").trim(),
        fallbackAge || null,
      );

    // Ambil detail profil & dokter untuk event
    const prof = db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(profileId);
    const doc = db.prepare("SELECT * FROM doctors WHERE id = ?").get(doctorId);
    const mpiId = prof?.mpi_id || "MPI-0001";

    // Tambahkan otomatis ke tabel events Mandaya timeline
    db.prepare(
      `
      INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
      VALUES (?, 'CARE_DOKTER', 'booking', ?, ?, ?, 'menunggu', ?)
    `,
    ).run(
      mpiId,
      `${date} ${time.split(" ")[0] || "09:00"}:00`,
      `Reservasi Konsultasi: ${doc ? doc.name : "Dokter Spesialis"} (${hospital})`,
      `Pasien: ${prof ? prof.name : "Pasien"}. Suhu: ${temp || "-"}°C. Keluhan: "${symptom}". Riwayat: ${history || "-"}`,
      `${date} ${time.split(" ")[0] || "09:00"}:00`,
    );

    res
      .status(201)
      .json(
        db
          .prepare("SELECT * FROM bookings WHERE id = ?")
          .get(info.lastInsertRowid),
      );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/bookings/:id", (req, res) => {
  try {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM bookings WHERE id = ?")
      .get(req.params.id);
    if (!existing)
      return res.status(404).json({ error: "Booking tidak ditemukan" });
    const {
      profileId,
      doctorId,
      hospital,
      date,
      time,
      temp,
      symptom,
      history,
      status,
      fallbackAge,
    } = req.body;
    db.prepare(
      `UPDATE bookings SET profileId=?, doctorId=?, hospital=?, date=?, time=?, temp=?, symptom=?, history=?, status=?, fallbackAge=? WHERE id=?`,
    ).run(
      profileId ?? existing.profileId,
      doctorId ?? existing.doctorId,
      hospital ?? existing.hospital,
      date ?? existing.date,
      time ?? existing.time,
      temp ?? existing.temp,
      symptom ?? existing.symptom,
      history ?? existing.history,
      status ?? existing.status,
      fallbackAge ?? existing.fallbackAge,
      req.params.id,
    );
    res.json(
      db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/bookings/:id", (req, res) => {
  try {
    const db = getDb();
    const info = db
      .prepare("DELETE FROM bookings WHERE id = ?")
      .run(req.params.id);
    if (info.changes === 0)
      return res.status(404).json({ error: "Booking tidak ditemukan" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. PENYAJIAN FILE STATIS & GAMBAR (public/)
// ==========================================

const imageFallbacks = {
  "/logo.png": "logo.svg",
  "/cover.png": "cover.svg",
  "/anisa.jpg": "anisa.svg",
  "/bagas.jpg": "bagas.svg",
  "/citra.jpg": "citra.svg",
  "/dimas.jpg": "dimas.svg",
};

for (const [routePath, svgFileName] of Object.entries(imageFallbacks)) {
  app.get(routePath, (req, res) => {
    const fullPath = path.join(__dirname, "public", svgFileName);
    res.setHeader("Content-Type", "image/svg+xml");
    res.sendFile(fullPath);
  });
}

app.use(express.static(path.join(__dirname, "public")));

// Fallback jika membuka root atau route tak dikenal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Jalankan Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`=======================================================`);
  console.log(` Mandaya Royal Hospital Puri - Satu Pasien, Satu Riwayat`);
  console.log(` Server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`=======================================================`);
});
