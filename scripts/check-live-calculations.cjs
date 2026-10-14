// Read-only reconciliation, independent arithmetic from the supplied menu.
const fs=require('node:fs'),assert=require('node:assert/strict'),ExcelJS=require('exceljs');
const {fixtures}=require('./audit-customer-session.cjs');
const site='https://slot-betting-app.vercel.app/api';
const normalize=s=>String(s).normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
async function api(route){const r=await fetch(site+route,{signal:AbortSignal.timeout(45000),cache:'no-store'});const j=await r.json();assert.ok(r.ok&&j.success,route+': '+JSON.stringify(j));return j.data;}
async function excel(route){const r=await fetch(site+route,{signal:AbortSignal.timeout(45000),cache:'no-store'});assert.ok(r.ok);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));return wb;}
async function main(){
 const menus=await api('/menus');assert.equal(menus.length,6);
 const expected=new Map(),roundChecks=[];
 for(const f of fixtures){
   const m=menus.find(m=>m.name===f.name);assert.ok(m,'Missing '+f.name);
   const [g,report]=await Promise.all([api('/game?menuId='+m.id+'&roundNumber=1'),api('/reports/menu/'+m.id)]);
   assert.equal(g.status,'finished');assert.equal(g.totalSlots,10);assert.equal(g.slots.length,10);assert.equal(g.slotPrice,f.price);assert.equal(g.prizeValue,f.prize);
   assert.equal(g.winners.length,{solo:1,split2:2,split3:3}[g.settleMode]);assert.ok(g.finishedResults.filter(r=>r.isWinner).every(r=>r.deducted===true), 'Winner costs must be deducted');
   const buyers=new Map();
   for(let n=0;n<10;n++){
     const s=g.slots.find(s=>s.slot_number===n+1);assert.ok(s);assert.equal(normalize(s.player_name||''),normalize(f.names[n]));
     // No percentage sharing configured in this supplied test session.
     assert.ok(!s.shares?.length || (s.shares.length===1&&s.shares[0].percent===100));
     if(!f.names[n])continue;
     const id=normalize(f.names[n]);if(!buyers.has(id))buyers.set(id,{name:f.names[n],slots:[],count:0,buy:0,award:0,net:0});
     const b=buyers.get(id);b.slots.push(n+1);b.count++;b.buy+=f.price;
   }
   g.winners.forEach((name,i)=>{
     const b=buyers.get(normalize(name));assert.ok(b,'Winner must own seat');
     b.award=Math.floor(f.prize/g.winners.length)+(i<f.prize%g.winners.length?1:0);
   });
   assert.equal(g.finishedResults.length,buyers.size);assert.equal(report.customers.length,buyers.size);
   for(const [id,b] of buyers){
     b.net=b.award-b.buy;
     const stored=g.finishedResults.find(c=>normalize(c.playerName)===id),listed=report.customers.find(c=>normalize(c.customerName)===id);assert.ok(stored&&listed);
     assert.equal(stored.attachedTotalCost,0);assert.deepEqual(stored.slotsList,b.slots);
     for(const [field,value] of Object.entries({slotCount:b.count,buyCost:b.buy,prizeWon:b.award,netAmount:b.net}))assert.equal(stored[field],value,f.name+' '+b.name+' '+field);
     for(const [field,value] of Object.entries({totalSlots:b.count,totalBuyCost:b.buy,totalPrizeWon:b.award,netAmount:b.net}))assert.equal(listed[field],value);
     if(!expected.has(id))expected.set(id,{name:b.name,count:0,buy:0,award:0,net:0});
     const a=expected.get(id);for(const prop of ['count','buy','award','net'])a[prop]+=b[prop];
   }
   const count=f.names.filter(Boolean).length;
   assert.equal(report.summary.grandTotalSlots,count);assert.equal(report.summary.grandTotalBuyCost,count*f.price);assert.equal(report.summary.grandTotalPrizeWon,f.prize);
   roundChecks.push({menu:f.name,sold:count,totalSlots:10,buy:count*f.price,award:f.prize,winners:g.winners,net:f.prize-count*f.price,status:'PASS'});
   console.log('PASS independent math: '+f.name);
 }
 const global=await api('/reports/all-menus');assert.equal(global.customers.length,expected.size);
 for(const [id,b] of expected){const c=global.customers.find(c=>normalize(c.customerName)===id);assert.ok(c);assert.equal(c.totalSlots,b.count);assert.equal(c.totalBuyCost,b.buy);assert.equal(c.totalPrizeWon,b.award);assert.equal(c.netAmount,b.net);}
 assert.equal(global.grandTotalSlots,56);assert.equal(global.grandTotalBuyCost,6762000);assert.equal(global.grandTotalPrizeWon,6290000);assert.equal(global.grandNetAmount,-472000);
 const [allXlsx,kieuXlsx]=await Promise.all([excel('/reports/export/all?format=xlsx'),excel('/reports/export/customer?format=xlsx&name='+encodeURIComponent('kiều'))]);
 const ws=allXlsx.getWorksheet('Thu và trả');
 for(let row=16;row<16+expected.size;row++){
   const b=expected.get(normalize(ws.getCell(row,1).value));assert.ok(b);
   const values=[b.count,b.buy,b.award,0,Math.max(0,-b.net),Math.max(0,b.net)];
   values.forEach((v,i)=>assert.equal(ws.getCell(row,i+2).value,v));
 }
 const customers=[...expected.values()],pay=customers.reduce((n,c)=>n+Math.max(0,-c.net),0),receive=customers.reduce((n,c)=>n+Math.max(0,c.net),0);
 assert.equal(ws.getCell('F9').value,pay);assert.equal(ws.getCell('F10').value,receive);assert.equal(pay-receive,472000);
 const ks=kieuXlsx.getWorksheet('Khách hàng');assert.equal(ks.getCell('F5').value,13);assert.equal(ks.getCell('F6').value,1459000);assert.equal(ks.getCell('F7').value,3435000);assert.equal(ks.getCell('F9').value,1976000);
 const result={readOnly:true,checkedAt:new Date().toISOString(),roundChecks,customers,pay,receive,shopBalance:pay-receive,errors:[],notes:['Ngọc + bàn tay yellow giữ nguyên một nhóm vì chưa có tỷ lệ chia ghế.','Bàn tay vàng và bàn tay yellow giữ riêng theo tên trong menu.','Kết quả thắng giả lập của đợt test, không phải kết quả giao dịch thật.']};
 fs.writeFileSync('outputs/dot-test-moi-10-10/Kiem_tra_tinh_toan.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
