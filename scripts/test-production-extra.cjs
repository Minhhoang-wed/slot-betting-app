// Extra operations only on the empty successor of our synthetic TEST menu.
const assert=require('node:assert/strict');
const site='https://slot-betting-app.vercel.app/api';
async function api(route,body,method){const r=await fetch(site+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});const j=await r.json();assert.ok(j.success,JSON.stringify(j));return j.data;}
async function main(){const menus=await api('/menus'),menu=menus.find(m=>m.name==='TEST WEB 10-10 · RF CỐP GẤU');assert.ok(menu);
 const route='/game?menuId='+menu.id+'&roundNumber=2',g=await api(route);assert.equal(g.status,'open');assert.ok(g.slots.every(s=>!s.player_name));
 const base={menuId:menu.id,roundNumber:2,gameId:g.id};
 await api('/game/quick-register',{...base,playerName:'TEST KỸ THUẬT · A',slotCount:2});assert.equal((await api(route)).slots.filter(s=>s.player_name).length,2);
 await api('/game/remove-player',{...base,playerName:'test kỹ thuật · a'});assert.equal((await api(route)).slots.filter(s=>s.player_name).length,0);
 await api('/game/slot/add',base);assert.equal((await api(route)).totalSlots,11);
 await api('/game/slot/remove',base);assert.equal((await api(route)).totalSlots,10);
 await api('/game/round',{...base,slotPrice:135001,prizeValue:1200001},'PUT');assert.equal((await api(route)).slotPrice,135001);
 await api('/game/slot',{...base,slotNumber:3,playerName:'TEST KỸ THUẬT · GHẾ CHUNG',shares:[{name:'TEST KỸ THUẬT · Ngọc',percent:50},{name:'TEST KỸ THUẬT · B',percent:50}]});
 const report=await api('/reports/menu/'+menu.id),ngoc=report.customers.find(c=>c.customerName==='TEST KỸ THUẬT · Ngọc');assert.equal(ngoc.totalSlots,0.5);assert.equal(report.summary.grandTotalBuyCost,1350000+135001);
 await api('/game/slot',{...base,slotNumber:3,playerName:null});
 await api('/game/round',{...base,slotPrice:135000,prizeValue:1200000},'PUT');
 const after=await api(route);assert.ok(after.slots.every(s=>!s.player_name));assert.equal(after.totalSlots,10);assert.equal(after.slotPrice,135000);
 assert.equal((await api('/game/history?menuId='+menu.id)).length,1);
 console.log('PASS LIVE: quick registration, normalized release, add/remove slot, round config persisted, explicit 50/50 shared seat, old history preserved. Test successor restored empty.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
