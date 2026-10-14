// Explicit live test: only synthetic TEST WEB menus/customers, no actual payments.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {fixtures}=require('./audit-customer-session.cjs');
const core=require('../views/js/settlement-core');
const site='https://slot-betting-app.vercel.app';
const output='outputs/test-web-that';fs.mkdirSync(output,{recursive:true});
const plans=[['split3',['mayne','lan anh','ngọc']],['solo',['Kiều']],['split2',['kiều','win']],['split3',['mayne','bàn tay vàng','kiều']],['solo',['kiều']],['split2',['kiều','lan anh']]];
const buyer=name=>'TEST WEB · '+name;
async function request(route,body,method){const response=await fetch(site+'/api'+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(45000)});const data=await response.json();return {status:response.status,...data};}
async function api(route,body,method){const result=await request(route,body,method);assert.equal(result.success,true,route+': '+JSON.stringify(result));return result.data;}
async function rejected(route,body){const result=await request(route,body);assert.equal(result.success,false,'Expected rejection: '+route);assert.ok(result.status>=400);}
async function main(){assert.ok(process.argv.includes('--run-live'),'Requires --run-live');const summaries=[];
 for(let i=0;i<fixtures.length;i++){
  const f=fixtures[i],name='TEST WEB 10-10 · '+f.name;
  const menus=await api('/menus');let menu=menus.find(m=>m.name===name);
  if(!menu)menu=await api('/menus',{name,slotPrice:f.price,totalSlots:10,prizeValue:f.prize,description:'Dữ liệu kiểm thử giả lập, không quyết toán tiền thật.'});
  assert.ok(menu.name.startsWith('TEST WEB 10-10 · '));
  let game=await api('/game?menuId='+menu.id+'&roundNumber=1');
  assert.equal(game.totalSlots,10);assert.equal(game.slotPrice,f.price);assert.equal(game.prizeValue,f.prize);
  const [mode,names]=plans[i],winners=names.map(buyer),base={menuId:menu.id,roundNumber:1};
  if(game.status!=='finished'){
   for(let n=0;n<10;n++)if(f.names[n]){
    await api('/game/slot',{...base,gameId:game.id,slotNumber:n+1,playerName:buyer(f.names[n]),shares:[]});
   }
   game=await api('/game?menuId='+menu.id+'&roundNumber=1');
   assert.deepEqual(game.slots.map(s=>s.player_name||''),f.names.map(n=>n?buyer(n):''));
   await rejected('/game/quick-register',{...base,gameId:game.id,playerName:buyer('Vượt ghế'),slotCount:11});
   await rejected('/game/finalize',{...base,settleMode:'solo',winners:[buyer('Không tồn tại')]});
   const before=await api('/reports/menu/'+menu.id);assert.equal(before.summary.grandTotalBuyCost,f.names.filter(Boolean).length*f.price);
   const finalized=await api('/game/finalize',{...base,settleMode:mode,winners,deductSlotCost:true});
   assert.equal(finalized.status,'finished');assert.equal(finalized.finishedResults.reduce((n,r)=>n+r.prizeWon,0),f.prize);
  }
  game=await api('/game?menuId='+menu.id+'&roundNumber=1');
  assert.equal(game.status,'finished');assert.equal(game.finishedResults.reduce((n,r)=>n+r.prizeWon,0),f.prize);
  const nextBody={...base,winners,settleMode:mode,deductSlotCost:true};
  const next=(await api('/game/next-round',nextBody)).nextRound,retry=(await api('/game/next-round',nextBody)).nextRound;
  assert.equal(next.id,retry.id);assert.equal(next.roundNumber,2);assert.equal(next.slots.filter(s=>s.player_name).length,0);
  const history=await api('/game/history?menuId='+menu.id);assert.equal(history.length,1);
  const report=await api('/reports/menu/'+menu.id);assert.equal(report.summary.grandTotalSlots,f.names.filter(Boolean).length);assert.equal(report.summary.grandTotalBuyCost,f.names.filter(Boolean).length*f.price);
  const kieu=report.customers.find(r=>core.key(r.customerName)===core.key(buyer('kiều')));
  const summary={menuId:menu.id,menu:name,sold:report.summary.grandTotalSlots,buyCost:report.summary.grandTotalBuyCost,winners,prize:report.summary.grandTotalPrizeWon,kieuBuyCost:kieu.totalBuyCost,kieuPrize:kieu.totalPrizeWon,kieuNet:kieu.netAmount,history:history.length,nextRoundId:next.id,status:'PASS'};
  summaries.push(summary);fs.writeFileSync(output+'/ket-qua.json',JSON.stringify({synthetic:true,summaries},null,2));console.log(JSON.stringify(summary));
 }
 const [kieu]=await api('/reports/search?name='+encodeURIComponent(buyer('kiều')));assert.equal(kieu.totalSlots,13);assert.equal(kieu.totalBuyCost,1459000);assert.equal(kieu.totalPrizeWon,3435000);assert.equal(kieu.netAmount,1976000);
 const csvResponse=await fetch(site+'/api/reports/export/customer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:buyer('kiều')}),signal:AbortSignal.timeout(45000)});
 assert.equal(csvResponse.status,200);const csv=await csvResponse.text();assert.ok(csv.includes('TỔNG CỘNG KÈO SLOT,,,13,,,1459000,3435000,'));assert.ok(csv.includes('NET = B - A - C),+1976000,'));fs.writeFileSync(output+'/TEST_WEB_Kieu.csv',csv);
 console.log('ALL SIX LIVE MENUS PASS; checking persistence again after 130 seconds');
 await new Promise(resolve=>setTimeout(resolve,130000));
 for(const summary of summaries){const history=await api('/game/history?menuId='+summary.menuId);assert.equal(history.length,1);const old=await api('/game?menuId='+summary.menuId+'&roundNumber=1');assert.equal(old.finishedResults.reduce((n,r)=>n+r.prizeWon,0),summary.prize);assert.equal(old.slots.filter(s=>s.player_name).length,summary.sold);}
 const result={synthetic:true,site,summaries,kieu:{slots:13,buyCost:1459000,prize:3435000,net:1976000},persistenceAfter130Seconds:'PASS',completedAt:new Date().toISOString()};fs.writeFileSync(output+'/ket-qua.json',JSON.stringify(result,null,2));console.log('PASS: six live test histories and results persisted beyond 2 minutes; CSV verified');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
