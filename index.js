global.WebSocket = require('ws');// SHAYA QUIZ - MINI APP + WEBSITE - BACKUP LIKE SHAYA WATCH ALL
// Backup: 1) Memory 2) quiz_backup.json (Render file) 3) Supabase quiz_users
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = process.env.ADMIN_ID || '1159481047';
const PORT = process.env.PORT || 10000;

// --- SUPABASE ---
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase connected');
} else {
  console.log('Supabase MISSING - using file backup only');
}

// --- BACKUP LIKE WATCH: FILE ---
const BACKUP_FILE = path.join(__dirname, 'quiz_backup.json');
let users = new Map();
let withdraws = [];
let topups = [];

function loadBackupFile() {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const d = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
      if (d.users) Object.entries(d.users).forEach(([k, v]) => users.set(k, v));
      if (d.withdraws) withdraws = d.withdraws;
      if (d.topups) topups = d.topups;
      console.log(`Backup file loaded: ${users.size} users`);
    }
  } catch (e) { console.log('Backup file load failed:', e.message); }
}
function saveBackupFile() {
  try {
    const data = { users: Object.fromEntries(users), withdraws, topups, savedAt: new Date().toISOString() };
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.log('Backup file save failed:', e.message); }
}
loadBackupFile();
setInterval(saveBackupFile, 30000); // Auto-save every 30s like Watch

// --- HELPERS ---
function normId(raw) {
  if (!raw) return null;
  let id = String(raw).trim();
  return id;
}
function getUser(id) {
  id = normId(id);
  if (!users.has(id)) {
    let user_id = null;
    let auth_source = 'telegram';
    let device_id = id;
    if (/^\d+$/.test(id)) { user_id = parseInt(id); auth_source = 'telegram'; }
        else if (id.startsWith('web_')) { auth_source = 'website'; }
    else if (id.startsWith('browser_')) { auth_source = 'website'; }
    else if (id.startsWith('tg_')) { user_id = parseInt(id.replace('tg_', '')) || null; auth_source = 'telegram'; }
    users.set(id, {
      id, user_id, device_id, auth_source,
      name: 'Player', first_name: 'Player', username: '',
      points: 0, play_points: 0, daily_points: 0,
      q_index: 0, correct: 0, wrong: 0, last_claim: null, pending_topup: null
    });
  }
  return users.get(id);
}
function mergeUser(oldU, newU) {
  // MAX merge - never lose points
  if (!oldU) return newU;
  return {
    ...oldU, ...newU,
    points: Math.max(oldU.points || 0, newU.points || 0),
    play_points: Math.max(oldU.play_points || 0, newU.play_points || 0),
    daily_points: Math.max(oldU.daily_points || 0, newU.daily_points || 0),
    correct: Math.max(oldU.correct || 0, newU.correct || 0),
    wrong: Math.max(oldU.wrong || 0, newU.wrong || 0),
    q_index: Math.max(oldU.q_index || 0, newU.q_index || 0)
  };
}

// --- SAVE TO SUPABASE + FILE ---
async function saveUser(id) {
  const u = getUser(id);
  u.updated_at = new Date().toISOString();
  saveBackupFile(); // 1. File first - always works
  if (!supabase) return;
  try {
    const { error } = await supabase.from('quiz_users').upsert({
      id: u.id, user_id: u.user_id, device_id: u.device_id, auth_source: u.auth_source,
      name: u.name, first_name: u.first_name, username: u.username,
      points: u.points, play_points: u.play_points, daily_points: u.daily_points,
      q_index: u.q_index, correct: u.correct, wrong: u.wrong,
      last_claim: u.last_claim, pending_topup: u.pending_topup, updated_at: u.updated_at
    }, { onConflict: 'id' });
    if (error) console.log('Supabase save failed for', id, error.message);
  } catch (e) { console.log('Supabase save error', e.message); }
}
async function loadUserFromSupabase(id) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('quiz_users').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  } catch { return null; }
}

// --- API FOR MINI APP + WEBSITE ---
app.get('/api/user/:id', async (req, res) => {
  const id = normId(req.params.id);
  const mem = getUser(id);
  const db = await loadUserFromSupabase(id);
  if (db) {
    const merged = mergeUser(mem, db);
    users.set(id, merged);
    saveBackupFile();
    return res.json({ ...merged, points: merged.points, playPoints: merged.play_points, dailyPoints: merged.daily_points });
  }
  res.json({ ...mem, points: mem.points, playPoints: mem.play_points, dailyPoints: mem.daily_points });
});

app.post('/api/sync', async (req, res) => {
  const { id, name, first_name, username, points, playPoints, dailyPoints, q_index, correct, wrong, last_claim } = req.body;
  if (!id) return res.json({ error: 'no id' });
  const u = getUser(id);
  if (name) { u.name = name; u.first_name = first_name || name; }
  if (username) u.username = username;
  // MAX merge - website sends its local points, we keep highest
  if (typeof points === 'number') u.points = Math.max(u.points, points);
  if (typeof playPoints === 'number') u.play_points = Math.max(u.play_points, playPoints);
  if (typeof dailyPoints === 'number') u.daily_points = Math.max(u.daily_points, dailyPoints);
  if (typeof q_index === 'number') u.q_index = Math.max(u.q_index, q_index);
  if (typeof correct === 'number') u.correct = Math.max(u.correct, correct);
  if (typeof wrong === 'number') u.wrong = Math.max(u.wrong, wrong);
  if (last_claim) u.last_claim = last_claim;
  await saveUser(id);
  res.json({ ok: true, points: u.points, playPoints: u.play_points, dailyPoints: u.daily_points });
});

app.post('/api/claim', async (req, res) => {
  const { id, name } = req.body;
  if (!id) return res.json({ error: 'no id' });
  const u = getUser(id);
  if (name) u.name = name;
  const today = new Date().toDateString();
  if (u.last_claim === today) return res.json({ ok: false, error: 'Already claimed today', dailyPoints: u.daily_points });
  u.daily_points = (u.daily_points || 0) + 200;
  u.points = (u.points || 0) + 200;
  u.last_claim = today;
  await saveUser(id);
  res.json({ ok: true, dailyPoints: u.daily_points, points: u.points });
});

app.post('/api/withdraw', async (req, res) => {
  const { id, name, method, wallet, rand } = req.body;
  const u = getUser(id);
  const cost = 10000;
  if (u.points < cost) return res.json({ ok: false, error: 'Need 10000 points' });
  u.points -= cost;
  const w = { id: Date.now(), user_id: id, device_id: id, name: u.name || name, method, wallet, rand, points: cost, status: 'pending', created_at: new Date().toISOString() };
  withdraws.push(w);
  await saveUser(id);
  if (supabase) await supabase.from('quiz_withdraws').insert(w).then(r => { if (r.error) console.log('Withdraw supabase fail', r.error.message); });
  res.json({ ok: true, points: u.points });
});

app.post('/api/topup', async (req, res) => {
  const { id, name, package_id, points, price, proof } = req.body;
  const u = getUser(id);
  const t = { id: Date.now(), user_id: id, device_id: id, name: u.name || name, package_id, points, price, proof, status: 'pending', created_at: new Date().toISOString() };
  topups.push(t);
  u.pending_topup = t;
  await saveUser(id);
  if (supabase) await supabase.from('quiz_topups').insert(t).then(r => { if (r.error) console.log('Topup supabase fail', r.error.message); });
  res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const list = Array.from(users.values()).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 20).map(u => ({ name: u.name, points: u.points }));
  res.json(list);
});

app.get('/health', (req, res) => res.json({ ok: true, users: users.size, supabase: !!supabase }));

// --- TELEGRAM BOT ---
let bot = null;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  const WEBAPP_URL = process.env.WEBAPP_URL || 'https://shayaquizearnbot.onrender.com/quiz.html';
  bot.onText(/\/start/, async (msg) => {
    const id = String(msg.from.id);
    const u = getUser(id);
    u.name = msg.from.first_name || 'Player';
    u.first_name = msg.from.first_name || 'Player';
    u.username = msg.from.username || '';
    await saveUser(id);
    bot.sendMessage(msg.chat.id, `🎯 Shaya Quiz Earn\n\nHi ${u.name}!\nPoints: ${u.points}\n\nTap PLAY to open Mini App or Website:`, {
      reply_markup: { inline_keyboard: [[{ text: '▶️ PLAY QUIZ', web_app: { url: WEBAPP_URL } }]] }
    });
  });
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    // Admin approve commands: /approve <user_id> <points>
    if (String(msg.from.id) === String(ADMIN_ID) && msg.text.startsWith('/approve')) {
      const parts = msg.text.split(' ');
      const target = parts[1]; const pts = parseInt(parts[2]) || 0;
      if (target) { const u = getUser(target); u.points += pts; u.play_points += pts; await saveUser(target); bot.sendMessage(msg.chat.id, `Approved ${pts} to ${target}`); }
    }
  });
  console.log('Bot started');
}

app.listen(PORT, () => console.log(`Quiz running on ${PORT}`));
