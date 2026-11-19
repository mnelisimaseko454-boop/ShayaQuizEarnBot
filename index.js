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

if (!TOKEN) console.log('⚠️ BOT_TOKEN missing in Render Env');
const bot = TOKEN ? new TelegramBot(TOKEN, { polling: true }) : null;

// --- In-memory store (use DB in production for persistence) ---
let users = {}; // user_id -> { name, points, playPoints, dailyPoints, qIndex, correct, wrong }
let withdraws = [];
let topups = [];

function getUser(id, name){
  if(!users[id]) users[id] = { name: name||'Player', points:0, playPoints:0, dailyPoints:0, qIndex:0, correct:0, wrong:0 };
  if(name) users[id].name = name;
  return users[id];
}

// --- Quiz API used by quiz.html ---
app.post('/api/quiz-sync', (req,res)=>{
  const { user_id, name, points, playPoints, dailyPoints, qIndex, correct, wrong } = req.body||{};
  if(!user_id) return res.json({ok:false});
  let u = getUser(String(user_id), name);
  if(points!==undefined) u.points = points;
  if(playPoints!==undefined) u.playPoints = playPoints;
  if(dailyPoints!==undefined) u.dailyPoints = dailyPoints;
  if(qIndex!==undefined) u.qIndex = qIndex;
  if(correct!==undefined) u.correct = correct;
  if(wrong!==undefined) u.wrong = wrong;
  res.json({ok:true, user:u});
});

app.get('/api/quiz-load', (req,res)=>{
  const u = getUser(String(req.query.user_id||''), '');
  res.json(u);
});

app.get('/api/quiz-leaderboard', (req,res)=>{
  let list = Object.entries(users).map(([id,u])=>({ user_id:id, name:u.name, points:u.points||0 })).sort((a,b)=>b.points-a.points).slice(0,20);
  res.json(list);
});

app.post('/api/quiz-withdraw', (req,res)=>{
  const { user_id, name, method, wallet, rand, points } = req.body||{};
  if(!user_id || !wallet) return res.json({error:'Missing wallet'});
  let u = getUser(String(user_id), name);
  let pts = Number(points)||0;
  if(method && method.includes('Data')){ pts = 5000; rand = 5; }
  else { if(rand < 20 || rand > 100) return res.json({error:'R20 - R100 only'}); pts = rand*1000; }
  if(u.points < pts) return res.json({error:'Not enough WIN Points'});
  // Do NOT deduct here - quiz.html deducts after success. We just log.
  withdraws.push({ user_id:String(user_id), name:u.name, method, wallet, rand, points:pts, time:new Date().toISOString() });
  if(bot){
    bot.sendMessage(ADMIN_ID, `💸 NEW WITHDRAW - QUIZ\n👤 ${u.name} (${user_id})\n💰 R${rand} = ${pts} WIN\n🏦 ${method} - ${wallet}`).catch(()=>{});
  }
  res.json({ok:true});
});

app.post('/api/quiz-topup', (req,res)=>{
  const { user_id, name, points, price, proof } = req.body||{};
  if(!proof) return res.json({msg:'Paste proof first'});
  topups.push({ user_id:String(user_id), name:name||'Player', points, price, proof, time:new Date().toISOString() });
  if(bot){
    bot.sendMessage(ADMIN_ID, `🏦 NEW TOPUP - QUIZ\n👤 ${name} (${user_id})\n💰 R${price} = ${points} PLAY\n🧾 Proof: ${proof}\n\nApprove with: /approve ${user_id} ${points}`).catch(()=>{});
  }
  res.json({msg:'Topup proof sent! Admin will approve and add your PLAY points.'});
});

// --- Bot ---
if(bot){
  bot.onText(/\/start/, (msg)=>{
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = msg.from.first_name||'Player';
    getUser(String(userId), name);
    bot.sendMessage(chatId, `🧠 Welcome to SHAYA QUIZ BOT, ${name}!\n\n🎁 Daily 200 FREE\n🎮 Play - Win - Withdraw\n🏆 Win R20 - R100\n💸 Data R5 = 1GB TikTok 24h\n\nPress PLAY below to start!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text:'🧠 PLAY QUIZ - WIN CASH', web_app:{ url: QUIZ_URL + '?user_id=' + userId } }],
          [{ text:'📢 Join Shaya Earn Network', url:'https://t.me/ShayaEarnNetwork' }]
        ]
      }
    });
  });

  bot.onText(/\/approve (\d+) (\d+)/, async (msg, match)=>{
    if(String(msg.from.id) !== String(ADMIN_ID)) return;
    const target = match[1]; const pts = parseInt(match[2]);
    let u = getUser(target, '');
    u.playPoints += pts;
    bot.sendMessage(msg.chat.id, `✅ Approved ${pts} PLAY to ${u.name} (${target}). New PLAY: ${u.playPoints}`);
    try{ await bot.sendMessage(target, `✅ TOPUP APPROVED! +${pts} PLAY points added. Go play Quiz now!`); }catch(e){}
  });

  bot.onText(/\/balance/, (msg)=>{
    let u = getUser(String(msg.from.id), msg.from.first_name);
    bot.sendMessage(msg.chat.id, `💰 Your Balance:\n🎁 Daily: ${u.dailyPoints}\n🎮 Play: ${u.playPoints}\n🏆 Win: ${u.points} = R${(u.points/1000).toFixed(2)}`);
  });

  bot.on('polling_error', (e)=> console.log('Polling:', e.message));
}

app.get('/', (req,res)=> res.send('SHAYA QUIZ BOT LIVE - ' + QUIZ_URL));
app.get('/health', (req,res)=> res.json({ok:true, quiz:QUIZ_URL, spot:'6155603'}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Live on', PORT, 'Quiz:', QUIZ_URL));
