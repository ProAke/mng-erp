/* MNG ERP — hermes-mini API routes
 *
 * Mounted at /api/hermes-mini/* in the main Express server.
 * All routes require auth (auth.middleware) to protect real data.
 */
'use strict';

const express = require('express');
const { HermesMini } = require('./hermes-mini');

const router = express.Router();
let mini = null;  // singleton per-server instance

function getMini() {
  if (!mini) mini = new HermesMini(require('../db').workPool, require('../db').authPool);
  return mini;
}

/* ---------- GET /api/hermes-mini/status ---------- */
router.get('/status', async (_req, res) => {
  try {
    const m = getMini();
    res.json(m.status());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/insights ---------- */
router.get('/insights', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.insights();
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/insights]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/summary ---------- */
router.get('/summary', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.summary();
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/summary]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/prioritize ---------- */
router.get('/prioritize', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.prioritize();
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/prioritize]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/tasks ---------- */
router.get('/tasks', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.prioritize();
    res.json({ tasks: result.recommendations, ...result });
  } catch (e) {
    console.error('[hermes-mini/tasks]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/risk ---------- */
router.get('/risk', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.predictRisk();
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/risk]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- POST /api/hermes-mini/chat ---------- */
router.post('/chat', async (req, res) => {
  try {
    const { question, context } = req.body || {};
    const m = getMini();
    const result = await m.chat(question, context);
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/worklog/:id ---------- */
router.get('/worklog/:id', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.generateWorklog(req.params.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/worklog]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- GET /api/hermes-mini/member/:id ---------- */
router.get('/member/:id', async (req, res) => {
  try {
    const m = getMini();
    const result = await m.memberDetail(req.params.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (e) {
    console.error('[hermes-mini/member]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
