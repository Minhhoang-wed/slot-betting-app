const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {isolatedModels}=require('../scripts/audit-customer-session.cjs');

function fixture() {
  const app=isolatedModels(),finance=app.load('models/FinanceModel.js');
  app.Report.getAllCustomersSummary=async()=>({customers:[{customerName:'FreeFire',totalSlots:4,totalBuyCost:480000,totalPrizeWon:1200000,totalAttachedCost:0,netAmount:1200000,menuBreakdown:{m:{menuName:'Cốp Gấu',slotCount:4,buyCost:480000,prizeWon:1200000,net:1200000,rounds:[]}}}]});
  const order={customerName:'freefire',id:'order',total:2070000,quantity:5,slots:[1,2,3,4,5],paid:false};
  const returns=[{customerName:'FREEFIRE',slotNumber:1,total:770000,items:[{name:'Phủ Swan Xanh',price:280000},{name:'Mắt Swan',price:240000},{name:'Mắt la 01',price:250000}]},
    {customerName:'FreeFire',slotNumber:2,total:315000,voided:true,items:[{name:'Nước hoa',price:315000}]},
    {customerName:'Free Fire',slotNumber:3,total:70000,items:[{name:'Kẻ mắt',price:70000}]}];
  const bags=[{data:{name:'Túi mù đợt 2',orders:[order],slots:[],pool:[],returns}}];
  app.load('models/BlindBagModel.js').list=async()=>bags;
  return {app,finance,order};
}

test('quick lookup combines recorded slot net, unpaid bags and valid pass without fuzzy identity merging',async()=>{
  const {finance,order}=fixture();
  const matches=await finance.searchCustomers('FREE');
  assert.equal(matches.length,2);
  const freefire=matches.find(c=>c.customerName==='FreeFire');
  assert.equal(freefire.totalSlots,4);assert.equal(freefire.detailedMenus[0].menuName,'Cốp Gấu');
  assert.equal(freefire.finance.slotNet,1200000);
  assert.equal(freefire.finance.buybackTotal,770000);
  assert.equal(freefire.finance.bagDue,2070000);
  assert.equal(freefire.finance.customerPays,100000);
  assert.equal(freefire.finance.shopPays,0);
  assert.equal(freefire.financePeriod.date,null);
  const bagOnly=matches.find(c=>c.customerName==='Free Fire');
  assert.equal(bagOnly.totalSlots,0);assert.equal(bagOnly.finance.shopPays,70000);
  assert.deepEqual(bagOnly.detailedMenus,[]);
  order.paid=true;
  const paid=(await finance.searchCustomers('freefire'))[0];
  assert.equal(paid.finance.bagDue,0);assert.equal(paid.finance.shopPays,1970000);
  const summary=await finance.getSummary();
  assert.deepEqual(paid.finance,summary.customers.find(c=>c.customerName==='FreeFire'));
});

test('failed pass storage reads cannot return a misleading slot-only final balance',async()=>{
  const {app,finance}=fixture();
  app.load('models/BlindBagModel.js').list=async()=>{throw new Error('DB unavailable');};
  await assert.rejects(finance.searchCustomers('FreeFire'),/DB unavailable/);
});

test('lookup final, details and Excel use the same all-date combined settlement',async()=>{
  const {finance}=fixture(),match=(await finance.searchCustomers('freefire'))[0];
  const handlers={},box={style:{},innerHTML:'',querySelector:id=>({addEventListener:(_,fn)=>handlers[id]=fn})};
  const calls=[];
  const ctx=vm.createContext({formatVND:n=>Number(n).toLocaleString('vi-VN')+' đ',downloadReadableWorkbook:(...args)=>calls.push(args),showFinanceCustomerDetail:(...args)=>calls.push(args),showToast:assert.fail,URLSearchParams});
  const source=fs.readFileSync('views/js/app.js','utf8');
  vm.runInContext(source.slice(source.indexOf('function escapeCustomerSearchText'),source.indexOf('const activeReportDownloads')),ctx);
  const financeSource=fs.readFileSync('views/js/blind-bag-finance.js','utf8');
  vm.runInContext(financeSource.slice(financeSource.indexOf('function financeExportURL'),financeSource.indexOf('function changeFinancePeriod')),ctx);
  ctx.renderCustomerSearchDetail(match,box);
  assert.match(box.innerHTML,/KHÁCH CẦN TRẢ SHOP/);
  assert.match(box.innerHTML,/<strong>100\.000 đ<\/strong>/);
  assert.match(box.innerHTML,/770\.000 đ/);assert.match(box.innerHTML,/2\.070\.000 đ/);
  assert.ok(!box.innerHTML.includes('SỐ DƯ RÒNG CUỐI CÙNG (NET)'));
  handlers['#customerSearchExport']();handlers['#customerSearchBill']();
  assert.equal(calls[0][0],'/api/reports/export/finance/customer?date=all&name=FreeFire');
  assert.deepEqual(calls[1],[match.finance,match.financePeriod]);
  const unavailable=ctx.renderCustomerCombinedBalance({});
  assert.match(unavailable,/Chưa tải được quyết toán chung/);assert.ok(!unavailable.includes('TIỀN CUỐI CÙNG'));
});
