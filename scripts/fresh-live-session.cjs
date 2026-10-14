// Authorized fresh live test. No real payment. Winners are synthetic test inputs.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {fixtures}=require('./audit-customer-session.cjs');
const site='https://slot-betting-app.vercel.app';
const out='outputs/dot-test-moi-10-10';
const plans=[['split3',['mayne','lan anh','ngọc']],['solo',['Kiều']],['split2',['kiều','win']],['split3',['mayne','bàn tay vàng','kiều']],['solo',['kiều']],['split2',['kiều','lan anh']]];
async function api(route,body,method){
 const response=await fetch(site+'/api'+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000),cache:'no-store'});
 const data=await response.json();assert.ok(response.ok&&data.success,route+': '+JSON.stringify(data));return data.data;
}
async function excel(route,name,expected){
 const response=await fetch(site+'/api'+route,{signal:AbortSignal.timeout(45000)});assert.ok(response.ok);assert.match(response.headers.get('content-type'),/spreadsheetml/);
 const bytes=Buffer.from(await response.arrayBuffer());const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);
 if(expected!==undefined)assert.equal(wb.worksheets[0].getCell('F9').value,expected);
 fs.writeFileSync(out+'/'+name+'.xlsx',bytes);return wb;
}
async function main(){
 assert.ok(process.argv.includes('--run-live'));fs.mkdirSync(out,{recursive:true});
 if(process.argv.includes('--backup')){
   const menus=await api('/menus'),backup={site,savedAt:new Date().toISOString(),menus,games:[]};
   for(const menu of menus){
     const game=await api('/game?menuId='+menu.id);
     for(const round of game.roundsList)backup.games.push(round.roundNumber===game.roundNumber?game:await api('/game?menuId='+menu.id+'&roundNumber='+round.roundNumber));
     console.log('BACKUP '+menu.name);
   }
   backup.reports=await api('/reports/all-menus');
   fs.writeFileSync(out+'/Sao_luu_truoc_khi_xoa.json',JSON.stringify(backup,null,2));
   console.log('BACKUP COMPLETE: '+menus.length+' menus, '+backup.games.length+' rounds');return;
 }
 if(process.argv.includes('--create')){
   const backup=JSON.parse(fs.readFileSync(out+'/Sao_luu_truoc_khi_xoa.json'));
   // Retain at least one menu, as required by the app, while replacing the old set.
   const existing=await api('/menus');assert.deepEqual(existing.map(m=>m.id).sort(),backup.menus.map(m=>m.id).sort());
   const menus=[];
   for(const f of fixtures){menus.push(await api('/menus',{name:f.name,slotPrice:f.price,totalSlots:10,prizeValue:f.prize,description:'Đợt kiểm thử mới 10/10/2026. Kết quả thắng giả lập; không chuyển tiền thật.'}));}
   fs.writeFileSync(out+'/Menu_moi.json',JSON.stringify(menus,null,2));
   for(const m of backup.menus){await api('/menus/'+m.id,undefined,'DELETE');console.log('REMOVED OLD '+m.name);}
   const remaining=await api('/menus');assert.equal(remaining.length,6);assert.deepEqual(remaining.map(m=>m.id).sort(),menus.map(m=>m.id).sort());
   console.log('PASS: old menus removed, six fresh menus remain');return;
 }
 if(process.argv.includes('--fill')){
   const menus=JSON.parse(fs.readFileSync(out+'/Menu_moi.json')),summaries=[];
   for(let i=0;i<fixtures.length;i++){
     const f=fixtures[i],menu=menus[i],base={menuId:menu.id,roundNumber:1};
     let game=await api('/game?menuId='+menu.id+'&roundNumber=1');assert.equal(game.totalSlots,10);
     if(game.status!=='finished'){
       for(let n=0;n<10;n++)if(f.names[n])await api('/game/slot',{...base,gameId:game.id,slotNumber:n+1,playerName:f.names[n],shares:[]});
       const [mode,winners]=plans[i];
       await api('/game/finalize',{...base,settleMode:mode,winners,deductSlotCost:true});
     }
     game=await api('/game?menuId='+menu.id+'&roundNumber=1');
     assert.equal(game.totalSlots,10);assert.equal(game.slots.length,10);assert.equal(game.status,'finished');assert.deepEqual(game.winners,plans[i][1]);
     assert.deepEqual(game.slots.map(s=>s.player_name||''),f.names);
     assert.equal(game.finishedResults.reduce((n,r)=>n+r.prizeWon,0),f.prize);
     const history=await api('/game/history?menuId='+menu.id);assert.equal(history.length,1);
     await excel('/reports/export/menu/'+menu.id+'?format=xlsx',f.name);
     summaries.push({menuId:menu.id,name:f.name,totalSlots:10,sold:f.names.filter(Boolean).length,price:f.price,prize:f.prize,winners:game.winners,mode:plans[i][0],status:'finished',results:game.finishedResults});
     fs.writeFileSync(out+'/Ket_qua.json',JSON.stringify({testOnly:true,site,summaries},null,2));console.log('PASS FINISHED '+f.name+' '+game.winners.join(', '));
   }
   const [kieu]=await api('/reports/search?name='+encodeURIComponent('kiều'));assert.equal(kieu.totalSlots,13);assert.equal(kieu.totalBuyCost,1459000);assert.equal(kieu.totalPrizeWon,3435000);assert.equal(kieu.netAmount,1976000);
   await excel('/reports/export/customer?format=xlsx&name='+encodeURIComponent('kiều'),'Khach_Kieu',1976000);
   await excel('/reports/export/all?format=xlsx','Tong_hop_thu_va_tra');await excel('/reports/export/rounds?format=xlsx','Lich_su_chuyen');
   fs.writeFileSync(out+'/Ket_qua.json',JSON.stringify({testOnly:true,site,summaries,kieu,completedAt:new Date().toISOString()},null,2));
   console.log('ALL PASS: 6 finalized rounds, 56 sold seats, Kieu receives net 1976000');return;
 }
 if(process.argv.includes('--verify')){
   const saved=JSON.parse(fs.readFileSync(out+'/Ket_qua.json'));
   assert.equal((await api('/menus')).length,6);
   for(const r of saved.summaries){const g=await api('/game?menuId='+r.menuId+'&roundNumber=1');assert.equal(g.status,'finished');assert.equal(g.totalSlots,10);assert.deepEqual(g.finishedResults,r.results);assert.equal((await api('/game/history?menuId='+r.menuId)).length,1);}
   const report=await api('/reports/all-menus');assert.equal(report.grandTotalSlots,56);assert.equal(report.grandTotalBuyCost,6762000);assert.equal(report.grandTotalPrizeWon,6290000);
   saved.persistenceVerifiedAt=new Date().toISOString();fs.writeFileSync(out+'/Ket_qua.json',JSON.stringify(saved,null,2));console.log('PERSISTENCE PASS: 6 histories and saved settlements retained');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
