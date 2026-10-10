// Isolated QA: actual models/controllers, simulated persistence; no live writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { isolatedModels, fixtures, isolatedUI } = require('./audit-customer-session.cjs');
const root = path.resolve(__dirname, '..');
const findings = [];
async function check(name, run) {
  try { await run(); findings.push({ name, result: 'PASS' }); }
  catch (error) { findings.push({ name, result: 'FAIL', detail: error.message }); }
}
function database() {
  const db = { menus: [{ id: 'm1', code: 'M1', name: 'QA', total_slots: 3, slot_price: 100, prize_value: 900 }],
    games: [{ id: 'g1', menu_id: 'm1', name: 'QA round 1', round_number: 1, total_slots: 3, slot_price: 100, prize_value: 900, status: 'open', winners: [] }],
    slots: [1,2,3].map(n => ({ id: 's'+n, game_id: 'g1', slot_number: n, player_name: ['A','B','C'][n-1] })), products: [], bills: [], fail: null, sequence: 0 };
  db.client = { async rpc(name, p) {
    if (db.fail === 'games:update') return { data: null, error: { message: 'Simulated DB failure' } };
    if (name === 'mutate_slot_round') {
      if (db.fail==='slots:update') return {data:null,error:{message:'Simulated slot failure'}};
      const game=db.games.find(g=>g.id===p.p_game_id), options=p.p_payload;
      if(p.p_action==='config')Object.assign(game,{slot_price:options.slotPrice ?? game.slot_price,prize_value:options.prizeValue ?? game.prize_value});
      else if(p.p_action==='assign')Object.assign(db.slots.find(s=>s.game_id===game.id&&s.slot_number===Number(options.slotNumber)),{player_name:options.playerName,shares:options.shares});
      else throw new Error('Unexpected action '+p.p_action);
      return {data:{gameId:game.id,slots:[]},error:null};
    }
    if (name !== 'finish_slot_round') throw new Error('Unexpected RPC ' + name);
    const game = db.games.find(g => g.id === p.p_game_id && g.menu_id === p.p_menu_id);
    if (!game) return { data: null, error: { message: 'Missing game' } };
    Object.assign(game, { status:'finished', winners:p.p_winners, settle_mode:p.p_mode, finished_results:p.p_results });
    return { data: { completedId:game.id, nextId:null }, error:null };
  }, from(table) {
    let op = 'select', payload, one = false, windowRange = null; const filters = [];
    const q = {
      range(a,b) { windowRange=[a,b]; return q; }, select() { return q; }, order() { return q; }, limit() { return q; },
      eq(k,v) { filters.push(r => r[k] === v); return q; },
      gt(k,v) { filters.push(r => r[k] > v); return q; },
      single() { one = true; return q; }, maybeSingle() { one = true; return q; },
      insert(v) { op = 'insert'; payload = v; return q; },
      update(v) { op = 'update'; payload = v; return q; },
      delete() { op = 'delete'; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (db.fail === table + ':' + op) return { data: null, error: { message: 'Simulated DB failure', code: 'QA_ERROR' } };
          let rows = db[table].filter(r => filters.every(f => f(r)));
          if (op === 'insert') { rows = (Array.isArray(payload) ? payload : [payload]).map(r => ({ id: 'qa'+(++db.sequence), ...structuredClone(r) })); db[table].push(...rows); }
          if (op === 'update') rows.forEach(r => Object.assign(r, structuredClone(payload)));
          if (op === 'delete') db[table] = db[table].filter(r => !rows.includes(r));
          rows = structuredClone(windowRange ? rows.slice(windowRange[0],windowRange[1]+1) : rows);
          if (table === 'games') rows.forEach(r => { r.slots = structuredClone(db.slots.filter(s => s.game_id === r.id)); });
          return { data: one ? rows[0] || null : rows, error: null };
        }).then(resolve, reject);
      }
    }; return q;
  }};
  return db;
}
function instance(db) {
  const cache = new Map();
  const load = file => {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const requireLocal = name => {
      if (name === 'fs') return { existsSync: () => false, mkdirSync() {}, writeFileSync() {} };
      if (name === 'path') return path;
      if (name === 'crypto') return require('node:crypto');
      if (name === 'exceljs') return require('exceljs');
      if (name.endsWith('supabase.config')) return { supabase: db.client, isConfigured: () => true };
      if (name.endsWith('shop.config')) return { bankCode:'QA', accountNumber:'0000',accountOwner:'TEST' };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.js'));
      throw new Error('Unexpected dependency: '+name);
    };
    vm.runInThisContext('(function(require,module,exports,__dirname){'+fs.readFileSync(file,'utf8')+'\n})', { filename: file })(requireLocal,module,module.exports,path.dirname(file));
    return module.exports;
  };
  return { Game: load('models/GameModel.js'), Menu: load('models/MenuModel.js'), Slot: load('models/SlotModel.js'), Controller: load('controllers/GameController.js'), Product:load('models/ProductModel.js'), Bill:load('models/BillModel.js'), Report:load('models/ReportModel.js'), Settlement:load('models/SettlementModel.js'), load };
}
async function main() {
  for (const [mode, count] of [['solo',1],['split2',2],['split3',3]]) {
    await check('Settlement '+mode+' with and without deduction', async () => {
      const m = isolatedModels(); const menu = await m.Menu.createMenu({ name:'QA',slotPrice:100,totalSlots:6,prizeValue:900 });
      const g = await m.Game.getCurrentGame(menu.id);
      for (let i=0;i<3;i++) await m.Slot.assignSlot(g.id,i+1,['A','B','C'][i]);
      for (const deduct of [true,false]) {
        const r=await m.Settlement.calculateSettlement(mode,['A','B','C'].slice(0,count),g.id,deduct);
        assert.equal(r.settlementList.reduce((s,p)=>s+p.prizeWon,0),900);
        assert.equal(r.settlementList[0].netAmount,900/count-(deduct?100:0));
      }
    });
  }
  await check('Slot add, remove, quick registration and overflow rejection',async()=>{
    const m=isolatedModels();const g=await m.Game.getCurrentGame();
    await m.Slot.quickRegister(g.id,'A',2); assert.equal((await m.Game.getCurrentGame()).slots.filter(s=>s.player_name).length,2);
    await assert.rejects(m.Slot.quickRegister(g.id,'B',g.totalSlots));
    await m.Slot.releasePlayerSlots(g.id,'A'); assert.equal(g.slots.filter(s=>s.player_name).length,0);
    const before=g.totalSlots;await m.Slot.addSlot(g.id);assert.equal(g.totalSlots,before+1);await m.Slot.removeLastSlot(g.id);assert.equal(g.totalSlots,before);
  });
  await check('Finalize, next round, history and CSV exports',async()=>{
    const m=isolatedModels();const g=await m.Game.getCurrentGame();await m.Slot.assignSlot(g.id,1,'A');
    const settlement=await m.Settlement.calculateSettlement('solo',['A'],g.id);
    const next=await m.Game.finishAndStartNextRound(g.menuId,settlement.settlementList,['A'],'solo');
    assert.equal(next.nextRound.roundNumber,2);assert.equal((await m.Game.getRoundHistory(g.menuId)).length,1);
    assert.equal(next.nextRound.slots.filter(s=>s.player_name).length,0);
    assert.ok((await m.Report.exportDetailedRoundsCsv(g.menuId)).includes('WINNER (TRÚNG GIẢI)'));
    assert.ok((await m.Report.exportCustomerDetailCsv('A')).includes('A'));
  });
  await check('DB success survives fresh server instance',async()=>{
    const db=database();await instance(db).Game.finalizeGame('m1',{winners:['A'],finishedResults:[{playerName:'A',prizeWon:900}]});
    assert.equal((await instance(db).Game.getRoundHistory('m1')).length,1);
  });
  await check('Another server sees newly finalized history',async()=>{
    const db=database(),reader=instance(db);await reader.Game.getRoundHistory('m1');
    await instance(db).Game.finalizeGame('m1',{winners:['A']});
    assert.equal((await reader.Game.getRoundHistory('m1')).length,1,'Warm server still returns empty history after another server saved it');
  });
  await check('Another server sees newly created menu',async()=>{
    const db=database(),reader=instance(db);await reader.Menu.getAllMenus();
    await instance(db).Menu.createMenu({name:'QA new',slotPrice:200,totalSlots:3,prizeValue:600});
    assert.equal((await reader.Menu.getAllMenus()).length,2,'Warm server keeps old menu cache');
  });
  await check('Finalize DB failure must return error, not success',async()=>{
    const db=database();db.fail='games:update';const m=instance(db);let status=200,body;
    const res={status(s){status=s;return this;},json(b){body=b;}};
    await m.Controller.finalizeGame({body:{menuId:'m1',roundNumber:1,winners:['A']}},res);
    const coldHistory=await instance(db).Game.getRoundHistory('m1');
    assert.ok(status>=400 && !body.success,'API returned success='+body.success+'; fresh instance history='+coldHistory.length);
  });
  await check('Slot DB failure must reject assignment',async()=>{
    const db=database();db.fail='slots:update';await assert.rejects(instance(db).Slot.assignSlot('g1',1,'Changed'));
  });
  await check('Round price retained after reload',async()=>{
    const db=database();await instance(db).Game.updateRound('m1',1,{slotPrice:250,prizeValue:750});
    const g=await instance(db).Game.getCurrentGame('m1',1);assert.equal(g.slotPrice,250,'getCurrentGame replaces round price with menu price');
    await instance(db).Game.updateRound('m1',1,{slotPrice:0,prizeValue:0});
    const zero=await instance(db).Game.getCurrentGame('m1',1);assert.equal(zero.slotPrice,0);assert.equal(zero.prizeValue,0);
  });
  await check('Selected older round is finalized across server instances',async()=>{
    const db=database();db.games.push({...db.games[0],id:'g2',round_number:2,name:'QA round 2'});
    await instance(db).Game.switchActiveRound('m1',1);
    await instance(db).Controller.finalizeGame({body:{menuId:'m1',roundNumber:1,winners:['A']}},{json(){},status(){return this;}});
    assert.equal(db.games.find(g=>g.id==='g1').status,'finished','Finalize ignores selected round and closes another round');
  });
  await check('Unknown game ID must not resolve to a different game',async()=>{
    const db=database();await assert.rejects(instance(db).Game.getGameById('missing'));
  });
  await check('Prize splitting preserves total with remainder',async()=>{
    const m=isolatedModels();const g=await m.Game.getCurrentGame();await m.Game.updateRound(g.menuId,1,{prizeValue:1000000});
    // getCurrentGame currently overwrites round values; change menu too to isolate rounding.
    await m.Menu.updateMenu(g.menuId,{prizeValue:1000000});
    for(let i=0;i<3;i++)await m.Slot.assignSlot(g.id,i+1,['A','B','C'][i]);
    const r=await m.Settlement.calculateSettlement('split3',['A','B','C'],g.id);
    assert.equal(r.settlementList.reduce((s,p)=>s+p.prizeWon,0),1000000);
  });
  await check('Retail product CRUD survives new instance',async()=>{
    const db=database();db.products.push({id:1,name:'Son QA',price:250000});const m=instance(db);
    await m.Product.updateProduct(1,{name:'Son QA updated',price:260000,image_url:''});
    assert.equal((await instance(db).Product.getAll())[0].price,260000);
    await m.Product.deleteProduct(1);assert.equal(db.products.length,0);
    await m.Product.addProduct({name:'Phan QA',price:290000});assert.equal((await instance(db).Product.getAll())[0].price,290000);
  });
  await check('Bill and QR amount survive fresh instance',async()=>{
    const db=database();await instance(db).Bill.createBill({customerName:'QA',netAmount:-500000,buyCost:500000});
    const bills=await instance(db).Bill.getRecentBills();assert.equal(bills.length,1);assert.equal(bills[0].net_amount,-500000);assert.ok(bills[0].qr_url.includes('amount=500000'));
  });
  await check('Bill DB failure must reject instead of temporary success',async()=>{
    const db=database();db.fail='bills:insert';await assert.rejects(instance(db).Bill.createBill({customerName:'QA',netAmount:-500000}));
  });
  await check('Empty product catalog stays empty',async()=>{
    assert.equal((await instance(database()).Product.getAll()).length,0,'Empty DB returns demo catalog');
  });
  const output={scope:'Isolated tests of real models/controllers with simulated DB. No production writes.',pass:findings.filter(f=>f.result==='PASS').length,fail:findings.filter(f=>f.result==='FAIL').length,findings};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2));
  console.log(JSON.stringify(output,null,2));
  if (output.fail) process.exitCode = 1;
}
module.exports = { instance };
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
