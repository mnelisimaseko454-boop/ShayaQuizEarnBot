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

// --- HOMEPAGE FIX ONLY - / shows quiz.html ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'quiz.html'));
});

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
    daily_points: Math.max(oldU.daily_points || 0, new
