/**
 * services/mira.js - Modul 2: MIRA (Mandaya Intelligent Recovery Assistant & Follow-up)
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 *
 * Fitur Lengkap:
 * 1. Care Pathway Template: Standar alur tindak lanjut klinis per kategori treatment (Kardiologi/PCI, Ortopedi, Onkologi, Bedah Umum, Kronis)
 * 2. Scheduled Check-in per Fase Pemulihan: Aturan H+1/H+3/H+7/H+14/H+30 dengan pertanyaan spesifik per kondisi
 * 3. Proactive Messaging: Sapaan proaktif MIRA berprinsip "Value First" (pengingat obat, edukasi, motivasi) + pertanyaan klinis ringkas
 * 4. One-tap Response: Jawaban 3 opsi cepat (Membaik / Masih Gejala / Butuh Bantuan) + catatan opsional
 * 5. Triase Engine: Klasifikasi otomatis 3 level (Rendah / Sedang / Tinggi) menentukan otonomi MIRA vs eskalasi klinis
 * 6. Priority Queue Dashboard buat Perawat: Papan pantau pasien tersaring triase untuk tindakan proaktif suster/DPJP
 * 7. Milestone Recognition + Loyalty Bridge: Penghargaan lencana fase & pemberian otomatis poin CarePoint
 */

import { getDb } from "../db.js";

// ============================================================================
// 1. CARE PATHWAY TEMPLATES (STANDAR KLINIS DPJP & PRODUCT)
// ============================================================================
export const CARE_PATHWAY_TEMPLATES = {
  pasca_pci_jantung: {
    id: "pasca_pci_jantung",
    name: "Care Pathway Pasca-PCI / Stent Jantung",
    category: "Kardiologi Intervensi",
    dpjp: "dr. Beny Hartono, Sp.JP(K), FIHA",
    specialty: "Spesialis Jantung & Pembuluh Darah",
    description:
      "Pemantauan pemulihan pasca tindakan Percutaneous Coronary Intervention (PCI) dengan Drug-Eluting Stent (DES) pembuluh darah koroner.",
    typicalMedications: [
      {
        name: "Clopidogrel 75 mg",
        dose: "1x1 tablet",
        timing: "Pagi sesudah makan",
        purpose: "Antiplatelet pencegah pembekuan darah pada stent",
      },
      {
        name: "Aspirin (Aspilets) 80 mg",
        dose: "1x1 tablet",
        timing: "Pagi sesudah makan",
        purpose: "Dual Antiplatelet Therapy (DAPT)",
      },
      {
        name: "Atorvastatin 20 mg",
        dose: "1x1 tablet",
        timing: "Malam sebelum tidur",
        purpose: "Penurun lipid & stabilisasi plak aterosklerosis",
      },
      {
        name: "Bisoprolol 2.5 mg",
        dose: "1x1 tablet",
        timing: "Pagi hari",
        purpose: "Pengontrol denyut jantung & beban miokard",
      },
    ],
    redFlags: [
      "Nyeri dada khas (seperti ditindih beban berat, menjalar ke lengan kiri/leher/punggung)",
      "Sesak napas mendadak saat istirahat atau saat berbaring telentang",
      "Pendarahan aktif atau hematoma (benjolan memar membesar) di area tusukan kateterisasi (lipat paha/pergelangan tangan)",
      "Pusing berputar hebat, pingsan (sinkop), atau pandangan gelap mendadak",
      "Denyut jantung terlalu lambat (< 50 bpm) atau berdebar sangat kencang & tidak teratur (> 120 bpm)",
    ],
    followUpPlan:
      "Kontrol Poli Jantung H+7 (Evaluasi Luka & EKG) dan H+30 (Panel Profil Lipid & Ekokardiografi)",
    phases: [
      {
        phaseId: "phase_h1",
        day: 1,
        name: "H+1: Pemantauan Hemodinamik & Akses Vaskular",
        phaseTag: "Fase Akut Awal",
        proactiveGreeting:
          "Selamat pagi, Ibu Siti! MIRA mendampingi pemulihan hari pertama Ibu di rumah.",
        proactiveValue:
          "💡 Tips Perawatan: Pastikan area tusukan kateter tetap kering dan bersih. Hindari mengangkat benda dengan berat lebih dari 3 kg. Jangan lupa konsumsi Clopidogrel 75mg & Aspirin pagi ini sesudah sarapan ya, Bu.",
        questionText:
          "Bagaimana kondisi Ibu hari ini? Apakah area bekas tusukan kateter terasa nyaman dan tidak ada nyeri dada?",
        pointsReward: 100,
        milestoneBadge: "🌟 H+1 Heart Survivor",
        options: {
          membaik: {
            text: "🟢 Membaik / Nyaman",
            detail:
              "Bekas tusukan kering, tidak nyeri, dada terasa lega & nyaman.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Masih Gejala Ringan",
            detail:
              "Nyeri/ngilu ringan di bekas tusukan atau sedikit pusing saat berdiri.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Butuh Bantuan Segera",
            detail:
              "Nyeri dada menjalar, rembesan darah pada luka, atau sesak napas.",
            triageLevel: "tinggi",
          },
        },
      },
      {
        phaseId: "phase_h3",
        day: 3,
        name: "H+3: Mobilisasi Mandiri & Penyesuaian Obat",
        phaseTag: "Fase Mobilisasi Bertahap",
        proactiveGreeting:
          "Halo Ibu Siti! Senang melihat progres pemulihan Ibu hingga hari ke-3.",
        proactiveValue:
          "🚶‍♂️ Edukasi Aktivitas: Ibu sudah boleh jalan santai 5–10 menit di dalam rumah. Bila merasa pusing atau terengah-engah, segera duduk dan istirahat. Minum obat Bisoprolol pagi ini untuk menjaga detak jantung tetap stabil.",
        questionText:
          "Bagaimana napas dan stamina Ibu saat melakukan aktivitas ringan di dalam rumah hari ini?",
        pointsReward: 150,
        milestoneBadge: "🛡️ H+3 Mobility Champion",
        options: {
          membaik: {
            text: "🟢 Bernapas Lega & Stamina Baik",
            detail:
              "Mampu jalan santai mandiri, tidak ada rasa sesak atau pusing.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Sedikit Cepat Lelah",
            detail:
              "Napas sedikit terengah jika berjalan agak lama, tetapi cepat pulih saat duduk.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Sesak Napas Berat / Nyeri Dada",
            detail:
              "Dada terasa tertekan, keringat dingin, atau denyut jantung sangat cepat.",
            triageLevel: "tinggi",
          },
        },
      },
      {
        phaseId: "phase_h7",
        day: 7,
        name: "H+7: Evaluasi Kepatuhan Obat DAPT & Pra-Kontrol",
        phaseTag: "Fase Penyembuhan Subakut",
        proactiveGreeting:
          "Selamat Ibu Siti! Ibu telah berhasil melewati 1 minggu pertama pasca tindakan stent.",
        proactiveValue:
          "🩸 Pengingat DAPT: Obat pengencer darah ganda sangat penting menjaga stent tetap lancar. Jadwal kontrol ke dr. Beny Hartono di Poli Jantung Mandaya Puri sudah siap pada H+10.",
        questionText:
          "Apakah ada keluhan seperti gusi berdarah, lebam berlebih, atau nyeri lambung setelah minum obat rutin?",
        pointsReward: 200,
        milestoneBadge: "🏆 H+7 DAPT Adherence Hero",
        options: {
          membaik: {
            text: "🟢 Tidak Ada Pendarahan / Nyeri Lambung",
            detail:
              "Obat diminum rutin 100%, nafsu makan baik & siap kontrol dokter.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Sedikit Mual / Memar Kecil",
            detail:
              "Ada bintik memar kecil di lengan atau perut terasa agak kembung.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Pendarahan Aktif / Mimisan Hebat",
            detail:
              "Pendarahan gusi sulit berhenti, BAB berwarna hitam, atau muntah.",
            triageLevel: "tinggi",
          },
        },
      },
      {
        phaseId: "phase_h14",
        day: 14,
        name: "H+14: Evaluasi Tensi Darah & Profil Risiko",
        phaseTag: "Fase Adaptasi & Diet Sehat",
        proactiveGreeting:
          "Selamat pagi Ibu Siti! Memasuki minggu ke-2, mari evaluasi kestabilan tensi darah.",
        proactiveValue:
          "🥗 Nutrisi Sehat Jantung: Batasi konsumsi garam maksimal 1 sendok teh (5 gram) per hari. Perbanyak sayuran hijau dan ikan tinggi Omega-3.",
        questionText:
          "Berapa rata-rata tekanan darah Ibu dalam 3 hari terakhir dan apakah Ibu merasa nyaman beraktivitas?",
        pointsReward: 250,
        milestoneBadge: "💎 H+14 Blood Pressure Master",
        options: {
          membaik: {
            text: "🟢 Tensi Terkontrol (< 130/80 mmHg)",
            detail:
              "Tekanan darah stabil, tidur nyenyak & energi semakin pulih.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Tensi Kadang Naik (135–145 mmHg)",
            detail:
              "Sedikit tegang di leher belakang atau kualitas tidur kurang maksimal.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Tensi Sangat Tinggi (> 170/100 mmHg)",
            detail:
              "Sakit kepala berdenyut hebat, pandangan kabur, atau nyeri dada berulang.",
            triageLevel: "tinggi",
          },
        },
      },
      {
        phaseId: "phase_h30",
        day: 30,
        name: "H+30: Milestone 1 Bulan & Kebugaran Fungsional",
        phaseTag: "Fase Pemulihan Penuh",
        proactiveGreeting:
          "Luar biasa, Ibu Siti! 1 Bulan penuh pasca pemasangan stent jantung telah tuntas.",
        proactiveValue:
          "🏅 Pencapaian Besar: Ibu telah membuktikan kepatuhan pengobatan yang luar biasa. Ibu berhak mengikuti program Fisioterapi & Senam Jantung Terbimbing di Mandaya Wellness Center.",
        questionText:
          "Apakah Ibu sudah siap memulai program latihan fisik terbimbing untuk menjaga kebugaran jantung jangka panjang?",
        pointsReward: 300,
        milestoneBadge: "👑 1-Month Cardiac Champion",
        options: {
          membaik: {
            text: "🟢 Sangat Siap & Tubuh Bugar",
            detail:
              "Kondisi fisik prima, siap mengikuti program senam jantung terpandu.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Masih Sedikit Ragu / Lelah",
            detail:
              "Butuh arahan konsultasi fisioterapis sebelum memulai senam.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Nyeri Dada Kambuh Saat Aktivitas",
            detail: "Perlu evaluasi klinis ulang dan rontgen/EKG mendesak.",
            triageLevel: "tinggi",
          },
        },
      },
    ],
  },

  pasca_op_ortopedi: {
    id: "pasca_op_ortopedi",
    name: "Care Pathway Pasca-Operasi Ortopedi & Sendi",
    category: "Ortopedi & Traumatologi",
    dpjp: "dr. Erwin Santoso, Sp.OT",
    specialty: "Spesialis Bedah Ortopedi & Traumatologi",
    description:
      "Pemantauan pasca operasi penggantian sendi (Total Knee/Hip Replacement) atau fiksasi internal fraktur tulang.",
    typicalMedications: [
      {
        name: "Celecoxib 200 mg",
        dose: "1x1 kapsul",
        timing: "Sesudah makan",
        purpose: "Antiinflamasi dan pereda nyeri sendi pasca-bedah",
      },
      {
        name: "Rivaroxaban 10 mg",
        dose: "1x1 tablet",
        timing: "Malam hari",
        purpose: "Pencegah trombosis vena dalam (DVT) tungkai",
      },
      {
        name: "Kalsium + Vitamin D3",
        dose: "1x1 tablet",
        timing: "Pagi hari",
        purpose: "Mendukung mineralisasi dan penyembuhan tulang",
      },
    ],
    redFlags: [
      "Bengkak hebat mendadak, kulit kemerahan hangat dan nyeri tegang pada betis/tungkai (gejala DVT)",
      "Demam tinggi > 38.5°C disertai menggigil",
      "Cairan nanah atau rembesan darah berbau dari luka jahitan operasi",
      "Mati rasa total (kebas/kesemutan hebat) atau jari kaki/tangan tampak pucat dingin",
      "Sendi terkunci atau implan terasa bergeser disertai nyeri tak tertahankan",
    ],
    followUpPlan: "Kontrol Angkat Jahitan H+10 & Foto Rontgen Evaluasi H+30",
    phases: [
      {
        phaseId: "ortho_h1",
        day: 1,
        name: "H+1: Manajemen Nyeri & Posisi Elevasi",
        phaseTag: "Fase Akut Pasca Bedah",
        proactiveGreeting:
          "Selamat pagi! MIRA memantau masa pemulihan hari pertama pasca operasi ortopedi.",
        proactiveValue:
          "🦵 Tips Elevasi: Posisikan kaki/tungkai yang dioperasi lebih tinggi dari jantung menggunakan 2 bantal untuk mengurangi pembengkakan.",
        questionText:
          "Bagaimana tingkat nyeri dan apakah Anda sudah dapat menggerakkan jari-jari kaki dengan leluasa?",
        pointsReward: 100,
        milestoneBadge: "🦴 H+1 Ortho Warrior",
        options: {
          membaik: {
            text: "🟢 Nyeri Terkontrol, Jari Bergerak Baik",
            detail: "Nyeri skala 1–3, bengkak minimal, jari terasa hangat.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Nyeri Sedang saat Gerak",
            detail:
              "Nyeri skala 4–6, butuh kompres es atau penyesuaian analgetik.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Mati Rasa / Nyeri Tak Tertahankan",
            detail: "Jari kebas dingin atau betis bengkak kemerahan tegang.",
            triageLevel: "tinggi",
          },
        },
      },
      {
        phaseId: "ortho_h7",
        day: 7,
        name: "H+7: Mobilisasi Alat Bantu (Walker/Crutch)",
        phaseTag: "Fase Latihan Beban Bertahap",
        proactiveGreeting:
          "Halo! Memasuki hari ke-7, latihan berjalan dengan alat bantu menjadi kunci kekuatan sendi.",
        proactiveValue:
          "🩼 Latihan Fisioterapi: Lakukan latihan pompa pergelangan kaki (ankle pumps) 10 kali setiap jam saat berbaring.",
        questionText:
          "Apakah Anda dapat berdiri dan melangkah dengan walker tanpa rasa goyang atau nyeri berlebih?",
        pointsReward: 200,
        milestoneBadge: "🦿 H+7 Step-by-Step Hero",
        options: {
          membaik: {
            text: "🟢 Melangkah Stabil & Mandiri",
            detail: "Mampu berpindah tempat dengan aman menggunakan walker.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Sedikit Kaku di Pagi Hari",
            detail:
              "Sendi terasa kaku namun membaik setelah digerakkan perlahan.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Sendi Terkunci / Demam Tinggi",
            detail: "Demam > 38.5°C atau luka operasi mengeluarkan nanah.",
            triageLevel: "tinggi",
          },
        },
      },
    ],
  },

  pasca_kemo_onkologi: {
    id: "pasca_kemo_onkologi",
    name: "Care Pathway Pasca-Kemoterapi & Onkologi",
    category: "Onkologi Terpadu",
    dpjp: "dr. Maria Ulfa, Sp.PD-KHOM",
    specialty: "Spesialis Penyakit Dalam - Konsultan Hematologi Onkologi Medik",
    description:
      "Pemantauan efek samping pasca siklus kemoterapi, pencegahan infeksi neutropenia, dan pemenuhan nutrisi.",
    typicalMedications: [
      {
        name: "Ondansetron 8 mg",
        dose: "2x1 tablet",
        timing: "30 menit sebelum makan",
        purpose: "Antiemetik pencegah mual dan muntah",
      },
      {
        name: "Dexamethasone 4 mg",
        dose: "1x1 tablet",
        timing: "Pagi hari",
        purpose: "Antiinflamasi dan peningkat respon antiemetik",
      },
      {
        name: "Obat Kumur Klorheksidin",
        dose: "3x sehari",
        timing: "Sesudah sikat gigi",
        purpose: "Pencegah stomatitis / sariawan oral",
      },
    ],
    redFlags: [
      "Demam neutropenik: Suhu tubuh ≥ 38.0°C (Kedaruratan Medis Onkologi)",
      "Muntah terus-menerus (> 4 kali dalam 24 jam) sehingga tidak bisa minum obat/cairan",
      "Diare hebat (> 5 kali sehari) disertai lemas dan tanda dehidrasi",
      "Sariawan mukosa mulut parah yang menyebabkan tidak bisa menelan makanan",
      "Memar luas spontan atau pendarahan tanpa sebab jelas (trombositopenia)",
    ],
    followUpPlan:
      "Cek Darah Lengkap & Hitung Jenis Leukosit H+7, Evaluasi DPJP H+14",
    phases: [
      {
        phaseId: "chemo_h1",
        day: 1,
        name: "H+1: Manajemen Mual Akut & Hidrasi",
        phaseTag: "Fase Efek Samping Akut",
        proactiveGreeting:
          "Selamat pagi. MIRA hadir mendampingi pemulihan hari pertama pasca siklus kemoterapi Anda.",
        proactiveValue:
          "💧 Hidrasi Optimal: Minum air putih minimal 2 liter per hari dalam tegukan kecil-kecil secara berkala untuk membantu ginjal membersihkan sisa metabolit obat.",
        questionText:
          "Bagaimana asupan makanan dan apakah obat antimual (Ondansetron) membantu Anda merasa nyaman?",
        pointsReward: 100,
        milestoneBadge: "🎗️ H+1 Chemo Recovery Strong",
        options: {
          membaik: {
            text: "🟢 Mual Terkontrol, Makanan Masuk",
            detail: "Nafsu makan cukup, tidak muntah, cairan masuk baik.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Sedikit Mual / Mulut Terasa Pahit",
            detail:
              "Mual ringan terkontrol, masih bisa minum cairan dan bubur.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Muntah Hebat / Tidak Bisa Minum",
            detail:
              "Muntah berulang > 4x atau tidak bisa menelan obat sama sekali.",
            triageLevel: "tinggi",
          },
        },
      },
      {
        phaseId: "chemo_h7",
        day: 7,
        name: "H+7: Titik Terendah Leukosit (Nadir Phase)",
        phaseTag: "Fase Kewaspadaan Infeksi (Nadir)",
        proactiveGreeting:
          "Halo! Hari ke-7 adalah fase Nadir di mana sel darah putih Anda berada pada titik terendah.",
        proactiveValue:
          "🛡️ Proteksi Infeksi: Selalu gunakan masker, cuci tangan dengan sabun, hindari kerumunan dan makanan mentah/setengah matang.",
        questionText:
          "Apakah Anda merasakan demam, badan menggigil, atau nyeri saat buang air kecil hari ini?",
        pointsReward: 200,
        milestoneBadge: "🌟 H+7 Immunity Guardian",
        options: {
          membaik: {
            text: "🟢 Suhu Normal (< 37.5°C), Bebas Infeksi",
            detail: "Tidak demam, tidak menggigil, stamina stabil.",
            triageLevel: "rendah",
          },
          gejala_ringan: {
            text: "🟡 Badan Terasa Hangat Ringan (37.5–37.9°C)",
            detail: "Agak sumeng, perlu dipantau termometer tiap 4 jam.",
            triageLevel: "sedang",
          },
          butuh_bantuan: {
            text: "🔴 Demam Tinggi ≥ 38.0°C / Menggigil",
            detail:
              "Demam neutropenik darurat, perlu penanganan antibiotik segera di RS.",
            triageLevel: "tinggi",
          },
        },
      },
    ],
  },
};

// ============================================================================
// 2. INITIALIZE DB TABLES FOR MIRA
// ============================================================================
export function initMiraTables() {
  const db = getDb();
  db.exec(`
    -- Tabel Pathway Pasien Aktif
    CREATE TABLE IF NOT EXISTS mira_patient_pathways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT NOT NULL,
      pathway_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      current_day INTEGER DEFAULT 3,
      status TEXT DEFAULT 'active',
      dpjp_name TEXT,
      diagnosis TEXT
    );

    -- Tabel Riwayat Respons Check-in Pasien
    CREATE TABLE IF NOT EXISTS mira_checkin_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT NOT NULL,
      pathway_id TEXT NOT NULL,
      phase_id TEXT NOT NULL,
      phase_day INTEGER NOT NULL,
      response_option TEXT NOT NULL,
      patient_notes TEXT,
      triage_level TEXT NOT NULL,
      triage_summary TEXT NOT NULL,
      red_flags_detected TEXT,
      points_awarded INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Tabel Antrean Prioritas Triase Perawat & Case Manager
    CREATE TABLE IF NOT EXISTS mira_nurse_priority_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpi_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      pathway_name TEXT NOT NULL,
      phase_name TEXT NOT NULL,
      triage_level TEXT NOT NULL,
      symptom_summary TEXT NOT NULL,
      red_flags TEXT,
      nurse_status TEXT DEFAULT 'perlu_tindakan',
      action_notes TEXT,
      assigned_nurse TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  seedMiraDefaultData();
}

/**
 * Seed data default MIRA
 */
function seedMiraDefaultData() {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) as c FROM mira_patient_pathways")
    .get().c;
  if (count === 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);

    // Pasien 1 (Siti Aminah Rahayu / MPI-0001) - Pasca PCI Jantung (Hari ke-3)
    db.prepare(
      `
      INSERT INTO mira_patient_pathways (mpi_id, pathway_id, start_date, current_day, status, dpjp_name, diagnosis)
      VALUES ('MPI-0001', 'pasca_pci_jantung', ?, 3, 'active', 'dr. Beny Hartono, Sp.JP(K), FIHA', 'Post-PCI 1 DES LAD (Coronary Artery Disease)')
    `,
    ).run(todayStr);

    // Pasien 2 (Bambang Sudiro / MPI-0002) - Pasca Ortopedi (Hari ke-1)
    db.prepare(
      `
      INSERT INTO mira_patient_pathways (mpi_id, pathway_id, start_date, current_day, status, dpjp_name, diagnosis)
      VALUES ('MPI-0002', 'pasca_op_ortopedi', ?, 1, 'active', 'dr. Erwin Santoso, Sp.OT', 'Post Total Knee Replacement (TKR) Sinistra')
    `,
    ).run(todayStr);

    // Initial Response H+1 untuk Siti Aminah (Membaik)
    db.prepare(
      `
      INSERT INTO mira_checkin_responses (mpi_id, pathway_id, phase_id, phase_day, response_option, patient_notes, triage_level, triage_summary, red_flags_detected, points_awarded, created_at)
      VALUES ('MPI-0001', 'pasca_pci_jantung', 'phase_h1', 1, 'membaik', 'Area tusukan lipat paha kering, sedikit ngilu wajar saat bangun tidur.', 'rendah', 'Kondisi stabil, luka insisi kering, kepatuhan DAPT 100%', '[]', 100, ?)
    `,
    ).run(now);

    // Initial Priority Queue item untuk pasien simulasi (Sedang)
    db.prepare(
      `
      INSERT INTO mira_nurse_priority_queue (mpi_id, patient_name, pathway_name, phase_name, triage_level, symptom_summary, red_flags, nurse_status, action_notes, assigned_nurse, created_at, updated_at)
      VALUES 
      ('MPI-0003', 'Hendra Kusuma (62 Thn)', 'Pasca-PCI / Stent Jantung', 'H+3: Mobilisasi Mandiri', 'tinggi', 'Nyeri dada terasa menekan menjalar ke bahu kiri saat mencoba naik tangga, keringat dingin.', '["Nyeri dada menjalar", "Keringat dingin"]', 'perlu_tindakan', 'Perlu konfirmasi segera via Tele-Nurse / panggilan darurat', 'Ns. Ratih Wardani, S.Kep', ?, ?),
      ('MPI-0002', 'Bambang Sudiro (42 Thn)', 'Pasca-Operasi Ortopedi', 'H+1: Elevasi & Nyeri', 'sedang', 'Nyeri lutut skala 5/10 saat digerakkan, memerlukan saran penyesuaian waktu minum pereda nyeri.', '["Nyeri skala 5/10"]', 'perlu_tindakan', 'Disarankan kompres dingin & minum analgetik sesuai resep dr. Erwin', 'Ns. Dian Anggraini, S.Kep', ?, ?)
    `,
    ).run(now, now, now, now);
  }
}

// ============================================================================
// 3. MIRA SERVICE FUNCTIONS
// ============================================================================

/**
 * Dapatkan Pathway Aktif & Status Check-in Pasien
 */
export function getPatientActivePathway(mpiId = "MPI-0001") {
  initMiraTables();
  const db = getDb();

  let pathwayRecord = db
    .prepare(
      'SELECT * FROM mira_patient_pathways WHERE mpi_id = ? AND status = "active"',
    )
    .get(mpiId);
  if (!pathwayRecord) {
    // Default fallback to cardiac
    const todayStr = new Date().toISOString().split("T")[0];
    db.prepare(
      `
      INSERT INTO mira_patient_pathways (mpi_id, pathway_id, start_date, current_day, status, dpjp_name, diagnosis)
      VALUES (?, 'pasca_pci_jantung', ?, 3, 'active', 'dr. Beny Hartono, Sp.JP(K), FIHA', 'Post-PCI Stent Jantung')
    `,
    ).run(mpiId, todayStr);
    pathwayRecord = db
      .prepare("SELECT * FROM mira_patient_pathways WHERE mpi_id = ?")
      .get(mpiId);
  }

  const template =
    CARE_PATHWAY_TEMPLATES[pathwayRecord.pathway_id] ||
    CARE_PATHWAY_TEMPLATES.pasca_pci_jantung;

  // Dapatkan riwayat respons check-in pasien
  const responses = db
    .prepare(
      `
    SELECT * FROM mira_checkin_responses 
    WHERE mpi_id = ? AND pathway_id = ? 
    ORDER BY phase_day ASC
  `,
    )
    .all(mpiId, pathwayRecord.pathway_id);

  const completedPhaseIds = responses.map((r) => r.phase_id);

  // Tentukan fase aktif saat ini (misal fase yang cocok dengan current_day atau fase pertama yang belum tuntas)
  let activePhase = template.phases.find(
    (p) => p.day === pathwayRecord.current_day,
  );
  if (!activePhase) {
    activePhase =
      template.phases.find((p) => !completedPhaseIds.includes(p.phaseId)) ||
      template.phases[template.phases.length - 1];
  }

  const isCurrentPhaseCompleted = completedPhaseIds.includes(
    activePhase.phaseId,
  );
  const currentPhaseResponse =
    responses.find((r) => r.phase_id === activePhase.phaseId) || null;

  return {
    pathwayRecord,
    template,
    activePhase,
    isCurrentPhaseCompleted,
    currentPhaseResponse,
    completedPhaseIds,
    responsesHistory: responses,
    allTemplates: Object.values(CARE_PATHWAY_TEMPLATES),
  };
}

/**
 * Ganti Pathway atau Majukan Hari Pemulihan (Untuk Simulasi Demo)
 */
export function setPatientPathwayPhase(
  mpiId = "MPI-0001",
  pathwayId = "pasca_pci_jantung",
  targetDay = 3,
) {
  initMiraTables();
  const db = getDb();

  db.prepare(
    `
    UPDATE mira_patient_pathways 
    SET pathway_id = ?, current_day = ? 
    WHERE mpi_id = ?
  `,
  ).run(pathwayId, targetDay, mpiId);

  return getPatientActivePathway(mpiId);
}

/**
 * 4 & 5. TRIASE ENGINE & ONE-TAP RESPONSE HANDLER
 * Memproses respons check-in pasien dengan analisis triase otomatis 3 level
 */
export function submitCheckinResponse(
  mpiId,
  pathwayId,
  phaseId,
  responseOption,
  patientNotes = "",
) {
  initMiraTables();
  const db = getDb();
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  const template =
    CARE_PATHWAY_TEMPLATES[pathwayId] ||
    CARE_PATHWAY_TEMPLATES.pasca_pci_jantung;
  const phase =
    template.phases.find((p) => p.phaseId === phaseId) || template.phases[0];
  const patient = db
    .prepare("SELECT * FROM patients WHERE mpi_id = ?")
    .get(mpiId) || { nama: "Siti Aminah Rahayu" };

  // Analisis Triase & Red Flags
  const detectedRedFlags = [];
  const notesLower = (patientNotes || "").toLowerCase();

  // Cek kata kunci bahaya klinis
  if (
    notesLower.includes("nyeri dada") ||
    notesLower.includes("sesak") ||
    notesLower.includes("pendarahan") ||
    notesLower.includes("darah") ||
    notesLower.includes("demam") ||
    notesLower.includes("38") ||
    notesLower.includes("pingsan") ||
    notesLower.includes("keringat dingin") ||
    notesLower.includes("bengkak")
  ) {
    detectedRedFlags.push(
      "Terdeteksi keluhan fisik berisiko dalam catatan pasien",
    );
  }

  // Tentukan Level Triase Akhir
  let triageLevel = "rendah";
  let triageSummary = "";
  let pointsToAward = 0;
  let actionTitle = "";
  let actionDescription = "";
  let nurseStatus = "selesai";

  if (responseOption === "butuh_bantuan" || detectedRedFlags.length > 0) {
    triageLevel = "tinggi";
    triageSummary = `[CRITICAL ALERT] Pasien melaporkan gejala berat / Red Flag pada ${phase.name}. Memerlukan intervensi klinis segera.`;
    pointsToAward = 50; // Poin apresiasi pelaporan jujur
    actionTitle = "🚨 Alert Kedaruratan Klinis (High Risk Escalation)";
    actionDescription =
      "Notifikasi darurat telah dikirim ke Nurse Station Mandaya Puri & DPJP. Suster jaga sedang mempersiapkan panggilan langsung ke nomor pasien.";
    nurseStatus = "perlu_tindakan";
  } else if (responseOption === "gejala_ringan") {
    triageLevel = "sedang";
    triageSummary = `[PERHATIAN] Pasien merasakan gejala ringan pada ${phase.name}. Masuk antrean pemantauan tele-nurse.`;
    pointsToAward = phase.pointsReward;
    actionTitle = "💬 Edukasi & Pemantauan Perawat (Medium Risk)";
    actionDescription =
      "MIRA telah mencatat gejala ringan Anda dan merekomendasikan penyesuaian istirahat/obat sesuai instruksi DPJP.";
    nurseStatus = "perlu_tindakan";
  } else {
    triageLevel = "rendah";
    triageSummary = `[STABIL] Pasien dalam kondisi sangat baik & nyaman pada ${phase.name}. Kepatuhan pemulihan tercapai optimal.`;
    pointsToAward = phase.pointsReward;
    actionTitle = "🎉 Fase Pemulihan Berhasil Dituntaskan!";
    actionDescription = `Selamat! Kondisi Anda stabil dan membaik. Anda mendapatkan ${pointsToAward} Mandaya CarePoints!`;
    nurseStatus = "selesai";
  }

  // 1. Simpan Respons Check-in
  db.prepare(
    `
    INSERT INTO mira_checkin_responses 
    (mpi_id, pathway_id, phase_id, phase_day, response_option, patient_notes, triage_level, triage_summary, red_flags_detected, points_awarded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    mpiId,
    pathwayId,
    phaseId,
    phase.day,
    responseOption,
    patientNotes,
    triageLevel,
    triageSummary,
    JSON.stringify(detectedRedFlags),
    pointsToAward,
    now,
  );

  // 2. Masukkan ke Nurse Priority Queue (Jika Sedang atau Tinggi)
  if (triageLevel === "tinggi" || triageLevel === "sedang") {
    db.prepare(
      `
      INSERT INTO mira_nurse_priority_queue
      (mpi_id, patient_name, pathway_name, phase_name, triage_level, symptom_summary, red_flags, nurse_status, action_notes, assigned_nurse, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      mpiId,
      patient.nama,
      template.name,
      phase.name,
      triageLevel,
      patientNotes ||
        (responseOption === "butuh_bantuan"
          ? "Pasien memilih opsi Butuh Bantuan Segera"
          : "Gejala ringan terdeteksi"),
      JSON.stringify(detectedRedFlags),
      nurseStatus,
      triageLevel === "tinggi"
        ? "PRIORITAS UTAMA: Hubungi pasien segera via telepon/WA"
        : "Kirim panduan penanganan gejala ringan via chat MIRA",
      "Ns. Ratih Wardani, S.Kep",
      now,
      now,
    );
  }

  // 3. Catat Event ke Garis Waktu Terpadu Pasien (Timeline Events)
  const eventOutcome =
    triageLevel === "rendah"
      ? "membaik"
      : triageLevel === "sedang"
        ? "stabil"
        : "memburuk";
  db.prepare(
    `
    INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
    VALUES (?, 'CRM', 'checkin', ?, ?, ?, ?, ?)
  `,
  ).run(
    mpiId,
    now,
    `MIRA Check-in: ${phase.name}`,
    `Respons: ${responseOption.toUpperCase()} | Triase: ${triageLevel.toUpperCase()} | Catatan: ${patientNotes || "-"}`,
    eventOutcome,
    now,
  );

  // 4. Milestone Recognition & Loyalty Bridge (Poin CarePoint)
  if (pointsToAward > 0) {
    // Update saldo di loyalty_accounts
    db.prepare(
      `
      UPDATE loyalty_accounts 
      SET points_balance = points_balance + ?, care_streak_days = care_streak_days + 1, last_streak_date = ?
      WHERE mpi_id = ?
    `,
    ).run(pointsToAward, now.split(" ")[0], mpiId);

    // Catat riwayat transaksi poin
    db.prepare(
      `
      INSERT INTO point_transactions (mpi_id, type, category, points, title, detail, created_at)
      VALUES (?, 'earn', 'clinical', ?, ?, ?, ?)
    `,
    ).run(
      mpiId,
      pointsToAward,
      `Milestone MIRA: ${phase.name}`,
      `Poin kepatuhan pemulihan terpadu (${phase.milestoneBadge})`,
      now,
    );
  }

  // Ambil data akun loyalitas terbaru
  const updatedLoyalty = db
    .prepare("SELECT * FROM loyalty_accounts WHERE mpi_id = ?")
    .get(mpiId);

  return {
    sukses: true,
    triageLevel,
    triageBadge:
      triageLevel === "tinggi"
        ? "🚨 TINGGI (RED FLAG)"
        : triageLevel === "sedang"
          ? "⚠️ SEDANG (MONITORING)"
          : "✅ RENDAH (STABIL)",
    actionTitle,
    actionDescription,
    pointsAwarded: pointsToAward,
    milestoneBadge: phase.milestoneBadge,
    currentBalance: updatedLoyalty ? updatedLoyalty.points_balance : 2450,
    detectedRedFlags,
    phase,
    template,
  };
}

// ============================================================================
// 6. PRIORITY QUEUE DASHBOARD BUAT PERAWAT
// ============================================================================

/**
 * Dapatkan Daftar Antrean Prioritas Triase Perawat
 */
export function getNursePriorityQueue(
  filterLevel = "all",
  filterStatus = "all",
) {
  initMiraTables();
  const db = getDb();

  let query = "SELECT * FROM mira_nurse_priority_queue WHERE 1=1";
  const params = [];

  if (filterLevel !== "all") {
    query += " AND triage_level = ?";
    params.push(filterLevel);
  }

  if (filterStatus !== "all") {
    query += " AND nurse_status = ?";
    params.push(filterStatus);
  }

  // Urutkan: Level TINGGI paling atas, lalu SEDANG, lalu terbaru
  query += ` ORDER BY 
    CASE triage_level 
      WHEN 'tinggi' THEN 1 
      WHEN 'sedang' THEN 2 
      ELSE 3 
    END ASC, 
    id DESC`;

  const items = db.prepare(query).all(...params);

  // Parse JSON red flags
  const parsedItems = items.map((item) => ({
    ...item,
    red_flags_list: item.red_flags ? JSON.parse(item.red_flags) : [],
  }));

  // Hitung ringkasan statistik perawat
  const totalHigh = db
    .prepare(
      'SELECT COUNT(*) as c FROM mira_nurse_priority_queue WHERE triage_level = "tinggi" AND nurse_status != "selesai"',
    )
    .get().c;
  const totalMedium = db
    .prepare(
      'SELECT COUNT(*) as c FROM mira_nurse_priority_queue WHERE triage_level = "sedang" AND nurse_status != "selesai"',
    )
    .get().c;
  const totalResolved = db
    .prepare(
      'SELECT COUNT(*) as c FROM mira_nurse_priority_queue WHERE nurse_status = "selesai"',
    )
    .get().c;

  return {
    queue: parsedItems,
    stats: {
      highCount: totalHigh,
      mediumCount: totalMedium,
      resolvedCount: totalResolved,
      totalActive: totalHigh + totalMedium,
    },
  };
}

/**
 * Update Status Penanganan Tindakan Perawat
 */
export function updateNurseQueueStatus(
  queueId,
  actionType,
  notes = "",
  nurseName = "Ns. Ratih Wardani, S.Kep",
) {
  initMiraTables();
  const db = getDb();
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  let newStatus = "sedang_dihubungi";
  if (actionType === "resolve") newStatus = "selesai";
  if (actionType === "escalate_dpjp") newStatus = "eskalasi_dpjp";
  if (actionType === "dispatch_homecare") newStatus = "disposisi_homecare";

  db.prepare(
    `
    UPDATE mira_nurse_priority_queue 
    SET nurse_status = ?, action_notes = ?, assigned_nurse = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(newStatus, notes, nurseName, now, queueId);

  const updatedItem = db
    .prepare("SELECT * FROM mira_nurse_priority_queue WHERE id = ?")
    .get(queueId);

  return {
    sukses: true,
    pesan: `Status antrean pasien berhasil diperbarui menjadi: ${newStatus}`,
    item: updatedItem,
  };
}
