// Local synthetic QA. This loader disables Supabase and real model persistence.
const express=require('express');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {fixtures,isolatedModels}=require('./audit-customer-session.cjs');
const core=require('../views/js/settlement-core');
const workbooks=require('../services/reportWorkbookService');

async function main(){
  const app=isolatedModels(),output=path.resolve('outputs/winning-slot-selection');
  fs.mkdirSync(output,{recursive:true});
  const records=[];
  for(const fixture of fixtures){
    const menu=await app.Menu.createMenu({name:'TEST · '+fixture.name,totalSlots:10,slotPrice:fixture.price,prizeValue:fixture.prize});
    const game=await app.Game.getCurrentGame(menu.id,1);
    for(let i=0;i<fixture.names.length;i++)if(fixture.names[i]){
      const shares=fixture.key==='kiniem'&&i===8?[{name:'ngọc',percent:50},{name:'bàn tay yellow',percent:50}]:[];
      await app.Slot.assignSlot(game.id,i+1,fixture.names[i],shares);
    }
    const occupied=game.slots.filter(s=>s.player_name).map(s=>s.slot_number);
    const selected=[occupied[0],occupied[Math.floor(occupied.length/2)],occupied.at(-1)];
    const result=await app.Game.finalizeGame(menu.id,{roundNumber:1,winningSlots:selected});
    assert.equal(result.finishedResults.reduce((sum,r)=>sum+r.prizeWon,0),fixture.prize);
    assert.equal(result.finishedResults.reduce((sum,r)=>sum+r.buyCost,0),occupied.length*fixture.price);
    assert.deepEqual(result.winningSlots,selected);
    records.push({menu:fixture.name,purchased:occupied.length,winningSlots:selected,totalPrize:fixture.prize,results:result.finishedResults});
  }
  assert.equal(records.reduce((sum,r)=>sum+r.purchased,0),56);
  assert.equal(records.flatMap(r=>r.results).reduce((sum,r)=>sum+r.buyCost,0),6762000);
  assert.equal(records.reduce((sum,r)=>sum+r.totalPrize,0),6290000);
  const example=await app.Menu.createMenu({name:'TEST · Cốp Gấu · Chọn theo phiếu',totalSlots:10,slotPrice:135000,prizeValue:1200000});
  const exampleGame=await app.Game.getCurrentGame(example.id,1);
  const names=['Lan Anh','Mayne','Bàn tay vàng','Freefire','Siêu cấp win','Freefire','Omayne','Siêu cấp win','Mayne','Kiều'];
  for(let i=0;i<names.length;i++)await app.Slot.assignSlot(exampleGame.id,i+1,names[i]);
  await app.Game.switchActiveMenu(example.id);
  const preview={...exampleGame,status:'finished',winningSlots:[2,4,6],winners:['Mayne','Freefire'],finishedResults:core.calculateBySlots(exampleGame,[2,4,6])};
  fs.writeFileSync(path.join(output,'TEST_Slot_thang_Mayne_Freefire.xlsx'),await workbooks.round(preview).xlsx.writeBuffer());
  fs.writeFileSync(path.join(output,'TEST_6_menu_theo_slot_thang.xlsx'),await workbooks.all(await app.Report.getAllCustomersSummary()).xlsx.writeBuffer());
  fs.writeFileSync(path.join(output,'qa-six-menus.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify({scope:'Synthetic QA only',menus:records.map(r=>({menu:r.menu,purchased:r.purchased,winningSlots:r.winningSlots,totalPrize:r.totalPrize})),exampleMenuId:example.id,output}));
  if(!process.argv.includes('--serve'))return;
  const server=express();server.use(express.json());
  const Game=app.load('controllers/GameController.js'),Menu=app.load('controllers/MenuController.js'),Reports=app.load('controllers/ReportController.js'),Product=app.load('controllers/ProductController.js'),Blind=app.load('controllers/BlindBagController.js');
  server.get('/api/menus',Menu.getMenus);server.get('/api/game',Game.getGame);server.get('/api/game/history',Game.getRoundHistory);
  server.post('/api/game/switch-menu',Game.switchMenu);server.post('/api/game/switch-round',Game.switchRound);
  server.post('/api/game/finalize',Game.finalizeGame);server.post('/api/game/next-round',Game.nextRound);server.put('/api/game/round',Game.updateRound);
  server.get('/api/products',Product.getProducts);server.get('/api/blind-bags',Blind.list);
  server.get('/api/shop-config',(req,res)=>res.json({success:true,data:{name:'TEST',bankCode:'QA',accountNumber:'0000',accountOwner:'TEST'}}));
  server.get('/api/reports/all-menus',Reports.getAllMenusReport);server.get('/api/reports/menu/:menuId',Reports.getMenuReport);
  server.get('/api/reports/search',Reports.searchCustomer);server.get('/api/reports/finance',Reports.getFinance);
  server.get('/api/reports/export/round',Reports.downloadRoundWorkbook);server.get('/api/reports/export/all',Reports.downloadAllMenusCsv);server.get('/api/reports/export/rounds',Reports.downloadRoundsCsv);
  server.get('/api/reports/export/menu/:menuId',Reports.downloadMenuCsv);server.get('/api/reports/export/finance',Reports.downloadFinance);
  server.get('/api/bills',(req,res)=>res.json({success:true,data:[]}));
  server.use(express.static(path.resolve('views')));
  const port=Number(process.argv.find(a=>a.startsWith('--port='))?.slice(7)||3114);
  server.listen(port,'127.0.0.1',()=>console.log('QA preview http://127.0.0.1:'+port));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
