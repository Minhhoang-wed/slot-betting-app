const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { createBlindBagService, createMemoryStore } = require('../services/blindBagService');
const { summarize } = require('../services/customerFinanceService');

async function setup() {
  const service = createBlindBagService(createMemoryStore(), { getAll: async () => [{ id: 1, name: 'Son', price: 250000 }] });
  const round = await service.create({ name: 'Đợt thử', productIds: Array(45).fill(1) });
  const first = await service.checkout(round.id, { requestId: randomUUID(), customerName: 'A', quantity: 1, items: [], discount: 0 });
  const second = await service.checkout(round.id, { requestId: randomUUID(), customerName: 'B', quantity: 1, items: [], discount: 0 });
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, disabled: false, textContent: '', style: {}, value: '', attrs: {},
      setAttribute(key, value) { this.attrs[key] = value; }, classList: { toggle() {} } });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: el }, currentBillData: {}, blindBagRounds: await service.list(), blindBagBusy: false,
    formatVND: amount => amount.toLocaleString('vi-VN') + ' đ', renderBlindBags() {}, showToast() {},
    async blindBagAPI(path, body, method) {
      assert.equal(method, 'PUT');
      const result = await service.payment(path.split('/')[1], body);
      return { data: result };
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/blind-bag-finance.js'), 'utf8'), context);
  context.loadFinanceSummary = async () => { context.finance = summarize({ customers: [] }, await service.list()); };
  context.showBlindBagBillPayment(second.round, first.order);
  return { context, el, service, round, first, second };
}

test('bill payment saves the exact invoice, removes only its debt, and survives reopening', async () => {
  const { context, el, service, round, first, second } = await setup();
  assert.match(el('bbBillPaymentStatus').textContent, /CÒN NỢ: 414/);
  await context.setBlindBagBillPayment(true);
  assert.equal(context.finance.customers.find(c => c.customerName === 'A').bagDue, 0);
  assert.equal(context.finance.customers.find(c => c.customerName === 'B').bagDue, 414000);
  assert.equal(el('billQrSection').style.display, 'none');
  assert.equal(context.currentBillData.blindBagPayment.paid, true);
  context.resetBlindBagBillPayment();
  assert.equal(el('bbBillPaymentControls').hidden, true);
  const saved = (await service.list()).find(r => r.id === round.id);
  context.showBlindBagBillPayment(saved, saved.data.orders.find(o => o.id === first.order.id));
  assert.match(el('bbBillPaymentStatus').textContent, /ĐÃ THANH TOÁN/);
  await context.setBlindBagBillPayment(false);
  assert.equal(context.finance.customers.find(c => c.customerName === 'A').bagDue, 414000);
  assert.equal(el('billQrSection').style.display, 'flex');
  assert.equal((await service.list())[0].data.orders.find(o => o.id === second.order.id).paid, false);
});

test('failed persistence never displays paid or removes debt, and supports retry', async () => {
  const { context, el } = await setup();
  const api = context.blindBagAPI;
  context.blindBagAPI = async () => { throw new Error('Mất kết nối'); };
  await context.setBlindBagBillPayment(true);
  assert.match(el('bbBillPaymentMessage').textContent, /Mất kết nối/);
  assert.equal(context.currentBillData.blindBagPayment.paid, false);
  assert.equal(context.finance.customers.find(c => c.customerName === 'A').bagDue, 414000);
  assert.equal(el('bbBillPaid').disabled, false);
  context.blindBagAPI = api;
  await context.setBlindBagBillPayment(true);
  assert.equal(context.currentBillData.blindBagPayment.paid, true);
});

test('duplicate clicks save once and a delayed response cannot mark a different bill paid', async () => {
  const { context, service, second, first } = await setup();
  let release, calls = 0;
  const api = context.blindBagAPI;
  context.blindBagAPI = async (...args) => { calls++; await new Promise(resolve => { release = resolve; }); return api(...args); };
  const pending = context.setBlindBagBillPayment(true);
  await context.setBlindBagBillPayment(true);
  assert.equal(calls, 1);
  context.resetBlindBagBillPayment();
  context.showBlindBagBillPayment(second.round, second.order);
  release(); await pending;
  assert.equal(context.currentBillData.blindBagPayment.paid, false);
  assert.equal((await service.list())[0].data.orders.find(o => o.id === first.order.id).paid, true);
  assert.equal((await service.list())[0].data.orders.find(o => o.id === second.order.id).paid, false);
});
