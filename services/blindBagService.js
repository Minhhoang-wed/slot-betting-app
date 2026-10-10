const { randomUUID } = require('crypto');

const CAPACITY = 15;
const DEFAULT_PRICE = 414000;
const productsPerSlot = round => round.data.productsPerSlot || 1;
const assignedNumbers = slot => slot.productNumbers || (slot.productNumber == null ? [] : [slot.productNumber]);
function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function createBlindBagService(store, products) {
  async function mutate(id, action) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const round = await store.get(id);
      check(round, 'Không tìm thấy đợt túi mù.', 404);
      const version = round.version;
      const result = action(round);
      if (await store.save(round, version)) return { round, ...result };
    }
    check(false, 'Dữ liệu vừa thay đổi. Vui lòng thử lại.', 409);
  }
  return {
    list: () => store.list(),
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
        if (input.price !== undefined) {
          const price = Number(input.price);
          check(Number.isSafeInteger(price) && price >= 0, 'Giá mỗi slot túi mù phải là số nguyên không âm.');
          round.data.price = price;
        }
        if (input.name !== undefined) {
          const name = String(input.name || '').trim().slice(0, 100);
          if (name) round.data.name = name;
        }
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
      const existing = previous.data.orders.find(o => o.id === input.requestId);
      if (existing) return { round: previous, order: existing };
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
        check(round.data.slots.length + input.quantity <= CAPACITY, 'Không còn đủ slot túi mù. Vui lòng cập nhật giỏ hàng.', 409);
        const currentPrice = Number(round.data.price ?? roundPrice);
        const currentSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, currentPrice * input.quantity);
        check(input.discount <= currentSubtotal, 'Giảm giá không được vượt tổng tiền hàng.');
        const numbers = Array.from({ length: input.quantity }, (_, i) => round.data.slots.length + i + 1);
        const order = { id: input.requestId, customerName, phone, items, quantity: input.quantity, slotPrice: currentPrice,
          slots: numbers, subtotal: currentSubtotal, discount: input.discount, total: currentSubtotal - input.discount, paid: false, createdAt: new Date().toISOString() };
        round.data.orders.push(order);
        numbers.forEach(number => round.data.slots.push({ number, customerName, phone, orderId: order.id, productNumber: null, productNumbers: [] }));
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
