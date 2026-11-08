'use strict';

// ───────────────────────────────────────────────────────────────
//  Discord URL Swapper — Express sunucusu
//  Statik arayüzü sunar ve /api/swapper ucunu açar.
// ───────────────────────────────────────────────────────────────

const path = require('path');
const express = require('express');
const { runSwap } = require('./swapper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Sağlık kontrolü
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'discord-url-swapper', time: Date.now() });
});

// Swap işlemi — NDJSON canlı akış.
// İstemci her satırı bir olay olarak okur:
//   {type:'step', msg}   → ilerleme satırı
//   {type:'done', ok, error?, result?} → nihai sonuç
app.post('/api/swapper', async (req, res) => {
  const body = req.body || {};

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (obj) => {
    try { res.write(JSON.stringify(obj) + '\n'); } catch { /* bağlantı kapalı */ }
  };

  try {
    const outcome = await runSwap(body, (msg) => send({ type: 'step', msg }));
    send({ type: 'done', ok: outcome.ok, error: outcome.error, result: outcome.result });
  } catch (err) {
    send({ type: 'done', ok: false, error: (err && err.message) || 'Sunucu hatası' });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Discord URL Swapper çalışıyor → http://localhost:${PORT}`);
});
