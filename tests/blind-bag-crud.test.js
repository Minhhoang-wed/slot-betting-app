const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createBlindBagService,createMemoryStore}=require('../services/blindBagService');
const {summarize}=require('../services/customerFinanceService');
async function setup(){
  const store=createMemoryStore(),catalog=[{id:1,name:'Son',price:250000}],service=createBlindBagService(store,{getAll:async()=>catalog});
  const round=await service.create({name:'Test CRUD',productIds:Array(45).fill(1)});
  const read=()=>store.get(round.id);
  const buy=(quantity,extra={})=>service.checkout(round.id,{requestId:randomUUID(),customerName:'A',phone:'090',quantity,items:[],discount:0,...extra});
  const edit=(body)=>read().then(r=>service.updateSlot(r.id,{previousVersion:r.version,...body}));
  const remove=number=>read().then(r=>service.removeSlot(r.id,{slotNumber:number,previousVersion:r.version}));
  const restore=entry=>read().then(r=>service.restoreSlot(r.id,{deletedSlotId:entry.id,previousVersion:r.version}));
  const finance=async()=>summarize({customers:[]},await service.list());
  return {store,service,round,read,buy,edit,remove,restore,finance};
}
test('a round can be renamed, archived and restored without losing orders or pass balances',async()=>{
  const {service,round,read,buy,finance}=await setup();await buy(1);
  let r=await read();await service.update(r.id,{name:'Đợt mới',price:100000,previousVersion:r.version});
  r=await read();assert.equal(r.data.orders[0].total,414000);assert.equal(r.data.price,100000);
  await service.remove(r.id,{previousVersion:r.version});
  assert.equal((await service.list()).length,0);assert.equal((await finance()).customers.length,0);
  const archived=(await service.list({deleted:true}))[0];assert.equal(archived.data.orders[0].total,414000);
  await assert.rejects(buy(1),/đã xóa/);
  await service.restore(round.id,{previousVersion:archived.version});
  assert.equal((await finance()).customers[0].bagDue,414000);
});
test('editing one paid slot splits its discount, keeps goods with the original customer and conserves every đồng',async()=>{
  const {buy,read,edit,finance,service}=await setup();
  const result=await buy(3,{items:[{productId:1,quantity:2}],discount:101});
  await service.payment(result.round.id,{orderId:result.order.id,paid:true,previousPaid:false});
  await edit({slotNumber:2,customerName:'B',phone:'091'});
  const r=await read(),a=r.data.orders.find(o=>o.customerName==='A'),b=r.data.orders.find(o=>o.customerName==='B');
  assert.deepEqual(a.slots,[1,3]);assert.deepEqual(b.slots,[2]);assert.equal(a.items.length,1);assert.equal(b.items.length,0);
  assert.equal(a.total+b.total,result.order.total);assert.equal(a.discount+b.discount,101);
  assert.ok(a.paid && b.paid);assert.equal((await finance()).bagDue,0);
});
test('deleting a non-last slot keeps numbers stable, normal checkout fills the hole, and tombstoned retries cannot sell again',async()=>{
  const {buy,read,remove,service,round}=await setup();
  await buy(3);const deleted=await remove(2);
  assert.deepEqual((await read()).data.slots.map(s=>s.number),[1,3]);
  const next=await buy(2);assert.deepEqual(next.order.slots,[2,4]);
  await assert.rejects(service.checkout(round.id,{requestId:deleted.deletedSlot.order.id,quantity:1,customerName:'A',items:[],discount:0}),/đã bị xóa/);
  const numbered=await buy(1,{slotNumber:9});assert.deepEqual(numbered.order.slots,[9]);
  await assert.rejects(buy(1,{slotNumber:9}),/vừa có khách/);
});
test('deletion and restoration preserve discounts and goods, without changing remaining customers',async()=>{
  const {buy,read,remove,restore,finance}=await setup();
  const {order}=await buy(2,{items:[{productId:1,quantity:1}],discount:830001});
  const original=await finance();const removed=(await remove(1)).deletedSlot;
  assert.equal((await read()).data.orders[0].items.length,1);
  assert.equal((await finance()).bagDue+removed.order.total,order.total);
  await restore(removed);assert.equal((await finance()).bagDue,original.bagDue);
  assert.equal((await read()).data.orders.reduce((n,o)=>n+o.discount,0),830001);
});
test('slot owner changes move its products and pass; deletion removes credit; restoration restores exact saved receipts',async()=>{
  const {buy,read,remove,restore,edit,finance,service,round}=await setup();await buy(15);
  await service.assign(round.id,{slotNumber:1,productNumbers:[1,2,3],previousProductNumbers:[]});
  await service.buyback(round.id,{slotNumber:1,productNumbers:[1,2],requestId:randomUUID()});
  await edit({slotNumber:1,customerName:'B',phone:''});
  const before=await finance(),b=before.customers.find(c=>c.customerName==='B');assert.equal(b.buybackTotal,500000);assert.equal(b.bagDue,414000);
  const removed=(await remove(1)).deletedSlot;assert.equal((await finance()).buybackTotal,0);
  await restore(removed);const after=await finance();assert.equal(after.buybackTotal,500000);assert.equal(after.bagDue,before.bagDue);
  assert.equal((await read()).data.returns[0].customerName,'B');assert.equal((await read()).data.returns[0].voided,false);
});
test('restoration refuses occupied seats and reused products; stale edits cannot overwrite new sales',async()=>{
  const {buy,read,remove,restore,service,round}=await setup();await buy(15);
  await service.assign(round.id,{slotNumber:1,productNumbers:[1,2,3],previousProductNumbers:[]});
  const removed=(await remove(1)).deletedSlot;await buy(1);
  await assert.rejects(restore(removed),/khách mới/);
  await service.assign(round.id,{slotNumber:2,productNumbers:[1,2,3],previousProductNumbers:[]});await remove(1);
  await assert.rejects(restore(removed),/gán cho slot khác/);
  const r=await read();await service.update(round.id,{price:200000});
  await assert.rejects(service.removeSlot(round.id,{slotNumber:2,previousVersion:r.version}),/vừa thay đổi/);
});
test('database save failure leaves original invoices, owners and pass untouched',async()=>{
  const {buy,read,store,service,round}=await setup();await buy(2);
  const before=await read();store.save=async()=>{throw new Error('offline');};
  await assert.rejects(service.removeSlot(round.id,{slotNumber:1,previousVersion:before.version}),/offline/);
  assert.deepEqual(await read(),before);
});
