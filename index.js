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
// SHAYA WATCH STYLE: One user = One Telegram ID. No guest. No link code.
async function getUserFromDB(id, name){
  id = String(id);
  if(SUPABASE_URL && SUPABASE_KEY){
    const rows = await sb('quiz_users','GET',null,`?user_id=eq.${encodeURIComponent(id)}&select=*`);
    if(Array.isArray(rows) && rows.length>0){
      let u = rows[0];
      return { user_id:id, name:u.name||name||'Player', points:u.points||0, playPoints:u.play_points||0, dailyPoints:u.daily_points||0, qIndex:u.q_index||0, correct:u.correct||0, wrong:u.wrong||0 };
    }
    await sb('quiz_users','POST', { user_id:id, name:name||'Player', points:0, play_points:0, daily_points:0, q_index:0, correct:0, wrong:0 });
    return { user_id:id, name:name||'Player', points:0, playPoints:0, dailyPoints:0, qIndex:0, correct:0, wrong:0 };
  }
  if(!memUsers[id]) memUsers[id] = { user_id:id, name:name||'Player', points:0, playPoints:0, dailyPoints:0, qIndex:0, correct:0, wrong:0 };
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
  try{ await bot.sendMessage(String(targetId), `✅ TOPUP APPROVED! +${pts} PLAY\n🎮 New PLAY: ${u.playPoints}\nOpen Quiz in Telegram - it auto-updates, no Refresh.`); }catch(e){}
  return u;
}
// WATCH STYLE SYNC: Server is truth. Client just sends what it did, server saves it.
app.post('/api/quiz-sync', async (req,res)=>{
  const { user_id, name, points, playPoints, dailyPoints, qIndex, correct, wrong } = req.body||{};
  if(!user_id || String(user_id).startsWith('guest_')) return res.json({ok:false, error:'Guest not allowed - open via Telegram'});
  let u = await getUserFromDB(String(user_id), name);
  // Direct save like Watch - no stale-wipe logic needed because there is only ONE ID now
  if(points!==undefined) u.points = points;
  if(playPoints!==undefined) u.playPoints = playPoints;
  if(dailyPoints!==undefined) u.dailyPoints = dailyPoints;
  if(qIndex!==undefined) u.qIndex = qIndex;
  if(correct!==undefined) u.correct = correct;
  if(wrong!==undefined) u.wrong = wrong;
  if(name) u.name = name;
  await saveUserToDB(u);
  res.json({ok:true, user:u});
});
app.get('/api/quiz-load', async (req,res)=>{
  const id = String(req.query.user_id||'');
  if(!id || id.startsWith('guest_')) return res.json({error:'Guest not allowed'});
  res.json(await getUserFromDB(id, ''));
});
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
      reply_markup: { inline_keyboard: [[{ text:'🧠 PLAY QUIZ - WIN CASH', web_app:{ url: QUIZ_URL } }],[{ text:'📢 Join Shaya Earn Network', url:'https://t.me/ShayaEarnNetwork' }]] }
    });
  });
  bot.onText(/\/approve (\d+) (\d+)/, async (msg, match)=>{ if(String(msg.from.id)!==String(ADMIN_ID)) return; await approveTopup(msg.chat.id, match[1], parseInt(match[2]), null); });
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
    bot.sendMessage(msg.chat.id, `💰 TRUE Balance (Supabase):\n🎁 Daily: ${u.dailyPoints}\n🎮 Play: ${u.playPoints}\n🏆 Win: ${u.points} = R${(u.points/1000).toFixed(2)}`);
  });
  bot.on('polling_error', (e)=> console.log('Polling:', e.message));
}
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'quiz.html')));
app.get('/health', (req,res)=> res.json({ok:true, supabase: !!SUPABASE_URL}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Live on', PORT, 'Supabase:', !!SUPABASE_URL));
