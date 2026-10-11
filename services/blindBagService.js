const { randomUUID } = require('crypto');

const CAPACITY = 15;
const DEFAULT_PRICE = 414000;
const productsPerSlot = round => round.data.productsPerSlot || 1;
const assignedNumbers = slot => slot.productNumbers || (slot.productNumber == null ? [] : [slot.productNumber]);
function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function createBlindBagService(store, products) {
  function expectVersion(round,input) {
    check(Number.isInteger(input.previousVersion) && input.previousVersion===round.version,'Đợt túi mù vừa thay đổi. Hãy tải lại trước khi sửa/xóa.',409);
  }
  // Extract one seat without moving retail goods or losing the order discount.
  function extractSlotOrder(round,slot) {
    const source=round.data.orders.find(o=>o.id===slot.orderId);
    check(source && source.slots.includes(slot.number),'Không tìm thấy hóa đơn của slot.',409);
    if(source.quantity===1 && !(source.items || []).length) {
      round.data.orders=round.data.orders.filter(o=>o.id!==source.id);
      return structuredClone(source);
    }
    const price=Number(source.slotPrice);
    const discount=source.subtotal ? Number(BigInt(source.discount)*BigInt(price)/BigInt(source.subtotal)) : 0;
    const part={...structuredClone(source),id:randomUUID(),items:[],quantity:1,slots:[slot.number],subtotal:price,discount,total:price-discount,sourceOrderId:source.id};
    source.slots=source.slots.filter(n=>n!==slot.number);source.quantity=source.slots.length;
    source.subtotal-=price;source.discount-=discount;source.total=source.subtotal-source.discount;
    return part;
  }
  async function mutate(id, action, allowDeleted=false) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const round = await store.get(id);
      check(round, 'Không tìm thấy đợt túi mù.', 404);
      check(allowDeleted || !round.data.deletedAt,'Đợt túi mù đã xóa. Hãy khôi phục để thao tác.',409);
      const version = round.version;
      const result = action(round);
      if (await store.save(round, version)) return { round, ...result };
    }
    check(false, 'Dữ liệu vừa thay đổi. Vui lòng thử lại.', 409);
  }
  return {
    async list({deleted=false}={}) {return (await store.list()).filter(r=>!!r.data.deletedAt===deleted);},
    async create(input) {
      check(Array.isArray(input.productIds) && input.productIds.length === CAPACITY * 3,
        'Mỗi đợt túi mù cần đúng 45 sản phẩm (15 slot × 3 món). Có thể chọn nhiều sản phẩm cùng loại.');
      const price = input.price !== undefined ? Number(input.price) : DEFAULT_PRICE;
      check(Number.isSafeInteger(price) && price >= 0, 'Giá mỗi slot túi mù phải là số nguyên không âm.');
      const catalog = await products.getAll();
      const pool = input.productIds.map((id, index) => {
        const product = catalog.find(p => String(p.id) === String(id) && p.in_stock !== false);
        check(product, `Sản phẩm thứ ${index + 1} không còn trong danh mục.`);
        return { number: index + 1, productId: product.id, name: product.name };
      });
      return store.create({ id: randomUUID(), version: 0, created_at: new Date().toISOString(),
        data: { name: String(input.name || 'Túi mù').trim().slice(0, 100) || 'Túi mù',
          capacity: CAPACITY, productsPerSlot: 3, price, pool, slots: [], orders: [], returns: [] } });
    },
    update(id, input) {
      return mutate(id, round => {
        if(input.previousVersion!==undefined)expectVersion(round,input);
        if (input.price !== undefined) {
          const price = Number(input.price);
          check(Number.isSafeInteger(price) && price >= 0, 'Giá mỗi slot túi mù phải là số nguyên không âm.');
          round.data.price = price;
        }
        if (input.name !== undefined) {
          const name = String(input.name || '').trim().slice(0, 100);
          check(name,'Vui lòng nhập tên đợt túi mù.');
          round.data.name = name;
        }
        return {};
      });
    },
    remove(id,input) {
      return mutate(id,round=>{expectVersion(round,input);round.data.deletedAt=new Date().toISOString();return {};});
    },
    restore(id,input) {
      return mutate(id,round=>{expectVersion(round,input);check(round.data.deletedAt,'Đợt này chưa bị xóa.',409);delete round.data.deletedAt;return {};},true);
    },
    updateSlot(id,input) {
      const name=String(input.customerName || '').trim(),phone=String(input.phone || '').trim();
      check(name.length>0 && name.length<=100,'Vui lòng nhập tên khách (tối đa 100 ký tự).');
      check(phone.length<=30,'Số điện thoại quá dài.');
      return mutate(id,round=>{
        expectVersion(round,input);
        const slot=round.data.slots.find(s=>s.number===input.slotNumber);
        check(slot,'Không tìm thấy slot đã bán.',404);
        if(slot.customerName===name && slot.phone===phone)return {};
        const order=extractSlotOrder(round,slot);
        order.customerName=name;order.phone=phone;
        round.data.orders.push(order);slot.orderId=order.id;slot.customerName=name;slot.phone=phone;
        for(const receipt of round.data.returns || [])if(receipt.slotNumber===slot.number && !receipt.deletedSlotId){receipt.customerName=name;receipt.phone=phone;}
        return {order};
      });
    },
    removeSlot(id,input) {
      return mutate(id,round=>{
        expectVersion(round,input);
        const slot=round.data.slots.find(s=>s.number===input.slotNumber);
        check(slot,'Không tìm thấy slot đã bán.',404);
        const sourceOrderId=slot.orderId,order=extractSlotOrder(round,slot),entry={id:randomUUID(),slot:{...slot,orderId:order.id},order,sourceOrderId,deletedAt:new Date().toISOString(),receipts:[]};
        for(const receipt of round.data.returns || [])if(receipt.slotNumber===slot.number && !receipt.deletedSlotId){
          entry.receipts.push(structuredClone(receipt));receipt.voided=true;receipt.deletedSlotId=entry.id;
        }
        round.data.deletedSlots ||= [];round.data.deletedSlots.push(entry);
        round.data.slots=round.data.slots.filter(s=>s.number!==slot.number);
        return {deletedSlot:entry};
      });
    },
    restoreSlot(id,input) {
      return mutate(id,round=>{
        expectVersion(round,input);
        const entry=(round.data.deletedSlots || []).find(e=>e.id===input.deletedSlotId);
        check(entry,'Không tìm thấy slot đã xóa.',404);
        check(!round.data.slots.some(s=>s.number===entry.slot.number),'Ô này đã có khách mới. Hãy giải phóng ô trước khi khôi phục.',409);
        check(!round.data.slots.some(s=>assignedNumbers(s).some(n=>assignedNumbers(entry.slot).includes(n))),'Sản phẩm cũ đã được gán cho slot khác. Hãy bỏ gán trước khi khôi phục.',409);
        check(!round.data.orders.some(o=>o.id===entry.order.id),'Hóa đơn này đã được khôi phục.',409);
        round.data.slots.push(entry.slot);round.data.slots.sort((a,b)=>a.number-b.number);round.data.orders.push(entry.order);
        for(const old of entry.receipts){const index=round.data.returns.findIndex(r=>r.id===old.id && r.deletedSlotId===entry.id);check(index>=0,'Phiếu pass đã thay đổi. Hãy tải lại.',409);round.data.returns[index]=old;}
        round.data.deletedSlots=round.data.deletedSlots.filter(e=>e.id!==entry.id);
        return {};
      });
    },
    async checkout(id, input) {
      check(typeof input.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(input.requestId), 'Mã đơn không hợp lệ.');
      const customerName = String(input.customerName || '').trim();
      const phone = String(input.phone || '').trim();
      check(customerName.length > 0 && customerName.length <= 100, 'Vui lòng nhập tên khách hàng (tối đa 100 ký tự).');
      check(phone.length <= 30, 'Số điện thoại quá dài.');
      check(Number.isInteger(input.quantity) && input.quantity > 0 && input.quantity <= CAPACITY, 'Số slot phải từ 1 đến 15.');
      check(Array.isArray(input.items) && input.items.length <= 100, 'Giỏ hàng không hợp lệ.');
      check(Number.isSafeInteger(input.discount) && input.discount >= 0, 'Giảm giá phải là số nguyên không âm.');
      // Retry an already committed order even if a catalog item was subsequently removed.
      const previous = await store.get(id);
      check(previous, 'Không tìm thấy đợt túi mù.', 404);
      check(!previous.data.deletedAt,'Đợt túi mù đã xóa.',409);
      const existing = previous.data.orders.find(o => o.id === input.requestId);
      if (existing) return { round: previous, order: existing };
      check(!(previous.data.deletedSlots || []).some(e=>e.sourceOrderId===input.requestId || e.order.id===input.requestId),'Đơn này đã bị xóa. Hãy tạo đơn mới.',409);
      if(input.slotNumber!==undefined)check(input.quantity===1 && Number.isInteger(input.slotNumber) && input.slotNumber>=1 && input.slotNumber<=CAPACITY,'Chọn một ô slot từ 1 đến 15.');
      const roundPrice = Number(previous.data.price ?? DEFAULT_PRICE);
      const catalog = await products.getAll();
      const items = input.items.map(item => {
        const product = catalog.find(p => String(p.id) === String(item.productId) && p.in_stock !== false);
        check(product, 'Có mỹ phẩm không còn trong danh mục. Vui lòng cập nhật giỏ hàng.');
        check(Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 1000, 'Số lượng mỹ phẩm không hợp lệ.');
        check(Number.isSafeInteger(Number(product.price)) && Number(product.price) >= 0, 'Giá mỹ phẩm không hợp lệ.');
        return { productId: product.id, name: product.name, price: Number(product.price), quantity: item.quantity };
      });
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, roundPrice * input.quantity);
      check(Number.isSafeInteger(subtotal) && input.discount <= subtotal, 'Giảm giá không được vượt tổng tiền hàng.');
      return mutate(id, round => {
        const duplicate = round.data.orders.find(o => o.id === input.requestId);
        if (duplicate) return { order: duplicate };
        check(!(round.data.deletedSlots || []).some(e=>e.sourceOrderId===input.requestId || e.order.id===input.requestId),'Đơn này đã bị xóa. Hãy tạo đơn mới.',409);
        check(round.data.slots.length + input.quantity <= CAPACITY, 'Không còn đủ slot túi mù. Vui lòng cập nhật giỏ hàng.', 409);
        const currentPrice = Number(round.data.price ?? roundPrice);
        const currentSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, currentPrice * input.quantity);
        check(input.discount <= currentSubtotal, 'Giảm giá không được vượt tổng tiền hàng.');
        const available=Array.from({length:CAPACITY},(_,i)=>i+1).filter(n=>!round.data.slots.some(s=>s.number===n));
        check(input.slotNumber===undefined || available.includes(input.slotNumber),'Ô slot này vừa có khách. Hãy tải lại.',409);
        const numbers=input.slotNumber===undefined ? available.slice(0,input.quantity) : [input.slotNumber];
        const order = { id: input.requestId, customerName, phone, items, quantity: input.quantity, slotPrice: currentPrice,
          slots: numbers, subtotal: currentSubtotal, discount: input.discount, total: currentSubtotal - input.discount, paid: false, createdAt: new Date().toISOString() };
        round.data.orders.push(order);
        numbers.forEach(number => round.data.slots.push({ number, customerName, phone, orderId: order.id, productNumber: null, productNumbers: [] }));
        round.data.slots.sort((a,b)=>a.number-b.number);
        return { order };
      });
    },
    assign(id, input) {
      check(Number.isInteger(input.slotNumber) && input.slotNumber >= 1 && input.slotNumber <= CAPACITY, 'Slot không hợp lệ.');
      return mutate(id, round => {
        check(round.data.slots.length === CAPACITY, 'Chỉ gán kết quả bốc thăm offline sau khi đủ 15 slot.');
        const slot = round.data.slots.find(s => s.number === input.slotNumber);
        const numbers = input.productNumbers ?? (input.productNumber == null ? [] : [input.productNumber]);
        const previous = input.previousProductNumbers ?? (input.previousProductNumber == null ? [] : [input.previousProductNumber]);
        check(Array.isArray(numbers) && numbers.length <= productsPerSlot(round) && numbers.every(n => Number.isInteger(n) && round.data.pool.some(p => p.number === n)) && new Set(numbers).size === numbers.length, 'Sản phẩm không hợp lệ.');
        check(JSON.stringify(assignedNumbers(slot)) === JSON.stringify(previous), 'Kết quả slot vừa được sửa. Vui lòng tải lại.', 409);
        const passed = (round.data.returns || []).filter(r => !r.voided).flatMap(r => r.items.map(p => p.productNumber));
        check(assignedNumbers(slot).filter(n => passed.includes(n)).every(n => numbers.includes(n)), 'Món đã pass không thể đổi kết quả. Hãy hủy phiếu pass trước.', 409);
        check(!round.data.slots.some(s => s.number !== input.slotNumber && assignedNumbers(s).some(n => numbers.includes(n))),
          'Sản phẩm này đã được gán cho slot khác.', 409);
        slot.productNumbers = numbers;
        slot.productNumber = numbers[0] ?? null;
        return {};
      });
    },
    payment(id, input) {
      check(typeof input.paid === 'boolean' && typeof input.previousPaid === 'boolean', 'Trạng thái thanh toán không hợp lệ.');
      return mutate(id, round => {
        const order = round.data.orders.find(o => o.id === input.orderId);
        check(order, 'Không tìm thấy hóa đơn.', 404);
        check(!!order.paid === input.previousPaid || !!order.paid === input.paid, 'Thanh toán vừa thay đổi. Vui lòng tải lại.', 409);
        order.paid = input.paid;
        return { order };
      });
    },
    async buyback(id, input) {
      check(typeof input.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(input.requestId), 'Mã phiếu pass không hợp lệ.');
      check(Array.isArray(input.productNumbers) && input.productNumbers.length > 0 && new Set(input.productNumbers).size === input.productNumbers.length && input.productNumbers.every(Number.isInteger), 'Chọn các món khách muốn pass.');
      const existing = await store.get(id);
      check(existing, 'Không tìm thấy đợt túi mù.', 404);
      check(!existing.data.deletedAt,'Đợt túi mù đã xóa.',409);
      const old = (existing.data.returns || []).find(r => r.id === input.requestId);
      if (old) return { round: existing, receipt: old };
      const catalog = await products.getAll();
      return mutate(id, round => {
        round.data.returns ||= [];
        const duplicate = round.data.returns.find(r => r.id === input.requestId);
        if (duplicate) return { receipt: duplicate };
        const slot = round.data.slots.find(s => s.number === input.slotNumber);
        check(slot && assignedNumbers(slot).length === productsPerSlot(round), 'Hãy lưu đủ sản phẩm bốc được của slot trước khi pass.');
        const passed = round.data.returns.filter(r => !r.voided).flatMap(r => r.items.map(p => p.productNumber));
        const items = input.productNumbers.map(number => {
          check(assignedNumbers(slot).includes(number), 'Chỉ thu lại món khách đã bốc được.');
          check(!passed.includes(number), 'Món này đã được shop thu lại.', 409);
          const gift = round.data.pool.find(p => p.number === number);
          const product = catalog.find(p => String(p.id) === String(gift.productId));
          check(product, 'Sản phẩm không còn trong danh mục. Hãy cập nhật danh mục trước khi pass.');
          const price = Number(product.price);
          check(Number.isSafeInteger(price) && price >= 0, 'Giá sản phẩm không hợp lệ.');
          return { productNumber: number, productId: product.id, name: product.name, price };
        });
        const total = items.reduce((sum,p) => sum+p.price, 0);
        check(Number.isSafeInteger(total), 'Tổng tiền pass không hợp lệ.');
        const receipt = { id: input.requestId, customerName: slot.customerName, phone: slot.phone, slotNumber: slot.number, items, total, createdAt: new Date().toISOString(), voided: false };
        round.data.returns.push(receipt);
        return { receipt };
      });
    },
    voidBuyback(id, input) {
      return mutate(id, round => {
        const receipt = (round.data.returns || []).find(r => r.id === input.receiptId);
        check(receipt, 'Không tìm thấy phiếu pass.', 404);
        receipt.voided = true;
        receipt.voidedAt ||= new Date().toISOString();
        return { receipt };
      });
    }
  };
}

function createMemoryStore() {
  const rows = new Map();
  return {
    async list() { return structuredClone([...rows.values()].reverse()); },
    async get(id) { return structuredClone(rows.get(id)); },
    async create(row) { rows.set(row.id, structuredClone(row)); return structuredClone(row); },
    async save(row, version) {
      if (rows.get(row.id)?.version !== version) return false;
      row.version = version + 1;
      rows.set(row.id, structuredClone(row));
      return true;
    }
  };
}
module.exports = { createBlindBagService, createMemoryStore, productsPerSlot, assignedNumbers };
