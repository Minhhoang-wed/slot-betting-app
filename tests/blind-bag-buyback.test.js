const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const ExcelJS=require('exceljs');
const {createBlindBagService,createMemoryStore}=require('../services/blindBagService');
const {summarize}=require('../services/customerFinanceService');
const workbooks=require('../services/reportWorkbookService');

async function setup(store=createMemoryStore()) {
  const catalog=[{id:1,name:'Son',price:250000},{id:2,name:'Phấn',price:290000},{id:3,name:'Gương',price:77000}];
  const service=createBlindBagService(store,{getAll:async()=>catalog});
  const round=await service.create({name:'TEST 3 MÓN',productIds:Array.from({length:45},(_,i)=>i%3+1)});
  const buy=await service.checkout(round.id,{requestId:randomUUID(),customerName:'Kiều',phone:'',quantity:15,items:[],discount:0});
  const assign=(slotNumber,productNumbers,previousProductNumbers=[])=>service.assign(round.id,{slotNumber,productNumbers,previousProductNumbers});
  const pass=(productNumbers,extra={})=>service.buyback(round.id,{slotNumber:1,productNumbers,requestId:randomUUID(),...extra});
  return {catalog,service,round,buy,assign,pass};
}

test('each slot has 3 distinct product units; all 45 are assigned without duplication',async()=>{
  const {service,assign,round}=await setup();
  await assert.rejects(assign(1,[1,1,2]),/không hợp lệ/);
  await assert.rejects(assign(1,[1,2,3,4]),/không hợp lệ/);
  await assert.rejects(assign(1,[46]),/không hợp lệ/);
  for(let n=1;n<=15;n++)await assign(n,[(n-1)*3+1,(n-1)*3+2,(n-1)*3+3]);
  const saved=(await service.list()).find(r=>r.id===round.id);
  assert.ok(saved.data.slots.every(s=>s.productNumbers.length===3));
  assert.equal(new Set(saved.data.slots.flatMap(s=>s.productNumbers)).size,45);
  await assert.rejects(assign(2,[1,5,6],[4,5,6]),/đã được gán/);
});

test('pass uses authoritative current prices, keeps snapshots, retries and blocks double returns',async()=>{
  const {catalog,service,assign,pass,round}=await setup();
  await assign(1,[1,2]);await assert.rejects(pass([1]),/đủ sản phẩm/);
  await assign(1,[1,2,3],[1,2]);
  catalog[0].price=260000;
  const requestId=randomUUID(),first=await pass([1,2],{requestId,customerName:'Giả mạo',price:1});
  assert.equal(first.receipt.total,550000);assert.equal(first.receipt.customerName,'Kiều');
  catalog[0].price=1;
  assert.equal((await pass([1,2],{requestId})).receipt.total,550000);
  await assert.rejects(pass([1]),/đã được shop thu/);
  await assert.rejects(pass([4]),/đã bốc/);
  await assert.rejects(assign(1,[2,3,4],[1,2,3]),/đã pass/);
  await service.voidBuyback(round.id,{receiptId:first.receipt.id});
  await service.voidBuyback(round.id,{receiptId:first.receipt.id});
  const second=await pass([1]);assert.equal(second.receipt.total,1);
  const saved=(await service.list())[0];assert.equal(saved.data.returns.length,2);
  assert.equal(saved.data.returns[0].total,550000);assert.equal(saved.data.returns[0].voided,true);
});

test('concurrent returns cannot credit the same product twice; failed storage credits nothing',async()=>{
  const {service,assign,pass}=await setup();await assign(1,[1,2,3]);
  const result=await Promise.allSettled([pass([1]),pass([1])]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await service.list())[0].data.returns.length,1);
  const memory=createMemoryStore(),other=await setup(memory);await other.assign(1,[1,2,3]);
  const broken=createBlindBagService({...memory,save:async()=>{throw new Error('DB failed');}},{getAll:async()=>other.catalog});
  await assert.rejects(broken.buyback(other.round.id,{slotNumber:1,productNumbers:[1],requestId:randomUUID()}),/DB failed/);
  assert.equal((await other.service.list())[0].data.returns.length,0);
});

test('a pass retry after catalog removal is idempotent and void removes its credit',async()=>{
  const {service,catalog,assign,pass}=await setup();await assign(1,[1,2,3]);
  const requestId=randomUUID();
  const results=await Promise.all([pass([1,2],{requestId}),pass([1,2],{requestId})]);
  assert.deepEqual(results[0].receipt,results[1].receipt);
  catalog.splice(0);
  assert.equal((await pass([1,2],{requestId})).receipt.total,540000);
  let rounds=await service.list();assert.equal(rounds[0].data.returns.length,1);
  await service.voidBuyback(rounds[0].id,{receiptId:requestId});
  rounds=await service.list();
  const report=summarize({customers:[]},rounds);
  assert.equal(report.buybackTotal,0);assert.equal(report.customers[0].customerPays,6210000);
});

test('finance combines slot balance, unpaid purchases and pass, with paid orders never charged again',async()=>{
  const {service,round,buy,assign,pass}=await setup();await assign(1,[1,2,3]);
  await pass([1,2,3]);
  const slots={customers:[{customerName:' KIỀU ',netAmount:-270000,menuBreakdown:{}}]};
  let report=summarize(slots,await service.list());
  assert.equal(report.customers.length,1);assert.equal(report.customers[0].bagDue,6210000);
  assert.equal(report.customers[0].buybackTotal,617000);assert.equal(report.customers[0].netAmount,-5863000);
  await service.payment(round.id,{orderId:buy.order.id,paid:true,previousPaid:false});
  await service.payment(round.id,{orderId:buy.order.id,paid:true,previousPaid:false});
  report=summarize(slots,await service.list());
  assert.equal(report.customers[0].bagDue,0);assert.equal(report.customers[0].shopPays,347000);
  const read=new ExcelJS.Workbook();await read.xlsx.load(await workbooks.finance(report).xlsx.writeBuffer());
  const ws=read.getWorksheet('Tổng hợp');
  assert.equal(ws.getCell('B12').value,-270000);assert.equal(ws.getCell('F12').value,617000);
  assert.deepEqual(ws.getCell('G12').value,{formula:'MAX(0,B12-E12+F12)',result:347000});
  assert.equal(ws.getCell('H12').value.formula,'MAX(0,E12-B12-F12)');
  assert.equal(ws.getCell('H12').value.result ?? 0,0);
  assert.ok(read.getWorksheet('Chi tiết').rowCount>=9);
  await service.payment(round.id,{orderId:buy.order.id,paid:false,previousPaid:true});
  assert.equal(summarize(slots,await service.list()).customers[0].customerPays,5863000);
});

test('migration is repeatable, accepts old 15-product rounds and persists new 45-product data',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE blind_bag_rounds(id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(),version integer DEFAULT 0,data jsonb NOT NULL,CHECK(jsonb_array_length(data->'pool')=15));`);
    const oldId=randomUUID(),old={name:'Đợt cũ',capacity:15,price:414000,pool:Array.from({length:15},(_,i)=>({number:i+1,productId:1,name:'Son'})),slots:[{number:1,customerName:'Khách cũ',productNumber:1}],orders:[]};
    await db.query('INSERT INTO blind_bag_rounds(id,data) VALUES($1,$2)',[oldId,JSON.stringify(old)]);
    const sql=fs.readFileSync(require.resolve('../migrations/004_blind_bag_three_products.sql'),'utf8');
    await db.exec(sql);await db.exec(sql);
    const store={
      async list(){return (await db.query('SELECT * FROM blind_bag_rounds ORDER BY created_at DESC')).rows;},
      async get(id){return (await db.query('SELECT * FROM blind_bag_rounds WHERE id=$1',[id])).rows[0];},
      async create(row){return (await db.query('INSERT INTO blind_bag_rounds(id,data) VALUES($1,$2) RETURNING *',[row.id,JSON.stringify(row.data)])).rows[0];},
      async save(row,version){const result=await db.query('UPDATE blind_bag_rounds SET data=$1,version=version+1 WHERE id=$2 AND version=$3 RETURNING version',[JSON.stringify(row.data),row.id,version]);if(!result.rows.length)return false;row.version=result.rows[0].version;return true;}
    };
    const {service,round,assign,pass}=await setup(store);await assign(1,[1,2,3]);await pass([1]);
    const fresh=createBlindBagService(store,{getAll:async()=>[]});
    const saved=(await fresh.list()).find(r=>r.id===round.id);assert.equal(saved.data.returns[0].total,250000);
    assert.deepEqual((await store.get(oldId)).data,old);
    const legacy=createBlindBagService(store,{getAll:async()=>[{id:1,name:'Son',price:250000}]});
    await legacy.checkout(oldId,{requestId:randomUUID(),customerName:'Khách cũ',quantity:14,items:[],discount:0});
    await legacy.assign(oldId,{slotNumber:2,productNumber:2,previousProductNumber:null});
    assert.equal((await store.get(oldId)).data.slots[1].productNumber,2);
    await assert.rejects(db.query('INSERT INTO blind_bag_rounds(id,data) VALUES($1,$2)',[randomUUID(),JSON.stringify({...old,productsPerSlot:3})]));
  }finally{await db.close();}
});
