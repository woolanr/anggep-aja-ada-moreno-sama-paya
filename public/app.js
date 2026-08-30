/**
 * app.js - Controller Frontend Terpadu
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri & Care+
 */

// State Global Aplikasi
let state = {
  currentView: "home",
  drawerOpen: false,
  drawerTab: "risk",
  currentMpiId: "MPI-0001",
  currentProfileId: null,
  activeChatDoctorId: 1,
  doctors: [],
  profiles: [],
  bookings: [],
  mpiPatients: [],
  timelineEvents: [],
  riskQueue: [],
  reviewQueue: [],
  accessLogs: [],
  consents: [],
  activeTimelineFilter: "ALL",
  loyaltyAccount: null,
  pointPrescriptions: [],
  rewardsCatalog: [],
  familyPool: null,
  activeRewardsFilter: "ALL",
  gamificationMissions: [],
  activeQuiz: null,
  lastRedemptionResult: null,
  medications: [
    {
      id: 1,
      name: "Amlodipine 10mg",
      dosis: "1x1 Tablet (Pagi)",
      status: "diminum",
      takenAt: "08:00 WIB",
    },
    {
      id: 2,
      name: "Atorvastatin 20mg",
      dosis: "1x1 Tablet (Malam)",
      status: "belum",
      takenAt: null,
    },
    {
      id: 3,
      name: "Clopidogrel 75mg",
      dosis: "1x1 Tablet (Pagi sesudah makan)",
      status: "diminum",
      takenAt: "08:15 WIB",
    },
  ],
  chatMessages: [
    {
      sender: "doctor",
      text: "Halo! Saya dr. Anisa Putri, Sp.A. Ada keluhan kesehatan anak yang bisa saya bantu hari ini?",
      time: "09:00",
    },
    {
      sender: "patient",
      text: "Selamat pagi dok, anak saya agak demam sejak semalam, suhu sekitar 37.8°C.",
      time: "09:02",
    },
    {
      sender: "doctor",
      text: "Baik Ibu. Pastikan si kecil cukup cairan dan istirahat. Apakah ada batuk, pilek, atau ruam merah di kulitnya?",
      time: "09:03",
    },
  ],
};

// Inisialisasi Saat DOM Siap
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Care+] Memulai inisialisasi aplikasi terpadu...");
  await loadInitialData();
  setupEventListeners();
  renderAllViews();

  // Check URL hash or query params
  const hash = window.location.hash.replace("#", "");
  if (hash === "risk" || hash === "mpi" || hash === "privacy") {
    switchDrawerTab(hash);
    toggleDrawer();
  }
});

/**
 * Muat data awal dari API
 */
async function loadInitialData() {
  try {
    const [docsRes, profsRes, mpiRes, statsRes] = await Promise.all([
      fetch("/api/doctors")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/profiles")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/mpi/patients")
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch("/api/stats")
        .then((r) => r.json())
        .catch(() => ({ data: {} })),
    ]);

    state.doctors =
      Array.isArray(docsRes) && docsRes.length
        ? docsRes
        : [
            {
              id: 1,
              name: "dr. Anisa Putri, Sp.A",
              spec: "Spesialis Anak",
              exp: 8,
              avail: "yes",
              img: "/anisa.svg",
            },
            {
              id: 2,
              name: "dr. Bagas Santoso, Sp.PD",
              spec: "Spesialis Penyakit Dalam",
              exp: 12,
              avail: "yes",
              img: "/bagas.svg",
            },
            {
              id: 3,
              name: "dr. Citra Lestari, Sp.KK",
              spec: "Spesialis Kulit & Kelamin",
              exp: 5,
              avail: "no",
              img: "/citra.svg",
            },
            {
              id: 4,
              name: "dr. Dimas Pratama, Sp.JP",
              spec: "Spesialis Jantung & Pembuluh Darah",
              exp: 15,
              avail: "yes",
              img: "/dimas.svg",
            },
          ];

    state.profiles =
      Array.isArray(profsRes) && profsRes.length
        ? profsRes
        : [
            {
              id: 1,
              mpi_id: "MPI-0001",
              name: "Siti Aminah Rahayu",
              birth: "1985-04-12",
              gender: "Perempuan",
              phone: "081234567890",
              email: "siti.aminah@gmail.com",
              nik: "3201018504120001",
              kk: "3201019876543210",
              isMain: true,
            },
          ];

    state.mpiPatients = mpiRes.data || [];
    if (state.profiles.length > 0) {
      state.currentProfileId = state.profiles[0].id;
      state.currentMpiId = state.profiles[0].mpi_id || "MPI-0001";
    }

    await loadPatientTimeline();
    await loadPatientConsents();
    await loadRiskQueue();
    await loadMpiReviews();
    await loadAccessLogs();
    await loadLoyaltyData();
  } catch (err) {
    console.error("Error loading initial data:", err);
  }
}

/**
 * Event Listeners & Input Helpers
 */
function setupEventListeners() {
  const dateInput = document.getElementById("book-date");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
    dateInput.value = today;
  }
}

/**
 * Ganti Halaman / View
 */
function switchView(viewName) {
  state.currentView = viewName;
  document
    .querySelectorAll(".page-view")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".care-nav-btn")
    .forEach((el) => el.classList.remove("active"));

  const targetView = document.getElementById(`view-${viewName}`);
  const targetNav = document.getElementById(`nav-${viewName}`);

  if (targetView) targetView.classList.add("active");
  if (targetNav) targetNav.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "profile") {
    loadPatientTimeline();
    loadPatientConsents();
  } else if (viewName === "doctors") {
    renderChatDoctorsList();
  } else if (viewName === "loyalty") {
    loadLoyaltyData();
  } else if (viewName === "booking") {
    updateBookingPointQuote();
  }
}

/**
 * Buka / Tutup Drawer Manajemen (3-Dots Panel)
 */
function toggleDrawer() {
  state.drawerOpen = !state.drawerOpen;
  const drawer = document.getElementById("drawer-backdrop");
  if (drawer) {
    drawer.classList.toggle("active", state.drawerOpen);
  }
  if (state.drawerOpen) {
    loadRiskQueue();
    loadMpiReviews();
    renderRoleComparison();
    loadMpiPatientsTable();
    loadAccessLogs();
  }
}

function closeDrawerOnOutside(e) {
  if (e.target.id === "drawer-backdrop") {
    toggleDrawer();
  }
}

function switchDrawerTab(tabName) {
  state.drawerTab = tabName;
  document
    .querySelectorAll(".drawer-tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll('[id^="drawer-pane-"]')
    .forEach((pane) => (pane.style.display = "none"));

  const btn = document.getElementById(`drawer-tab-${tabName}`);
  const pane = document.getElementById(`drawer-pane-${tabName}`);

  if (btn) btn.classList.add("active");
  if (pane) pane.style.display = "block";
}

/**
 * Render Semua Tampilan
 */
function renderAllViews() {
  renderHomeView();
  renderDoctorsGrid();
  renderChatDoctorsList();
  renderChatMessages();
  renderBookingDropdowns();
  renderProfilePills();
  renderActiveProfileDetails();
}

/**
 * Render Halaman Beranda
 */
function renderHomeView() {
  // Stats
  const statMpi = document.getElementById("stat-mpi-count");
  if (statMpi) statMpi.textContent = state.mpiPatients.length || 9;

  const statDoc = document.getElementById("stat-doc-count");
  if (statDoc) statDoc.textContent = state.doctors.length;

  const statRisk = document.getElementById("stat-risk-count");
  if (statRisk) statRisk.textContent = state.riskQueue.length;

  const badgeRisk = document.getElementById("badge-risk-count");
  if (badgeRisk) {
    if (state.riskQueue.length > 0) {
      badgeRisk.style.display = "flex";
      badgeRisk.textContent = state.riskQueue.length;
    } else {
      badgeRisk.style.display = "none";
    }
  }

  // Medications List
  const medContainer = document.getElementById("home-medications-list");
  if (medContainer) {
    let takenCount = 0;
    medContainer.innerHTML = state.medications
      .map((med) => {
        const isTaken = med.status === "diminum";
        if (isTaken) takenCount++;
        return `
        <div class="quick-med-item ${isTaken ? "taken" : ""}">
          <div>
            <div style="font-weight: 700; font-size: 13.5px; color: var(--text-main);">${med.name}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${med.dosis}</div>
          </div>
          <button class="btn btn-sm ${isTaken ? "btn-white" : "btn-primary"}" 
                  onclick="toggleMedication(${med.id})" 
                  style="border: 1px solid ${isTaken ? "#a7f3d0" : "transparent"}; font-size: 12px;">
            ${isTaken ? "✓ Diminum" : "Tandai Minum"}
          </button>
        </div>
      `;
      })
      .join("");

    const rateEl = document.getElementById("home-adherence-rate");
    if (rateEl) {
      const pct = Math.round((takenCount / state.medications.length) * 100);
      rateEl.textContent = `${pct}%`;
    }
  }
}

/**
 * Toggle Status Obat & Catat ke Events
 */
async function toggleMedication(medId) {
  const med = state.medications.find((m) => m.id === medId);
  if (!med) return;

  if (med.status === "diminum") {
    med.status = "belum";
  } else {
    med.status = "diminum";
    // Kirim event ke backend
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mpi_id: state.currentMpiId,
          sistem: "CARE_DOKTER",
          tipe: "obat",
          judul: `Konfirmasi Minum Obat: ${med.name}`,
          detail: `Dosis ${med.dosis} diminum tepat waktu oleh pasien.`,
          outcome: "diminum",
        }),
      });
      await loadPatientTimeline();
    } catch (e) {}
  }
  renderHomeView();
}

/**
 * Render Kartu Dokter di Beranda
 */
function renderDoctorsGrid() {
  const grid = document.getElementById("home-doctor-grid");
  if (!grid) return;

  grid.innerHTML = state.doctors
    .map(
      (doc) => `
    <div class="doctor-card">
      <div class="doc-avatar-wrap">
        <img src="${doc.img || "/anisa.svg"}" alt="${doc.name}" class="doc-avatar">
      </div>
      <h4 class="doc-name">${doc.name}</h4>
      <div class="doc-spec">${doc.spec}</div>
      <div class="doc-meta">Pengalaman ${doc.exp} tahun</div>
      <span class="badge-avail ${doc.avail === "yes" ? "yes" : "no"}">
        ${doc.avail === "yes" ? "● Tersedia Konsultasi" : "○ Sedang Praktik"}
      </span>
      <button class="btn btn-primary btn-sm" onclick="startDoctorChat(${doc.id})" style="width: 100%;">
        💬 Chat Sekarang
      </button>
    </div>
  `,
    )
    .join("");
}

/**
 * Dokter & Chat Logic
 */
function renderChatDoctorsList() {
  const list = document.getElementById("chat-doctor-list");
  if (!list) return;

  list.innerHTML = state.doctors
    .map(
      (doc) => `
    <div class="chat-doc-item ${doc.id === state.activeChatDoctorId ? "active" : ""}" onclick="selectChatDoctor(${doc.id})">
      <img src="${doc.img || "/anisa.svg"}" alt="${doc.name}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 700; font-size: 13.5px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.name}</div>
        <div style="font-size: 11.5px; color: var(--primary);">${doc.spec}</div>
      </div>
    </div>
  `,
    )
    .join("");
}

function selectChatDoctor(docId) {
  state.activeChatDoctorId = docId;
  const doc = state.doctors.find((d) => d.id === docId);
  if (doc) {
    const avatarEl = document.getElementById("active-chat-avatar");
    const nameEl = document.getElementById("active-chat-name");
    const specEl = document.getElementById("active-chat-spec");
    if (avatarEl) avatarEl.src = doc.img || "/anisa.svg";
    if (nameEl) nameEl.textContent = doc.name;
    if (specEl) specEl.textContent = `${doc.spec} · Online`;
  }
  renderChatDoctorsList();
  renderChatMessages();
}

function startDoctorChat(docId) {
  selectChatDoctor(docId);
  switchView("doctors");
}

function renderChatMessages() {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;

  container.innerHTML = state.chatMessages
    .map(
      (msg) => `
    <div class="chat-bubble ${msg.sender}">
      <div>${msg.text}</div>
      <div style="font-size: 10px; margin-top: 4px; text-align: right; opacity: 0.7;">${msg.time}</div>
    </div>
  `,
    )
    .join("");

  container.scrollTop = container.scrollHeight;
}

function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input-field");
  const text = input.value.trim();
  if (!text) return;

  const now = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  state.chatMessages.push({ sender: "patient", text, time: now });
  input.value = "";
  renderChatMessages();

  // Dokter Balas Otomatis
  setTimeout(() => {
    const doc = state.doctors.find((d) => d.id === state.activeChatDoctorId);
    const replyText = `Terima kasih atas informasinya. Rekam medis terpadu Anda di Mandaya sudah saya periksa. Jika keluhan berlanjut, disarankan untuk melakukan pemeriksaan fisik langsung di poliklinik kami.`;
    state.chatMessages.push({
      sender: "doctor",
      text: replyText,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    renderChatMessages();
  }, 1000);
}

function openBookingForCurrentDoctor() {
  switchView("booking");
  const docSelect = document.getElementById("book-doctor-select");
  if (docSelect) docSelect.value = state.activeChatDoctorId;
}

/**
 * Reservasi Janji Temu Logic
 */
function renderBookingDropdowns() {
  const profSelect = document.getElementById("book-profile-select");
  if (profSelect) {
    profSelect.innerHTML = state.profiles
      .map(
        (p) => `
      <option value="${p.id}">${p.name} (${p.gender}, NIK: ${p.nik || "-"})</option>
    `,
      )
      .join("");
  }

  const docSelect = document.getElementById("book-doctor-select");
  if (docSelect) {
    docSelect.innerHTML = state.doctors
      .map(
        (d) => `
      <option value="${d.id}">${d.name} - ${d.spec}</option>
    `,
      )
      .join("");
  }
}

async function submitBooking(e) {
  e.preventDefault();
  const profileId = parseInt(
    document.getElementById("book-profile-select").value,
    10,
  );
  const doctorId = parseInt(
    document.getElementById("book-doctor-select").value,
    10,
  );
  const hospital = document.getElementById("book-hospital-select").value;
  const date = document.getElementById("book-date").value;
  const time = document.getElementById("book-time").value;
  const temp = parseFloat(document.getElementById("book-temp").value) || null;
  const symptom = document.getElementById("book-symptom").value;
  const history = document.getElementById("book-history").value;

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        doctorId,
        hospital,
        date,
        time,
        temp,
        symptom,
        history,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Gagal membuat reservasi: ${data.error || "Terjadi kesalahan"}`);
      return;
    }

    alert(
      "✓ Reservasi berhasil dibuat dan otomatis terhubung ke Rekam Medis Terpadu Mandaya!",
    );
    document.getElementById("booking-form").reset();
    await loadPatientTimeline();
    switchView("profile");
  } catch (err) {
    alert("Terjadi kesalahan jaringan saat menyimpan reservasi.");
  }
}

/**
 * Profil Pasien & Anggota Keluarga
 */
function renderProfilePills() {
  const container = document.getElementById("profile-pills-container");
  if (!container) return;

  container.innerHTML = state.profiles
    .map(
      (p) => `
    <div class="profile-pill ${p.id === state.currentProfileId ? "active" : ""}" onclick="selectProfile(${p.id})">
      <span>👤</span>
      <span>${p.name} ${p.isMain ? "(Utama)" : ""}</span>
    </div>
  `,
    )
    .join("");
}

function selectProfile(profId) {
  state.currentProfileId = profId;
  const p = state.profiles.find((x) => x.id === profId);
  if (p) {
    state.currentMpiId = p.mpi_id || "MPI-0001";
  }
  renderProfilePills();
  renderActiveProfileDetails();
  loadPatientTimeline();
  loadPatientConsents();
}

function renderActiveProfileDetails() {
  const p =
    state.profiles.find((x) => x.id === state.currentProfileId) ||
    state.profiles[0];
  if (!p) return;

  const nameEl = document.getElementById("prof-disp-name");
  const mpiEl = document.getElementById("prof-disp-mpi");
  const nikEl = document.getElementById("prof-disp-nik");
  const phoneEl = document.getElementById("prof-disp-phone");
  const emailEl = document.getElementById("prof-disp-email");
  const birthEl = document.getElementById("prof-disp-birth");

  if (nameEl) nameEl.textContent = p.name;
  if (mpiEl) mpiEl.textContent = p.mpi_id || "MPI-0001";
  if (nikEl) nikEl.textContent = p.nik || "-";
  if (phoneEl) phoneEl.textContent = p.phone || "-";
  if (emailEl) emailEl.textContent = p.email || "-";
  if (birthEl) birthEl.textContent = `${p.birth || "-"} (${p.gender || "-"})`;
}

function openAddProfileModal() {
  document.getElementById("modal-profile-title").textContent =
    "Tambah Profil Anggota Baru";
  document.getElementById("prof-form-id").value = "";
  document.getElementById("prof-form-name").value = "";
  document.getElementById("prof-form-birth").value = "1990-01-01";
  document.getElementById("prof-form-gender").value = "Perempuan";
  document.getElementById("prof-form-phone").value = "";
  document.getElementById("prof-form-email").value = "";
  document.getElementById("prof-form-nik").value = "";
  document.getElementById("prof-form-kk").value = "";
  document.getElementById("modal-profile").classList.add("active");
}

function openEditProfileModal() {
  const p = state.profiles.find((x) => x.id === state.currentProfileId);
  if (!p) return;

  document.getElementById("modal-profile-title").textContent =
    "Edit Profil Anggota";
  document.getElementById("prof-form-id").value = p.id;
  document.getElementById("prof-form-name").value = p.name;
  document.getElementById("prof-form-birth").value = p.birth;
  document.getElementById("prof-form-gender").value = p.gender;
  document.getElementById("prof-form-phone").value = p.phone;
  document.getElementById("prof-form-email").value = p.email;
  document.getElementById("prof-form-nik").value = p.nik;
  document.getElementById("prof-form-kk").value = p.kk;
  document.getElementById("modal-profile").classList.add("active");
}

async function saveProfile(e) {
  e.preventDefault();
  const id = document.getElementById("prof-form-id").value;
  const payload = {
    name: document.getElementById("prof-form-name").value,
    birth: document.getElementById("prof-form-birth").value,
    gender: document.getElementById("prof-form-gender").value,
    phone: document.getElementById("prof-form-phone").value,
    email: document.getElementById("prof-form-email").value,
    nik: document.getElementById("prof-form-nik").value,
    kk: document.getElementById("prof-form-kk").value,
    mpi_id: state.currentMpiId,
  };

  try {
    const url = id ? `/api/profiles/${id}` : "/api/profiles";
    const method = id ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Gagal menyimpan profil: ${data.error}`);
      return;
    }

    closeModal("modal-profile");
    const profs = await fetch("/api/profiles").then((r) => r.json());
    state.profiles = profs;
    renderProfilePills();
    renderBookingDropdowns();
    renderActiveProfileDetails();
  } catch (err) {
    alert("Terjadi kesalahan jaringan.");
  }
}

/**
 * Garis Waktu Terpadu (Unified 5-System Timeline)
 */
async function loadPatientTimeline() {
  try {
    const res = await fetch(`/api/timeline/${state.currentMpiId}`).then((r) =>
      r.json(),
    );
    state.timelineEvents = res.events || [];
    renderTimelineFeed();
  } catch (e) {
    console.error("Error loading timeline:", e);
  }
}

function filterTimeline(systemKey, btn) {
  state.activeTimelineFilter = systemKey;
  if (btn) {
    document
      .querySelectorAll("#timeline-filters .btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  }
  renderTimelineFeed();
}

function renderTimelineFeed() {
  const container = document.getElementById("patient-timeline-container");
  if (!container) return;

  const filtered =
    state.activeTimelineFilter === "ALL"
      ? state.timelineEvents
      : state.timelineEvents.filter(
          (ev) => ev.sistem === state.activeTimelineFilter,
        );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
        Tidak ada rekam jejak pada kategori sistem ini.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map(
      (ev) => `
    <div class="timeline-item">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
        <span class="badge-system badge-${ev.sistem}">${ev.sistem.replace("_", " ")}</span>
        <span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">${ev.waktu}</span>
      </div>
      <div style="font-weight: 700; font-size: 15px; color: var(--text-main); margin-bottom: 4px;">${ev.judul}</div>
      <div style="font-size: 13px; color: var(--text-muted); line-height: 1.5;">${ev.detail || "-"}</div>
      ${
        ev.outcome
          ? `
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 12px; font-weight: 600; color: var(--primary-dark);">Outcome: <strong>${ev.outcome}</strong></span>
          <span style="font-size: 11px; background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-weight: 700;">✓ Data Latih AI</span>
        </div>
      `
          : ""
      }
    </div>
  `,
    )
    .join("");
}

/**
 * Pusat Persetujuan Data Pasien (Consent UU PDP)
 */
async function loadPatientConsents() {
  try {
    const res = await fetch(`/api/consent/${state.currentMpiId}`).then((r) =>
      r.json(),
    );
    state.consents = res.consents || [];
    renderConsentSwitches();
  } catch (e) {
    console.error("Error loading consents:", e);
  }
}

function renderConsentSwitches() {
  const container = document.getElementById("consent-switches-container");
  if (!container) return;

  container.innerHTML = state.consents
    .map((c) => {
      const isLocked = c.dapat_dicabut === 0;
      return `
      <div style="background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1; padding-right: 12px;">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              ${c.nama_purpose}
              ${isLocked ? '<span style="font-size: 10px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 800;">Wajib Medis</span>' : ""}
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Dasar Hukum: ${c.basis_hukum}
            </div>
          </div>
          <div>
            <input type="checkbox" 
                   ${c.status === 1 ? "checked" : ""} 
                   ${isLocked ? 'disabled title="Tujuan klinis tidak dapat dicabut demi keselamatan pasien"' : ""}
                   onchange="updateConsent('${c.purpose}', this.checked)"
                   style="transform: scale(1.3); cursor: ${isLocked ? "not-allowed" : "pointer"};">
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

async function updateConsent(purpose, isGranted) {
  try {
    await fetch(`/api/consent/${state.currentMpiId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, diberikan: isGranted ? 1 : 0 }),
    });
    await loadPatientConsents();
    await loadAccessLogs();
  } catch (e) {
    alert("Gagal memperbarui izin data.");
  }
}

function openConsentModal() {
  document.getElementById("modal-consent").classList.add("active");
}

/**
 * Check-in Gejala Mandiri
 */
function openCheckinModal() {
  document.getElementById("modal-checkin").classList.add("active");
}

async function submitCheckin(e) {
  e.preventDefault();
  const pain = document.getElementById("input-pain-scale").value;
  const checkboxes = document.querySelectorAll(
    'input[name="symptom_tag"]:checked',
  );
  const tags = Array.from(checkboxes).map((c) => c.value);
  const notes = document.getElementById("checkin-notes").value;

  const detailText = `Skala Nyeri: ${pain}/10. Gejala: ${tags.join(", ") || "Tidak ada gejala khusus"}. Catatan: ${notes || "-"}`;

  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mpi_id: state.currentMpiId,
        sistem: "CRM",
        tipe: "checkin",
        judul: `Check-in Mandiri (Nyeri ${pain}/10)`,
        detail: detailText,
        outcome: pain > 4 ? "memburuk" : "stabil",
      }),
    });

    closeModal("modal-checkin");
    alert(
      "✓ Check-in berhasil dikirim! Tim medis dan DPJP Mandaya memantau kondisi Anda.",
    );

    const lastPainEl = document.getElementById("home-last-pain");
    const lastSymEl = document.getElementById("home-last-symptoms");
    if (lastPainEl)
      lastPainEl.textContent = `${pain} / 10 (${pain > 4 ? "Waspada" : "Stabil"})`;
    if (lastSymEl)
      lastSymEl.textContent = `Gejala: ${tags.join(", ") || "Nyeri ringan"}`;

    await loadPatientTimeline();
    await loadRiskQueue();
  } catch (e) {
    alert("Gagal mengirim check-in.");
  }
}

function confirmAppointment() {
  alert(
    "✓ Kehadiran Anda pada jadwal kontrol telah dikonfirmasi ke Poli Jantung Mandaya Royal Hospital Puri (+50 Poin Sehat ditambahkan)!",
  );
}

/**
 * Observabilitas & Panel Juri Logic (3-Dots Menu)
 */
async function loadRiskQueue() {
  try {
    const res = await fetch("/api/risk/queue").then((r) => r.json());
    state.riskQueue = res.antrean || [];
    renderRiskQueue();
    renderHomeView();
  } catch (e) {
    console.error("Error loading risk queue:", e);
  }
}

function renderRiskQueue() {
  const container = document.getElementById("staff-risk-queue-container");
  if (!container) return;

  if (state.riskQueue.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #ffffff; border-radius: 12px; border: 1px solid var(--border-color);">
        <div style="font-size: 28px; margin-bottom: 8px;">✅</div>
        <div style="font-weight: 700; font-size: 15px; color: var(--text-main);">Tidak Ada Pasien Berisiko Tinggi</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Gunakan tombol "Majukan Hari" untuk memicu simulasi obat terlewat & no-show.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.riskQueue
    .map(
      (item) => `
    <div style="background: #ffffff; border: 1px solid ${item.tingkat === "tinggi" ? "#fca5a5" : "var(--border-color)"}; border-left: 5px solid ${item.tingkat === "tinggi" ? "var(--risk-high)" : "var(--risk-med)"}; border-radius: 12px; padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-sm);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 16px; color: var(--text-main);">${item.nama}</strong>
            <code style="background: var(--bg-page); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${item.mpi_id}</code>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            Kontak: ${item.telepon || "-"} · Usia: ${item.usia || "-"} thn
          </div>
        </div>
        <div style="text-align: right;">
          <span style="background: ${item.tingkat === "tinggi" ? "#fee2e2" : "#fef3c7"}; color: ${item.tingkat === "tinggi" ? "#b91c1c" : "#b45309"}; font-weight: 800; font-size: 12px; padding: 3px 10px; border-radius: 20px;">
            SKOR: ${item.skor}/100 (${item.tingkat.toUpperCase()})
          </span>
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
        <strong style="color: var(--text-main);">Alasan Inferensi XAI:</strong>
        <ul style="padding-left: 18px; margin-top: 4px; color: var(--text-muted);">
          ${item.alasan.map((a) => `<li>${a}</li>`).join("")}
        </ul>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-primary btn-sm" onclick="callPatientAction('${item.mpi_id}')">
          📞 Tandai Sudah Ditelepon (Tersambung)
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

async function callPatientAction(mpiId) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mpi_id: mpiId,
        sistem: "CARE_DOKTER",
        tipe: "panggilan",
        judul: "Panggilan Intervensi Klinis Staf Medis Mandaya",
        detail:
          "Pasien telah dihubungi via telepon. Pasien menyanggupi hadir kontrol ulang & resep obat disesuaikan.",
        outcome: "tersambung",
      }),
    });
    alert(
      "✓ Intervensi telepon berhasil dicatat dan masuk ke Closed Learning Loop (Data Latih AI)!",
    );
    await loadRiskQueue();
    await loadPatientTimeline();
  } catch (e) {
    alert("Gagal mencatat intervensi.");
  }
}

async function runMpiResolution() {
  try {
    const res = await fetch("/api/mpi/resolve", { method: "POST" }).then((r) =>
      r.json(),
    );
    alert(res.pesan || "Resolusi MPI Selesai!");
    await loadInitialData();
    renderRoleComparison();
    loadMpiPatientsTable();
    loadMpiReviews();
  } catch (e) {
    alert("Gagal menjalankan resolusi MPI.");
  }
}

async function loadMpiReviews() {
  try {
    const res = await fetch("/api/mpi/review").then((r) => r.json());
    state.reviewQueue = res.data || [];
    renderMpiReviewQueue();
  } catch (e) {
    console.error("Error loading reviews:", e);
  }
}

function renderMpiReviewQueue() {
  const container = document.getElementById("mpi-review-list");
  const badge = document.getElementById("review-count-badge");
  if (badge) badge.textContent = `${state.reviewQueue.length} Perlu Tinjauan`;
  if (!container) return;

  if (state.reviewQueue.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
        Tidak ada data yang memerlukan tinjauan manusia saat ini.
      </div>
    `;
    return;
  }

  container.innerHTML = state.reviewQueue
    .map(
      (r) => `
    <div style="background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; margin-bottom: 10px; font-size: 13px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <strong>Skor Kecocokan: ${(r.skor * 100).toFixed(1)}% (${r.sistem} - ID: ${r.local_id})</strong>
        <span class="badge-system badge-LOYALITAS">Ambang Tinjau 0.70 - 0.92</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; background: white; padding: 8px; border-radius: 6px;">
        <div><strong>Data Master MPI:</strong> ${r.nama_pasien_mpi} (NIK: ${r.nik_pasien_mpi || "-"})</div>
        <div><strong>Data Sumber Baru:</strong> ${r.nama_sumber} (NIK: ${r.nik_sumber || "-"})</div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn btn-secondary btn-sm" onclick="reviewDecision(${r.link_id}, 'tolak')">✕ Tolak (Pasien Berbeda)</button>
        <button class="btn btn-primary btn-sm" onclick="reviewDecision(${r.link_id}, 'setuju')">✓ Setujui (Gabung Pasien)</button>
      </div>
    </div>
  `,
    )
    .join("");
}

async function reviewDecision(linkId, keputusan) {
  try {
    const res = await fetch(`/api/mpi/review/${linkId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keputusan, petugas: "dr. Verifikator Medis" }),
    }).then((r) => r.json());

    alert(res.pesan);
    await loadInitialData();
    loadMpiReviews();
    loadMpiPatientsTable();
  } catch (e) {
    alert("Gagal memproses keputusan.");
  }
}

async function renderRoleComparison() {
  const container = document.getElementById("role-columns-grid");
  if (!container) return;

  const select = document.getElementById("role-test-patient");
  const mpiId = select ? select.value : "MPI-0001";

  try {
    const [doc, nurse, mkt, ai] = await Promise.all([
      fetch(`/api/patient/${mpiId}?purpose=klinis`, {
        headers: { "X-Peran": "dokter" },
      }).then((r) => r.json()),
      fetch(`/api/patient/${mpiId}?purpose=klinis`, {
        headers: { "X-Peran": "perawat" },
      }).then((r) => r.json()),
      fetch(`/api/patient/${mpiId}?purpose=pemasaran`, {
        headers: { "X-Peran": "marketing" },
      }).then((r) => r.json()),
      fetch(`/api/patient/${mpiId}?purpose=analitik`, {
        headers: { "X-Peran": "ai" },
      }).then((r) => r.json()),
    ]);

    const roles = [
      { title: "👨‍⚕️ DPJP DOKTER", color: "#0369a1", data: doc.data || {} },
      { title: "👩‍⚕️ PERAWAT", color: "#047857", data: nurse.data || {} },
      {
        title: "📢 MARKETING",
        color: "#b45309",
        data: mkt.data || (mkt.error ? { error: mkt.error } : {}),
      },
      { title: "🤖 AI (PSEUDONIM)", color: "#6d28d9", data: ai.data || {} },
    ];

    container.innerHTML = roles
      .map(
        (r) => `
      <div style="background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; font-size: 11.5px;">
        <div style="font-weight: 800; color: ${r.color}; margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">${r.title}</div>
        <pre style="background: #0f172a; color: #38bdf8; padding: 8px; border-radius: 6px; max-height: 220px; overflow: auto; font-family: monospace;">${JSON.stringify(r.data, null, 2)}</pre>
      </div>
    `,
      )
      .join("");
  } catch (e) {
    console.error("Error rendering role comparison:", e);
  }
}

async function loadMpiPatientsTable() {
  const tbody = document.getElementById("mpi-patients-table-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/mpi/patients").then((r) => r.json());
    const patients = res.data || [];
    tbody.innerHTML = patients
      .map(
        (p) => `
      <tr>
        <td><code>${p.mpi_id}</code></td>
        <td><strong>${p.nama}</strong></td>
        <td>${p.nik || "-"}</td>
        <td>${p.tgl_lahir || "-"}</td>
        <td><span class="badge-system badge-LOYALITAS">${p.total_tautan} Tautan</span></td>
        <td>${p.sistem_terhubung || "-"}</td>
      </tr>
    `,
      )
      .join("");
  } catch (e) {}
}

async function loadAccessLogs() {
  const tbody = document.getElementById("access-log-table-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/access-logs").then((r) => r.json());
    const logs = res.logs || [];
    tbody.innerHTML = logs
      .slice(0, 30)
      .map(
        (l) => `
      <tr>
        <td style="font-size: 11.5px; color: var(--text-muted);">${l.waktu}</td>
        <td><strong>${l.aktor}</strong> (${l.peran})</td>
        <td><code>${l.mpi_id}</code></td>
        <td>${l.purpose}</td>
        <td>
          <span style="font-size: 11px; font-weight: 800; color: ${l.diizinkan === 1 ? "#047857" : "#b91c1c"}; background: ${l.diizinkan === 1 ? "#ecfdf5" : "#fee2e2"}; padding: 2px 6px; border-radius: 4px;">
            ${l.diizinkan === 1 ? "200 DIIZINKAN" : "403 DIBLOKIR"}
          </span>
        </td>
        <td style="font-size: 11px; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.fields || "-"}</td>
      </tr>
    `,
      )
      .join("");
  } catch (e) {}
}

async function advanceDaySimulation() {
  try {
    const res = await fetch("/api/demo/advance-day", { method: "POST" }).then(
      (r) => r.json(),
    );
    alert(res.pesan);
    await loadRiskQueue();
    await loadPatientTimeline();
  } catch (e) {
    alert("Gagal memajukan hari simulasi.");
  }
}

async function resetDemoDb() {
  if (
    !confirm(
      "Apakah Anda yakin ingin me-reset seluruh database ke kondisi awal demo?",
    )
  )
    return;
  try {
    const res = await fetch("/api/demo/reset", { method: "POST" }).then((r) =>
      r.json(),
    );
    alert(res.pesan);
    await loadInitialData();
  } catch (e) {
    alert("Gagal me-reset database.");
  }
}

function filterDoctorsChat(query) {
  const q = query.toLowerCase();
  document
    .querySelectorAll("#chat-doctor-list .chat-doc-item")
    .forEach((el) => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? "flex" : "none";
    });
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove("active");
}

// ==========================================================================
// MODUL 1: MANDAYA CAREPOINT & LOYALITAS CONTROLLERS
// ==========================================================================

let selectedQuizAnswerIndex = 0;

/**
 * Muat seluruh data modul loyalitas
 */
async function loadLoyaltyData() {
  const mpiId = state.currentMpiId || "MPI-0001";
  try {
    const [accRes, presRes, rewRes, poolRes, misRes] = await Promise.all([
      fetch(`/api/loyalty/account/${mpiId}`)
        .then((r) => r.json())
        .catch(() => ({ data: null })),
      fetch(`/api/loyalty/prescriptions/${mpiId}`)
        .then((r) => r.json())
        .catch(() => ({ data: null })),
      fetch("/api/loyalty/rewards")
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch("/api/loyalty/family-pool/FAM-001")
        .then((r) => r.json())
        .catch(() => ({ data: null })),
      fetch(`/api/loyalty/missions/${mpiId}`)
        .then((r) => r.json())
        .catch(() => ({ data: null })),
    ]);

    state.loyaltyAccount = accRes.data;
    state.pointPrescriptions = presRes.data?.prescriptions || [];
    state.rewardsCatalog = rewRes.data || [];
    state.familyPool = poolRes.data;
    state.gamificationMissions = misRes.data?.missions || [];
    state.activeQuiz = misRes.data?.dailyQuiz || null;

    renderLoyaltyView();
    updateHeaderPointsBadge();
  } catch (err) {
    console.error("Error loading loyalty data:", err);
  }
}

/**
 * Update badge poin cepat di header navbar
 */
function updateHeaderPointsBadge() {
  const pts = state.loyaltyAccount?.points_balance ?? 2450;
  const el = document.getElementById("nav-header-points");
  if (el) {
    el.textContent = `${pts.toLocaleString("id-ID")} Pts`;
  }
}

/**
 * Render seluruh komponen di halaman CarePoint
 */
function renderLoyaltyView() {
  const acc = state.loyaltyAccount || {
    points_balance: 2450,
    tier: "Gold Care",
    care_streak_days: 5,
    auto_use_points: 1,
  };

  // Hero Card Info
  const ptsEl = document.getElementById("loyalty-points-val");
  if (ptsEl)
    ptsEl.textContent = (acc.points_balance || 0).toLocaleString("id-ID");

  const tierEl = document.getElementById("loyalty-hero-tier");
  if (tierEl) {
    tierEl.textContent = `⭐ ${acc.tier || "Gold Care"}`;
    tierEl.className = `tier-badge-pill ${acc.tier === "Diamond Elite" ? "tier-diamond" : acc.tier === "Platinum Royale" ? "tier-platinum" : acc.tier === "Gold Care" ? "tier-gold" : "tier-silver"}`;
  }

  const streakCountEl = document.getElementById("loyalty-streak-count");
  if (streakCountEl)
    streakCountEl.textContent = `${acc.care_streak_days || 5} Hari Care Streak`;

  const autoUseToggle = document.getElementById("toggle-auto-use");
  if (autoUseToggle) autoUseToggle.checked = acc.auto_use_points === 1;

  // Next Tier Progress
  const progressBar = document.getElementById("loyalty-tier-progress-bar");
  const nextTierName = document.getElementById("loyalty-next-tier-name");
  const nextTierText = document.getElementById("loyalty-next-tier-text");
  if (progressBar && nextTierName && nextTierText) {
    if (acc.tier === "Silver Care") {
      nextTierName.textContent = "Gold Care";
      nextTierText.textContent = `${Math.max(0, 1000 - acc.points_balance)} Pts lagi`;
      progressBar.style.width = `${Math.min(100, (acc.points_balance / 1000) * 100)}%`;
    } else if (acc.tier === "Gold Care") {
      nextTierName.textContent = "Platinum Royale";
      nextTierText.textContent = `${Math.max(0, 3000 - acc.points_balance)} Pts lagi`;
      progressBar.style.width = `${Math.min(100, (acc.points_balance / 3000) * 100)}%`;
    } else if (acc.tier === "Platinum Royale") {
      nextTierName.textContent = "Diamond Elite";
      nextTierText.textContent = `${Math.max(0, 5000 - acc.points_balance)} Pts lagi`;
      progressBar.style.width = `${Math.min(100, (acc.points_balance / 5000) * 100)}%`;
    } else {
      nextTierName.textContent = "Maksimal (Diamond Elite)";
      nextTierText.textContent = "Tier Tertinggi";
      progressBar.style.width = "100%";
    }
  }

  renderPointPrescriptions();
  renderRewardsCatalog();
  renderFamilyPool();
  renderGamificationMissions();
  renderActiveQuiz();
  renderLoyaltyTransactions();
}

/**
 * 1. Render Point Prescription Engine
 */
function renderPointPrescriptions() {
  const container = document.getElementById("point-prescriptions-grid");
  if (!container) return;

  const list = state.pointPrescriptions;
  if (!list || list.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Belum ada preskripsi poin DPJP saat ini.</div>`;
    return;
  }

  container.innerHTML = list
    .map(
      (item) => `
    <div class="prescription-card" style="display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px;">
          <span class="prescription-badge-dpjp">
            <span>🩺</span> ${item.dpjp}
          </span>
          <span style="font-size: 11px; font-weight: 700; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 6px;">
            ${item.badge}
          </span>
        </div>

        <h4 style="font-size: 15px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
          ${item.title}
        </h4>
        <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
          ${item.description}
        </p>

        <div style="background: #f0f9ff; border: 1px dashed #bae6fd; border-radius: 10px; padding: 10px; margin-bottom: 14px;">
          <div style="font-size: 11.5px; color: #0369a1; font-weight: 700;">🎯 Target Klinis:</div>
          <div style="font-size: 12px; color: #0f172a;">${item.clinicalOutcome}</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color);">
        <div>
          <div style="font-size: 11px; color: var(--text-muted);">Biaya Penukaran</div>
          <div style="font-size: 16px; font-weight: 800; color: var(--primary);">${item.pointsCost} Pts</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="redeemReward('${item.rewardId}')" style="font-size: 12px; padding: 8px 14px;">
          ✓ Terapkan Preskripsi
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * 2 & 3. Render Katalog Care Rewards & Lifestyle Rewards
 */
function renderRewardsCatalog() {
  const container = document.getElementById("rewards-catalog-grid");
  if (!container) return;

  const filter = state.activeRewardsFilter || "ALL";
  const list = state.rewardsCatalog.filter((r) => {
    if (filter === "ALL") return true;
    return r.category === filter;
  });

  if (list.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada reward di kategori ini.</div>`;
    return;
  }

  const userBalance = state.loyaltyAccount?.points_balance ?? 2450;

  container.innerHTML = list
    .map((item) => {
      const isAffordable = userBalance >= item.pointsCost;
      const isMicro = item.category === "lifestyle_micro";

      return `
      <div class="reward-card">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <span style="font-size: 28px;">${item.icon}</span>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              ${isMicro ? `<span class="micro-burn-badge">Micro-Burn</span>` : `<span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${item.type}</span>`}
              <span style="font-size: 11px; color: var(--text-muted); text-decoration: line-through;">${item.originalValue}</span>
            </div>
          </div>

          <h4 style="font-size: 14.5px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
            ${item.name}
          </h4>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px; line-height: 1.4;">
            ${item.description}
          </p>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <div>
            <div style="font-size: 16px; font-weight: 800; color: ${isAffordable ? "var(--primary)" : "#94a3b8"};">
              ${item.pointsCost} <span style="font-size: 12px; font-weight: 600;">Pts</span>
            </div>
          </div>
          <button 
            class="btn btn-sm ${isAffordable ? "btn-primary" : "btn-secondary"}" 
            style="font-size: 12px; padding: 6px 12px;"
            ${!isAffordable ? 'disabled title="Poin tidak mencukupi"' : `onclick="redeemReward('${item.id}')"`}>
            ${isAffordable ? "Tukar Poin" : "Poin Kurang"}
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

function filterRewardsCatalog(category, btn) {
  state.activeRewardsFilter = category;
  document
    .querySelectorAll(
      '[id^="btn-filter-all-rewards"], #view-loyalty .section-header-row .btn-secondary',
    )
    .forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderRewardsCatalog();
}

/**
 * 4. Render Family Health Pool
 */
function renderFamilyPool() {
  const pool = state.familyPool || {
    name: "Keluarga Rahayu Sudiro",
    total_points: 3800,
    members: [],
  };

  const poolNameEl = document.getElementById("family-pool-name");
  if (poolNameEl) poolNameEl.textContent = `Family Health Pool: ${pool.name}`;

  const poolPtsEl = document.getElementById("family-pool-total-pts");
  if (poolPtsEl)
    poolPtsEl.textContent = `${(pool.total_points || 0).toLocaleString("id-ID")} Pts`;

  const container = document.getElementById("family-pool-members-grid");
  if (!container) return;

  const members = pool.members || [];
  container.innerHTML = members
    .map(
      (m) => `
    <div style="background: rgba(255, 255, 255, 0.85); border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px;">
      <div style="font-size: 26px; background: #ffffff; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-sm);">
        ${m.avatar || "👤"}
      </div>
      <div>
        <div style="font-weight: 700; font-size: 13px; color: #14532d;">${m.name}</div>
        <div style="font-size: 11px; color: #166534;">${m.relation}</div>
        <div style="font-size: 11.5px; font-weight: 800; color: #15803d; margin-top: 2px;">
          +${(m.contributedPoints || 0).toLocaleString("id-ID")} Pts
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * 5. Render Misi Gamifikasi & Kuis Kesehatan
 */
function renderGamificationMissions() {
  const container = document.getElementById("gamification-missions-container");
  if (!container) return;

  const missions = state.gamificationMissions;
  if (!missions || missions.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted);">Tidak ada misi saat ini.</div>`;
    return;
  }

  container.innerHTML = missions
    .map(
      (m) => `
    <div class="gamification-mission-card ${m.completed ? "completed" : ""}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">${m.icon}</span>
        <div>
          <div style="font-size: 13.5px; font-weight: 700; color: var(--text-main);">
            ${m.title}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted);">
            ${m.description}
          </div>
        </div>
      </div>
      <div style="text-align: right; min-width: 80px;">
        ${
          m.completed
            ? `
          <span style="font-size: 11px; font-weight: 800; color: #047857; background: #ecfdf5; padding: 4px 8px; border-radius: 6px;">
            ✓ Selesai
          </span>
        `
            : `
          <button class="btn btn-sm btn-primary" onclick="claimMissionReward('${m.id}', ${m.points})" style="font-size: 11px; padding: 4px 8px;">
            +${m.points} Pts
          </button>
        `
        }
      </div>
    </div>
  `,
    )
    .join("");
}

function renderActiveQuiz() {
  const quiz = state.activeQuiz;
  if (!quiz) return;

  const qText = document.getElementById("quiz-question-text");
  if (qText) qText.textContent = quiz.question;

  const optionsContainer = document.getElementById("quiz-options-list");
  if (!optionsContainer) return;

  optionsContainer.innerHTML = quiz.options
    .map(
      (opt, idx) => `
    <label style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 10px; cursor: pointer; font-size: 13px; transition: all 0.2s;" class="quiz-option-label" id="quiz-opt-label-${idx}">
      <input type="radio" name="quiz_opt" value="${idx}" ${idx === selectedQuizAnswerIndex ? "checked" : ""} onchange="selectQuizOption(${idx})">
      <span>${opt}</span>
    </label>
  `,
    )
    .join("");
}

function selectQuizOption(idx) {
  selectedQuizAnswerIndex = idx;
  document.querySelectorAll(".quiz-option-label").forEach((el, i) => {
    el.style.borderColor = i === idx ? "var(--primary)" : "var(--border-color)";
    el.style.background = i === idx ? "#f0f9ff" : "#f8fafc";
  });
}

/**
 * 6. Render Riwayat Transaksi Poin
 */
function renderLoyaltyTransactions() {
  const tbody = document.getElementById("loyalty-transactions-table-body");
  if (!tbody) return;

  const history = state.loyaltyAccount?.history || [
    {
      waktu: "Hari ini 09:30",
      title: "Kunjungan Rawat Inap & Tindakan RS",
      category: "Klinis",
      detail: "Akumulasi transaksi paket kardiologi",
      points: 500,
      type: "earn",
    },
    {
      waktu: "Kemarin 14:00",
      title: "Bonus Care Streak 7 Hari",
      category: "Misi",
      detail: "Kepatuhan minum obat & check-in mandiri",
      points: 150,
      type: "earn",
    },
    {
      waktu: "2 hari lalu",
      title: "Gratis Parkir VIP / Valet Mandaya",
      category: "Lifestyle",
      detail: "Penggunaan tiket valet lobby utama",
      points: -100,
      type: "redeem",
    },
  ];

  tbody.innerHTML = history
    .map((item) => {
      const isEarn = item.points > 0 || item.type === "earn";
      return `
      <tr>
        <td style="font-size: 12px; color: var(--text-muted);">${item.waktu || item.created_at || "-"}</td>
        <td style="font-weight: 700; font-size: 13px;">${item.title}</td>
        <td>
          <span class="badge-system badge-${item.category === "Klinis" || item.category === "clinical" ? "HIS" : item.category === "Misi" || item.category === "mission" ? "CARE_DOKTER" : "LOYALITAS"}" style="font-size: 11px;">
            ${item.category}
          </span>
        </td>
        <td style="font-size: 12px; color: var(--text-muted);">${item.detail || "-"}</td>
        <td style="font-weight: 800; font-size: 14px; color: ${isEarn ? "#059669" : "#dc2626"};">
          ${isEarn ? `+${item.points}` : item.points} Pts
        </td>
      </tr>
    `;
    })
    .join("");
}

/**
 * Aksi Penukaran Reward & Tampilkan Next-Best-Action Modal
 */
async function redeemReward(rewardId) {
  const mpiId = state.currentMpiId || "MPI-0001";
  try {
    const res = await fetch("/api/loyalty/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpiId, rewardId }),
    }).then((r) => r.json());

    if (!res.sukses) {
      alert(res.error || "Gagal menukarkan reward.");
      return;
    }

    state.lastRedemptionResult = res;
    await loadLoyaltyData();
    showNextBestActionModal(res);
  } catch (err) {
    alert("Terjadi kesalahan saat memproses penukaran poin.");
  }
}

/**
 * Tampilkan Modal Post-Redemption Next-Best-Action
 */
function showNextBestActionModal(res) {
  const voucherEl = document.getElementById("nba-voucher-code");
  if (voucherEl)
    voucherEl.textContent = `Kode Voucher: ${res.voucherCode || "MNY-2026-CARE"}`;

  const rewardTitleEl = document.getElementById("nba-reward-title");
  if (rewardTitleEl)
    rewardTitleEl.textContent =
      res.reward?.name || "Voucher Manfaat Medis Mandaya";

  const ptsDeductedEl = document.getElementById("nba-points-deducted");
  if (ptsDeductedEl)
    ptsDeductedEl.textContent = `-${res.reward?.pointsCost || 0} Poin Terpotong (Sisa Saldo: ${res.newBalance.toLocaleString("id-ID")} Pts)`;

  const container = document.getElementById("nba-recommendations-list");
  if (container && res.nextBestActions) {
    container.innerHTML = res.nextBestActions
      .map(
        (nba, idx) => `
      <div class="next-best-action-card">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <span style="font-size: 20px;">${nba.icon || "📌"}</span>
          <div>
            <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${nba.title}</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">${nba.description}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="executeNbaAction('${nba.actionType}')" style="font-size: 11px; white-space: nowrap;">
          ${nba.actionLabel || "Lakukan"}
        </button>
      </div>
    `,
      )
      .join("");
  }

  const modal = document.getElementById("modal-next-best-action");
  if (modal) modal.classList.add("active");
}

function handleNbaPrimaryAction() {
  closeModal("modal-next-best-action");
  switchView("booking");
}

function executeNbaAction(type) {
  closeModal("modal-next-best-action");
  if (type === "booking" || type === "schedule_lab") {
    switchView("booking");
  } else if (type === "share_family") {
    openFamilyTransferModal();
  } else {
    switchView("loyalty");
  }
}

/**
 * Toggle Auto-Use My Points
 */
async function toggleAutoUseSetting(enabled) {
  const mpiId = state.currentMpiId || "MPI-0001";
  try {
    await fetch("/api/loyalty/auto-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpiId, enabled: enabled ? 1 : 0 }),
    });
    if (state.loyaltyAccount) {
      state.loyaltyAccount.auto_use_points = enabled ? 1 : 0;
    }
  } catch (err) {
    console.error("Error toggling auto use:", err);
  }
}

/**
 * Klaim Care Streak Harian
 */
async function claimDailyStreak() {
  const mpiId = state.currentMpiId || "MPI-0001";
  try {
    const res = await fetch("/api/loyalty/streak/increment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpiId }),
    }).then((r) => r.json());

    if (res.sukses) {
      alert(
        `🔥 Selamat! Care Streak bertambah menjadi ${res.streakDays} hari. Bonus +${res.bonusPoints} Poin!`,
      );
      await loadLoyaltyData();
    }
  } catch (err) {
    alert("Gagal klaim Care Streak.");
  }
}

/**
 * Klaim Poin Misi Harian
 */
async function claimMissionReward(missionId, points) {
  const mpiId = state.currentMpiId || "MPI-0001";
  try {
    alert(`🎉 Misi selesai! Anda mendapatkan +${points} Mandaya CarePoint.`);
    await loadLoyaltyData();
  } catch (err) {}
}

/**
 * Buka Modal Transfer Family Pool
 */
function openFamilyTransferModal() {
  const userBalance = state.loyaltyAccount?.points_balance ?? 2450;
  const hint = document.getElementById("transfer-pool-available-hint");
  if (hint)
    hint.textContent = `Saldo Anda saat ini: ${userBalance.toLocaleString("id-ID")} Poin`;

  const input = document.getElementById("transfer-points-amount");
  if (input) input.max = userBalance;

  const modal = document.getElementById("modal-family-transfer");
  if (modal) modal.classList.add("active");
}

/**
 * Submit Transfer Poin ke Family Pool
 */
async function submitFamilyPoolTransfer(e) {
  e.preventDefault();
  const points = parseInt(
    document.getElementById("transfer-points-amount").value,
    10,
  );
  const mpiId = state.currentMpiId || "MPI-0001";

  try {
    const res = await fetch("/api/loyalty/family-pool/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpiId, points }),
    }).then((r) => r.json());

    if (!res.sukses) {
      alert(res.error || "Gagal transfer poin ke kolam keluarga.");
      return;
    }

    closeModal("modal-family-transfer");
    alert(`👨‍👩‍👧‍👦 Berhasil mentransfer ${points} Poin ke Family Health Pool!`);
    await loadLoyaltyData();
  } catch (err) {
    alert("Terjadi kesalahan saat memproses transfer.");
  }
}

/**
 * Kirim Jawaban Kuis Kesehatan Harian
 */
async function submitActiveQuiz() {
  const quiz = state.activeQuiz;
  if (!quiz) return;

  const mpiId = state.currentMpiId || "MPI-0001";
  const submitBtn = document.getElementById("btn-submit-quiz");
  const feedbackBox = document.getElementById("quiz-feedback-box");

  try {
    const res = await fetch("/api/loyalty/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mpiId,
        quizId: quiz.id,
        selectedOption: selectedQuizAnswerIndex,
      }),
    }).then((r) => r.json());

    if (feedbackBox) {
      feedbackBox.style.display = "block";
      if (res.isCorrect) {
        feedbackBox.style.background = "#ecfdf5";
        feedbackBox.style.border = "1px solid #a7f3d0";
        feedbackBox.style.color = "#065f46";
        feedbackBox.innerHTML = `
          <strong>✓ Jawaban Benar (+${res.pointsAwarded} Pts)!</strong><br>
          ${res.explanation}
        `;
      } else {
        feedbackBox.style.background = "#fef2f2";
        feedbackBox.style.border = "1px solid #fecaca";
        feedbackBox.style.color = "#991b1b";
        feedbackBox.innerHTML = `
          <strong>✕ Jawaban Kurang Tepat:</strong> ${res.explanation}
        `;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "✓ Kuis Telah Dikerjakan";
    }

    await loadLoyaltyData();
  } catch (err) {
    alert("Gagal mengirim jawaban kuis.");
  }
}

/**
 * Update Quote Auto-Use Diskon di Form Booking
 */
async function updateBookingPointQuote() {
  const mpiId = state.currentMpiId || "MPI-0001";
  try {
    const res = await fetch(
      `/api/loyalty/auto-use/quote?mpiId=${mpiId}&price=350000`,
    ).then((r) => r.json());
    if (res.sukses && res.data) {
      const q = res.data;
      const banner = document.getElementById("booking-auto-use-banner");
      const textEl = document.getElementById("booking-point-quote-text");
      if (banner && textEl) {
        if (q.autoUseEnabled && q.pointsToUse > 0) {
          banner.style.display = "flex";
          textEl.textContent = `Estimasi potongan: ${q.pointsToUse} Poin (Diskon Rp ${q.discountAmount.toLocaleString("id-ID")}) dari total normal Rp ${q.originalPrice.toLocaleString("id-ID")}.`;
        } else {
          banner.style.display = "none";
        }
      }
    }
  } catch (err) {}
}
