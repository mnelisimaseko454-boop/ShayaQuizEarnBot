// SHAYA QUIZ BOT - FINAL - Daily 200 - Supabase Backup - No ID clash
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://shaya-quiz-earn-bot.onrender.com';
const QUIZ_WEBAPP_URL = WEBAPP_URL + '/quiz.html';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
const GROUP_URL = 'https://t.me/ShayaEarnNetwork';
const TOPUP_ACCOUNT = '1893275807';
const DAILY_POINTS = 200;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
let supabase = null;
try{ if(SUPABASE_URL && SUPABASE_KEY){ supabase = createClient(SUPABASE_URL, SUPABASE_KEY); console.log('Supabase connected - Quiz backup ON'); } }catch(e){ console.log('Supabase failed', e.message); }
async function sbUpsert(table, row){ if(!supabase) return; try{ await supabase.from(table).upsert(row); }catch(e){ console.log('sb upsert failed', e.message); } }
async function sbGetScore(user_id){
  if(!supabase) return null;
  try{ const {data} = await supabase.from('quiz_scores').select('*').eq('user_id', String(user_id)).single(); return data; }catch(e){ return null; }
}

const users = new Map();
const withdrawals = [];
const quizScores = new Map();

async function getUser(id){ return users.get(String(id)) || null; }
async function createUser(id, data){
  data = data || {}; const key = String(id);
  const u = { id: key, user_id: parseInt(id) || null, username: data.username || '', first_name: data.first_name || 'friend', name: data.first_name || 'friend', referrals: 0, pendingTopup: null, pendingWithdraw: null, referred_by: data.referred_by || null };
  users.set(key, u); return u;
}
async function getUserAsync(id, name, extra){
  extra = extra || {}; let u = await getUser(id);
  if(!u) u = await createUser(id, { first_name: name, name: name, referred_by: extra.referred_by });
  if(name){ u.name = name; u.first_name = name; } return u;
}
async function updateUser(id, patch){ let u = users.get(String(id)) || await getUser(id); if(!u) return null; Object.assign(u, patch); users.set(String(id), u); return u; }

let bot = null;
if(BOT_TOKEN){ try{ bot = new Telegraf(BOT_TOKEN); }catch(e){ console.log('Bot create failed', e.message); } }

function sendQuiz(req,res){
  let p1 = path.join(__dirname,'quiz.html'); let p2 = path.join(__dirname,'public','quiz.html');
  if(fs.existsSync(p1)) return res.sendFile(p1);
  if(fs.existsSync(p2)) return res.sendFile(p2);
  return res.status(404).send('quiz.html NOT FOUND - Upload quiz.html to ROOT next to index.js');
}
app.get('/', sendQuiz);
app.get('/quiz.html', sendQuiz);
app.get('/index.html', sendQuiz);
app.get('/health', (req,res)=>res.json({ok:true, bot:'Shaya Quiz Bot', daily: DAILY_POINTS, supabase: !!supabase}));

app.get('/api/quiz-load', async (req,res)=>{
  const user_id = String(req.query.user_id || '');
  let mem = quizScores.get(user_id);
  let sb = await sbGetScore(user_id);
  if(sb){
    const merged = { user_id, name: sb.name||mem?.name||'Player', points: sb.points||0, playPoints: sb.play_points||0, dailyPoints: sb.daily_points||0, qIndex: sb.q_index||0, correct: sb.correct||0, wrong: sb.wrong||0 };
    quizScores.set(user_id, merged); return res.json(merged);
  }
  if(mem) return res.json(mem);
  return res.json({ user_id, name:'Player', points:0, playPoints:0, dailyPoints:0, qIndex:0, correct:0, wrong:0 });
});

app.post('/api/quiz-sync', async (req,res)=>{
  const b = req.body || {};
  const row = { user_id:String(b.user_id), name:b.name||'Player', points:parseInt(b.points||0), play_points:parseInt(b.playPoints||0), daily_points:parseInt(b.dailyPoints||0), q_index:parseInt(b.qIndex||0), correct:parseInt(b.correct||0), wrong:parseInt(b.wrong||0), updated_at:new Date().toISOString() };
  quizScores.set(String(b.user_id), { user_id:row.user_id, name:row.name, points:row.points, playPoints:row.play_points, dailyPoints:row.daily_points, qIndex:row.q_index, correct:row.correct, wrong:row.wrong });
  await sbUpsert('quiz_scores', row);
  res.json({success:true});
});
app.get('/api/quiz-leaderboard', async (req,res)=>{
  if(supabase){ try{ const {data} = await supabase.from('quiz_scores').select('*').order('points',{ascending:false}).limit(20); if(data) return res.json(data.map(r=>({user_id:r.user_id,name:r.name,points:r.points,playPoints:r.play_points,dailyPoints:r.daily_points}))); }catch(e){} }
  res.json(Array.from(quizScores.values()).sort((a,b)=>b.points-a.points).slice(0,20));
});
app.post('/api/quiz-topup', async (req,res)=>{
  const b = req.body; let u = await getUserAsync(b.user_id, b.name);
  await updateUser(u.id, { pendingTopup:{ points:b.points, price:b.price, proof:b.proof||'', date:new Date().toISOString() } });
  if(ADMIN_ID && bot) await bot.telegram.sendMessage(ADMIN_ID, `🧠 QUIZ TOPUP - PLAY ONLY\nUser: ${u.name} ID:${u.id}\n${b.points} PLAY Points = R${b.price} - CANNOT WITHDRAW\nProof: ${b.proof}\nCapitec ${TOPUP_ACCOUNT}`, {reply_markup:{inline_keyboard:[[{text:'Approve Play Points',callback_data:'approve_topup_'+u.id+'_quiz_'+b.points}],[{text:'Reject',callback_data:'reject_topup_'+u.id}]]}}).catch(()=>{});
  res.json({msg:`Topup sent! ${b.points} PLAY Points = R${b.price}. PLAY ONLY - cannot withdraw.`});
});
app.post('/api/quiz-withdraw', async (req,res)=>{
  const b = req.body; const isData = String(b.method||'').includes('Data');
  if(isData){ if(b.points !== 5000) return res.status(400).json({error:'Data is fixed R5 = 5000 Win Points'}); }
  else { if(b.points < 20000) return res.status(400).json({error:'Min R20 = 20,000 Win Points'}); if(b.points > 100000) return res.status(400).json({error:'MAX R100 = 100,000 Win Points'}); }
  let u = await getUserAsync(b.user_id, b.name);
  const w = { id: Date.now(), user_id: parseInt(u.id)||u.id, userKey: String(u.id), username: u.username, first_name: u.first_name, method: 'Quiz WIN - '+b.method, wallet: b.wallet, amountCash: b.rand, amountLabel: `R${b.rand} - ${b.points} WIN Points ONLY`, status: 'pending', created_at: new Date().toISOString() };
  withdrawals.push(w);
  // FIXED: Do NOT send id - Supabase generates it (BY DEFAULT identity)
  if(supabase){ try{ await supabase.from('quiz_withdrawals').insert({ user_id:String(w.user_id), method:w.method, wallet:w.wallet, amount_cash:w.amountCash, amount_label:w.amountLabel, status:'pending', created_at:w.created_at }); }catch(e){ console.log('withdraw insert failed', e.message); } }
  if(ADMIN_ID && bot) await bot.telegram.sendMessage(ADMIN_ID, `🏆 QUIZ WITHDRAW - WIN ONLY\nUser: ${u.name} ID:${u.id}\n${b.points} WIN Points = R${b.rand}\nMethod: ${b.method}\nTo: ${b.wallet}`, {reply_markup:{inline_keyboard:[[{text:'Paid',callback_data:'approve_withdraw_'+u.id}],[{text:'Reject',callback_data:'reject_withdraw_'+u.id}]]}}).catch(()=>{});
  res.json({success:true});
});

if(bot){
  bot.start(async function(ctx){
    const user_id = ctx.from.id; const payload = ctx.startPayload || ''; let referred_by = null;
    if(payload.indexOf('ref_')===0) referred_by = payload.replace('ref_',''); else if(payload) referred_by = payload;
    let u = await getUser(user_id); if(!u) u = await createUser(user_id, { username: ctx.from.username||'', first_name: ctx.from.first_name||'', referred_by: referred_by?String(referred_by):null });
    await ctx.replyWithMarkdown(
`Welcome to *SHAYA QUIZ BOT* ${u.first_name}! 🧠\n\n*PLAY - WIN - WITHDRAW*\n\n🧠 *10000 Questions* • 70% HARDEST\n⏱️ *5 Seconds* Per Question - Answer FAST!\n🎬 *Ad After EVERY Question*\n📦 *5 Questions = 1 Round* - Press START Once\n\n*3 WALLETS:*\n🎁 *DAILY:* ${DAILY_POINTS} / Day FREE - NOT Withdrawable\n🎮 *PLAY:* Topup Only - NOT Withdrawable\n🏆 *WIN:* Withdrawable ONLY\n\n✅ *WIN:* +10 WIN • -10 Play, if none -10 Daily\n❌ *LOSE:* -10 Win, if none -10 Play, if none -10 Daily\n🛑 *No points in ALL 3 = Playing STOPS*\n\n*WITHDRAW WIN ONLY:*\n💸 Capitec / Airtime: Min *R20* • Max *R100*\n📱 Data: *R5 = 1GB TikTok 24h* - Fixed\n\n*TOPUP PLAY:*\n🏦 Capitec *${TOPUP_ACCOUNT}*\nRef: Your Name\n\nTap below to play! 👇`,
    {reply_markup:{inline_keyboard:[
      [{text:'🧠 PLAY QUIZ - START', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+user_id}}],
      [{text:'🏆 Leaderboard', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+user_id}}],
      [{text:'Join Shaya Earn Network', url: GROUP_URL}]
    ]}});
  });
  bot.command('balance', async function(ctx){
    let q = quizScores.get(String(ctx.from.id)) || await sbGetScore(ctx.from.id) || {points:0, play_points:0, daily_points:0};
    let win = q.points||0, play = q.playPoints||q.play_points||0, daily = q.dailyPoints||q.daily_points||0;
    await ctx.reply(`🧠 SHAYA QUIZ BALANCE\n\n🎁 Daily: ${daily} - NOT Withdrawable\n🎮 Play: ${play} - NOT Withdrawable\n🏆 Win: ${win} = R${(win/1000).toFixed(2)} - WITHDRAWABLE\n\nWithdraw WIN ONLY: Min R20 • Max R100\nData: R5 = 1GB TikTok 24h\nTopup Play: Capitec ${TOPUP_ACCOUNT}`, {reply_markup:{inline_keyboard:[[{text:'🧠 PLAY QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
  });
  bot.command('leaderboard', async function(ctx){
    let list = Array.from(quizScores.values()).sort((a,b)=>b.points-a.points).slice(0,10);
    if(!list.length) return ctx.reply('No scores yet. Be the first!', {reply_markup:{inline_keyboard:[[{text:'🧠 PLAY QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
    let txt = '🏆 SHAYA QUIZ LEADERBOARD - TOP 10 WIN POINTS\n\n'; list.forEach((p,i)=>{ txt += `${i+1}. ${p.name||'Player'} - ${p.points} Win = R${(p.points/1000).toFixed(2)} ${i===0?'👑':''}\n`; }); txt += '\nOnly WIN counts.';
    await ctx.reply(txt);
  });
  bot.command('withdraw', async function(ctx){ await ctx.reply(`💸 WITHDRAW - WIN POINTS ONLY\n\n1. Open Quiz Mini App\n2. Tap WITHDRAW WIN ONLY\n3. Capitec / Airtime Min R20 Max R100\n   Data Fixed R5 = 1GB TikTok 24h\n4. Enter Capitec / Phone\n\n⚠️ Daily + Play CANNOT be withdrawn.`, {reply_markup:{inline_keyboard:[[{text:'🧠 OPEN QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}}); });
  bot.command('topup', async function(ctx){ await ctx.reply(`🏦 TOPUP PLAY POINTS ONLY\n\n1. Send to Capitec: *${TOPUP_ACCOUNT}*\n2. Ref: Your Name\n3. In Quiz App → TOPUP PLAY → Paste EFT Proof\n4. Admin approves → Play Points added\n\n⚠️ Topup = PLAY ONLY. CANNOT be withdrawn.\n1000 Play Points = R1.00`, {reply_markup:{inline_keyboard:[[{text:'🧠 OPEN QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}}); });
  bot.command('help', async function(ctx){ await ctx.reply(`🧠 HOW SHAYA QUIZ WORKS\n\n1. Claim ${DAILY_POINTS} Daily Points FREE every day\n2. Press START QUIZ - PRESS ONCE\n3. Answer in 5 Seconds or lose points\n4. Watch Ad after EVERY question\n5. 5 Questions = 1 Round, then START again\n\n✅ WIN: +10 WIN • -10 Play, if none -10 Daily\n❌ LOSE: -10 Win, if none -10 Play, if none -10 Daily\n🛑 All 3 empty = Playing STOPS\n\nWithdraw WIN ONLY: Min R20 • Max R100\nData: R5 = 1GB TikTok 24h`, {reply_markup:{inline_keyboard:[[{text:'🧠 PLAY QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}}); });
  bot.command('approve', async function(ctx){
    if(ctx.from.id!==ADMIN_ID) return ctx.reply('Admin only');
    const parts = ctx.message.text.trim().split(/\s+/); const targetId = parts[1]; let pts = parseInt(parts[2])||0;
    if(!targetId || !pts) return ctx.reply('Usage: /approve <ID> <points>');
    let target = await getUser(targetId); if(!target) return ctx.reply('User not found: '+targetId);
    await updateUser(target.id, { pendingTopup: null });
    let q = quizScores.get(String(target.id)) || { user_id:String(target.id), name:target.name, points:0, playPoints:0, dailyPoints:0 };
    q.playPoints = (q.playPoints||0) + pts; quizScores.set(String(target.id), q);
    await sbUpsert('quiz_scores', { user_id:String(target.id), name:target.name, points:q.points, play_points:q.playPoints, daily_points:q.dailyPoints, updated_at:new Date().toISOString() });
    ctx.reply('Approved! +'+pts+' PLAY Points to '+target.name+' - PLAY ONLY');
    try{ const chatId = parseInt(target.id); if(chatId) await ctx.telegram.sendMessage(chatId, 'TOPUP APPROVED! +'+pts+' PLAY Points! PLAY ONLY - cannot withdraw.'); }catch(e){}
  });
  bot.on('callback_query', async function(ctx){
    const data = ctx.callbackQuery?.data || ''; const fromId = ctx.from?.id;
    if(data.includes('topup_')||data.includes('withdraw_')){ if(fromId!==ADMIN_ID){ try{ await ctx.answerCbQuery('Admin only'); }catch(e){} return; } }
    if(data.indexOf('approve_topup_')===0){
      const rest = data.replace('approve_topup_',''); const lastUnd = rest.lastIndexOf('_'); const userId = rest.slice(0,lastUnd); const packageId = rest.slice(lastUnd+1);
      const target = await getUser(userId); if(!target) return;
      let pts = 0; if(packageId.indexOf('quiz_')===0) pts = parseInt(packageId.replace('quiz_',''))||0; if(!pts && target.pendingTopup) pts = target.pendingTopup.points||0;
      await updateUser(target.id, { pendingTopup: null });
      let q = quizScores.get(String(target.id)) || { user_id:String(target.id), name:target.name, points:0, playPoints:0, dailyPoints:0 };
      q.playPoints = (q.playPoints||0) + pts; quizScores.set(String(target.id), q);
      await sbUpsert('quiz_scores', { user_id:String(target.id), name:target.name, points:q.points, play_points:q.playPoints, daily_points:q.dailyPoints, updated_at:new Date().toISOString() });
      try{ await ctx.answerCbQuery('Approved!'); await ctx.editMessageText('APPROVED - TOPUP\n\n'+target.name+' ID:'+target.id+'\n+'+pts+' PLAY Points - PLAY ONLY'); }catch(e){}
      try{ const chatId = parseInt(target.id); if(chatId) await ctx.telegram.sendMessage(chatId, 'TOPUP APPROVED! +'+pts+' PLAY Points! PLAY ONLY - cannot withdraw.'); }catch(e){}
      return;
    }
    if(data.indexOf('reject_topup_')===0){ const userId = data.replace('reject_topup_',''); const target = await getUser(userId); if(target) await updateUser(target.id, { pendingTopup: null }); try{ await ctx.answerCbQuery('Rejected'); await ctx.editMessageText('REJECTED - TOPUP\n\n'+(target?.name||'')+' ID:'+userId); }catch(e){} return; }
    if(data.indexOf('approve_withdraw_')===0){ const userId = data.replace('approve_withdraw_',''); try{ await ctx.answerCbQuery('Marked as Paid'); await ctx.editMessageText((ctx.callbackQuery.message?.text||'Withdraw')+'\n\nPAID - Admin confirmed'); }catch(e){} const w = withdrawals.find(x=>String(x.user_id)===String(userId) && x.status==='pending'); if(w){ w.status='paid'; if(supabase){ try{ await supabase.from('quiz_withdrawals').update({status:'paid'}).eq('user_id',String(w.user_id)).eq('status','pending'); }catch(e){} } } try{ const chatId = parseInt(userId); if(chatId) await ctx.telegram.sendMessage(chatId, 'Your withdraw has been PAID!'); }catch(e){} return; }
    if(data.indexOf('reject_withdraw_')===0){ const userId = data.replace('reject_withdraw_',''); try{ await ctx.answerCbQuery('Rejected'); await ctx.editMessageText('REJECTED - WITHDRAW ID:'+userId); }catch(e){} try{ const chatId = parseInt(userId); if(chatId) await ctx.telegram.sendMessage(chatId, 'Your withdraw was rejected.'); }catch(e){} return; }
  });
  bot.launch().then(()=>console.log('Shaya Quiz Bot launched')).catch(e=>console.log('Bot launch failed', e.message));
  process.once('SIGINT', ()=>bot.stop('SIGINT')); process.once('SIGTERM', ()=>bot.stop('SIGTERM'));
} else console.log('BOT_TOKEN not set');
app.listen(PORT, ()=>{ console.log('Shaya Quiz running on '+PORT); });
