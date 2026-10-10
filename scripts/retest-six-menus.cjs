// Actual models + actual PostgreSQL migration, isolated from production.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {instance}=require('./audit-full-flow.cjs');
const {fixtures}=require('./audit-customer-session.cjs');
const core=require('../views/js/settlement-core');
const plans=[['split3',['mayne','lan anh','ngọc']],['solo',['Kiều']],['split2',['kiều','win']],['split3',['mayne','bàn tay vàng','kiều']],['solo',['kiều']],['split2',['kiều','lan anh']]];
const quote=s=>{assert.match(s,/^[a-z_]+$/);return '"'+s+'"';};
const parameter=v=>v!==null && typeof v==='object' && !(v instanceof Date)?JSON.stringify(v):v;
function client(db){return {
  async rpc(name,p){try{
    const args=Object.entries(p);
    const result=await db.query(`SELECT ${quote(name)}(${args.map(([k],i)=>quote(k)+' => $'+(i+1)).join(',')}) AS result`,args.map(([,v])=>parameter(v)));
    return {data:result.rows[0].result,error:null};
  }catch(e){return {data:null,error:{message:e.message}};}},
  from(table){let op='select',payload,one=false,join=false,sort=null,windowRange=null;const filters=[];
    const q={range(a,b){windowRange=[a,b];return q;},select(s='*'){join=s.includes('slots(');return q;},eq(k,v){filters.push([k,v]);return q;},order(k,o={}){sort=[k,o.ascending!==false];return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},insert(v){op='insert';payload=v;return q;},
      then(resolve,reject){return (async()=>{try{
        let rows;
        if(op==='insert'){
          const entries=Object.entries(payload);
          rows=(await db.query(`INSERT INTO ${quote(table)} (${entries.map(([k])=>quote(k)).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,entries.map(([,v])=>parameter(v)))).rows;
        }else{
          rows=(await db.query(`SELECT * FROM ${quote(table)}${filters.length?' WHERE '+filters.map(([k],i)=>quote(k)+'=$'+(i+1)).join(' AND '):''}${sort?' ORDER BY '+quote(sort[0])+(sort[1]?' ASC':' DESC'):''}`,filters.map(([,v])=>parameter(v)))).rows;
        }
        if(windowRange)rows=rows.slice(windowRange[0],windowRange[1]+1);
        if(join)for(const r of rows)r.slots=(await db.query('SELECT * FROM slots WHERE game_id=$1 ORDER BY slot_number',[r.id])).rows;
        return {data:one?rows[0]||null:rows,error:null};
      }catch(e){return {data:null,error:{message:e.message}};}})().then(resolve,reject);}
    };return q;}
};}
async function main(){
  const db=new PGlite();let serving=false;
  try{
    const schema=fs.readFileSync(path.join(__dirname,'../schema.sql'),'utf8');
    await db.exec(schema.slice(schema.indexOf('CREATE TABLE public.menus'),schema.indexOf('-- 6. CHỈ MỤC')));
    await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/002_durable_rounds.sql'),'utf8'));
    const backing={client:client(db)}, app=instance(backing), checks=[];
    const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'outputs/retest-six-menus');
    fs.mkdirSync(output,{recursive:true});
    for(let index=0;index<fixtures.length;index++){
      const f=fixtures[index], [mode,winners]=plans[index];
      const menu=await app.Menu.createMenu({name:'TEST · '+f.name,slotPrice:f.price,totalSlots:10,prizeValue:f.prize});
      const game=await app.Game.getCurrentGame(menu.id,1);
      for(let i=0;i<f.names.length;i++)await app.Slot.assignSlot(game.id,i+1,f.names[i]);
      const reader=instance(backing);assert.equal((await reader.Game.getRoundHistory(menu.id)).length,0);
      const loaded=await reader.Game.getCurrentGame(menu.id,1);
      const sold=f.names.filter(Boolean).length, expected=sold*f.price;
      assert.equal(loaded.slots.filter(s=>s.player_name).length,sold);
      assert.equal((await reader.Report.getCustomerStatsByMenu(menu.id)).summary.grandTotalBuyCost,expected);
      await assert.rejects(app.Slot.quickRegister(game.id,'TEST OVERFLOW',11));
      await assert.rejects(app.Game.finalizeGame(menu.id,{roundNumber:1,settleMode:'solo',winners:['Không có khách này']}));
      // Check every settlement mode, with/without deduction against simple independent arithmetic.
      const names=[...new Set(f.names.filter(Boolean).map(core.key))];
      for(const [testMode,count] of [['solo',1],['split2',2],['split3',3]])for(const deduct of [true,false]){
        const selected=names.slice(0,count), calculated=await app.Settlement.calculateSettlement(testMode,selected,game.id,deduct);
        assert.equal(calculated.settlementList.reduce((sum,r)=>sum+r.prizeWon,0),f.prize);
        for(const row of calculated.settlementList){
          const cost=f.names.filter(n=>core.key(n)===core.key(row.playerName)).length*f.price;
          assert.equal(row.buyCost,cost);
          const winnerIndex=selected.indexOf(core.key(row.playerName));
          const counts=selected.map(name=>f.names.filter(n=>core.key(n)===name).length);
          const total=counts.reduce((sum,n)=>sum+n,0);
          const amounts=counts.map(n=>Math.floor(f.prize*n/total));
          const ranking=counts.map((n,i)=>({i,remainder:f.prize*n%total})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
          for(let i=0,left=f.prize-amounts.reduce((sum,n)=>sum+n,0);i<left;i++)amounts[ranking[i].i]++;
          const prize=winnerIndex>=0?amounts[winnerIndex]:0;
          assert.equal(row.netAmount,prize-(prize && !deduct?0:cost));
        }
      }
      let status=200,response;
      await app.Controller.finalizeGame({body:{menuId:menu.id,roundNumber:1,settleMode:mode,winners,deductSlotCost:true}},{status(n){status=n;return this;},json(body){response=body;}});
      assert.equal(status,200,JSON.stringify(response));assert.equal(response.success,true);
      assert.equal((await reader.Game.getRoundHistory(menu.id)).length,1);
      const fresh=instance(backing),saved=await fresh.Game.getCurrentGame(menu.id,1);
      assert.equal(saved.finishedResults.reduce((sum,r)=>sum+r.prizeWon,0),f.prize);
      await assert.rejects(fresh.Slot.assignSlot(game.id,1,'Không sửa chuyến đã chốt'));
      const next=await fresh.Game.finishAndStartNextRound(menu.id,null,winners,mode,null,1);
      const retry=await instance(backing).Game.finishAndStartNextRound(menu.id,null,winners,mode,null,1);
      assert.equal(next.nextRound.id,retry.nextRound.id);assert.equal(next.nextRound.roundNumber,2);
      assert.equal(next.nextRound.slots.filter(s=>s.player_name).length,0);
      const report=await instance(backing).Report.getCustomerStatsByMenu(menu.id);
      assert.equal(report.summary.grandTotalBuyCost,expected);assert.equal(report.summary.grandTotalSlots,sold);assert.equal(report.summary.completedRounds,1);
      const kieu=report.customers.find(r=>core.key(r.customerName)==='kiều');
      fs.writeFileSync(path.join(output,f.key+'.csv'),await fresh.Report.exportMenuReportCsv(menu.id));
      checks.push({menu:f.name,sold,buyCost:expected,mode,winners,prize:f.prize,kieuBuyCost:kieu.totalBuyCost,kieuPrize:kieu.totalPrizeWon,kieuNet:kieu.netAmount,status:'PASS'});
    }
    const summary=await instance(backing).Report.getAllCustomersSummary();
    assert.equal(summary.grandTotalSlots,56);assert.equal(summary.grandTotalBuyCost,6762000);assert.equal(summary.grandTotalPrizeWon,6290000);
    const report=instance(backing).Report,[kieu]=await report.searchCustomer('KIỀU');
    assert.equal(kieu.totalSlots,13);assert.equal(kieu.totalBuyCost,1459000);assert.equal(kieu.totalPrizeWon,3471000);assert.equal(kieu.netAmount,2012000);
    const csv=await report.exportCustomerDetailCsv('KIỀU');
    assert.ok(csv.includes('TỔNG CỘNG KÈO SLOT,,,13,,,1459000,3471000,'));assert.ok(csv.includes('NET = B - A - C),+2012000,'));
    fs.writeFileSync(path.join(output,'TEST_Kieu_6_menu.csv'),csv);
    fs.writeFileSync(path.join(output,'TEST_Lich_su.csv'),await report.exportDetailedRoundsCsv());
    fs.writeFileSync(path.join(output,'TEST_Tong_hop.csv'),await report.exportAllMenusSummaryCsv());
    const result={scope:'Synthetic winners; actual application models/controllers and PostgreSQL SQL; no production writes',checks,totalSlots:56,totalBuyCost:6762000,totalPrize:6290000,kieu:{slots:13,buyCost:1459000,prize:3471000,net:2012000},finishedRounds:(await instance(backing).Game.getRoundHistory()).length};
    assert.equal(result.finishedRounds,6);
    fs.writeFileSync(path.join(output,'ket-qua.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
    if(process.argv.includes('--serve')){
      const express=require('express'),web=express(),models=instance(backing),games=models.Controller,reports=models.load('controllers/ReportController.js');
      web.use(express.json());web.get('/api/menus',models.load('controllers/MenuController.js').getMenus);
      web.get('/api/game',games.getGame);web.get('/api/game/history',games.getRoundHistory);
      web.post('/api/game/switch-menu',games.switchMenu);web.post('/api/game/switch-round',games.switchRound);
      web.get('/api/reports/all-menus',reports.getAllMenusReport);web.get('/api/reports/menu/:menuId',reports.getMenuReport);web.get('/api/reports/customer-detail',reports.getCustomerDetail);
      web.get('/api/reports/search',reports.searchCustomer);
      web.post('/api/reports/export/customer',reports.downloadCustomerDetailCsv);
      web.get('/api/reports/export/rounds',reports.downloadRoundsCsv);
      web.get('/api/reports/export/all',reports.downloadAllMenusCsv);
      web.get('/api/reports/export/menu/:menuId',reports.downloadMenuCsv);
      web.get('/api/reports/export/round',reports.downloadRoundWorkbook);
      web.get('/api/products',(_,res)=>res.json({success:true,data:[]}));web.get('/api/blind-bags',(_,res)=>res.json({success:true,data:[]}));
      web.use('/api',(_,res)=>res.status(403).json({success:false,error:'Bản thử nghiệm chỉ xem; không ghi giao dịch thật'}));
      const port=Number(process.argv.find(a=>a.startsWith('--port='))?.slice(7)||3105);
      web.use(express.static(path.join(__dirname,'../views')));web.listen(port,'127.0.0.1',()=>console.log('TEST 6 MENU: http://127.0.0.1:'+port));serving=true;
    }
  }finally{if(!serving)await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
