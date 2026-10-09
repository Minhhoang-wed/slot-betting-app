const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createBlindBagService, createMemoryStore } = require('../services/blindBagService');

async function setup(store = createMemoryStore()) {
  const catalog = [{ id: 1, name: 'Son', price: 250000 }, { id: 2, name: 'Phấn', price: 290000 }];
  const service = createBlindBagService(store, { getAll: async () => catalog });
  const round = await service.create({ name: 'Túi mù tháng 10', productIds: Array.from({ length: 15 }, (_, i) => i % 2 + 1) });
  const buy = (quantity, overrides = {}) => service.checkout(round.id, {
    requestId: randomUUID(), customerName: 'Khách A', phone: '0901234567', quantity, items: [], discount: 0, ...overrides
  });
  return { service, round, buy, catalog };
}

test('creates exactly 15 product units, retaining repeated types and snapshots', async () => {
  const { service, round, catalog } = await setup();
  assert.equal(round.data.pool.length, 15);
  assert.equal(round.data.price, 414000);
  catalog[0].name = 'Đã sửa tên';
  assert.equal((await service.list())[0].data.pool[0].name, 'Son');
  await assert.rejects(service.create({ productIds: [1] }), /đúng 15/);
  await assert.rejects(service.create({ productIds: Array(15).fill(99) }), /không còn/);
});

test('mixed checkout stores authoritative prices, buyer, slots and full receipt together', async () => {
  const { buy, service } = await setup();
  const { order, round } = await buy(2, { items: [{ productId: 1, quantity: 3, price: 1 }], discount: 10000 });
  assert.equal(order.total, 1568000);
  assert.deepEqual(order.slots, [1, 2]);
  assert.equal(round.data.slots[1].customerName, 'Khách A');
  assert.equal(round.data.slots[1].phone, '0901234567');
  assert.equal((await service.list())[0].data.orders[0].id, order.id);
});

test('rejects invalid purchases without reserving slots', async () => {
  const { buy, service } = await setup();
  for (const quantity of [0, -1, 1.5, 16, '2']) await assert.rejects(buy(quantity), /Số slot/);
  await assert.rejects(buy(1, { customerName: ' ' }), /tên khách/);
  await assert.rejects(buy(1, { discount: -1 }), /Giảm giá/);
  await assert.rejects(buy(1, { discount: 414001 }), /vượt tổng/);
  await assert.rejects(buy(1, { items: [{ productId: 99, quantity: 1 }] }), /không còn/);
  await assert.rejects(buy(1, { items: [{ productId: 1, quantity: 0 }] }), /Số lượng/);
  assert.equal((await service.list())[0].data.slots.length, 0);
});

test('one buyer can purchase again and slots remain sequential', async () => {
  const { buy, service } = await setup();
  await buy(2);
  const { order } = await buy(3);
  assert.deepEqual(order.slots, [3, 4, 5]);
  assert.equal((await service.list())[0].data.orders.length, 2);
});

test('concurrent buyers cannot oversell the final slot', async () => {
  const { buy, service } = await setup();
  await buy(14);
  const results = await Promise.allSettled([buy(1), buy(1)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  const round = (await service.list())[0];
  assert.equal(round.data.slots.length, 15);
  assert.equal(new Set(round.data.slots.map(s => s.number)).size, 15);
});

test('retries and simultaneous double submits create only one order', async () => {
  const { buy, service, catalog } = await setup();
  const requestId = randomUUID();
  const [first, second] = await Promise.all([buy(2, { requestId }), buy(2, { requestId })]);
  assert.deepEqual(first.order, second.order);
  catalog.splice(0);
  const retry = await buy(2, { requestId });
  assert.deepEqual(retry.order, first.order);
  assert.equal((await service.list())[0].data.slots.length, 2);
  assert.equal((await service.list())[0].data.orders.length, 1);
});

test('offline results require a full round and each product unit has one recipient', async () => {
  const { buy, service, round } = await setup();
  await buy(14);
  const assign = (slotNumber, productNumber, previousProductNumber = null) => service.assign(round.id, { slotNumber, productNumber, previousProductNumber });
  await assert.rejects(assign(1, 1), /đủ 15/);
  await buy(1);
  await assign(1, 1);
  await assert.rejects(assign(2, 1), /đã được gán/);
  await assert.rejects(assign(1, 2), /vừa được sửa/);
  await assign(1, null, 1);
  await assign(2, 1);
  await assign(1, 2);
  for (let i = 3; i <= 15; i++) await assign(i, i);
  assert.equal((await service.list())[0].data.slots.filter(s => s.productNumber).length, 15);
});

test('simultaneous assignments cannot give one product to two slots', async () => {
  const { buy, service, round } = await setup();
  await buy(15);
  const results = await Promise.allSettled([1, 2].map(slotNumber => service.assign(round.id, { slotNumber, productNumber: 1, previousProductNumber: null })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await service.list())[0].data.slots.filter(s => s.productNumber === 1).length, 1);
});

test('new rounds retain previous buyers and results', async () => {
  const { buy, service, round } = await setup();
  await buy(1);
  await service.create({ productIds: Array(15).fill(1) });
  const rounds = await service.list();
  assert.equal(rounds.length, 2);
  assert.equal(rounds.find(r => r.id === round.id).data.slots.length, 1);
});

test('storage failures do not acknowledge or partially record a purchase', async () => {
  const memory = createMemoryStore();
  const store = { ...memory, save: async () => { throw new Error('Storage unavailable'); } };
  const { buy, service } = await setup(store);
  await assert.rejects(buy(2), /Storage unavailable/);
  const round = (await service.list())[0];
  assert.equal(round.data.slots.length, 0);
  assert.equal(round.data.orders.length, 0);
});
