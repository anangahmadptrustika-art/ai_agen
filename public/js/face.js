'use strict';

/*
 * Modul pengenalan wajah berbasis face-api.js (@vladmandic/face-api).
 * Memuat model dari CDN, lalu menyediakan util untuk deteksi & pencocokan.
 *
 * Konfigurasi akurasi ada di FACE.CONFIG di bawah.
 */

const FACE = (() => {
  // CDN model. Bisa diganti ke folder lokal '/models' bila ingin offline.
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

  const CONFIG = {
    // Detektor wajah:
    //  'ssd'  -> SSD MobileNet v1: lebih AKURAT (disarankan untuk kios khusus)
    //  'tiny' -> TinyFaceDetector: lebih RINGAN (untuk PC berspesifikasi rendah)
    detector: 'ssd',
    ssdMinConfidence: 0.5,
    tinyInputSize: 512,        // makin besar makin akurat tapi lebih berat
    tinyScoreThreshold: 0.5,

    // Ambang jarak euclidean; < nilai ini dianggap orang yang sama.
    // face-api default 0.6. Kita pakai 0.48 agar lebih ketat (kurangi salah kenal).
    matchThreshold: 0.48,

    // Dipakai di halaman absensi (lihat attendance.js):
    minConsecutive: 2,   // identitas harus terkonfirmasi N frame beruntun sebelum dicatat
    minFaceRatio: 0.12,  // lebar wajah minimum relatif lebar frame (abaikan yg terlalu jauh)
  };

  let loaded = false;
  let loadingPromise = null;

  function detectorOptions() {
    if (CONFIG.detector === 'tiny') {
      return new faceapi.TinyFaceDetectorOptions({
        inputSize: CONFIG.tinyInputSize,
        scoreThreshold: CONFIG.tinyScoreThreshold,
      });
    }
    return new faceapi.SsdMobilenetv1Options({ minConfidence: CONFIG.ssdMinConfidence });
  }

  async function load(onProgress) {
    if (loaded) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      onProgress && onProgress('Memuat model deteksi wajah…');
      if (CONFIG.detector === 'tiny') {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      } else {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      }
      onProgress && onProgress('Memuat model landmark wajah…');
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      onProgress && onProgress('Memuat model pengenalan wajah…');
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      loaded = true;
      onProgress && onProgress('Model siap.');
    })();

    return loadingPromise;
  }

  // Satu wajah dengan descriptor — dipakai di halaman registrasi.
  async function detectSingle(input) {
    return faceapi
      .detectSingleFace(input, detectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  // Banyak wajah dengan descriptor — dipakai di halaman absensi.
  async function detectAll(input) {
    return faceapi
      .detectAllFaces(input, detectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();
  }

  /*
   * Bangun FaceMatcher dari daftar anggota (tiap anggota bisa punya
   * beberapa descriptor sampel). Mengembalikan { matcher, labelToMember }.
   */
  function buildMatcher(members) {
    const labeled = [];
    const labelToMember = {};
    for (const m of members) {
      const descriptors = (m.descriptors || [])
        .filter((d) => Array.isArray(d) && d.length === 128)
        .map((d) => new Float32Array(d));
      if (descriptors.length === 0) continue;
      labeled.push(new faceapi.LabeledFaceDescriptors(m.id, descriptors));
      labelToMember[m.id] = m;
    }
    if (labeled.length === 0) return { matcher: null, labelToMember };
    const matcher = new faceapi.FaceMatcher(labeled, CONFIG.matchThreshold);
    return { matcher, labelToMember };
  }

  return {
    CONFIG,
    load,
    detectSingle,
    detectAll,
    buildMatcher,
    isLoaded: () => loaded,
    get MATCH_THRESHOLD() { return CONFIG.matchThreshold; },
  };
})();
