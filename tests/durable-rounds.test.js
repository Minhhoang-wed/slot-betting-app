const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const core = require('../views/js/settlement-core');

test('normalization, membership and integer allocation agree', () => {
  const game = {slotPrice:100,prizeValue:1000000,slots:[{slot_number:1,player_name:' Kiều '},{slot_number:2,player_name:'kiều'},{slot_number:3,player_name:'B'},{slot_number:4,player_name:'C'}]};
  const results=core.calculate(game,'split3',['KIỀU','B','C']);
  assert.equal(results.length,3);assert.equal(results[0].buyCost,200);
  assert.equal(results.reduce((s,r)=>s+r.prizeWon,0),1000000);
  assert.throws(()=>core.calculate(game,'split2',['Kiều','kiều']));
  assert.throws(()=>core.calculate(game,'solo',['missing']));
  assert.throws(()=>core.calculate(game,'solo',['B','C']));
});

test('shared seats use explicit percentages and preserve integer costs', () => {
  const game={slotPrice:165001,prizeValue:900,slots:[{slot_number:1,player_name:'Nhóm',shares:[{name:'Ngọc',percent:50},{name:'B',percent:50}]}]};
  const rows=core.calculate(game,'split2',['NGỌC','B']);
  assert.equal(rows.reduce((sum,r)=>sum+r.buyCost,0),165001);
  assert.equal(rows.reduce((sum,r)=>sum+r.slotCount,0),1);
  assert.equal(rows[0].slotCount,0.5);
  assert.throws(()=>core.groups({...game,slots:[{...game.slots[0],shares:[{name:'Ngọc',percent:60}]}]}));
});

test('SQL migration is repeatable, atomic, detects stale data and reuses next round', async () => {
  const db=new PGlite();
  try {
    const schema=fs.readFileSync(require.resolve('../schema.sql'),'utf8');
    // Use the actual base tables, without destructive reset/extension/seed sections.
    const tables=schema.slice(schema.indexOf('CREATE TABLE public.menus'),schema.indexOf('-- 6. CHỈ MỤC'));
    await db.exec(tables);
    const sql=fs.readFileSync(require.resolve('../migrations/002_durable_rounds.sql'),'utf8');
    await db.exec(sql);await db.exec(sql);
    const m=(await db.query("INSERT INTO menus(code,name,total_slots,slot_price,prize_value) VALUES('QA','QA',3,100,900) RETURNING id")).rows[0].id;
    const g=(await db.query("INSERT INTO games(menu_id,name,total_slots,slot_price,prize_value) VALUES($1,'QA 1',3,100,900) RETURNING id",[m])).rows[0].id;
    await db.query("INSERT INTO slots(game_id,slot_number,player_name) VALUES($1,1,'A'),($1,2,NULL),($1,3,NULL)",[g]);
    const mutate=(action,payload={})=>db.query('SELECT mutate_slot_round($1,$2,$3) AS result',[g,action,JSON.stringify(payload)]);
    await assert.rejects(mutate('quick',{playerName:'B',slotCount:3}));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM slots WHERE player_name IS NULL')).rows[0].n,2);
    await mutate('quick',{playerName:'B',slotCount:2});
    await assert.rejects(mutate('quick',{playerName:'C',slotCount:1}));
    await mutate('release',{playerName:' b '});
    await mutate('assign',{slotNumber:2,playerName:'Nhóm',shares:[{name:'B',percent:50},{name:'C',percent:50}]});
    await assert.rejects(mutate('release',{playerName:'B'}),/ghế chung/);
    await assert.rejects(mutate('assign',{slotNumber:2,playerName:'Nhóm',shares:[{name:'B',percent:90}]}));
    await mutate('assign',{slotNumber:2,playerName:null});
    await mutate('config',{slotPrice:250,prizeValue:750});
    assert.equal(Number((await db.query('SELECT slot_price FROM games WHERE id=$1',[g])).rows[0].slot_price),250);
    await mutate('add');await mutate('remove');
    const snapshot=async()=> (await db.query('SELECT updated_at::text AS stamp,status FROM games WHERE id=$1',[g])).rows[0];
    let before=await snapshot();
    const call=(stamp,mode='solo')=>db.query('SELECT finish_slot_round($1,$2,$3,$4,$5,$6,true) AS result',[g,m,stamp,JSON.stringify(['A']),mode,JSON.stringify([{playerName:'A',prizeWon:900}])]);
    await assert.rejects(call(before.stamp,'bad'));
    assert.equal((await snapshot()).status,'open');
    await db.query("UPDATE slots SET player_name='B' WHERE game_id=$1",[g]);
    await assert.rejects(call(before.stamp),/thay đổi/);
    before=await snapshot();
    // Deliberately fail successor creation: the finish must roll back too.
    await db.exec("ALTER TABLE games ADD CONSTRAINT qa_fail_next CHECK(round_number < 2)");
    await assert.rejects(call(before.stamp));
    assert.equal((await snapshot()).status,'open');
    await db.exec('ALTER TABLE games DROP CONSTRAINT qa_fail_next');
    const first=(await call(before.stamp)).rows[0].result;
    const retry=(await call(before.stamp)).rows[0].result;
    assert.equal(first.nextId,retry.nextId);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM games')).rows[0].n,2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM slots WHERE game_id=$1',[first.nextId])).rows[0].n,3);
    await assert.rejects(db.query("UPDATE slots SET player_name='C' WHERE game_id=$1",[g]),/đã chốt/);
    await assert.rejects(mutate('config',{slotPrice:123}),/Mở lại/);
    await mutate('config',{name:'Tên đã sửa',status:'finished'});
    assert.equal((await snapshot()).status,'finished');
    await mutate('config',{status:'open'});
    await mutate('assign',{slotNumber:1,playerName:'A'});
  } finally { await db.close(); }
});
