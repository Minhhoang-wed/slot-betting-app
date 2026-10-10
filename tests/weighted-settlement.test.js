const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const core = require('../views/js/settlement-core');
const reports = require('../services/reportWorkbookService');
const fs = require('node:fs');
const vm = require('node:vm');
const { isolatedModels } = require('../scripts/audit-customer-session.cjs');
const game = { slotPrice:135000, prizeValue:1200000, slots:['mayne','freefire','freefire','khách khác'].map((player_name,i)=>({slot_number:i+1,player_name})) };

test('two winners receive 400k and 800k by their 1 and 2 slots, excluding losing slots', () => {
  for (const deduct of [true,false]) {
    const rows = core.calculate(game,'split2',['MAYNE','freefire'],deduct);
    assert.deepEqual(rows.map(r=>r.prizeWon),[400000,800000,0]);
    assert.deepEqual(rows.map(r=>r.netAmount),deduct?[265000,530000,-135000]:[400000,800000,-135000]);
    assert.ok(rows.every(r=>r.prizeRule==='winner_slots'));
  }
  assert.equal(core.calculate(game,'solo',['mayne'])[0].prizeWon,1200000);
  assert.equal(core.calculate(game,'split2',['mayne','freefire'],true,{mayne:[{price:100000,qty:2}]})[0].netAmount,65000);
});

test('three winners and shared seats use proportional ownership', () => {
  const three={...game,slots:['A','B','B','C','C','C'].map(player_name=>({player_name}))};
  assert.deepEqual(core.calculate(three,'split3',['A','B','C']).map(r=>r.prizeWon),[200000,400000,600000]);
  const shared={...game,slots:[{player_name:'Nhóm',shares:[{name:'A',percent:50},{name:'B',percent:50}]},{player_name:'B'}]};
  assert.deepEqual(core.calculate(shared,'split2',['A','B']).map(r=>r.prizeWon),[300000,900000]);
});

test('integer allocation preserves every đồng, handles ties and large amounts exactly', () => {
  assert.deepEqual(core.allocate(10,['A','B'],[1,2]),{a:3,b:7});
  assert.deepEqual(core.allocate(5,['A','B','C'],[1,1,1]),{a:2,b:2,c:1});
  const amounts=Object.values(core.allocate(Number.MAX_SAFE_INTEGER,['A','B'],[100,200]));
  assert.equal(amounts.reduce((sum,n)=>sum+BigInt(n),0n),BigInt(Number.MAX_SAFE_INTEGER));
  assert.throws(()=>core.allocate(10,[],[]));
  assert.throws(()=>core.allocate(10,['A','B'],[1,0]));
  assert.throws(()=>core.allocate(10,['A','B'],[1]));
});

test('browser preview and summary show each actual award instead of an equal split', () => {
  const elements={finalSettlementTableBody:{innerHTML:'',children:[],appendChild(row){this.children.push(row);}},summaryMetaBar:{innerHTML:''},soloAmountText:{},split2AmountText:{},split3AmountText:{}};
  const context=vm.createContext({console,Intl,input:game,document:{addEventListener(){},getElementById:id=>elements[id]||null,createElement:()=>({innerHTML:''})}});
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/settlement-core'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/app'),'utf8'),context);
  vm.runInContext("gameState={...input,name:'TEST',roundNumber:1,winners:['mayne','freefire'],settleMode:'split2'}; updateHeroStats=()=>{}; autoCalculateSettlement(true); updateSplitAmounts();",context);
  assert.match(elements.summaryMetaBar.innerHTML,/mayne.*400\.000.*freefire.*800\.000/);
  assert.doesNotMatch(elements.summaryMetaBar.innerHTML,/600\.000|Mỗi người nhận/);
  assert.match(elements.finalSettlementTableBody.children[0].innerHTML,/265\.000/);
  assert.match(elements.finalSettlementTableBody.children[1].innerHTML,/530\.000/);
  assert.equal(elements.split2AmountText.innerText,'Chia theo số slot của 2 người thắng');
});

test('actual models persist weighted prizes, history/report and Excel retain them', async () => {
  const app=isolatedModels();
  const menu=await app.Menu.createMenu({name:'TEST CHIA THEO SLOT',slotPrice:135000,totalSlots:10,prizeValue:1200000});
  const current=await app.Game.getCurrentGame(menu.id,1);
  for(let i=0;i<game.slots.length;i++)await app.Slot.assignSlot(current.id,i+1,game.slots[i].player_name);
  const calculated=await app.Settlement.calculateSettlement('split2',['mayne','freefire'],current.id);
  assert.equal(calculated.prizePerWinner,null);
  assert.deepEqual(calculated.prizeByWinner,{mayne:400000,freefire:800000});
  await app.Game.finalizeGame(menu.id,{roundNumber:1,settleMode:'split2',winners:['mayne','freefire'],deductSlotCost:true});
  const history=await app.Game.getRoundHistory(menu.id);
  assert.equal(history.length,1);
  assert.deepEqual(history[0].finishedResults.map(r=>r.prizeWon),[400000,800000,0]);
  const report=await app.Report.getCustomerStatsByMenu(menu.id);
  assert.equal(report.customers.find(r=>r.customerName==='mayne').totalPrizeWon,400000);
  assert.equal(report.customers.find(r=>r.customerName==='freefire').netAmount,530000);
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await reports.round(history[0]).xlsx.writeBuffer());
  const ws=wb.getWorksheet('Thu và trả');
  assert.equal(ws.getCell('D16').value,400000);assert.equal(ws.getCell('G16').value,265000);
  assert.equal(ws.getCell('D17').value,800000);assert.equal(ws.getCell('G17').value,530000);
});
