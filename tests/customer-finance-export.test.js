const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ExcelJS=require('exceljs');
const {forCustomer}=require('../services/customerFinanceService');
const workbooks=require('../services/reportWorkbookService');
const FinanceModel=require('../models/FinanceModel');
const Controller=require('../controllers/ReportController');

const person=(customerName,net)=>({customerName,slotNet:net,bagTotal:414000,bagPaid:414000,bagDue:0,buybackTotal:250000,shopPays:Math.max(0,net+250000),customerPays:Math.max(0,-net-250000),events:[
  {type:'Bàn kèo',context:'Gấu',slots:'Chuyến #1',name:'Mua #1, #2 · Thắng #2',quantity:2,amount:net,status:'Đã chốt'},
  {type:'Mua túi mù và hàng kèm',context:'Túi mù',slots:'1',name:'Hóa đơn',quantity:1,amount:414000,status:'Đã trả tiền'},
  {type:'Shop thu lại',context:'Túi mù',slots:'1',name:'Son',quantity:1,amount:250000,status:'Ghi có cho khách'},
  {type:'Shop thu lại',context:'Túi mù',slots:'1',name:'Phấn',quantity:1,amount:290000,status:'Đã hủy phiếu'}]});
const data={customers:[person('Kiều',-405000),person('kieu',-90000),person('Khánh',1200000)]};

test('a per-customer export uses exact identity, never a fuzzy search or all customers',()=>{
  const filtered=forCustomer(data,' KIỀU ');
  assert.equal(filtered.totalCustomers,1);
  assert.equal(filtered.customerPays,155000);
  assert.equal(filtered.shopPays,0);
  assert.deepEqual(filtered.customers,[data.customers[0]]);
  assert.equal(forCustomer(data,'kieu').shopPays,160000);
  for(const name of ['', 'k', 'không tồn tại'])assert.equal(forCustomer(data,name),null);
  assert.equal(data.customers.length,3);
});

test('individual Excel contains only the selected customer and reconciles paid purchases and pass',async()=>{
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(await workbooks.finance(forCustomer(data,'Kiều'),{customerName:'Kiều'}).xlsx.writeBuffer());
  const ws=wb.getWorksheet('Tổng hợp'),detail=wb.getWorksheet('Chi tiết');
  assert.equal(ws.getCell('A2').value,'QUYẾT TOÁN RIÊNG KHÁCH HÀNG');
  assert.match(ws.getCell('A3').value,/Khách hàng: Kiều/);
  assert.equal(ws.getCell('A12').value,'Kiều');
  assert.equal(ws.getCell('A13').value,'TỔNG');
  assert.equal(ws.getCell('F5').value.result,155000);
  assert.equal(ws.getCell('F6').value.result??0,0);
  assert.equal(ws.getCell('E12').value.result??0,0);
  assert.equal(ws.getCell('H12').value.result,155000);
  assert.equal(ws.getCell('H12').fill.fgColor.argb,'FFF1DE');
  assert.equal(detail.getCell('B6').value,'Kiều');
  assert.equal(detail.getCell('I9').value,'Đã hủy phiếu');
  assert.match(detail.getCell('F6').value,/Mua #1, #2 · Thắng #2/);
  for(const sheet of wb.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{
    assert.notEqual(cell.value,'kieu');assert.notEqual(cell.value,'Khánh');
  }));
});

test('download handler returns an xlsx for one customer and refuses missing or ambiguous queries',async()=>{
  const previous=FinanceModel.getSummary;
  FinanceModel.getSummary=async()=>data;
  const response=()=>({headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;},send(body){this.body=body;}});
  try{
    const res=response();await Controller.downloadCustomerFinance({query:{name:'kiều'}},res);
    assert.equal(res.code,200);assert.ok(Buffer.isBuffer(res.body));
    assert.match(res.headers['Content-Disposition'],/Quyet_toan_Ki%E1%BB%81u/);
    const read=new ExcelJS.Workbook();await read.xlsx.load(res.body);
    assert.equal(read.getWorksheet('Tổng hợp').getCell('A12').value,'Kiều');
    for(const name of [undefined,'', ['Kiều','Khánh'],'k','không tồn tại']){
      const bad=response();await Controller.downloadCustomerFinance({query:{name}},bad);
      assert.equal(bad.code,typeof name!=='string'||!name?400:404);assert.equal(bad.body.success,false);
    }
  }finally{FinanceModel.getSummary=previous;}
});

test('search shows a separate safely encoded download for every matching row',()=>{
  const elements={financeSearch:{value:'k'},financeBody:{innerHTML:''}};
  const context=vm.createContext({URLSearchParams,document:{getElementById:id=>elements[id]},CustomerSearch:require('../views/js/customer-search'),formatVND:String,
    blindBagEscape:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')});
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/blind-bag-finance'),'utf8'),context);
  context.rows=data.customers;
  vm.runInContext('financeRows=rows;renderFinanceSummary();',context);
  const html=elements.financeBody.innerHTML;
  assert.equal((html.match(/href=/g)||[]).length,3);
  for(const row of data.customers)assert.ok(html.includes('name='+encodeURIComponent(row.customerName)));
  elements.financeSearch.value='không tồn tại';vm.runInContext('renderFinanceSummary()',context);
  assert.match(elements.financeBody.innerHTML,/colspan="7"/);assert.ok(!elements.financeBody.innerHTML.includes('href='));
  elements.financeSearch.value='';context.rows=[person('K"><script>',0)];
  vm.runInContext('financeRows=rows;renderFinanceSummary()',context);
  assert.ok(!elements.financeBody.innerHTML.includes('<script>'));
});
