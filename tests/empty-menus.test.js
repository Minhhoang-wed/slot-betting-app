const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {isolatedModels}=require('../scripts/audit-customer-session.cjs');

test('deleting all menus including the last removes cached rounds and allows a fresh menu',async()=>{
  const app=isolatedModels();
  const menus=await app.Menu.getAllMenus();
  for(const menu of menus){
    const round=await app.Game.getCurrentGame(menu.id,1);
    await app.Slot.assignSlot(round.id,1,'Khách cũ');
    await app.Game.finalizeGame(menu.id,{roundNumber:1,winningSlots:[1]});
  }
  assert.equal((await app.Game.getRoundHistory()).length,4);
  for(const menu of [...menus])await app.Menu.deleteMenu(menu.id);
  assert.deepEqual(await app.Menu.getAllMenus(),[]);
  assert.deepEqual(await app.Game.getAllRounds(),[]);
  assert.deepEqual(await app.Game.getRoundHistory(),[]);
  const menu=await app.Menu.createMenu({name:'Đợt mới',slotPrice:135000,totalSlots:10,prizeValue:1200000});
  const round=await app.Game.switchActiveMenu(menu.id);
  assert.equal(round.roundNumber,1);
  assert.ok(round.slots.every(slot=>!slot.player_name));
  assert.deepEqual(round.winningSlots,[]);
});

test('empty menu UI hides old boards, clears orphan history and can load a newly added menu',async()=>{
  const elements=Object.fromEntries(['emptyMenuState','roundsSwitcherDock','gameWorkspace','finalResultCard','historyCountBadge','roundHistoryListContainer','menuPillsContainer'].map(id=>[id,{style:{},innerHTML:'old',textContent:'old'}]));
  const storage={'lucky_slot_history_deleted':'old history','lucky_slot_shop_settings':'keep settings'};
  Object.defineProperty(storage,'removeItem',{enumerable:false,value(key){delete this[key];}});
  let calls=0;
  const context=vm.createContext({console,Intl,localStorage:storage,document:{addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]},fetch:async()=>{calls++;return {ok:true,json:async()=>({success:true,data:[]})};}});
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/settlement-core'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/app'),'utf8'),context);
  vm.runInContext('populateReportMenuSelect=()=>{};',context);
  await vm.runInContext('initAppMenusAndGame()',context);
  assert.equal(calls,1,'An empty menu list must not request or initialize a game');
  assert.equal(elements.emptyMenuState.style.display,'block');
  assert.equal(elements.gameWorkspace.style.display,'none');
  assert.equal(elements.finalResultCard.style.display,'none');
  assert.equal(elements.historyCountBadge.textContent,'0');
  assert.equal(storage.lucky_slot_history_deleted,undefined);
  assert.equal(storage.lucky_slot_shop_settings,'keep settings');
  let applied=false;
  context.fetch=async()=>{calls++;return {ok:true,json:async()=>({success:true,data:{name:'Menu mới'}})};};
  context.applied=()=>{applied=true;};
  vm.runInContext("menusList=[{id:'new'}];currentActiveMenuId='new';renderMenuPills=()=>{};playSound=()=>{};applyGameData=()=>applied();showToast=()=>{};",context);
  await vm.runInContext("selectMenu('new')",context);
  assert.equal(applied,true,'Adding the first menu must load its game even after fetchMenus selects its ID');
});

test('database menu deletion cascades finished and open rounds and slots',async()=>{
  const db=new PGlite();
  try{
    const schema=fs.readFileSync(require.resolve('../schema.sql'),'utf8');
    await db.exec(schema.slice(schema.indexOf('CREATE TABLE public.menus'),schema.indexOf('-- 6. CHỈ MỤC')));
    await db.exec(fs.readFileSync(require.resolve('../migrations/002_durable_rounds.sql'),'utf8'));
    const menu=(await db.query("INSERT INTO menus(code,name) VALUES('OLD','OLD') RETURNING id")).rows[0];
    for(const number of [1,2]){
      const round=(await db.query("INSERT INTO games(menu_id,round_number,name) VALUES($1,$2,'OLD') RETURNING id",[menu.id,number])).rows[0];
      await db.query("INSERT INTO slots(game_id,slot_number,player_name) VALUES($1,1,'Khách cũ')",[round.id]);
      if(number===1)await db.query("UPDATE games SET status='finished' WHERE id=$1",[round.id]);
    }
    await db.query('DELETE FROM menus WHERE id=$1',[menu.id]);
    for(const table of ['menus','games','slots'])assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,0);
  }finally{await db.close();}
});
