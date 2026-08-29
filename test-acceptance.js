/**
 * test-acceptance.js - Verifikasi Otomatis 7 Kriteria Uji Terima
 * "Satu Pasien, Satu Riwayat" - Mandaya Royal Hospital Puri
 */

import http from 'http';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log(' MEMULAI UJI TERIMA: SATU PASIEN, SATU RIWAYAT');
  console.log(' Mandaya Royal Hospital Puri');
  console.log('====================================================\n');

  let passed = 0;
  let total = 7;

  try {
    // 0. Reset Database
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/demo/reset',
      method: 'POST'
    });

    // UJI 1: POST /api/mpi/resolve -> 30 baris jadi 9 pasien MPI
    console.log('[UJI 1] Menjalankan Resolusi MPI (POST /api/mpi/resolve)...');
    const res1 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/mpi/resolve',
      method: 'POST'
    });

    const resPatients = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/mpi/patients',
      method: 'GET'
    });

    const totalPatients = resPatients.body?.data?.length || 0;
    if (totalPatients === 9) {
      console.log(`✓ UJI 1 LOLOS: 30 baris berhasil diresolusi menjadi tepat ${totalPatients} pasien MPI.\n`);
      passed++;
    } else {
      console.error(`✗ UJI 1 GAGAL: Diharapkan 9 pasien, didapat ${totalPatients}\n`);
    }

    // UJI 2: Minimal 1 kasus masuk antrean tinjauan (0.70 - 0.92)
    console.log('[UJI 2] Memeriksa Antrean Tinjauan Manusia (GET /api/mpi/review)...');
    const resReview = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/mpi/review',
      method: 'GET'
    });
    const reviewCount = resReview.body?.data?.length || 0;
    if (reviewCount >= 1) {
      console.log(`✓ UJI 2 LOLOS: Ada ${reviewCount} kasus masuk antrean tinjauan (Skor: ${(resReview.body.data[0].skor * 100).toFixed(1)}%).\n`);
      passed++;
    } else {
      console.error(`✗ UJI 2 GAGAL: Tidak ada kasus dalam antrean tinjauan.\n`);
    }

    // UJI 3: Dua "Ahmad Fauzi" TIDAK tergabung
    console.log('[UJI 3] Memeriksa dua pasien bernama "Ahmad Fauzi"...');
    const ahmadList = (resPatients.body?.data || []).filter(p => p.nama.toLowerCase().includes('ahmad fauzi'));
    if (ahmadList.length === 2 && ahmadList[0].mpi_id !== ahmadList[1].mpi_id) {
      console.log(`✓ UJI 3 LOLOS: Dua 'Ahmad Fauzi' tetap terpisah sebagai ${ahmadList[0].mpi_id} (Tgl Lahir: ${ahmadList[0].tgl_lahir}) dan ${ahmadList[1].mpi_id} (Tgl Lahir: ${ahmadList[1].tgl_lahir}).\n`);
      passed++;
    } else {
      console.error(`✗ UJI 3 GAGAL: Ahmad Fauzi tidak terpisah dengan benar (Jumlah: ${ahmadList.length}).\n`);
    }

    // UJI 4: Matikan consent pemasaran -> GET /api/patient/:id?purpose=pemasaran dengan X-Peran: marketing -> 403 & tercatat di access_log
    console.log('[UJI 4] Menguji Consent Gerbang Pemasaran (Cabut Persetujuan)...');
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/consent/MPI-0001',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { purpose: 'pemasaran', diberikan: 0 });

    const resMkt = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patient/MPI-0001?purpose=pemasaran',
      method: 'GET',
      headers: { 'X-Peran': 'marketing' }
    });

    const resLog = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/access-log/MPI-0001',
      method: 'GET'
    });

    const logTercatat = (resLog.body?.logs || []).some(l => l.purpose === 'pemasaran' && l.diizinkan === 0);
    if (resMkt.statusCode === 403 && logTercatat) {
      console.log(`✓ UJI 4 LOLOS: Respon bernilai 403 Forbidden dan insiden pemblokiran tercatat di access_log.\n`);
      passed++;
    } else {
      console.error(`✗ UJI 4 GAGAL: Status: ${resMkt.statusCode}, Log tercatat: ${logTercatat}\n`);
    }

    // UJI 5: Matikan SEMUA consent -> purpose=klinis dengan X-Peran: dokter tetap 200
    console.log('[UJI 5] Menguji Akses Klinis Medis saat Seluruh Consent Dimatikan...');
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/consent/MPI-0001',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { purpose: 'pengingat', diberikan: 0 });

    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/consent/MPI-0001',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { purpose: 'personalisasi', diberikan: 0 });

    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/consent/MPI-0001',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { purpose: 'analitik', diberikan: 0 });

    const resDokter = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patient/MPI-0001?purpose=klinis',
      method: 'GET',
      headers: { 'X-Peran': 'dokter' }
    });

    if (resDokter.statusCode === 200 && resDokter.body?.data?.diagnosis) {
      console.log(`✓ UJI 5 LOLOS: Akses klinis dokter tetap 200 OK karena dasar hukum Pelaksanaan Perjanjian Layanan Medis (dapat_dicabut = 0).\n`);
      passed++;
    } else {
      console.error(`✗ UJI 5 GAGAL: Status klinis dokter: ${resDokter.statusCode}\n`);
    }

    // UJI 6: Satu mpi_id + 4 peran berbeda -> 4 payload berbeda
    console.log('[UJI 6] Menguji Minimisasi Data: 1 Pasien, 4 Peran, 4 Payload Berbeda...');
    // Aktifkan kembali consent pemasaran & analitik untuk melihat payload
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/consent/MPI-0001',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { purpose: 'pemasaran', diberikan: 1 });
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/consent/MPI-0001',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { purpose: 'analitik', diberikan: 1 });

    const pDokter = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patient/MPI-0001?purpose=klinis',
      method: 'GET',
      headers: { 'X-Peran': 'dokter' }
    });
    const pPerawat = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patient/MPI-0001?purpose=klinis',
      method: 'GET',
      headers: { 'X-Peran': 'perawat' }
    });
    const pMkt = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patient/MPI-0001?purpose=pemasaran',
      method: 'GET',
      headers: { 'X-Peran': 'marketing' }
    });
    const pAI = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patient/MPI-0001?purpose=analitik',
      method: 'GET',
      headers: { 'X-Peran': 'ai' }
    });

    const keysDokter = Object.keys(pDokter.body?.data || {}).sort().join(',');
    const keysPerawat = Object.keys(pPerawat.body?.data || {}).sort().join(',');
    const keysMkt = Object.keys(pMkt.body?.data || {}).sort().join(',');
    const keysAI = Object.keys(pAI.body?.data || {}).sort().join(',');

    const uniquePayloads = new Set([keysDokter, keysPerawat, keysMkt, keysAI]);
    const aiHasHash = !!pAI.body?.data?.mpi_hash && !pAI.body?.data?.nama;

    if (uniquePayloads.size === 4 && aiHasHash) {
      console.log(`✓ UJI 6 LOLOS: 4 payload berbeda dihasilkan:`);
      console.log(`  - Dokter   : [${keysDokter}]`);
      console.log(`  - Perawat  : [${keysPerawat}]`);
      console.log(`  - Marketing: [${keysMkt}]`);
      console.log(`  - AI (Hash): [${keysAI}] (mpi_hash: ${pAI.body?.data?.mpi_hash})\n`);
      passed++;
    } else {
      console.error(`✗ UJI 6 GAGAL: Payloads tidak berbeda atau AI membuka nama (Unique: ${uniquePayloads.size}).\n`);
    }

    // UJI 7: POST /api/demo/advance-day 3x -> minimal 1 pasien muncul di /api/risk/queue
    console.log('[UJI 7] Menjalankan Simulasi Majukan Hari 3x...');
    await makeRequest({ hostname: 'localhost', port: 3000, path: '/api/demo/advance-day', method: 'POST' });
    await makeRequest({ hostname: 'localhost', port: 3000, path: '/api/demo/advance-day', method: 'POST' });
    await makeRequest({ hostname: 'localhost', port: 3000, path: '/api/demo/advance-day', method: 'POST' });

    const resQueue = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/risk/queue',
      method: 'GET'
    });

    const queueCount = resQueue.body?.antrean?.length || 0;
    const topPatient = resQueue.body?.antrean?.[0];

    if (queueCount >= 1 && topPatient?.alasan?.length > 0) {
      console.log(`✓ UJI 7 LOLOS: ${queueCount} pasien terdeteksi di antrean risiko tinggi.`);
      console.log(`  - Pasien Teratas: ${topPatient.nama} (Skor: ${topPatient.skor}/100, Tingkat: ${topPatient.tingkat.toUpperCase()})`);
      console.log(`  - Alasan Transparan:`);
      topPatient.alasan.forEach(a => console.log(`    * ${a}`));
      console.log('');
      passed++;
    } else {
      console.error(`✗ UJI 7 GAGAL: Antrean risiko kosong.\n`);
    }

    console.log('====================================================');
    console.log(` HASIL PENGUJIAN: ${passed}/${total} UJI TERIMA BERHASIL`);
    console.log('====================================================');

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Error saat pengujian:', err);
    process.exit(1);
  }
}

// Beri jeda 500ms lalu jalankan
setTimeout(runTests, 500);
