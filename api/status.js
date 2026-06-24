'use strict';

// Endpoint status JSON untuk pemantauan eksternal.
// Serverless function Vercel di /api/status (CORS aktif, tidak di-cache).
// Catatan: ditulis CommonJS agar konsisten dengan project ("type":"commonjs").
module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const mem = process.memoryUsage();
  res.status(200).json({
    status: "ok",
    app: process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host || "",
    version: process.env.VERCEL_GIT_COMMIT_REF || "main",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
    region: process.env.VERCEL_REGION || "local",
    node: process.version,
    memoryMB: Math.round(mem.rss / 1048576),
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
};
