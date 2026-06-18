'use strict';

/*
 * Modul pengenalan wajah berbasis face-api.js (@vladmandic/face-api).
 * Memuat model dari CDN, lalu menyediakan util untuk:
 *  - mendeteksi 1 wajah + menghitung descriptor (untuk registrasi)
 *  - mendeteksi banyak wajah + descriptor (untuk absensi)
 *  - membangun FaceMatcher dari daftar anggota tim
 */

const FACE = (() => {
  // CDN model. Bisa diganti ke folder lokal '/models' bila ingin offline.
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

  let loaded = false;
  let loadingPromise = null;

  // Ambang jarak euclidean; < nilai ini dianggap orang yang sama.
  // face-api default 0.6. Kita pakai 0.5 agar lebih ketat (mengurangi salah kenal).
  const MATCH_THRESHOLD = 0.5;

  const detectorOptions = () =>
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });

  async function load(onProgress) {
    if (loaded) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      onProgress && onProgress('Memuat model deteksi wajah…');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
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
    const matcher = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD);
    return { matcher, labelToMember };
  }

  return {
    load,
    detectSingle,
    detectAll,
    buildMatcher,
    isLoaded: () => loaded,
    MATCH_THRESHOLD,
  };
})();
