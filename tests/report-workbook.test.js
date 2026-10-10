const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const reports = require('../services/reportWorkbookService');

const customer = {
  customerName: 'Kiều', totalSlots: 2.5, totalBuyCost: 337500,
  totalPrizeWon: 600000, totalAttachedCost: 50000, netAmount: 212500,
  attachedItems: [{name: 'Son', qty: 1, price: 50000}],
  detailedMenus: [{menuName: 'Cốp Gấu', rounds: [{roundNumber: 1, status: 'finished',
    slots: [1, 3, 10], slotCount: 2.5, buyCost: 337500, prizeWon: 600000,
    attachedCost: 50000, net: 212500}]}]
};

test('customer Excel retains fractional seats, actual settlement, goods and cached totals', async () => {
  const bytes = await reports.customer(customer).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet('Khách hàng');
  assert.equal(ws.getCell('F9').value, 212500);
  assert.equal(ws.getCell('C15').value, 2.5);
  assert.equal(ws.getCell('G15').value, 262500);
  assert.equal(ws.getCell('G16').value.result, 262500);
  assert.match(ws.getCell('B15').value, /1, 3, 10/);
  assert.equal(ws.autoFilter, 'A14:H15');
  assert.equal(ws.getCell('D22').value, 50000);
  assert.equal(ws.getCell('G15').fill.fgColor.argb, 'E3F3EA');
});

test('full award mode is retained instead of recomputing award minus buy cost', () => {
  const data = {...customer, netAmount: 550000,
    detailedMenus: [{menuName:'Gấu',rounds:[{...customer.detailedMenus[0].rounds[0],net:550000}]}]};
  const ws = reports.customer(data).getWorksheet('Khách hàng');
  assert.equal(ws.getCell('F9').value,550000);
  assert.equal(ws.getCell('G15').value,600000);
});

test('pending and empty Excel exports remain clear and exclude empty rounds from pending', () => {
  const ws = reports.customer({...customer, detailedMenus:[{menuName:'Gấu',rounds:[{...customer.detailedMenus[0].rounds[0],status:'open'}]}]}).getWorksheet('Khách hàng');
  assert.match(ws.getCell('A11').value,/TẠM TÍNH/);
  const empty = reports.all({customers:[]}).getWorksheet('Thu và trả');
  assert.equal(empty.getCell('F9').value,0);
  assert.match(empty.getCell('A16').value,/Chưa có dữ liệu/);
});

test('collection separates receivables from payables and keeps literal names', async () => {
  const data={customers:[{...customer,customerName:'=1+1',netAmount:-100}, {...customer,customerName:'Ngọc',netAmount:200}]};
  const wb=reports.menu({...data,menu:{name:'Gấu'},customers:data.customers.map(c=>({...c,roundsDetails:[]}))});
  const read=new ExcelJS.Workbook(); await read.xlsx.load(await wb.xlsx.writeBuffer());
  const ws=read.getWorksheet('Thu và trả');
  assert.equal(ws.getCell('F9').value,100);
  assert.equal(ws.getCell('F10').value,200);
  assert.equal(ws.getCell('A16').value,'=1+1');
  assert.equal(ws.getCell('F18').value.result,100);
});
