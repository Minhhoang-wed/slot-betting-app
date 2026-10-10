const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ExcelJS=require('exceljs');
const {dayOf,resolvePeriod}=require('../services/financePeriodService');
const {summarize,forCustomer}=require('../services/customerFinanceService');
const workbooks=require('../services/reportWorkbookService');
const {isolatedModels}=require('../scripts/audit-customer-session.cjs');
const today='2026-10-10T17:00:00Z',yesterday='2026-10-10T16:59:59Z';
function fixture(){
  const slots={customers:[{customerName:'Kiều',netAmount:60000,menuBreakdown:{m:{menuName:'Gấu',rounds:[
    {createdAt:yesterday,finishedAt:today,roundNumber:1,status:'finished',slots:[1,2,3],slotCount:3,buyCost:405000,prizeWon:0,net:-405000},
    {createdAt:today,roundNumber:2,status:'open',slots:[4],winningSlotsList:[4],slotCount:1,buyCost:135000,prizeWon:600000,net:465000}]} }},
    {customerName:'Không có ngày',netAmount:-90000,menuBreakdown:{m:{menuName:'Cũ',rounds:[{roundNumber:1,status:'open',slots:[1],slotCount:1,net:-90000}]}}}]};
  const bags=[{data:{name:'Túi mù',orders:[
    {id:'old',customerName:'KIỀU',createdAt:yesterday,total:414000,paid:false,quantity:1,slots:[1]},
    {id:'new',customerName:'Kiều',createdAt:today,total:1000000,paid:true,quantity:1,slots:[2]}],
    slots:[{number:1,customerName:'Kiều',orderId:'old',productNumbers:[1]},{number:2,customerName:'Kiều',orderId:'new',productNumbers:[2]}],
    pool:[{number:1,name:'Son cũ'},{number:2,name:'Phấn mới'}],returns:[
      {customerName:'Kiều',createdAt:yesterday,slotNumber:1,total:100000,items:[{name:'Son',price:100000}]},
      {customerName:'Kiều',createdAt:today,slotNumber:1,total:250000,items:[{name:'Phấn',price:250000}]},
      {customerName:'Kiều',createdAt:today,slotNumber:2,total:500000,voided:true,items:[{name:'Đã hủy',price:500000}]}]}}];
  return {slots,bags};
}
test('Vietnam day boundaries, yesterday and calendar validation are independent of UTC date',()=>{
  assert.equal(dayOf(yesterday),'2026-10-10');assert.equal(dayOf(today),'2026-10-11');
  assert.equal(resolvePeriod('today',today).date,'2026-10-11');
  assert.equal(resolvePeriod('yesterday','2026-12-31T17:01:00Z').date,'2026-12-31');
  assert.equal(resolvePeriod('2024-02-29').date,'2024-02-29');
  assert.equal(resolvePeriod().date,null);
  for(const value of ['2026-02-29','2026-02-30','2026-13-01','11/10/2026','',[],['all']])assert.throws(()=>resolvePeriod(value),{status:400});
  assert.equal(dayOf(null),null);assert.equal(dayOf('bad'),null);
});
test('daily summary filters each source before totals, keeps current payment state and excludes void pass credits',()=>{
  const {slots,bags}=fixture();
  const current=summarize(slots,bags,{date:'2026-10-11'}),past=summarize(slots,bags,{date:'2026-10-10'}),all=summarize(slots,bags);
  assert.equal(current.customers.length,1);assert.equal(current.slotNet,465000);assert.equal(current.bagDue,0);
  assert.equal(current.bagPaid,1000000);assert.equal(current.buybackTotal,250000);assert.equal(current.shopPays,715000);
  assert.equal(past.slotNet,-405000);assert.equal(past.bagDue,414000);assert.equal(past.buybackTotal,100000);assert.equal(past.customerPays,719000);
  assert.equal(all.slotNet,-30000);assert.equal(all.buybackTotal,350000);assert.equal(all.customerPays,94000);
  assert.equal(current.undatedCount,1);assert.equal(all.customers.length,2);
  assert.ok(current.customers[0].events.every(e=>dayOf(e.occurredAt)==='2026-10-11'));
  assert.ok(past.customers[0].events.some(e=>e.name==='Son cũ'));
  assert.ok(!current.customers[0].events.some(e=>e.name==='Son cũ'));
  assert.equal(summarize(slots,bags,{date:'2020-01-01'}).customers.length,0);
  assert.equal(forCustomer(past,'kiều').period.date,'2026-10-10');
});
test('actual pending and finalized report details retain the round opening date',async()=>{
  const app=isolatedModels(),menu=(await app.Menu.getAllMenus())[0];
  const game=await app.Game.getCurrentGame(menu.id,1);
  game.createdAt=new Date(yesterday);await app.Slot.assignSlot(game.id,1,'Kiều');
  let report=await app.Report.getAllCustomersSummary();
  let detail=Object.values(report.customers[0].menuBreakdown)[0].rounds[0];
  assert.equal(dayOf(detail.createdAt),'2026-10-10');assert.equal(detail.status,'open');
  await app.Game.finalizeGame(menu.id,{roundNumber:1,winningSlots:[1]});
  report=await app.Report.getAllCustomersSummary();detail=Object.values(report.customers[0].menuBreakdown)[0].rounds[0];
  assert.equal(dayOf(detail.createdAt),'2026-10-10');assert.ok(detail.finishedAt);assert.equal(detail.status,'finished');
  assert.equal(summarize(report,[],{date:'2026-10-10'}).customers.length,1);
});
test('daily individual and aggregate Excel use the same day, totals and timestamped rows',async()=>{
  const {slots,bags}=fixture(),data=summarize(slots,bags,{date:'2026-10-10'});
  for(const single of [false,true]){
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(await workbooks.finance(single?forCustomer(data,'Kiều'):data,single?{customerName:'Kiều'}:{}).xlsx.writeBuffer());
    const summary=wb.getWorksheet('Tổng hợp'),detail=wb.getWorksheet('Chi tiết');
    assert.match(summary.getCell('A3').value,/Ngày 10\/10\/2026/);assert.equal(summary.getCell('F5').value.result,719000);
    assert.equal(summary.getCell('B12').value,-405000);
    assert.equal(summary.getCell('E12').value.result,414000);
    assert.ok(detail.getCell('A6').value instanceof Date);
    assert.equal(detail.getCell('A6').value.toISOString(),'2026-10-10T23:59:59.000Z');
    assert.equal(detail.getCell('A6').numFmt,'dd/mm/yyyy hh:mm');
    assert.equal(detail.getCell('B6').value,'Kiều');assert.equal(detail.getCell('H6').value,-405000);
    assert.ok(!JSON.stringify(detail.getSheetValues()).includes('Phấn mới'));
  }
});
test('a late daily response cannot replace newer dates; loading clears old detail and disables exports',async()=>{
  const elements=Object.fromEntries(['financeBody','financeSearch','financePeriodSelect','financeDateInput','financePeriodLabel','financeMessage','financeExportAll','financeDetailModal'].map(id=>[id,{innerHTML:'',textContent:'',value:'',open:false,attributes:{},removeAttribute(name){delete this.attributes[name];if(name==='href')delete this.href;},setAttribute(name,value){this.attributes[name]=value;}}]));
  elements.financePeriodSelect.value='today';elements.financeDetailModal.open=true;elements.financeDetailModal.close=function(){this.open=false;};
  const pending=[];
  const ctx=vm.createContext({URLSearchParams,document:{getElementById:id=>elements[id]},CustomerSearch:require('../views/js/customer-search'),formatVND:String,blindBagEscape:String,fetch:url=>new Promise(resolve=>pending.push({url,resolve}))});
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/blind-bag-finance'),'utf8'),ctx);
  const old=vm.runInContext('loadFinanceSummary()',ctx);
  assert.ok(!elements.financeDetailModal.open);assert.equal(elements.financeExportAll.attributes['aria-disabled'],'true');
  elements.financePeriodSelect.value='yesterday';const latest=vm.runInContext('loadFinanceSummary()',ctx);
  const {slots,bags}=fixture(),data=summarize(slots,bags,{date:'2026-10-10'});
  pending[1].resolve({ok:true,json:async()=>({success:true,data})});await latest;
  assert.match(elements.financeExportAll.href,/date=2026-10-10/);
  assert.match(elements.financeBody.innerHTML,/date=2026-10-10/);
  pending[0].resolve({ok:true,json:async()=>({success:true,data:summarize(slots,bags,{date:'2026-10-11'})})});await old;
  assert.match(elements.financePeriodLabel.textContent,/10\/10\/2026/);
  assert.equal(pending[0].url,'/api/reports/finance?date=today');
  elements.financePeriodSelect.value='custom';await vm.runInContext('loadFinanceSummary()',ctx);
  assert.equal(pending.length,2);assert.equal(elements.financeExportAll.href,undefined);assert.match(elements.financeMessage.textContent,/Hãy chọn ngày/);
});
