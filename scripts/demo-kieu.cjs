// Disposable local example using the real application models, controllers and UI.
// The isolated loader replaces only persistence with memory, never calculations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const { fixtures, isolatedModels, isolatedUI } = require('./audit-customer-session.cjs');

async function main() {
  const models = isolatedModels();
  const { Menu, Game, Slot, Report } = models;
  const ui = isolatedUI();
  const defaultMenus = [...await Menu.getAllMenus()];
  const results = [];
  for (const [key, winners] of [['gau', ['mayne', 'lan anh', 'ngọc']], ['uni', ['mayne', 'bàn tay vàng', 'kiều']]]) {
    const fixture = fixtures.find(f => f.key === key);
    const menu = await Menu.createMenu({ name: 'VÍ DỤ · ' + fixture.name, slotPrice: fixture.price, totalSlots: 10, prizeValue: fixture.prize });
    menu.id = 'demo-' + key;
    const round = await Game.getCurrentGame(menu.id);
    for (let i = 0; i < fixture.names.length; i++) await Slot.assignSlot(round.id, i + 1, fixture.names[i]);
    const calculated = ui(round, winners);
    await Game.finalizeGame(menu.id, { winners, settleMode: 'split3', deductSlotCost: true, finishedResults: calculated.results });
    results.push({ menu: menu.name, winners, results: calculated.results });
  }
  for (const menu of defaultMenus) await Menu.deleteMenu(menu.id);
  await Game.switchActiveMenu('demo-gau');
  const [kieu] = await Report.searchCustomer('kiều');
  assert.equal(kieu.totalSlots, 4);
  assert.equal(kieu.totalBuyCost, 540000);
  assert.equal(kieu.totalPrizeWon, 400000);
  assert.equal(kieu.netAmount, -140000);
  const outputDir = path.resolve(process.argv[2] || path.join(__dirname, '../outputs/demo-kieu'));
  fs.mkdirSync(outputDir, { recursive: true });
  const csv = await Report.exportCustomerDetailCsv('kiều');
  assert.ok(csv.includes('TỔNG CỘNG KÈO SLOT,,,4,,,540000,400000,'));
  assert.ok(csv.includes('NET = B - A - C),-140000,'));
  fs.writeFileSync(path.join(outputDir, 'Vi_du_Kieu_Gau_Uni.csv'), csv);
  fs.writeFileSync(path.join(outputDir, 'Vi_du_Kieu_Gau_Uni.json'), JSON.stringify({
    exampleOnly: true, note: 'Synthetic recipients: mayne is selected for this example, not asserted to be Ái Vân. THU 1200 treated as prize pool. Slot payments not yet paid.',
    kieu, results
  }, null, 2));
  console.log('VERIFIED: 4 slots; buy 540000; prize 400000; net -140000. CSV: ' + path.join(outputDir, 'Vi_du_Kieu_Gau_Uni.csv'));
  if (!process.argv.includes('--serve')) return;

  const app = express();
  const game = models.load('controllers/GameController.js');
  const report = models.load('controllers/ReportController.js');
  app.use(express.json());
  app.get('/api/menus', async (_, res) => res.json({ success: true, data: await Menu.getAllMenus() }));
  app.get('/api/game', game.getGame);
  app.get('/api/game/history', game.getRoundHistory);
  app.post('/api/game/switch-menu', game.switchMenu);
  app.post('/api/game/switch-round', game.switchRound);
  app.get('/api/reports/all-menus', report.getAllMenusReport);
  app.get('/api/reports/menu/:menuId', report.getMenuReport);
  app.get('/api/reports/search', report.searchCustomer);
  app.get('/api/reports/customer-detail', report.getCustomerDetail);
  app.get('/api/reports/export/customer', report.downloadCustomerDetailCsv);
  app.post('/api/reports/export/customer', report.downloadCustomerDetailCsv);
  app.get('/api/products', (_, res) => res.json({ success: true, data: [] }));
  app.get('/api/blind-bags', (_, res) => res.json({ success: true, data: [], persistent: false }));
  app.use('/api', (_, res) => res.status(403).json({ success: false, error: 'Bản ví dụ chỉ xem và xuất file; không sửa dữ liệu.' }));
  app.get('/', (_, res) => {
    const html = fs.readFileSync(path.join(__dirname, '../views/index.html'), 'utf8')
      .replace('<title>BETTING</title>', '<title>VÍ DỤ KIỀU · GẤU + UNI</title>')
      .replace('<body class="theme-lovable">', '<body class="theme-lovable"><div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff3cd;color:#713f12;text-align:center;padding:8px;font-size:12px">VÍ DỤ THỬ NGHIỆM · Gấu: mayne + Lan Anh + Ngọc; Uni: mayne + Bàn Tay Vàng + Kiều · Chưa thanh toán tiền ghế · Không dùng chốt tiền thật</div>');
    res.send(html);
  });
  app.use(express.static(path.join(__dirname, '../views')));
  app.listen(3103, '127.0.0.1', () => console.log('DEMO READY http://127.0.0.1:3103 — RAM only, no live DB'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
