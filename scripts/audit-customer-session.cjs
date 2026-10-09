// Replays the supplied customer session through the actual app models and UI
// calculation functions. All model storage is memory-only; no DB, HTTP, or live
// data files are accessed. Prize recipients below are explicitly synthetic.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

const fixtures = [
  { key: 'gau', name: 'RF CỐP GẤU', price: 135000, prize: 1200000,
    names: ['kiều', 'tn', 'lan anh', 'ngọc', 'mayne', 'tn', 'mayne', 'lan anh', 'ngọc', 'kiều'] },
  { key: 'kiniem', name: 'CỐP KỈ NIỆM', price: 165000, prize: 1500000,
    names: ['Kiều', 'lan anh', 'mayne', 'kiều', 'bàn tay yellow', 'mayne', 'ngọc', 'nora', 'ngọc + bàn tay yellow', 'lan anh'] },
  { key: 'tho', name: 'CỐP THỎ', price: 150000, prize: 1350000,
    names: ['bàn tay vàng', 'win', 'kiều', 'bàn tay yellow', 'mayne', 'win', 'mayne', 'lan anh', 'kiều', 'lan anh'] },
  { key: 'uni', name: 'CỐP UNI', price: 135000, prize: 1200000,
    names: ['ngọc', 'kiều', 'kiều', 'bàn tay vàng', 'ngọc', 'bàn tay vàng', 'lan anh', 'mayne', 'mayne', 'lan anh'] },
  { key: 'la', name: 'GƯƠNG LA ĐEN', price: 77000, prize: 680000,
    names: ['mayne', 'kiều', '', '', 'NGỌC', '', 'NGỌC', '', 'mayne', 'kiều'] },
  { key: 'xanh', name: 'GƯƠNG KỈ NIỆM XANH', price: 45000, prize: 360000,
    names: ['kiều', 'tn', 'dâu', 'dâu', 'tn', 'lan anh', 'bàn tay vàng', 'kiều', 'lan anh', 'kiều'] }
];

function isolatedModels() {
  const modules = new Map();
  const storage = new Map();
  const fakeFs = {
    existsSync: name => storage.has(name), mkdirSync() {},
    writeFileSync: (name, value) => storage.set(name, value),
    readFileSync: name => storage.get(name)
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const localRequire = name => {
      if (name === 'fs') return fakeFs;
      if (name === 'path') return path;
      if (name === 'crypto') return require('node:crypto');
      if (name.endsWith('shop.config')) return { name:'TEST LOCAL',bankCode:'QA',accountNumber:'0000',accountOwner:'TEST' };
      if (name.endsWith('supabase.config')) return { supabase: null, isConfigured: () => false };
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.js')));
      throw new Error('Blocked external dependency in isolated replay: ' + name);
    };
    vm.runInThisContext(`(function(require,module,exports,__dirname){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })
      (localRequire, module, module.exports, path.dirname(filename));
    return module.exports;
  }
  return { Game: load('models/GameModel.js'), Menu: load('models/MenuModel.js'),
    Slot: load('models/SlotModel.js'), Settlement: load('models/SettlementModel.js'), Report: load('models/ReportModel.js'), load };
}

function isolatedUI() {
  const context = vm.createContext({
    console, Intl, document: { addEventListener() {}, getElementById: () => null },
    fetch: async () => ({ json: async () => ({ success: true }) })
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'views/js/settlement-core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'views/js/app.js'), 'utf8'), context);
  vm.runInContext('updateHeroStats = () => {}; renderSettlementTableUI = () => {};', context);
  return (round, winners = []) => {
    context.input = { ...round, slots: round.slots.map(s => ({ id: s.slot_number, owner: s.player_name })), winners, settleMode: 'split3' };
    return JSON.parse(vm.runInContext(`
      gameState = input;
      autoCalculateSettlement(true);
      JSON.stringify({ players: getGroupedPlayerData(), results: gameState.finishedResults });
    `, context));
  };
}

async function main() {
  const { Game, Menu, Slot, Settlement, Report } = isolatedModels();
  const ui = isolatedUI();
  const rounds = new Map();
  const summary = [];
  for (const fixture of fixtures) {
    const menu = await Menu.createMenu({ name: fixture.name, slotPrice: fixture.price, totalSlots: 10, prizeValue: fixture.prize });
    // Stable fixture identifier; no reliance on Date.now() ID timing.
    menu.id = 'audit-' + fixture.key;
    const round = await Game.getCurrentGame(menu.id);
    for (let i = 0; i < fixture.names.length; i++) {
      await Slot.assignSlot(round.id, i + 1, fixture.names[i]);
    }
    rounds.set(fixture.key, round);
    const front = ui(round);
    const report = await Report.getCustomerStatsByMenu(menu.id);
    const expectedCost = fixture.names.filter(Boolean).length * fixture.price;
    assert.equal(front.players.reduce((s, p) => s + p.totalCost, 0), expectedCost);
    assert.equal(report.summary.grandTotalBuyCost, expectedCost);
    summary.push({ name: fixture.name, sold: fixture.names.filter(Boolean).length,
      price: fixture.price, buyCost: expectedCost,
      kieuSlots: fixture.names.filter(n => n.toLowerCase() === 'kiều').length,
      kieuCost: fixture.names.filter(n => n.toLowerCase() === 'kiều').length * fixture.price,
      uiCustomers: front.players.map(p => ({ name: p.name, slots: p.slots.length, buyCost: p.totalCost })),
      reportCustomers: report.customers.map(p => ({ name: p.customerName, slots: p.totalSlots, buyCost: p.totalBuyCost })) });
  }
  const rawReport = await Report.getAllCustomersSummary();
  assert.equal(rawReport.grandTotalSlots, 56);
  assert.equal(rawReport.grandTotalBuyCost, 6762000);
  assert.equal(summary.reduce((s, r) => s + r.kieuCost, 0), 1459000);

  const simulated = [];
  for (const [key, winners] of [['gau', ['mayne', 'lan anh', 'ngọc']], ['uni', ['mayne', 'bàn tay vàng', 'kiều']]]) {
    const round = rounds.get(key);
    const front = ui(round, winners);
    const back = await Settlement.calculateSettlement('split3', winners, round.id, true);
    assert.equal(back.prizePerWinner, 400000);
    for (const entry of front.results) {
      const backendEntry = back.settlementList.find(r => r.playerName === entry.playerName);
      assert.equal(entry.buyCost, 270000);
      assert.equal(entry.netAmount, winners.includes(entry.playerName) ? 130000 : -270000);
      assert.equal(entry.netAmount, backendEntry.netAmount);
    }
    assert.equal(front.results.reduce((s, r) => s + r.prizeWon, 0), 1200000);
    await Game.finalizeGame(round.menuId, { winners, settleMode: 'split3', deductSlotCost: true, finishedResults: front.results });
    const report = await Report.getCustomerStatsByMenu(round.menuId);
    const kieu = report.customers.find(c => c.customerName === 'kiều');
    assert.equal(kieu.netAmount, key === 'gau' ? -270000 : 130000);
    simulated.push({ name: round.name, winners, kieuBuyCost: kieu.totalBuyCost,
      kieuPrize: kieu.totalPrizeWon, kieuNet: kieu.netAmount, results: front.results });
  }
  assert.equal(simulated.reduce((s, r) => s + r.kieuNet, 0), -140000);

  // Probe screenshot names literally: no invented mapping between Ái Vân and buyers.
  await assert.rejects(Settlement.calculateSettlement('split3', ['Ái Vân', 'lan anh', 'ngọc'], rounds.get('gau').id));
  assert.equal(summary[1].reportCustomers.filter(c => c.name.toLowerCase() === 'kiều').length, 1);
  assert.equal(summary[1].reportCustomers.find(c => c.name.toLowerCase() === 'kiều').buyCost, 330000);
  const issues = [{ issue: 'Ghế chung giữ nguyên tên nhóm; chưa có tỷ lệ phân chia do người dùng xác nhận.' }];
  const output = { mode: 'Isolated replay of actual models and UI calculation; NO live DB or real payouts',
    assumptions: ['Prices and THU interpreted as thousands of VND; THU used as prizeValue for synthetic settlement only.',
      'No alias mapping for Ái Vân/mayne or bàn tay yellow/bàn tay vàng. No assumed split of shared seat.',
      'Only two synthetic rounds settled. Remaining four have no supplied winners.'],
    rounds: summary, totalSlots: 56, totalBuyCost: 6762000, kieuTotalBuyCost: 1459000,
    rawReportCustomers: rawReport.customers.map(c => ({ name: c.customerName, slots: c.totalSlots, buyCost: c.totalBuyCost })),
    simulated, simulatedKieuNet: -140000, issues };
  const outputPath = process.argv[2];
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ rounds: summary.map(({uiCustomers, reportCustomers, ...r}) => r),
    totalSlots: 56, totalBuyCost: 6762000, kieuTotalBuyCost: 1459000,
    simulated: simulated.map(({results,...s}) => s), issues }, null, 2));
  console.log('PASS: actual frontend, settlement model and report math checked against independent expected totals. Issues reproduced as listed.');
}
module.exports = { fixtures, isolatedModels, isolatedUI };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
