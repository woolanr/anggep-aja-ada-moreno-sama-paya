/**
 * services/loyalty.js - Mandaya CarePoint Engine (Modul 1: Loyalitas Medis Terpadu)
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 *
 * Fitur:
 * 1. Point Prescription Engine: Rekomendasi klinis terpersonalisasi berdasarkan fase perawatan & riwayat HIS
 * 2. Care Rewards: Katalog penukaran klinis (konsultasi, screening, rehab, lab, follow-up)
 * 3. Family Rewards (Family Health Pool): Gabung & transfer poin bersama keluarga
 * 4. Lifestyle Rewards: Micro-burn untuk kebutuhan harian rumah sakit (parkir valet, F&B cafe, wellness)
 * 5. Auto-Use My Points: Pemakaian poin otomatis tanpa repot pilih voucher manual saat booking
 * 6. Care Journey & Gamifikasi: Misi harian edukasi, kuis kesehatan, care streak 7 hari, tier leveling
 * 7. Post-Redemption Next-Best-Action: Rekomendasi langkah lanjutan cerdas pasca penukaran
 */

import { getDb } from "../db.js";

// Tier Definitions
export const CARE_TIERS = {
  SILVER: {
    name: "Silver Care",
    minPoints: 0,
    maxPoints: 999,
    badgeClass: "tier-silver",
    multiplier: 1.0,
    perks: "Diskon 5% Farmasi Non-Resep, Akses Care+ App",
  },
  GOLD: {
    name: "Gold Care",
    minPoints: 1000,
    maxPoints: 2999,
    badgeClass: "tier-gold",
    multiplier: 1.25,
    perks:
      "Fast-track Antrean Farmasi, Diskon 10% Wellness, Priority Chat DPJP",
  },
  PLATINUM: {
    name: "Platinum Royale",
    minPoints: 3000,
    maxPoints: 5999,
    badgeClass: "tier-platinum",
    multiplier: 1.5,
    perks:
      "Akses Executive Lounge Mandaya, Free Valet Parking, Prioritas Rawat Inap",
  },
  DIAMOND: {
    name: "Diamond Mandaya Club",
    minPoints: 6000,
    maxPoints: Infinity,
    badgeClass: "tier-diamond",
    multiplier: 2.0,
    perks:
      "Personal Care Concierge 24/7, Kamar Presidential Upgrade, Free Annual Health Screening",
  },
};

export function getTierForPoints(points) {
  if (points >= CARE_TIERS.DIAMOND.minPoints) return CARE_TIERS.DIAMOND;
  if (points >= CARE_TIERS.PLATINUM.minPoints) return CARE_TIERS.PLATINUM;
  if (points >= CARE_TIERS.GOLD.minPoints) return CARE_TIERS.GOLD;
  return CARE_TIERS.SILVER;
}

/**
 * Inisialisasi Akun Loyalitas Default jika belum ada
 */
export function getOrCreateLoyaltyAccount(mpiId = "MPI-0001") {
  const db = getDb();

  let account = db
    .prepare("SELECT * FROM loyalty_accounts WHERE mpi_id = ?")
    .get(mpiId);
  if (!account) {
    db.prepare(
      `
      INSERT INTO loyalty_accounts (mpi_id, points_balance, tier, care_streak_days, last_streak_date, auto_use_points, family_pool_id)
      VALUES (?, 2450, 'Gold Care', 5, ?, 1, 'FAM-001')
    `,
    ).run(mpiId, new Date().toISOString().split("T")[0]);

    account = db
      .prepare("SELECT * FROM loyalty_accounts WHERE mpi_id = ?")
      .get(mpiId);
  }

  // Update tier based on points
  const tierObj = getTierForPoints(account.points_balance);
  if (account.tier !== tierObj.name) {
    db.prepare("UPDATE loyalty_accounts SET tier = ? WHERE mpi_id = ?").run(
      tierObj.name,
      mpiId,
    );
    account.tier = tierObj.name;
  }

  // Dapatkan riwayat transaksi
  const transactions = db
    .prepare(
      `
    SELECT * FROM point_transactions 
    WHERE mpi_id = ? 
    ORDER BY id DESC 
    LIMIT 20
  `,
    )
    .all(mpiId);

  // Dapatkan data family pool
  const familyPool = getFamilyHealthPool(
    account.family_pool_id || "FAM-001",
    mpiId,
  );

  return {
    ...account,
    tierDetails: tierObj,
    nextTier: getNextTierInfo(account.points_balance),
    transactions,
    familyPool,
  };
}

function getNextTierInfo(points) {
  if (points < 1000)
    return {
      name: "Gold Care",
      target: 1000,
      remaining: 1000 - points,
      progress: Math.min(100, Math.round((points / 1000) * 100)),
    };
  if (points < 3000)
    return {
      name: "Platinum Royale",
      target: 3000,
      remaining: 3000 - points,
      progress: Math.min(100, Math.round(((points - 1000) / 2000) * 100)),
    };
  if (points < 6000)
    return {
      name: "Diamond Mandaya Club",
      target: 6000,
      remaining: 6000 - points,
      progress: Math.min(100, Math.round(((points - 3000) / 3000) * 100)),
    };
  return {
    name: "Maksimum Tier (Diamond Club)",
    target: 6000,
    remaining: 0,
    progress: 100,
  };
}

/**
 * 1. POINT PRESCRIPTION ENGINE
 * Membaca riwayat klinis, diagnosis, tindakan, dan tahap perawatan pasien untuk
 * memberikan rekomendasi preskripsi poin yang sangat spesifik dan relevan secara medis.
 */
export function generatePointPrescriptions(mpiId = "MPI-0001") {
  const db = getDb();
  const account = getOrCreateLoyaltyAccount(mpiId);
  const patient = db
    .prepare("SELECT * FROM patients WHERE mpi_id = ?")
    .get(mpiId);

  // Baca seluruh sumber klinis & event
  const events = db
    .prepare("SELECT * FROM events WHERE mpi_id = ? ORDER BY waktu DESC")
    .all(mpiId);
  const sources = db
    .prepare(
      `
    SELECT s.* FROM source_records s
    JOIN links l ON s.sistem = l.sistem AND s.local_id = l.local_id
    WHERE l.mpi_id = ? AND l.status IN ('auto', 'disetujui')
  `,
    )
    .all(mpiId);

  // Kumpulkan teks diagnosis dan riwayat
  let clinicalKeywords = [];
  sources.forEach((s) => {
    if (s.raw) {
      clinicalKeywords.push(s.raw.toLowerCase());
    }
  });
  events.forEach((e) => {
    clinicalKeywords.push((e.judul + " " + (e.detail || "")).toLowerCase());
  });
  const allClinicalContext = clinicalKeywords.join(" ");

  const prescriptions = [];

  // Kasus 1: Pasien Jantung / Pasca PTCA / Stent / Hipertensi
  if (
    allClinicalContext.includes("jantung") ||
    allClinicalContext.includes("stent") ||
    allClinicalContext.includes("ptca") ||
    allClinicalContext.includes("amlodipine") ||
    allClinicalContext.includes("hipertensi")
  ) {
    prescriptions.push({
      id: "rx-cardiac-lipid",
      badge: "Preskripsi DPJP Jantung",
      priority: "TINGGI",
      title: "Diskon 50% Panel Profil Lipid & Elektrolit Pasca Stent",
      category: "Laboratorium & Skrining",
      pointsCost: 1200,
      originalValue: "Rp 650.000",
      reasoning:
        "Riwayat pasca pemasangan stent jantung & terapi Amlodipine memerlukan pemantauan lipid dan fungsi elektrolit berkala pada minggu ke-4.",
      clinicalOutcome:
        "Mencegah restenosis dan memvalidasi dosis statin yang optimal.",
      actionButton: "Terapkan Preskripsi Poin (1.200 Pts)",
      eligible: account.points_balance >= 1200,
      rewardId: "rew-lab-lipid",
    });

    prescriptions.push({
      id: "rx-cardiac-rehab",
      badge: "Rehabilitasi Kardiovaskular",
      priority: "SEDANG",
      title: "Voucher Sesi Fisioterapi & Senam Jantung Sehat",
      category: "Rehabilitasi Medis",
      pointsCost: 800,
      originalValue: "Rp 400.000",
      reasoning:
        "Program pemulihan kapasitas aerobik jantung pasca rawat inap di Mandaya Royal Hospital Puri.",
      clinicalOutcome:
        "Meningkatkan ketahanan fisik dan menurunkan risiko serangan berulang.",
      actionButton: "Terapkan Preskripsi Poin (800 Pts)",
      eligible: account.points_balance >= 800,
      rewardId: "rew-rehab-physio",
    });
  }

  // Kasus 2: Pasien Nyeri / Pemulihan Pasca Bedah
  if (
    allClinicalContext.includes("operasi") ||
    allClinicalContext.includes("luka") ||
    allClinicalContext.includes("nyeri") ||
    allClinicalContext.includes("bedah")
  ) {
    prescriptions.push({
      id: "rx-post-op-homecare",
      badge: "Follow-up Bedah Mandaya",
      priority: "TINGGI",
      title: "Layanan Homecare Perawat Mandaya (Perawatan Luka & Tanda Vital)",
      category: "Homecare & Follow-up",
      pointsCost: 1500,
      originalValue: "Rp 750.000",
      reasoning:
        "Pasien dalam fase pemulihan luka operasi membutuhkan penggantian balutan steril di rumah tanpa harus bepergian.",
      clinicalOutcome:
        "Mencegah infeksi nosokomial dan mempercepat epitelisasi jaringan luka.",
      actionButton: "Terapkan Preskripsi Poin (1.500 Pts)",
      eligible: account.points_balance >= 1500,
      rewardId: "rew-homecare-wound",
    });
  }

  // Kasus 3: General Follow-up Telekonsultasi DPJP
  prescriptions.push({
    id: "rx-teleconsult-followup",
    badge: "Kontinuitas Perawatan",
    priority: "RUTIN",
    title: "Gratis 1x Telekonsultasi Lanjutan Dokter Spesialis DPJP",
    category: "Konsultasi Medis",
    pointsCost: 600,
    originalValue: "Rp 300.000",
    reasoning:
      "Memastikan evaluasi kepatuhan obat dan penyesuaian resep tanpa antre di rumah sakit.",
    clinicalOutcome:
      "Menjaga keterikatan pengobatan dan menurunkan risiko re-hospitalisasi.",
    actionButton: "Terapkan Preskripsi Poin (600 Pts)",
    eligible: account.points_balance >= 600,
    rewardId: "rew-consult-tele",
  });

  return {
    patientName: patient ? patient.nama : "Pasien Mandaya",
    mpiId,
    pointsBalance: account.points_balance,
    treatmentPhase: "Fase Pemulihan & Kontrol Terjadwal (Hari ke-14)",
    prescriptions,
  };
}

/**
 * 2. KATALOG CARE REWARDS & LIFESTYLE REWARDS
 */
export function getRewardsCatalog() {
  return [
    // --- CARE REWARDS (KLINIS) ---
    {
      id: "rew-consult-tele",
      category: "care_clinical",
      categoryName: "Konsultasi & Telemedisin",
      title: "Voucher 100% Telekonsultasi DPJP Spesialis",
      pointsCost: 600,
      originalValue: "Rp 300.000",
      description:
        "Konsultasi video call privat dengan dokter spesialis pilihan Anda di Care+ App.",
      icon: "🩺",
      badge: "Best Value Medis",
    },
    {
      id: "rew-lab-lipid",
      category: "care_clinical",
      categoryName: "Laboratorium & Skrining",
      title: "Diskon 50% Skrining Profil Lipid & Gula Darah",
      pointsCost: 1200,
      originalValue: "Rp 650.000",
      description:
        "Pemeriksaan Kolesterol Total, HDL, LDL, Trigliserida & HbA1c di Laboratorium Mandaya Puri.",
      icon: "🧪",
      badge: "Rekomendasi DPJP",
    },
    {
      id: "rew-rehab-physio",
      category: "care_clinical",
      categoryName: "Rehabilitasi Medis",
      title: "1 Sesi Fisioterapi / Rehabilitasi Medik",
      pointsCost: 800,
      originalValue: "Rp 400.000",
      description:
        "Terapi pemulihan muskuloskeletal atau kardiovaskular dipandu fisioterapis berlisensi.",
      icon: "🏃",
      badge: "Program Pemulihan",
    },
    {
      id: "rew-homecare-wound",
      category: "care_clinical",
      categoryName: "Homecare & Follow-up",
      title: "Layanan Homecare Kunjungan Perawat ke Rumah",
      pointsCost: 1500,
      originalValue: "Rp 750.000",
      description:
        "Pemeriksaan tanda vital, perawatan luka steril, dan edukasi obat langsung di kediaman pasien.",
      icon: "🏡",
      badge: "Kenyamanan Keluarga",
    },
    {
      id: "rew-screening-mcu",
      category: "care_clinical",
      categoryName: "Health Screening",
      title: "Potongan Rp 500.000 Paket Comprehensive MCU",
      pointsCost: 2000,
      originalValue: "Rp 500.000",
      description:
        "Berlaku untuk Paket Medical Check-up Gold/Platinum Mandaya Royal Hospital Puri.",
      icon: "📋",
      badge: "Preventif Unggulan",
    },

    // --- LIFESTYLE REWARDS (MICRO-BURN KESEHARIAN RS) ---
    {
      id: "rew-life-valet",
      category: "lifestyle_micro",
      categoryName: "Kenyamanan RS",
      title: "Gratis 1x Tiket Parkir VIP / Layanan Valet",
      pointsCost: 100,
      originalValue: "Rp 50.000",
      description:
        "Bebas biaya parkir seharian atau layanan drop-off valet di Lobby Utama Mandaya Puri.",
      icon: "🚗",
      badge: "Micro-Burn 100 Pts",
    },
    {
      id: "rew-life-juice",
      category: "lifestyle_micro",
      categoryName: "Healthy F&B",
      title: "Voucher Fresh Cold-Pressed Juice Mandaya Cafe",
      pointsCost: 150,
      originalValue: "Rp 45.000",
      description:
        "Minuman nutrisi segar 100% buah organik pilihan ahli gizi Mandaya di Lantai 1.",
      icon: "🥤",
      badge: "Sehat & Segar",
    },
    {
      id: "rew-life-bakery",
      category: "lifestyle_micro",
      categoryName: "Healthy F&B",
      title: "Voucher Makanan Sehat Kantin & Toko Roti Mandaya",
      pointsCost: 200,
      originalValue: "Rp 60.000",
      description:
        "Potongan Rp 60.000 untuk pembelian menu makanan sehat dan roti gandum rendah gula.",
      icon: "🥐",
      badge: "Favorit Pasien",
    },
    {
      id: "rew-life-massage",
      category: "lifestyle_micro",
      categoryName: "Wellness & Relaksasi",
      title: "Relaksasi Akupresur / Pijat Refleksi (30 Menit)",
      pointsCost: 300,
      originalValue: "Rp 120.000",
      description:
        "Sesi relaksasi pelepas stres di Ruang Tunggu Eksekutif Mandaya Wellness Center.",
      icon: "💆",
      badge: "Wellness Lounge",
    },
    {
      id: "rew-life-pharmacy",
      category: "lifestyle_micro",
      categoryName: "Mitra Lifestyle",
      title: "Voucher Diskon Rp 50.000 Produk Perawatan Kulit & Optik",
      pointsCost: 250,
      originalValue: "Rp 50.000",
      description:
        "Berlaku di Mandaya Derma Store & Optik Mitra Mandaya Hospital.",
      icon: "👓",
      badge: "Mitra Sehat",
    },
  ];
}

/**
 * 3. PENUKARAN REWARD DENGAN NEXT-BEST-ACTION
 */
export function redeemPointReward(mpiId = "MPI-0001", rewardId) {
  const db = getDb();
  const account = getOrCreateLoyaltyAccount(mpiId);
  const catalog = getRewardsCatalog();
  const reward = catalog.find((r) => r.id === rewardId);

  if (!reward) {
    throw new Error("Reward tidak ditemukan di katalog");
  }

  if (account.points_balance < reward.pointsCost) {
    throw new Error(
      `Poin tidak mencukupi. Anda memiliki ${account.points_balance} Poin, dibutuhkan ${reward.pointsCost} Poin.`,
    );
  }

  const newBalance = account.points_balance - reward.pointsCost;
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  // Kurangi poin akun
  db.prepare(
    "UPDATE loyalty_accounts SET points_balance = ? WHERE mpi_id = ?",
  ).run(newBalance, mpiId);

  // Catat transaksi
  db.prepare(
    `
    INSERT INTO point_transactions (mpi_id, type, category, points, title, detail, created_at)
    VALUES (?, 'redeem', ?, ?, ?, ?, ?)
  `,
  ).run(
    mpiId,
    reward.category,
    -reward.pointsCost,
    `Tukar Reward: ${reward.title}`,
    `Menggunakan ${reward.pointsCost} Poin untuk ${reward.title} (Nilai: ${reward.originalValue})`,
    now,
  );

  // Catat ke timeline rekam medis terpadu
  db.prepare(
    `
    INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
    VALUES (?, 'LOYALITAS', 'poin', ?, ?, ?, 'berhasil', ?)
  `,
  ).run(
    mpiId,
    now,
    `Penukaran CarePoint: ${reward.title}`,
    `Penggunaan ${reward.pointsCost} Poin Mandaya Care+. Sisa Saldo: ${newBalance} Poin.`,
    now,
  );

  // Generate Post-Redemption Next-Best-Action
  const nextBestAction = generatePostRedemptionNextBestAction(
    mpiId,
    reward,
    newBalance,
  );

  return {
    sukses: true,
    reward,
    pointsDeducted: reward.pointsCost,
    remainingPoints: newBalance,
    nextBestAction,
  };
}

/**
 * 7. POST-REDEMPTION NEXT-BEST-ACTION ENGINE
 */
export function generatePostRedemptionNextBestAction(
  mpiId,
  redeemedReward,
  remainingPoints,
) {
  const actions = [];

  // Langkah 1: Direct Continuation based on reward category
  if (redeemedReward.category === "care_clinical") {
    if (redeemedReward.id.includes("consult")) {
      actions.push({
        type: "book_now",
        icon: "📅",
        title: "Jadwalkan Konsultasi Sekarang",
        description:
          "Gunakan voucher yang baru ditukar untuk langsung memilih tanggal & jam dokter spesialis DPJP Anda.",
        actionText: "Buka Jadwal Dokter",
        targetView: "booking",
      });
    } else if (redeemedReward.id.includes("lab")) {
      actions.push({
        type: "lab_prep",
        icon: "🧪",
        title: "Panduan Persiapan Tes Lab (Puasa 10 Jam)",
        description:
          "Voucher lab aktif. Pasien disarankan berpuasa mulai pukul 22:00 malam sebelum pengambilan sampel darah pagi hari.",
        actionText: "Lihat Jadwal Lab Mandaya",
        targetView: "profile",
      });
    } else if (redeemedReward.id.includes("homecare")) {
      actions.push({
        type: "homecare_call",
        icon: "🏡",
        title: "Konfirmasi Alamat & Waktu Kunjungan Perawat",
        description:
          "Tim Homecare Mandaya siap menuju lokasi. Konfirmasi nomor WhatsApp aktif Anda.",
        actionText: "Hubungi Tim Homecare",
        targetView: "doctors",
      });
    }
  }

  // Langkah 2: Family Pool Sharing Suggestion (jika masih ada saldo signifikan)
  if (remainingPoints >= 500) {
    actions.push({
      type: "share_family",
      icon: "👨‍👩‍👧‍👦",
      title: `Bagi ${remainingPoints} Poin Tersisa ke Family Pool`,
      description:
        "Poin Anda masih cukup banyak. Gabungkan ke Kolam Kesehatan Keluarga agar bisa dimanfaatkan oleh anak atau orang tua.",
      actionText: "Transfer ke Family Pool",
      targetAction: "open_family_pool",
    });
  }

  // Langkah 3: Micro-Burn Upsell (jika saldo kecil tapi pas untuk lifestyle)
  if (remainingPoints >= 100) {
    actions.push({
      type: "micro_burn",
      icon: "🚗",
      title: "Klaim Gratis Parkir VIP / Valet Hari Ini (100 Pts)",
      description:
        "Tukarkan 100 poin tersisa agar Anda tidak perlu repot bayar tiket parkir saat kontrol di Mandaya Puri.",
      actionText: "Tukar Tiket Parkir",
      targetRewardId: "rew-life-valet",
    });
  }

  return {
    heading: "🎉 Penukaran Berhasil! Rekomendasi Langkah Lanjutan:",
    redeemedTitle: redeemedReward.title,
    remainingPoints,
    actions,
  };
}

/**
 * 3. FAMILY REWARDS (FAMILY HEALTH POOL)
 */
export function getFamilyHealthPool(poolId = "FAM-001", mpiId = "MPI-0001") {
  const db = getDb();

  let pool = db.prepare("SELECT * FROM family_pools WHERE id = ?").get(poolId);
  if (!pool) {
    const defaultMembers = [
      {
        id: 1,
        name: "Siti Aminah Rahayu",
        relation: "Pasien Utama (Ibu)",
        mpiId: "MPI-0001",
        contributedPoints: 1800,
        avatar: "👩",
      },
      {
        id: 2,
        name: "Bambang Sudiro",
        relation: "Suami",
        mpiId: "MPI-0002",
        contributedPoints: 1200,
        avatar: "👨",
      },
      {
        id: 3,
        name: "Rian Pratama",
        relation: "Anak (14 Thn)",
        mpiId: "MPI-0003",
        contributedPoints: 800,
        avatar: "👦",
      },
    ];

    db.prepare(
      `
      INSERT INTO family_pools (id, name, total_points, members_json)
      VALUES (?, 'Keluarga Rahayu Sudiro', 3800, ?)
    `,
    ).run(poolId, JSON.stringify(defaultMembers));

    pool = db.prepare("SELECT * FROM family_pools WHERE id = ?").get(poolId);
  }

  return {
    ...pool,
    members: JSON.parse(pool.members_json || "[]"),
  };
}

export function transferToFamilyPool(mpiId = "MPI-0001", pointsToTransfer) {
  const db = getDb();
  const account = getOrCreateLoyaltyAccount(mpiId);
  const points = parseInt(pointsToTransfer, 10);

  if (isNaN(points) || points <= 0) {
    throw new Error("Jumlah poin yang ditransfer tidak valid");
  }

  if (account.points_balance < points) {
    throw new Error(
      `Poin pribadi Anda (${account.points_balance}) tidak mencukupi untuk transfer ${points} poin.`,
    );
  }

  const pool = getFamilyHealthPool(account.family_pool_id || "FAM-001", mpiId);
  const newAccountBalance = account.points_balance - points;
  const newPoolTotal = pool.total_points + points;
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  // Update member contribution
  const updatedMembers = pool.members.map((m) => {
    if (m.mpiId === mpiId) {
      return { ...m, contributedPoints: m.contributedPoints + points };
    }
    return m;
  });

  db.prepare(
    "UPDATE loyalty_accounts SET points_balance = ? WHERE mpi_id = ?",
  ).run(newAccountBalance, mpiId);
  db.prepare(
    "UPDATE family_pools SET total_points = ?, members_json = ? WHERE id = ?",
  ).run(newPoolTotal, JSON.stringify(updatedMembers), pool.id);

  // Record transaction
  db.prepare(
    `
    INSERT INTO point_transactions (mpi_id, type, category, points, title, detail, created_at)
    VALUES (?, 'transfer_to_pool', 'family', ?, 'Transfer ke Family Health Pool', ?, ?)
  `,
  ).run(
    mpiId,
    -points,
    `Mengalokasikan ${points} Poin ke ${pool.name} untuk digunakan bersama keluarga`,
    now,
  );

  return {
    sukses: true,
    transferredPoints: points,
    newPersonalBalance: newAccountBalance,
    newPoolTotal,
    pesan: `Berhasil menggabungkan ${points} Poin ke ${pool.name}!`,
  };
}

/**
 * 5. AUTO-USE MY POINTS ENGINE
 */
export function toggleAutoUsePoints(mpiId = "MPI-0001", enabled) {
  const db = getDb();
  const val = enabled ? 1 : 0;
  db.prepare(
    "UPDATE loyalty_accounts SET auto_use_points = ? WHERE mpi_id = ?",
  ).run(val, mpiId);
  return {
    sukses: true,
    autoUseEnabled: !!val,
    pesan: val
      ? "Auto-Use My Points diaktifkan! Poin eligible otomatis dipotong saat transaksi/booking berikutnya."
      : "Auto-Use My Points dinonaktifkan.",
  };
}

export function calculateAutoUseDiscount(
  mpiId = "MPI-0001",
  originalPrice = 350000,
) {
  const account = getOrCreateLoyaltyAccount(mpiId);
  if (!account.auto_use_points) {
    return {
      autoUseActive: false,
      pointsApplied: 0,
      discountRupiah: 0,
      finalPrice: originalPrice,
    };
  }

  // 1 Poin = Rp 100 diskon, maksimal 50% dari harga total
  const maxDiscountRupiah = originalPrice * 0.5;
  const maxPointsApplicable = Math.floor(maxDiscountRupiah / 100);
  const pointsToApply = Math.min(account.points_balance, maxPointsApplicable);
  const discountRupiah = pointsToApply * 100;
  const finalPrice = originalPrice - discountRupiah;

  return {
    autoUseActive: true,
    pointsApplied: pointsToApply,
    discountRupiah,
    finalPrice,
    explanation: `Auto-Use memotong ${pointsToApply} Poin senilai Rp ${discountRupiah.toLocaleString("id-ID")} secara otomatis.`,
  };
}

/**
 * 6. CARE JOURNEY, GAMIFIKASI & CARE STREAK
 */
export function getMissionsAndQuizzes(mpiId = "MPI-0001") {
  const db = getDb();
  const account = getOrCreateLoyaltyAccount(mpiId);

  const missions = [
    {
      id: "mis-edu-hypertension",
      title: "Baca Panduan: 5 Tips Kontrol Tekanan Darah di Rumah",
      category: "education",
      rewardPoints: 25,
      description:
        "Edukasi klinis singkat dari DPJP Spesialis Jantung Mandaya Royal Hospital Puri.",
      completed: 1,
      icon: "📖",
    },
    {
      id: "mis-quiz-nutrition",
      title: "Kuis Sehat: Pola Makan Rendah Garam Pasca Tindakan",
      category: "quiz",
      rewardPoints: 50,
      description:
        "Jawab 1 pertanyaan singkat untuk menguji pemahaman diet sehat Anda.",
      completed: 0,
      icon: "🧠",
    },
    {
      id: "mis-confirm-control",
      title: "Konfirmasi Jadwal Kontrol Dokter Kamis Ini",
      category: "appointment",
      rewardPoints: 50,
      description: "Bantu tim medis mempersiapkan rekam medis Anda lebih awal.",
      completed: 1,
      icon: "📅",
    },
    {
      id: "mis-streak-7days",
      title: "Care Streak 7 Hari: Minum Obat & Check-in Mandiri",
      category: "adherence",
      rewardPoints: 150,
      description: `Capai 7 hari kepatuhan tanpa putus. Status Anda saat ini: ${account.care_streak_days}/7 Hari.`,
      completed: account.care_streak_days >= 7 ? 1 : 0,
      icon: "🔥",
    },
  ];

  const activeQuiz = {
    id: "quiz-sodium-1",
    question:
      "Berapa batas maksimal asupan garam (natrium) harian yang dianjurkan untuk pasien hipertensi & pasca stent?",
    options: [
      {
        id: "A",
        text: "1 sendok teh (sekitar 2.000 mg natrium / 5 gram garam dapur)",
        isCorrect: true,
      },
      {
        id: "B",
        text: "3 sendok makan penuh setiap kali makan",
        isCorrect: false,
      },
      {
        id: "C",
        text: "Bebas tanpa batas asalkan banyak minum air putih",
        isCorrect: false,
      },
    ],
    explanation:
      "Sesuai pedoman Perki & WHO, membatasi garam hingga <2.000 mg natrium (1 sendok teh) per hari terbukti klinis menurunkan tekanan darah sistolik rata-rata 5–8 mmHg.",
    pointsReward: 50,
  };

  return {
    careStreakDays: account.care_streak_days,
    missions,
    activeQuiz,
  };
}

export function submitHealthQuiz(mpiId = "MPI-0001", quizId, selectedOption) {
  const db = getDb();
  const account = getOrCreateLoyaltyAccount(mpiId);
  const isCorrect = selectedOption === "A";

  if (!isCorrect) {
    return {
      sukses: false,
      isCorrect: false,
      pesan:
        "Jawaban kurang tepat. Coba baca penjelasan klinis di bawah dan ulangi lagi!",
      explanation:
        "Pasien jantung & hipertensi dianjurkan membatasi asupan garam maksimal 1 sendok teh (5 gram garam / 2.000 mg natrium) per hari.",
    };
  }

  const bonusPoints = 50;
  const newBalance = account.points_balance + bonusPoints;
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  db.prepare(
    "UPDATE loyalty_accounts SET points_balance = ? WHERE mpi_id = ?",
  ).run(newBalance, mpiId);

  // Catat transaksi
  db.prepare(
    `
    INSERT INTO point_transactions (mpi_id, type, category, points, title, detail, created_at)
    VALUES (?, 'earn', 'mission', ?, 'Kuis Kesehatan Selesai: Diet Natrium', 'Menjawab kuis edukasi diet hipertensi dengan benar', ?)
  `,
  ).run(mpiId, bonusPoints, now);

  // Event timeline
  db.prepare(
    `
    INSERT INTO events (mpi_id, sistem, tipe, waktu, judul, detail, outcome, outcome_waktu)
    VALUES (?, 'LOYALITAS', 'poin', ?, 'Gamifikasi Care+: +50 Poin Kuis Sehat', 'Pasien menyelesaikan misi edukasi gizi pasca tindakan.', 'berhasil', ?)
  `,
  ).run(mpiId, now, now);

  return {
    sukses: true,
    isCorrect: true,
    pointsEarned: bonusPoints,
    newBalance,
    pesan:
      "🎉 Hebat! Jawaban Anda Benar. +50 Poin Mandaya CarePoint telah ditambahkan ke saldo Anda!",
    explanation:
      "Sesuai pedoman Perki & WHO, membatasi garam hingga <2.000 mg natrium (1 sendok teh) per hari terbukti klinis menurunkan tekanan darah sistolik rata-rata 5–8 mmHg.",
  };
}

export function incrementCareStreak(mpiId = "MPI-0001") {
  const db = getDb();
  const account = getOrCreateLoyaltyAccount(mpiId);
  const newStreak = account.care_streak_days + 1;
  let bonusPoints = 20; // 20 pts per daily streak check-in

  if (newStreak % 7 === 0) {
    bonusPoints += 150; // Extra 150 points for 7-day milestone
  }

  const newBalance = account.points_balance + bonusPoints;
  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  db.prepare(
    `
    UPDATE loyalty_accounts 
    SET care_streak_days = ?, last_streak_date = ?, points_balance = ? 
    WHERE mpi_id = ?
  `,
  ).run(newStreak, todayStr, newBalance, mpiId);

  db.prepare(
    `
    INSERT INTO point_transactions (mpi_id, type, category, points, title, detail, created_at)
    VALUES (?, 'earn', 'mission', ?, 'Care Streak Harian: Hari ke-${newStreak}', 'Kepatuhan minum obat & check-in rutin', ?)
  `,
  ).run(mpiId, bonusPoints, now);

  return {
    sukses: true,
    newStreak,
    pointsEarned: bonusPoints,
    newBalance,
    milestoneAchieved: newStreak % 7 === 0,
    pesan: `🔥 Luar biasa! Care Streak Anda kini ${newStreak} Hari berturut-turut (+${bonusPoints} Poin).`,
  };
}
