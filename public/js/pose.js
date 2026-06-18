'use strict';

/*
 * Modul deteksi "angkat tangan" berbasis MediaPipe Pose Landmarker.
 * Memuat library + model dari CDN (dynamic import ESM).
 *
 * Output deteksi: untuk tiap orang di frame, kita tahu posisi hidung,
 * bahu, dan pergelangan tangan. Tangan dianggap "terangkat" bila
 * pergelangan tangan berada di atas garis bahu.
 */

const POSE = (() => {
  const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const WASM_URL = `${VISION_URL}/wasm`;
  const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  // Indeks landmark MediaPipe Pose yang kita pakai.
  const NOSE = 0;
  const L_SHOULDER = 11;
  const R_SHOULDER = 12;
  const L_WRIST = 15;
  const R_WRIST = 16;

  let landmarker = null;
  let loadingPromise = null;

  async function load(onProgress, maxPoses = 4) {
    if (landmarker) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      onProgress && onProgress('Memuat model deteksi pose (angkat tangan)…');
      const vision = await import(`${VISION_URL}/vision_bundle.mjs`);
      const { PoseLandmarker, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: maxPoses,
      });
      onProgress && onProgress('Model pose siap.');
    })();

    return loadingPromise;
  }

  /*
   * Deteksi pose dari elemen video pada timestamp tertentu.
   * Mengembalikan array orang: [{ handRaised, noseX, noseY, centerX }].
   * Koordinat dalam rentang 0..1 (relatif terhadap lebar/tinggi frame).
   */
  function detect(video, timestampMs) {
    if (!landmarker) return [];
    const result = landmarker.detectForVideo(video, timestampMs);
    const people = [];
    for (const lm of result.landmarks || []) {
      const nose = lm[NOSE];
      const ls = lm[L_SHOULDER];
      const rs = lm[R_SHOULDER];
      const lw = lm[L_WRIST];
      const rw = lm[R_WRIST];
      if (!ls || !rs) continue;

      const shoulderY = (ls.y + rs.y) / 2;
      // Ingat: y kecil = lebih atas pada gambar.
      const leftUp = lw && lw.y < shoulderY;
      const rightUp = rw && rw.y < shoulderY;
      const handRaised = Boolean(leftUp || rightUp);

      const centerX = (ls.x + rs.x) / 2;
      people.push({
        handRaised,
        noseX: nose ? nose.x : centerX,
        noseY: nose ? nose.y : shoulderY,
        centerX,
      });
    }
    return people;
  }

  return { load, detect, isLoaded: () => Boolean(landmarker) };
})();
