const { randomUUID } = require('crypto');

const CAPACITY = 15;
const PRICE = 414000;
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
      check(Array.isArray(input.productIds) && input.productIds.length === CAPACITY,
        'Mỗi đợt túi mù cần đúng 15 sản phẩm. Có thể chọn nhiều sản phẩm cùng loại.');
      const catalog = await products.getAll();
      const pool = input.productIds.map((id, index) => {
        const product = catalog.find(p => String(p.id) === String(id) && p.in_stock !== false);
        check(product, `Sản phẩm thứ ${index + 1} không còn trong danh mục.`);
        return { number: index + 1, productId: product.id, name: product.name };
      });
      return store.create({ id: randomUUID(), version: 0, created_at: new Date().toISOString(),
        data: { name: String(input.name || 'Túi mù').trim().slice(0, 100) || 'Túi mù',
          capacity: CAPACITY, price: PRICE, pool, slots: [], orders: [] } });
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
      const catalog = await products.getAll();
      const items = input.items.map(item => {
        const product = catalog.find(p => String(p.id) === String(item.productId) && p.in_stock !== false);
        check(product, 'Có mỹ phẩm không còn trong danh mục. Vui lòng cập nhật giỏ hàng.');
        check(Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 1000, 'Số lượng mỹ phẩm không hợp lệ.');
        check(Number.isSafeInteger(Number(product.price)) && Number(product.price) >= 0, 'Giá mỹ phẩm không hợp lệ.');
        return { productId: product.id, name: product.name, price: Number(product.price), quantity: item.quantity };
      });
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, PRICE * input.quantity);
      check(Number.isSafeInteger(subtotal) && input.discount <= subtotal, 'Giảm giá không được vượt tổng tiền hàng.');
      return mutate(id, round => {
        const duplicate = round.data.orders.find(o => o.id === input.requestId);
        if (duplicate) return { order: duplicate };
        check(round.data.slots.length + input.quantity <= CAPACITY, 'Không còn đủ slot túi mù. Vui lòng cập nhật giỏ hàng.', 409);
        const numbers = Array.from({ length: input.quantity }, (_, i) => round.data.slots.length + i + 1);
        const order = { id: input.requestId, customerName, phone, items, quantity: input.quantity,
          slots: numbers, subtotal, discount: input.discount, total: subtotal - input.discount, createdAt: new Date().toISOString() };
        round.data.orders.push(order);
        numbers.forEach(number => round.data.slots.push({ number, customerName, phone, orderId: order.id, productNumber: null }));
        return { order };
      });
    },
    assign(id, input) {
      check(Number.isInteger(input.slotNumber) && input.slotNumber >= 1 && input.slotNumber <= CAPACITY, 'Slot không hợp lệ.');
      check(input.productNumber === null || (Number.isInteger(input.productNumber) && input.productNumber >= 1 && input.productNumber <= CAPACITY), 'Sản phẩm không hợp lệ.');
      return mutate(id, round => {
        check(round.data.slots.length === CAPACITY, 'Chỉ gán kết quả bốc thăm offline sau khi đủ 15 slot.');
        const slot = round.data.slots.find(s => s.number === input.slotNumber);
        check(slot.productNumber === input.previousProductNumber, 'Kết quả slot vừa được sửa. Vui lòng tải lại.', 409);
        check(input.productNumber === null || !round.data.slots.some(s => s.number !== input.slotNumber && s.productNumber === input.productNumber),
          'Sản phẩm này đã được gán cho slot khác.', 409);
        slot.productNumber = input.productNumber;
        return {};
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
module.exports = { createBlindBagService, createMemoryStore };
