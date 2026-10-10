const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { PGlite } = require('@electric-sql/pglite');
const core = require('../views/js/settlement-core');
const reports = require('../services/reportWorkbookService');
const { isolatedModels } = require('../scripts/audit-customer-session.cjs');

const fixture = {
  slotPrice: 135000, prizeValue: 1200000,
  slots: ['Mayne', 'Freefire', 'Freefire', 'mayne', 'Kiều', '', '', '', '', '']
    .map((player_name, index) => ({ slot_number: index + 1, player_name }))
};
const rowFor = (rows, name) => rows.find(row => core.key(row.playerName) === core.key(name));

async function createRound(app) {
  const menu = await app.Menu.createMenu({ name: 'TEST SLOT THẮNG', slotPrice: fixture.slotPrice, totalSlots: 10, prizeValue: fixture.prizeValue });
  const game = await app.Game.getCurrentGame(menu.id, 1);
  for (const slot of fixture.slots.filter(slot => slot.player_name)) {
    await app.Slot.assignSlot(game.id, slot.slot_number, slot.player_name);
  }
  return { menu, game };
}

function response() {
  return { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test('only selected winning slots earn prizes; all purchased slots still incur their cost', () => {
  const rows = core.calculateBySlots(fixture, [3, 1, 2]);
  const mayne = rowFor(rows, 'Mayne'), freefire = rowFor(rows, 'Freefire'), kieu = rowFor(rows, 'Kiều');
  assert.deepEqual([mayne.slotCount, freefire.slotCount], [2, 2]);
  assert.deepEqual([mayne.slotsList, freefire.slotsList], [[1, 4], [2, 3]]);
  assert.deepEqual([mayne.winningSlotsList, freefire.winningSlotsList, kieu.winningSlotsList], [[1], [2, 3], []]);
  assert.deepEqual([mayne.winningSlotCount, freefire.winningSlotCount], [1, 2]);
  assert.deepEqual([mayne.prizeWon, freefire.prizeWon, kieu.prizeWon], [400000, 800000, 0]);
  assert.deepEqual([mayne.buyCost, freefire.buyCost], [270000, 270000]);
  assert.deepEqual([mayne.netAmount, freefire.netAmount, kieu.netAmount], [130000, 530000, -135000]);
  assert.ok(rows.every(row => row.prizeRule === 'winning_slots'));
  assert.deepEqual(core.winningSlotsFromResults(rows), [1, 2, 3]);
  const paid = core.calculateBySlots(fixture, [1, 2, 3], false, { MAYNE: [{ name: 'Son', price: 100000, qty: 2 }] });
  assert.equal(rowFor(paid, 'Mayne').netAmount, 200000);
  assert.equal(rowFor(paid, 'Freefire').netAmount, 800000);
  assert.equal(rowFor(paid, 'Kiều').netAmount, -135000);
});

test('rejects empty, duplicate, unsold, absent, negative and non-integer winning slots', () => {
  for (const selected of [[], null, '1', [1, 1], [1, '1'], [6], [11], [-1], [0], [1.5], ['abc'], [NaN]]) {
    assert.throws(() => core.calculateBySlots(fixture, selected), 'Invalid selection: ' + JSON.stringify(selected));
  }
  assert.deepEqual(core.winningSlotNumbers(fixture, ['3', '1', '2']), [1, 2, 3]);
});

test('a shared winning slot splits only its own award, preserving ownership and every đồng', () => {
  const shared = { slotPrice: 101, prizeValue: 1001, slots: [
    { slot_number: 1, player_name: 'A + B', shares: [{ name: 'A', percent: 25 }, { name: 'B', percent: 75 }] },
    { slot_number: 2, player_name: 'B' },
    { slot_number: 3, player_name: 'A' }
  ] };
  const rows = core.calculateBySlots(shared, [1, 2]);
  const a = rowFor(rows, 'A'), b = rowFor(rows, 'B');
  // Slot #1 receives 501đ: A receives 125đ, B 376đ. Slot #2 receives 500đ.
  assert.deepEqual([a.prizeWon, b.prizeWon], [125, 876]);
  assert.deepEqual([a.winningSlotsList, b.winningSlotsList], [[1], [1, 2]]);
  assert.deepEqual([a.winningSlotCount, b.winningSlotCount], [0.25, 1.75]);
  assert.deepEqual([a.slotCount, b.slotCount], [1.25, 1.75]);
  assert.equal(rows.reduce((sum, row) => sum + row.buyCost, 0), 303);
  assert.equal(rows.reduce((sum, row) => sum + row.prizeWon, 0), 1001);
});

test('arbitrary winning-slot counts preserve the prize without increasing payouts for losing owned slots', () => {
  const many = { slotPrice: 7, prizeValue: 1000003, slots: Array.from({ length: 15 }, (_, index) => ({ slot_number: index + 1, player_name: 'Khách ' + index % 4 })) };
  for (let count = 1; count <= 15; count++) {
    const selected = Array.from({ length: count }, (_, index) => index + 1);
    const rows = core.calculateBySlots(many, selected);
    const base = Math.floor(many.prizeValue / count), remainder = many.prizeValue % count;
    assert.equal(rows.reduce((sum, row) => sum + row.prizeWon, 0), many.prizeValue);
    assert.equal(rows.reduce((sum, row) => sum + row.buyCost, 0), 105);
    for (const row of rows) {
      const ids = selected.filter(number => core.key(many.slots[number - 1].player_name) === core.key(row.playerName));
      const expected = ids.reduce((sum, number) => sum + base + (number <= remainder ? 1 : 0), 0);
      assert.equal(row.prizeWon, expected);
      assert.deepEqual(row.winningSlotsList, ids);
    }
  }
});

test('actual preview/finalize controllers compute server results, preserve history, and reuse the next round', async () => {
  const app = isolatedModels(), { menu, game } = await createRound(app);
  const settlementController = app.load('controllers/SettlementController.js');
  const gameController = app.load('controllers/GameController.js');
  const preview = response();
  await settlementController.settle({ body: { gameId: game.id, winningSlots: [1, 2, 3], winners: ['Kiều'], settleMode: 'solo' } }, preview);
  assert.equal(preview.code, 200);
  assert.equal(preview.payload.data.prizeByWinner.mayne, 400000);
  assert.equal(preview.payload.data.prizeByWinner.freefire, 800000);
  assert.deepEqual(preview.payload.data.winningSlots, [1, 2, 3]);
  assert.equal((await app.Game.getRoundHistory(menu.id)).length, 0, 'A preview must not persist the outcome');
  const invalid = response();
  await settlementController.settle({ body: { gameId: game.id, winningSlots: [6] } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(invalid.payload.success, false);
  const saved = response();
  await gameController.finalizeGame({ body: { menuId: menu.id, roundNumber: 1, winningSlots: [1, 2, 3], winners: ['Kiều'], settleMode: 'solo', finishedResults: [{ playerName: 'Kiều', prizeWon: 9999999 }] } }, saved);
  assert.equal(saved.code, 200);
  assert.equal(saved.payload.success, true);
  assert.deepEqual(saved.payload.data.winners, ['Mayne', 'Freefire']);
  const history = await app.Game.getRoundHistory(menu.id), original = JSON.stringify(history[0].finishedResults);
  assert.deepEqual(history[0].winningSlots, [1, 2, 3]);
  assert.equal(rowFor(history[0].finishedResults, 'Mayne').netAmount, 130000);
  const first = await app.Game.finishAndStartNextRound(menu.id, [], ['Kiều'], 'solo', [], 1, { winningSlots: [5] });
  const retry = await app.Game.finishAndStartNextRound(menu.id, [], [], 'solo', [], 1, { winningSlots: [] });
  assert.equal(first.nextRound.id, retry.nextRound.id);
  assert.equal((await app.Game.getAllRounds(menu.id)).length, 2);
  assert.equal(JSON.stringify((await app.Game.getRoundHistory(menu.id))[0].finishedResults), original);
  assert.deepEqual(first.nextRound.winningSlots, []);
  const summary = await app.Report.getCustomerStatsByMenu(menu.id);
  const customer = summary.customers.find(row => core.key(row.customerName) === 'mayne');
  assert.equal(customer.totalPrizeWon, 400000);
  assert.deepEqual(customer.roundsDetails[0].winningSlotsList, [1]);
  assert.equal(customer.roundsDetails[0].winningSlotCount, 1);
});

test('finished legacy snapshots retain their saved amounts and do not invent winning slot numbers', async () => {
  const app = isolatedModels(), { menu, game } = await createRound(app);
  await app.Game.finalizeGame(menu.id, { roundNumber: 1, winners: ['Mayne', 'Freefire'], settleMode: 'split2' });
  const legacy = await app.Game.getCurrentGame(menu.id, 1);
  assert.equal(legacy.winningSlots, null);
  assert.equal(rowFor(legacy.finishedResults, 'Mayne').prizeWon, 600000);
  const original = JSON.stringify(legacy.finishedResults);
  await app.Game.finishAndStartNextRound(menu.id, null, [], 'solo', null, 1, { winningSlots: [1, 2, 3] });
  const saved = (await app.Game.getRoundHistory(menu.id))[0];
  assert.equal(JSON.stringify(saved.finishedResults), original);
  assert.equal(core.winningSlotsFromResults(saved.finishedResults), null);
  assert.equal(rowFor(saved.finishedResults, 'Freefire').prizeWon, 600000);
});

test('legacy attached goods can be added and removed without changing saved prizes or inventing winning slots', async () => {
  const app = isolatedModels(), { menu } = await createRound(app);
  const legacy = await app.Game.finalizeGame(menu.id, { roundNumber: 1, winners: ['Mayne', 'Freefire'], settleMode: 'split2' });
  const original = JSON.stringify(legacy.finishedResults);
  const preview = core.withAttachedProducts(legacy.finishedResults, { MAYNE: [{ name: 'Son', price: 100000, qty: 1 }] });
  assert.equal(JSON.stringify(legacy.finishedResults), original, 'Changing goods must not mutate the saved input');
  assert.equal(rowFor(preview, 'Mayne').netAmount, 230000);
  assert.equal(rowFor(preview, 'Mayne').prizeWon, 600000);
  for (const bad of [{ Mayne: {} }, { Mayne: [{ price: -1 }] }, { Mayne: [{ price: 100, qty: 0 }] }, { Mayne: [{ price: 100, qty: 1.5 }] }]) {
    assert.throws(() => core.withAttachedProducts(legacy.finishedResults, bad));
  }
  await app.Game.finalizeGame(menu.id, { roundNumber: 1, customerAttachedProducts: { MAYNE: [{ name: 'Son', price: 100000, qty: 1 }] } });
  const saved = await app.Game.getCurrentGame(menu.id, 1), mayne = rowFor(saved.finishedResults, 'Mayne');
  assert.equal(saved.winningSlots, null);
  assert.equal(saved.settleMode, 'split2');
  assert.deepEqual(saved.winners, ['Mayne', 'Freefire']);
  assert.equal(mayne.prizeWon, 600000);
  assert.equal(mayne.buyCost, 270000);
  assert.equal(mayne.attachedTotalCost, 100000);
  assert.equal(mayne.netAmount, 230000);
  assert.equal(rowFor(saved.finishedResults, 'Freefire').prizeWon, 600000);
  assert.equal((await app.Report.getCustomerStatsByMenu(menu.id)).customers.find(row => core.key(row.customerName) === 'mayne').netAmount, 230000);
  await app.Game.finalizeGame(menu.id, { roundNumber: 1, customerAttachedProducts: {} });
  const removed = (await app.Game.getRoundHistory(menu.id))[0];
  assert.equal(removed.winningSlots, null);
  assert.equal(rowFor(removed.finishedResults, 'Mayne').prizeWon, 600000);
  assert.equal(rowFor(removed.finishedResults, 'Mayne').netAmount, 330000);
  assert.equal(rowFor(removed.finishedResults, 'Mayne').attachedTotalCost, 0);
});

test('new-round creation responses explicitly provide an empty winning-slot selection', async () => {
  const app = isolatedModels(), { menu, game } = await createRound(app);
  assert.deepEqual(game.winningSlots, []);
  const next = await app.Game.createNewRound(menu.id);
  assert.deepEqual(next.winningSlots, []);
  assert.equal(next.prizeRule, null);
  const controller = app.load('controllers/GameController.js'), res = response();
  await controller.createRound({ body: { menuId: menu.id } }, res);
  assert.equal(res.payload.success, true);
  assert.deepEqual(res.payload.data.winningSlots, []);
});

test('stale client timestamps block finalizing and opening a successor before mutating saved data', async () => {
  const app = isolatedModels(), { menu, game } = await createRound(app);
  const controller = app.load('controllers/GameController.js');
  game.updatedAt = new Date('2026-10-10T01:00:00.000Z');
  const staleStamp = game.updatedAt.toISOString();
  await app.Slot.assignSlot(game.id, 1, 'Kiều');
  game.updatedAt = new Date('2026-10-10T01:01:00.000Z');
  const currentStamp = game.updatedAt.toISOString();
  for (const expectedUpdatedAt of [staleStamp, null, 'invalid']) {
    const stale = response();
    await controller.finalizeGame({ body: { menuId: menu.id, roundNumber: 1, winningSlots: [1, 2, 3], expectedUpdatedAt } }, stale);
    assert.equal(stale.payload.success, false);
    assert.match(stale.payload.error, /đã thay đổi/);
    assert.equal((await app.Game.getRoundHistory(menu.id)).length, 0);
    assert.equal((await app.Game.getCurrentGame(menu.id, 1)).status, 'open');
  }
  const fresh = response();
  await controller.finalizeGame({ body: { menuId: menu.id, roundNumber: 1, winningSlots: [1, 2, 3], expectedUpdatedAt: currentStamp } }, fresh);
  assert.equal(fresh.payload.success, true);
  assert.equal(rowFor(fresh.payload.data.finishedResults, 'Mayne').prizeWon, 0);
  assert.equal(rowFor(fresh.payload.data.finishedResults, 'Kiều').prizeWon, 400000);
  const saved = JSON.stringify(fresh.payload.data.finishedResults);
  const staleNext = response();
  await controller.nextRound({ body: { menuId: menu.id, roundNumber: 1, winningSlots: [1, 2, 3], expectedUpdatedAt: currentStamp } }, staleNext);
  assert.equal(staleNext.payload.success, false);
  assert.match(staleNext.payload.error, /đã thay đổi/);
  assert.equal((await app.Game.getAllRounds(menu.id)).length, 1);
  assert.equal(JSON.stringify((await app.Game.getRoundHistory(menu.id))[0].finishedResults), saved);
  const current = await app.Game.getCurrentGame(menu.id, 1), next = response();
  await controller.nextRound({ body: { menuId: menu.id, roundNumber: 1, winningSlots: [1, 2, 3], expectedUpdatedAt: current.updatedAt.toISOString() } }, next);
  assert.equal(next.payload.success, true);
  assert.equal(next.payload.data.nextRound.roundNumber, 2);
  assert.equal(JSON.stringify(next.payload.data.completedRound.finishedResults), saved);
});

test('combined finance events show bought slot IDs separately from winning slot IDs', async () => {
  const app = isolatedModels(), { menu } = await createRound(app);
  await app.Game.finalizeGame(menu.id, { roundNumber: 1, winningSlots: [1, 2, 3] });
  const finance = app.load('services/customerFinanceService.js').summarize(await app.Report.getAllCustomersSummary(), []);
  const mayne = finance.customers.find(customer => core.key(customer.customerName) === 'mayne');
  assert.equal(mayne.slotNet, 130000);
  assert.equal(mayne.shopPays, 130000);
  const event = mayne.events.find(event => event.type === 'Bàn kèo');
  assert.match(event.name, /Mua #1, #4 · Thắng #1$/);
  assert.deepEqual(event.winningSlotsList, [1]);
  assert.equal(event.winningSlotCount, 1);
  assert.equal(event.prizeWon, 400000);
  assert.equal(event.amount, 130000);
});

test('existing database RPC stores actual selected slots and awards atomically without a schema change', async () => {
  const db = new PGlite();
  try {
    const schema = fs.readFileSync(require.resolve('../schema.sql'), 'utf8');
    await db.exec(schema.slice(schema.indexOf('CREATE TABLE public.menus'), schema.indexOf('-- 6. CHỈ MỤC')));
    await db.exec(fs.readFileSync(require.resolve('../migrations/002_durable_rounds.sql'), 'utf8'));
    const menu = (await db.query("INSERT INTO menus(code,name,total_slots,slot_price,prize_value) VALUES('WIN','WIN',10,135000,1200000) RETURNING id")).rows[0].id;
    const game = (await db.query("INSERT INTO games(menu_id,name,total_slots,slot_price,prize_value) VALUES($1,'WIN 1',10,135000,1200000) RETURNING id,updated_at::text AS stamp", [menu])).rows[0];
    for (const slot of fixture.slots) await db.query('INSERT INTO slots(game_id,slot_number,player_name) VALUES($1,$2,$3)', [game.id, slot.slot_number, slot.player_name || null]);
    const stamp = (await db.query('SELECT updated_at::text AS stamp FROM games WHERE id=$1', [game.id])).rows[0].stamp;
    const result = core.calculateBySlots(fixture, [1, 2, 3]);
    await db.query('SELECT finish_slot_round($1,$2,$3,$4,$5,$6,false)', [game.id, menu, stamp, JSON.stringify(['Mayne', 'Freefire']), core.modeForWinningSlots([1, 2, 3]), JSON.stringify(result)]);
    const persisted = (await db.query('SELECT status,finished_results FROM games WHERE id=$1', [game.id])).rows[0];
    assert.equal(persisted.status, 'finished');
    assert.deepEqual(core.winningSlotsFromResults(persisted.finished_results), [1, 2, 3]);
    assert.equal(rowFor(persisted.finished_results, 'Mayne').prizeWon, 400000);
    assert.equal(rowFor(persisted.finished_results, 'Freefire').prizeWon, 800000);
    await assert.rejects(db.query("UPDATE slots SET player_name='Khách khác' WHERE game_id=$1 AND slot_number=1", [game.id]), /đã chốt/);
  } finally { await db.close(); }
});

test('Excel reports distinguish purchased slots from winning slots, including legacy disclosure', async () => {
  const app = isolatedModels(), { menu } = await createRound(app);
  const round = await app.Game.finalizeGame(menu.id, { roundNumber: 1, winningSlots: [1, 2, 3] });
  const stats = await app.Report.getCustomerStatsByMenu(menu.id), all = await app.Report.getAllCustomersSummary();
  const customer = (await app.Report.searchCustomer('mayne')).find(row => core.key(row.customerName) === 'mayne');
  for (const original of [reports.round(round), reports.menu(stats), reports.all(all), reports.customer(customer)]) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await original.xlsx.writeBuffer());
    const ws = wb.getWorksheet('Từng chuyến');
    const row = [...Array(ws.rowCount)].map((_, index) => ws.getRow(index + 1)).find(row => row.getCell(1).value === 'Mayne');
    assert.ok(row, 'Mayne is present in the detailed worksheet');
    assert.equal(row.getCell(3).value, '#1\nSlot đã mua: 1, 4');
    assert.equal(row.getCell(4).value, 2);
    assert.equal(row.getCell(6).value, 400000);
    assert.equal(row.getCell(9).value, '#1');
    assert.equal(row.getCell(10).value, 1);
  }
  const historyBook = new ExcelJS.Workbook();
  await historyBook.xlsx.load(await reports.history([round]).xlsx.writeBuffer());
  assert.equal(historyBook.getWorksheet('Lịch sử').getCell('I9').value, '#1, #2, #3');
  const legacy = { ...round, winningSlots: null, finishedResults: round.finishedResults.map(({ winningSlots, winningSlotsList, winningSlotCount, ...row }) => ({ ...row, prizeRule: 'winner_slots' })) };
  const legacyBook = new ExcelJS.Workbook();
  await legacyBook.xlsx.load(await reports.history([legacy]).xlsx.writeBuffer());
  assert.equal(legacyBook.getWorksheet('Lịch sử').getCell('I9').value, 'Không lưu slot thắng');
});
