// ===== SHAYA QUIZ BOT - ONLY ONE index.js - QUIZ ONLY =====
// Bot: @ShayaQuizBot | OnclickA Zone 472905 | Banner 6155495 | Popunder 6155496
// Capitec 1893275807 | Daily 200 | Win ONLY withdraw Min R20 Max R100 | Data R5 = 1GB TikTok 24h
const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://shaya-watch-all.onrender.com';
const QUIZ_WEBAPP_URL = WEBAPP_URL + '/quiz.html';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
const GROUP_URL = 'https://t.me/ShayaEarnNetwork';
const TOPUP_ACCOUNT = '1893275807';

// ===== QUIZ ADS - 472905 ONLY =====
const ONCLICKA_ZONE_QUIZ = 472905;
const QUIZ_BANNER_SPOT = 6155495;
const QUIZ_POPUNDER_SPOT = 6155496;

// ===== IN-MEMORY DB (Quiz Only) =====
const users = new Map();
const withdrawals = [];
const quizScores = new Map();

function getVipName(u){ return 'FREE'; }
async function getUser(id){
  const key = String(id);
  if(users.has(key)) return users.get(key);
  return null;
}
async function createUser(id, data){
  data = data || {};
  const key = String(id);
  const u = { id: key, user_id: parseInt(id) || null, username: data.username || '', first_name: data.first_name || data.name || 'friend', name: data.first_name || data.name || 'friend', region: 'SA', currency: 'R', balance: 0, coins: 0, points: 0, level: 1, total_ads: 0, referrals: 0, total_earned: 0, pendingTopup: null, pendingWithdraw: null, referred_by: data.referred_by || null };
  users.set(key, u);
  if(data.referred_by && String(data.referred_by) !== key){
    let ref = await getUser(data.referred_by);
    if(!ref) ref = await createUser(data.referred_by, {});
    ref.referrals += 1;
  }
  return u;
}
async function getUserAsync(id, name, extra){
  extra = extra || {};
  let u = await getUser(id);
  if(!u) u = await createUser(id, { first_name: name, name: name, referred_by: extra.referred_by });
  if(name){ u.name = name; u.first_name = name; }
  return u;
}
async function updateUser(id, patch){
  let u = users.get(String(id)) || await getUser(id);
  if(!u) return null;
  Object.assign(u, patch); users.set(String(id), u); return u;
}
function parseTopupCallback(data, prefix){
  const rest = data.replace(prefix, '');
  const lastUnd = rest.lastIndexOf('_');
  if(lastUnd === -1) return { userId: rest, packageId: '' };
  return { userId: rest.slice(0, lastUnd), packageId: rest.slice(lastUnd+1) };
}

// ===== BOT =====
let bot = null;
if(BOT_TOKEN){ try{ bot = new Telegraf(BOT_TOKEN); console.log('Quiz Bot created'); }catch(e){ console.log('Bot create failed', e.message); } }

app.get('/health', (req,res)=>res.json({ok:true, bot:'Shaya Quiz Bot', zone: ONCLICKA_ZONE_QUIZ, time:new Date().toISOString()}));
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'quiz.html')));
app.get('/quiz.html', (req,res)=>res.sendFile(path.join(__dirname,'quiz.html')));
app.get('/api/quiz-ads/config', (req,res)=>res.json({ onclicka_zone_quiz: ONCLICKA_ZONE_QUIZ, banner_spot: QUIZ_BANNER_SPOT, popunder_spot: QUIZ_POPUNDER_SPOT }));

// ===== QUIZ API - 3 WALLETS =====
app.post('/api/quiz-sync', async (req,res)=>{
  const b = req.body || {};
  quizScores.set(String(b.user_id), { user_id:String(b.user_id), name:b.name||'Player', points:parseInt(b.points||0), playPoints:parseInt(b.playPoints||0), dailyPoints:parseInt(b.dailyPoints||0), qIndex:parseInt(b.qIndex||0), correct:parseInt(b.correct||0), wrong:parseInt(b.wrong||0) });
  res.json({success:true});
});
app.get('/api/quiz-leaderboard', (req,res)=>{
  res.json(Array.from(quizScores.values()).sort((a,b)=>b.points-a.points).slice(0,20));
});
app.post('/api/quiz-topup', async (req,res)=>{
  const b = req.body;
  let u = await getUserAsync(b.user_id, b.name);
  await updateUser(u.id, { pendingTopup:{ packageId:'quiz_play_'+b.points, coins:0, points:b.points, price:b.price, proof:b.proof||'', date:new Date().toISOString(), label:b.points+' PLAY Points (NOT withdrawable) - R'+b.price } });
  if(ADMIN_ID && bot) await bot.telegram.sendMessage(ADMIN_ID, `🧠 QUIZ TOPUP - PLAY ONLY\nUser: ${u.name} ID:${u.id}\n${b.points} PLAY Points = R${b.price} - CANNOT WITHDRAW\nProof: ${b.proof}\nCapitec ${TOPUP_ACCOUNT}`, {reply_markup:{inline_keyboard:[[{text:'Approve Play Points',callback_data:'approve_topup_'+u.id+'_quiz_'+b.points}],[{text:'Reject',callback_data:'reject_topup_'+u.id}]]}}).catch(()=>{});
  res.json({msg:`Topup sent! ${b.points} PLAY Points = R${b.price}. PLAY ONLY - cannot withdraw.`});
});
app.post('/api/quiz-withdraw', async (req,res)=>{
  const b = req.body;
  const isData = String(b.method||'').includes('Data');
  if(isData){ if(b.points !== 5000) return res.status(400).json({error:'Data is fixed R5 = 5000 Win Points'}); }
  else {
    if(b.points < 20000) return res.status(400).json({error:'Min R20 = 20,000 Win Points'});
    if(b.points > 100000) return res.status(400).json({error:'MAX R100 = 100,000 Win Points'});
    if(b.rand < 20 || b.rand > 100) return res.status(400).json({error:'R20 - R100 only'});
  }
  let u = await getUserAsync(b.user_id, b.name);
  const w = { id: withdrawals.length+1, user_id: parseInt(u.id)||u.id, userKey: String(u.id), username: u.username, first_name: u.first_name, method: 'Quiz WIN Points - '+b.method, wallet: b.wallet, detail: b.wallet, amountCash: b.rand, amountLabel: `R${b.rand} - ${b.points} WIN Points ONLY`, coinsUsed: 0, need: 0, region: u.region, vip_level: getVipName(u), status: 'pending', created_at: new Date().toISOString() };
  withdrawals.push(w);
  if(ADMIN_ID && bot) await bot.telegram.sendMessage(ADMIN_ID, `🏆 QUIZ WITHDRAW - WIN ONLY\nUser: ${u.name} ID:${u.id}\n${b.points} WIN Points = R${b.rand}\nMethod: ${b.method}\nTo: ${b.wallet}\n⚠️ Check: Daily/Topup NOT included`, {reply_markup:{inline_keyboard:[[{text:'Paid',callback_data:'approve_withdraw_'+u.id}],[{text:'Reject',callback_data:'reject_withdraw_'+u.id}]]}}).catch(()=>{});
  res.json({success:true});
});
app.get('/api/admin/pending', (req,res)=>res.json({ withdrawals: withdrawals.filter(w=>w.status==='pending') }));

// ===== BOT COMMANDS - QUIZ ONLY =====
if(bot){
  bot.start(async function(ctx){
    const user_id = ctx.from.id;
    const payload = ctx.startPayload || '';
    let referred_by = null;
    if(payload.indexOf('ref_')===0) referred_by = payload.replace('ref_','');
    else if(payload && (/^\d+$/.test(payload) || payload.indexOf('quiz_')===0)) referred_by = payload;
    let u = await getUser(user_id);
    if(!u) u = await createUser(user_id, { username: ctx.from.username||'', first_name: ctx.from.first_name||'', referred_by: referred_by?String(referred_by):null });
    await ctx.replyWithMarkdown(
`Welcome to *SHAYA QUIZ BOT* ${u.first_name}! 🧠

*PLAY - WIN - WITHDRAW*

🧠 *10000 Questions* • 70% HARDEST
⏱️ *5 Seconds* Per Question - Answer FAST!
🎬 *Ad After EVERY Question*
📦 *5 Questions = 1 Round* - Press START Once

*3 WALLETS:*
🎁 *DAILY:* 200 / Day FREE - NOT Withdrawable
🎮 *PLAY:* Topup Only - NOT Withdrawable
🏆 *WIN:* Withdrawable ONLY

✅ *WIN:* +10 WIN • -10 Play, if none -10 Daily
❌ *LOSE:* -10 Win, if none -10 Play, if none -10 Daily
🛑 *No points in ALL 3 = Playing STOPS*

*WITHDRAW WIN ONLY:*
💸 Capitec / Airtime: Min *R20* • Max *R100*
📱 Data: *R5 = 1GB TikTok 24h* - Fixed

*TOPUP PLAY:*
🏦 Capitec *${TOPUP_ACCOUNT}*
Ref: Your Name

Tap below to play! 👇`,
    {reply_markup:{inline_keyboard:[
      [{text:'🧠 PLAY QUIZ - START', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+user_id}}],
      [{text:'🏆 Leaderboard', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+user_id}}],
      [{text:'Join Shaya Earn Network', url: GROUP_URL}]
    ]}});
  });

  bot.command('balance', async function(ctx){
    let u = await getUser(ctx.from.id);
    if(!u) return ctx.reply('Send /start first');
    let q = quizScores.get(String(ctx.from.id)) || { points:0, playPoints:0, dailyPoints:0 };
    await ctx.reply(`🧠 SHAYA QUIZ BALANCE\n\n🎁 Daily: ${q.dailyPoints||0} - NOT Withdrawable\n🎮 Play: ${q.playPoints||0} - NOT Withdrawable\n🏆 Win: ${q.points||0} = R${((q.points||0)/1000).toFixed(2)} - WITHDRAWABLE\n\nWithdraw WIN ONLY: Min R20 • Max R100\nData: R5 = 1GB TikTok 24h\nTopup Play: Capitec ${TOPUP_ACCOUNT}`, {reply_markup:{inline_keyboard:[[{text:'🧠 PLAY QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
  });

  bot.command('leaderboard', async function(ctx){
    let list = Array.from(quizScores.values()).sort((a,b)=>b.points-a.points).slice(0,10);
    if(!list.length) return ctx.reply('No scores yet. Be the first! Play Quiz now.', {reply_markup:{inline_keyboard:[[{text:'🧠 PLAY QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
    let txt = '🏆 SHAYA QUIZ LEADERBOARD - TOP 10 WIN POINTS\n\n';
    list.forEach((p,i)=>{ txt += `${i+1}. ${p.name||'Player'} - ${p.points} Win = R${(p.points/1000).toFixed(2)} ${i===0?'👑':''}\n`; });
    txt += '\nOnly WIN counts. Daily / Play do NOT count.';
    await ctx.reply(txt);
  });

  bot.command('withdraw', async function(ctx){
    await ctx.reply(`💸 WITHDRAW - WIN POINTS ONLY\n\n1. Open Quiz Mini App\n2. Tap WITHDRAW WIN ONLY\n3. Choose:\n   - Capitec - Min R20 • Max R100\n   - Airtime - Min R20 • Max R100\n   - Data - Fixed R5 = 1GB TikTok 24h\n4. Enter Capitec / Phone\n5. Admin pays you\n\n⚠️ Daily + Play CANNOT be withdrawn.`, {reply_markup:{inline_keyboard:[[{text:'🧠 OPEN QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
  });

  bot.command('topup', async function(ctx){
    await ctx.reply(`🏦 TOPUP PLAY POINTS ONLY\n\n1. Send to Capitec: *${TOPUP_ACCOUNT}*\n2. Ref: Your Name\n3. In Quiz App → TOPUP PLAY → Paste EFT Proof\n4. Admin approves → Play Points added\n\n⚠️ Topup = PLAY ONLY. CANNOT be withdrawn.\n1000 Play Points = R1.00`, {reply_markup:{inline_keyboard:[[{text:'🧠 OPEN QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
  });

  bot.command('help', async function(ctx){
    await ctx.reply(`🧠 HOW SHAYA QUIZ WORKS\n\n1. Claim 100 Daily Points FREE every day\n2. Press START QUIZ - PRESS ONCE\n3. Answer in 5 Seconds or lose points\n4. Watch Ad after EVERY question\n5. 5 Questions = 1 Round, then START again\n\n✅ WIN: +10 WIN • -10 Play, if none -10 Daily\n❌ LOSE: -10 Win, if none -10 Play, if none -10 Daily\n🛑 All 3 empty = Playing STOPS\n\nWithdraw WIN ONLY: Min R20 • Max R100\nData: R5 = 1GB TikTok 24h`, {reply_markup:{inline_keyboard:[[{text:'🧠 PLAY QUIZ', web_app:{url: QUIZ_WEBAPP_URL + '?user_id='+ctx.from.id}}]]}});
  });

  bot.command('approve', async function(ctx){
    if(ctx.from.id!==ADMIN_ID) return ctx.reply('Admin only');
    const parts = ctx.message.text.trim().split(/\s+/);
    const targetId = parts[1]; let pkgId = parts[2];
    if(!targetId || !pkgId) return ctx.reply('Usage: /approve <ID> <points>\nExample:\n/approve quiz_abc123 10000');
    let target = await getUser(targetId);
    if(!target) return ctx.reply('User not found: '+targetId);
    const pts = parseInt(pkgId) || 0;
    await updateUser(target.id, { pendingTopup: null });
    // Add to quiz score playPoints
    let q = quizScores.get(String(target.id)) || { user_id:String(target.id), name:target.name, points:0, playPoints:0, dailyPoints:0 };
    q.playPoints = (q.playPoints||0) + pts;
    quizScores.set(String(target.id), q);
    ctx.reply('Approved! +'+pts+' PLAY Points to '+target.name+' (ID: '+target.id+') - PLAY ONLY, cannot withdraw.');
    try{ const chatId = parseInt(target.id); if(chatId) await ctx.telegram.sendMessage(chatId, 'TOPUP APPROVED! +'+pts+' PLAY Points! PLAY ONLY - cannot withdraw.'); }catch(e){}
  });

  bot.command('pending', async function(ctx){
    if(ctx.from.id!==ADMIN_ID) return ctx.reply('Admin only');
    let pendingList = [];
    for(let kv of users){ const u = kv[1]; if(u.pendingTopup) pendingList.push({id:u.id, name:u.name||'friend', username:u.username||'', pending:u.pendingTopup}); }
    if(pendingList.length===0) return ctx.reply('No pending topups. All clear!');
    let txt = 'PENDING TOPUPS ('+pendingList.length+')\n\n';
    pendingList.forEach((p,i)=>{ txt += (i+1)+'. '+p.name+' ID:'+p.id+'\n   '+p.pending.points+' PLAY Points - R'+p.pending.price+'\n   Proof: '+p.pending.proof+'\n\n'; });
    txt += '\nApprove with: /approve <ID> <points>';
    await ctx.reply(txt);
  });

  bot.on('callback_query', async function(ctx){
    const data = ctx.callbackQuery && ctx.callbackQuery.data || '';
    const fromId = ctx.from && ctx.from.id;
    if(data.indexOf('approve_topup_')===0 || data.indexOf('reject_topup_')===0 || data.indexOf('approve_withdraw_')===0 || data.indexOf('reject_withdraw_')===0){
      if(fromId!==ADMIN_ID){ try{ await ctx.answerCbQuery('Admin only'); }catch(e){} return; }
    }
    if(data.indexOf('approve_topup_')===0){
      const parsed = parseTopupCallback(data, 'approve_topup_');
      const userId = parsed.userId; const packageId = parsed.packageId;
      const target = await getUser(userId);
      if(!target){ try{ await ctx.answerCbQuery('User not found'); }catch(e){} return; }
      // packageId is like quiz_10000 -> points = 10000
      let pts = 0;
      if(packageId.indexOf('quiz_')===0) pts = parseInt(packageId.replace('quiz_','')) || 0;
      if(!pts && target.pendingTopup) pts = target.pendingTopup.points || 0;
      await updateUser(target.id, { pendingTopup: null });
      let q = quizScores.get(String(target.id)) || { user_id:String(target.id), name:target.name, points:0, playPoints:0, dailyPoints:0 };
      q.playPoints = (q.playPoints||0) + pts;
      quizScores.set(String(target.id), q);
      try{ await ctx.answerCbQuery('Approved!'); }catch(e){}
      try{ await ctx.editMessageText('APPROVED - TOPUP\n\n'+target.name+' ID:'+target.id+'\n+'+pts+' PLAY Points - PLAY ONLY\nPaid via Capitec '+TOPUP_ACCOUNT); }catch(e){}
      try{ const chatId = parseInt(target.id); if(chatId) await ctx.telegram.sendMessage(chatId, 'TOPUP APPROVED! +'+pts+' PLAY Points! PLAY ONLY - cannot withdraw.'); }catch(e){}
      return;
    }
    if(data.indexOf('reject_topup_')===0){
      const userId = data.replace('reject_topup_','');
      const target = await getUser(userId);
      if(target) await updateUser(target.id, { pendingTopup: null });
      try{ await ctx.answerCbQuery('Rejected'); }catch(e){}
      try{ await ctx.editMessageText('REJECTED - TOPUP\n\n'+(target && target.name || '')+' ID:'+userId+'\nReason: No payment found in Capitec '+TOPUP_ACCOUNT); }catch(e){}
      return;
    }
    if(data.indexOf('approve_withdraw_')===0){
      const userId = data.replace('approve_withdraw_','');
      try{ await ctx.answerCbQuery('Marked as Paid'); }catch(e){}
      try{ await ctx.editMessageText((ctx.callbackQuery.message && ctx.callbackQuery.message.text || 'Withdraw') + '\n\nPAID - Admin confirmed'); }catch(e){}
      const target = await getUser(userId);
      if(target) await updateUser(target.id, { pendingWithdraw: null });
      try{ const chatId = parseInt(userId); if(chatId) await ctx.telegram.sendMessage(chatId, 'Your withdraw has been PAID!'); }catch(e){}
      const w = withdrawals.find(x=>String(x.user_id)===String(userId) && x.status==='pending');
      if(w) w.status = 'paid';
      return;
    }
    if(data.indexOf('reject_withdraw_')===0){
      const userId = data.replace('reject_withdraw_','');
      const target = await getUser(userId);
      if(target) await updateUser(target.id, { pendingWithdraw: null });
      try{ await ctx.answerCbQuery('Rejected'); }catch(e){}
      try{ await ctx.editMessageText('REJECTED - WITHDRAW\n\n'+(target && target.name || '')+' ID:'+userId); }catch(e){}
      try{ const chatId = parseInt(userId); if(chatId) await ctx.telegram.sendMessage(chatId, 'Your withdraw was rejected.'); }catch(e){}
      return;
    }
  });

  bot.launch().then(()=>console.log('Shaya Quiz Bot launched - Zone 472905')).catch(e=>console.log('Bot launch failed', e.message));
  process.once('SIGINT', ()=>bot.stop('SIGINT')); process.once('SIGTERM', ()=>bot.stop('SIGTERM'));
} else console.log('BOT_TOKEN not set - bot disabled, API still works');

app.listen(PORT, ()=>{ console.log('Shaya Quiz running on '+PORT); console.log('WebApp: '+QUIZ_WEBAPP_URL); console.log('Ads: OnclickA Quiz '+ONCLICKA_ZONE_QUIZ); });
