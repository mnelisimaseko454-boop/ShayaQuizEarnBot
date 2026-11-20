const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || '7860630273';
const DOMAIN = 'https://shayaquizearnbot.onrender.com';
const QUIZ_URL = DOMAIN + '/quiz.html';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const bot = TOKEN ? new TelegramBot(TOKEN, { polling: true }) : null;

async function sb(table, method, body, query=''){
  if(!SUPABASE_URL || !SUPABASE_KEY) return null;
  try{
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method, headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: body ? JSON.stringify(body) : undefined
    });
    const txt = await r.text();
    try{ return JSON.parse(txt); }catch(e){ return txt; }
  }catch(e){ console.log('Supabase error', e.message); return null; }
}
let memUsers = {};
let linkCodes = {}; // SYNC: code -> { telegramId, expires }
async function getUserFromDB(id, name){
  if(SUPABASE_URL && SUPABASE_KEY){
    const rows = await sb('quiz_users','GET',null,`?user_id=eq.${encodeURIComponent(id)}&select=*`);
    if(Array.isArray(rows) && rows.length>0){
      let u = rows[0];
      return { user_id:id, name:u.name||name||'Player', points:u.points||0, playPoints:u.play_points||0, dailyPoints:u.daily_points||0, qIndex:u.q_index||0, correct:u.correct||0, wrong:u.wrong||0 };
    }
    await sb('quiz_users','POST', { user_id:String(id), name:name||'Player', points:0, play_points:0, daily_points:0, q_index:0, correct:0, wrong:0 });
    return { user_id:String(id), name:name||'Player', points:0, playPoints:0, dailyPoints:0, qIndex:0, correct:0, wrong:0 };
  }
  if(!memUsers[id]) memUsers[id] = { user_id:String(id), name:name||'Player', points:0, playPoints:0, dailyPoints:0, qIndex:0, correct:0, wrong:0 };
  if(name) memUsers[id].name = name;
  return memUsers[id];
}
async function saveUserToDB(u){
  if(SUPABASE_URL && SUPABASE_KEY){
    await sb('quiz_users','PATCH', { name:u.name, points:u.points, play_points:u.playPoints, daily_points:u.dailyPoints, q_index:u.qIndex, correct:u.correct, wrong:u.wrong, updated_at:new Date().toISOString() }, `?user_id=eq.${encodeURIComponent(u.user_id)}`);
  } else memUsers[u.user_id] = u;
}
async function approveTopup(adminChatId, targetId, pts, topupId){
  let u = await getUserFromDB(String(targetId), '');
  u.playPoints += pts;
  await saveUserToDB(u);
  if(SUPABASE_URL && SUPABASE_KEY && topupId) await sb('quiz_topups','PATCH', { status:'approved' }, `?id=eq.${topupId}`);
  if(bot && adminChatId) bot.sendMessage(adminChatId, `✅ APPROVED\n👤 ${u.name} (${targetId})\n💰 +${pts} PLAY\n🎮 New PLAY: ${u.playPoints}`).catch(()=>{});
  try{ await bot.sendMessage(String(targetId), `✅ TOPUP APPROVED! +${pts} PLAY\n🎮 New PLAY: ${u.playPoints}\nCheck Bot AND Browser - both synced now.`); }catch(e){}
  return u;
}
// ===== SYNC BETWEEN BOT AND BROWSER =====
// Bot creates code, Browser claims it -> Browser becomes same Telegram ID
app.post('/api/link-create', async (req,res)=>{
  const { user_id } = req.body||{};
  if(!user_id) return res.json({error:'No user_id'});
  const code = String(Math.floor(100000+Math.random()*899999));
  linkCodes[code] = { telegramId: String(user_id), expires: Date.now()+10*60*1000 };
  // Also save to Supabase if available so it survives restart
  if(SUPABASE_URL && SUPABASE_KEY) await sb('quiz_links','POST', { code, user_id:String(user_id), expires_at:new Date(Date.now()+10*60*1000).toISOString() });
  res.json({ok:true, code});
});
app.post('/api/link-claim', async (req,res)=>{
  const { code, browser_id } = req.body||{};
  if(!code) return res.json({error:'Enter code'});
  let entry = linkCodes[String(code).trim()];
  // Try Supabase if not in memory (Render restarted)
  if(!entry && SUPABASE_URL && SUPABASE_KEY){
    const rows = await sb('quiz_links','GET',null,`?code=eq.${encodeURIComponent(String(code).trim())}&select=*`);
    if(Array.isArray(rows) && rows.length>0) entry = { telegramId: rows[0].user_id, expires: new Date(rows[0].expires_at).getTime() };
  }
  if(!entry) return res.json({error:'Code not found. In Bot send /link again.'});
  if(Date.now() > entry.expires) return res.json({error:'Code expired (10 min). Send /link again.'});
  // SYNC: Merge browser guest balance into Telegram account, then browser uses Telegram ID
  let telegramUser = await getUserFromDB(entry.telegramId, '');
  let browserUser = await getUserFromDB(String(browser_id||''), '');
  // Keep the HIGHER of each - so nothing is lost in either place
  telegramUser.points = Math.max(telegramUser.points, browserUser.points);
  telegramUser.playPoints = Math.max(telegramUser.playPoints, browserUser.playPoints);
  telegramUser.dailyPoints = Math.max(telegramUser.dailyPoints, browserUser.dailyPoints);
  telegramUser.qIndex = Math.max(telegramUser.qIndex, browserUser.qIndex);
  await saveUserToDB(telegramUser);
  delete linkCodes[String(code).trim()];
  if(SUPABASE_URL && SUPABASE_KEY) await sb('quiz_links','DELETE',null,`?code=eq.${encodeURIComponent(String(code).trim())}`);
  res.json({ok:true, telegramId: entry.telegramId, user: telegramUser});
});
app.post('/api/quiz-sync', async (req,res)=>{
  const { user_id, name, points, playPoints, dailyPoints, qIndex, correct, wrong } = req.body||{};
  if(!user_id) return res.json({ok:false});
  let server = await getUserFromDB(String(user_id), name);
  let u = { ...server };
  if(points!==undefined) u.points = (server.points - points > 50) ? server.points : points;
  if(playPoints!==undefined) u.playPoints = (server.playPoints - playPoints > 50) ? server.playPoints : playPoints;
  if(dailyPoints!==undefined) u.dailyPoints = (server.dailyPoints - dailyPoints > 50) ? server.dailyPoints : dailyPoints;
  if(qIndex!==undefined) u.qIndex = Math.max(u.qIndex, qIndex);
  if(correct!==undefined) u.correct = Math.max(u.correct, correct);
  if(wrong!==undefined) u.wrong = Math.max(u.wrong, wrong);
  if(name) u.name = name;
  await saveUserToDB(u);
  res.json({ok:true, user:u, corrected:(u.points!==points || u.playPoints!==playPoints || u.dailyPoints!==dailyPoints)});
});
app.get('/api/quiz-load', async (req,res)=>{ res.json(await getUserFromDB(String(req.query.user_id||''), '')); });
app.get('/api/quiz-leaderboard', async (req,res)=>{
  if(SUPABASE_URL && SUPABASE_KEY){
    const rows = await sb('quiz_users','GET',null,`?select=user_id,name,points&order=points.desc&limit=20`);
    if(Array.isArray(rows)) return res.json(rows.map(r=>({user_id:r.user_id, name:r.name, points:r.points})));
  }
  res.json(Object.values(memUsers).map(u=>({user_id:u.user_id, name:u.name, points:u.points})).sort((a,b)=>b.points-a.points).slice(0,20));
});
app.post('/api/quiz-withdraw', async (req,res)=>{
  const { user_id, name, method, wallet, rand, points } = req.body||{};
  if(!user_id || !wallet) return res.json({error:'Missing wallet'});
  let u = await getUserFromDB(String(user_id), name);
  let r = Number(rand)||0; let pts = Number(points)||0;
  if(method && method.includes('Data')){ r=5; pts=5000; } else { if(r<20 || r>100) return res.json({error:'R20 - R100 only'}); pts = r*1000; }
  if(u.points < pts) return res.json({error:'Not enough WIN Points'});
  u.points -= pts; await saveUserToDB(u);
  if(SUPABASE_URL && SUPABASE_KEY) await sb('quiz_withdraws','POST', { user_id:String(user_id), name:u.name, method, wallet, rand:r, points:pts, status:'pending' });
  if(bot) bot.sendMessage(ADMIN_ID, `💸 NEW WITHDRAW - QUIZ\n👤 ${u.name} (${user_id})\n💰 R${r} = ${pts} WIN\n🏦 ${method} - ${wallet}`, {
    reply_markup: { inline_keyboard: [[{ text:'✅ PAID', callback_data:`withdraw_paid:${user_id}:${pts}` }],[{ text:'❌ REJECT', callback_data:`withdraw_reject:${user_id}:${pts}` }]] }
  }).catch(()=>{});
  res.json({ok:true, remaining:u.points});
});
app.post('/api/quiz-topup', async (req,res)=>{
  const { user_id, name, points, price, proof } = req.body||{};
  if(!proof) return res.json({msg:'Paste proof first'});
  let topupId = null;
  if(SUPABASE_URL && SUPABASE_KEY){
    const created = await sb('quiz_topups','POST', { user_id:String(user_id), name:name||'Player', points, price, proof, status:'pending' });
    if(Array.isArray(created) && created[0]) topupId = created[0].id;
  }
  if(bot) bot.sendMessage(ADMIN_ID, `🏦 NEW TOPUP - QUIZ\n👤 ${name} (${user_id})\n💰 R${price} = ${points} PLAY\n🧾 Proof: ${proof}`, {
    reply_markup: { inline_keyboard: [[{ text:`✅ APPROVE +${points} PLAY`, callback_data:`topup_approve:${user_id}:${points}:${topupId||0}` }],[{ text:'❌ REJECT', callback_data:`topup_reject:${user_id}:${points}:${topupId||0}` }]] }
  }).catch(()=>{});
  res.json({msg:'Topup proof sent! Admin will approve.'});
});
if(bot){
  bot.onText(/\/start/, async (msg)=>{
    const userId = String(msg.from.id); const name = msg.from.first_name||'Player';
    await getUserFromDB(userId, name);
    bot.sendMessage(msg.chat.id, `🧠 Welcome to SHAYA QUIZ BOT, ${name}!\n\n🎁 Daily 200 FREE\n🎮 Play - Win - Withdraw\n🏆 Win R20 - R100\n\nPress PLAY below!`, {
      reply_markup: { inline_keyboard: [[{ text:'🧠 PLAY QUIZ - WIN CASH', web_app:{ url: QUIZ_URL + '?user_id=' + userId } }],[{ text:'📢 Join Shaya Earn Network', url:'https://t.me/ShayaEarnNetwork' }]] }
    });
  });
  // ===== SYNC COMMAND =====
  bot.onText(/\/link/, async (msg)=>{
    const userId = String(msg.from.id);
    const code = String(Math.floor(100000+Math.random()*899999));
    linkCodes[code] = { telegramId: userId, expires: Date.now()+10*60*1000 };
    if(SUPABASE_URL && SUPABASE_KEY) await sb('quiz_links','POST', { code, user_id:userId, expires_at:new Date(Date.now()+10*60*1000).toISOString() });
    bot.sendMessage(msg.chat.id, `🔗 SYNC BOT ↔ BROWSER\n\nYour Code: *${code}*\nValid for 10 minutes.\n\nIn Chrome Browser, open Quiz and type this code in the 🔗 SYNC box and press SYNC.\nAfter that, Bot and Browser share ONE balance.`, { parse_mode:'Markdown' });
  });
  bot.onText(/\/approve (\d+) (\d+)/, async (msg, match)=>{ if(String(msg.from.id)!==String(ADMIN_ID)) return; await approveTopup(msg.chat.id, match[1], parseInt(match[2]), null); });
  bot.onText(/^\/approve$/, async (msg)=>{ if(String(msg.from.id)!==String(ADMIN_ID)) return; bot.sendMessage(msg.chat.id, `⚠️ Use the ✅ APPROVE button, OR type:\n/approve 1159481047 100000`); });
  bot.on('callback_query', async (q)=>{
    try{
      const data=q.data||''; if(String(q.from.id)!==String(ADMIN_ID)){ bot.answerCallbackQuery(q.id,{text:'Only admin',show_alert:true}).catch(()=>{}); return; }
      if(data.startsWith('topup_approve:')){
        const p=data.split(':'); await approveTopup(q.message.chat.id, p[1], parseInt(p[2]), p[3]==='0'?null:p[3]);
        try{ await bot.editMessageText(`✅ APPROVED\n👤 ${p[1]}\n💰 +${p[2]} PLAY added`, {chat_id:q.message.chat.id, message_id:q.message.message_id}); }catch(e){}
        bot.answerCallbackQuery(q.id,{text:'✅ Approved!'}).catch(()=>{});
      }
      if(data.startsWith('topup_reject:')){
        const p=data.split(':'); if(SUPABASE_URL && SUPABASE_KEY && p[3]!=='0') await sb('quiz_topups','PATCH',{status:'rejected'},`?id=eq.${p[3]}`);
        try{ await bot.editMessageText(`❌ REJECTED\n👤 ${p[1]}`, {chat_id:q.message.chat.id, message_id:q.message.message_id}); }catch(e){}
        try{ await bot.sendMessage(String(p[1]), `❌ Your topup was REJECTED.`); }catch(e){}
        bot.answerCallbackQuery(q.id,{text:'Rejected'}).catch(()=>{});
      }
      if(data.startsWith('withdraw_paid:')){ try{ await bot.editMessageText(`✅ WITHDRAW PAID`, {chat_id:q.message.chat.id, message_id:q.message.message_id}); }catch(e){} bot.answerCallbackQuery(q.id,{text:'Marked Paid'}).catch(()=>{}); }
      if(data.startsWith('withdraw_reject:')){ try{ await bot.editMessageText(`❌ WITHDRAW REJECTED`, {chat_id:q.message.chat.id, message_id:q.message.message_id}); }catch(e){} bot.answerCallbackQuery(q.id,{text:'Rejected'}).catch(()=>{}); }
    }catch(e){ console.log('callback error', e.message); }
  });
  bot.onText(/\/balance/, async (msg)=>{
    let u = await getUserFromDB(String(msg.from.id), msg.from.first_name);
    bot.sendMessage(msg.chat.id, `💰 TRUE Balance (Supabase - Synced):\n🎁 Daily: ${u.dailyPoints}\n🎮 Play: ${u.playPoints}\n🏆 Win: ${u.points} = R${(u.points/1000).toFixed(2)}\n\nBrowser? Send /link and sync it.`);
  });
  bot.on('polling_error', (e)=> console.log('Polling:', e.message));
}
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'quiz.html')));
app.get('/health', (req,res)=> res.json({ok:true, supabase: !!SUPABASE_URL}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Live on', PORT, 'Supabase:', !!SUPABASE_URL));
