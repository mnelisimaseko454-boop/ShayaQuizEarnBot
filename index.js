// ===== SHAYA QUIZ ONLY - ZONE 472905 =====
const ONCLICKA_ZONE_QUIZ = 472905;
const QUIZ_BANNER_SPOT = 6155495;
const QUIZ_POPUNDER_SPOT = 6155496;
const quizScores = new Map();
app.get('/quiz.html', (req,res)=>res.sendFile(path.join(__dirname,'quiz.html')));
app.get('/api/quiz-ads/config', (req,res)=>res.json({ onclicka_zone_quiz: ONCLICKA_ZONE_QUIZ, banner_spot: QUIZ_BANNER_SPOT, popunder_spot: QUIZ_POPUNDER_SPOT }));
app.post('/api/quiz-sync', async (req,res)=>{ const b=req.body||{}; quizScores.set(String(b.user_id), { user_id:String(b.user_id), name:b.name||'Player', points:parseInt(b.points||0), playPoints:parseInt(b.playPoints||0), dailyPoints:parseInt(b.dailyPoints||0) }); res.json({success:true}); });
app.get('/api/quiz-leaderboard', (req,res)=>res.json(Array.from(quizScores.values()).sort((a,b)=>b.points-a.points).slice(0,20)));
app.post('/api/quiz-topup', async (req,res)=>{ const b=req.body; let u = await getUserAsync(b.user_id, b.name); await updateUser(u.id, { pendingTopup:{ packageId:'quiz_play_'+b.points, coins:0, points:b.points, price:b.price, proof:b.proof||'', date:new Date().toISOString(), label:b.points+' PLAY Points (NOT withdrawable) - R'+b.price } }); if(ADMIN_ID && bot) await bot.telegram.sendMessage(ADMIN_ID, `🧠 QUIZ TOPUP - PLAY ONLY\nUser: ${u.name} ID:${u.id}\n${b.points} PLAY Points = R${b.price} - CANNOT WITHDRAW\nProof: ${b.proof}\nCapitec 1893275807`, {reply_markup:{inline_keyboard:[[{text:'Approve Play Points',callback_data:'approve_topup_'+u.id+'_quiz_'+b.points}],[{text:'Reject',callback_data:'reject_topup_'+u.id}]]}}).catch(()=>{}); res.json({msg:`Topup sent! ${b.points} PLAY Points = R${b.price}. PLAY ONLY.`}); });
app.post('/api/quiz-withdraw', async (req,res)=>{
  const b=req.body; const isData = String(b.method||'').includes('Data');
  if(isData){ if(b.points!==5000) return res.status(400).json({error:'Data is fixed R5 = 5000 Win Points'}); }
  else { if(b.points<20000) return res.status(400).json({error:'Min R20 = 20,000 Win Points'}); if(b.points>100000) return res.status(400).json({error:'MAX R100 = 100,000 Win Points'}); if(b.rand<20||b.rand>100) return res.status(400).json({error:'R20 - R100 only'}); }
  let u = await getUserAsync(b.user_id, b.name);
  const w={id:withdrawals.length+1, user_id:parseInt(u.id)||u.id, userKey:String(u.id), username:u.username, first_name:u.first_name, method:'Quiz WIN Points - '+b.method, wallet:b.wallet, detail:b.wallet, amountCash:b.rand, amountLabel:`R${b.rand} - ${b.points} WIN Points ONLY`, coinsUsed:0, need:0, region:u.region, vip_level:getVipName(u), status:'pending', created_at:new Date().toISOString()};
  withdrawals.push(w);
  if(ADMIN_ID && bot) await bot.telegram.sendMessage(ADMIN_ID, `🏆 QUIZ WITHDRAW - WIN ONLY\nUser: ${u.name} ID:${u.id}\n${b.points} WIN Points = R${b.rand}\nMethod: ${b.method}\nTo: ${b.wallet}`, {reply_markup:{inline_keyboard:[[{text:'Paid',callback_data:'approve_withdraw_'+u.id}],[{text:'Reject',callback_data:'reject_withdraw_'+u.id}]]}}).catch(()=>{});
  res.json({success:true});
});
