// Retail blind bags deliberately have no dependency on gameState or settlement.
let blindBagRounds = [];
let blindBagSelectedId = '';
let blindBagBusy = false;
let blindBagPending = null;
const blindBagEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const selectedBlindBag = () => blindBagRounds.find(r => r.id === blindBagSelectedId);
const blindBagStatus = round => round.data.slots.length < 15 ? 'Đang mở bán' : round.data.slots.every(s => s.productNumber !== null) ? 'Đã gán đủ sản phẩm' : 'Đủ 15 slot · Chờ kết quả offline';

async function blindBagAPI(path = '', body, method = 'POST') {
  const response = await fetch(`/api/blind-bags${path}`, body === undefined ? {} : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok || !json.success) throw Object.assign(new Error(json.error || 'Không thể tải túi mù.'), { status: response.status });
  return json;
}

document.addEventListener('DOMContentLoaded', () => {
  const section = document.createElement('section');
  section.className = 'surface-card blind-bag-panel';
  section.innerHTML = `
    <div class="card-top-bar"><div class="top-bar-title">
      <span class="icon-circle icon-purple"><i class="fa-solid fa-gift"></i></span>
      <div><h2 class="card-heading">TÚI MÙ</h2><p class="card-caption">Mỹ phẩm bất ngờ · Riêng biệt với Bàn kèo slot</p></div>
    </div><button class="btn-ghost-primary" onclick="loadBlindBags()">Làm mới</button></div>
    <div class="card-content">
      <div class="blind-bag-intro"><strong>15 slot / đợt</strong><strong>414.000 đ / slot</strong><span>1 slot nhận 1 sản phẩm</span></div>
      <p class="blind-bag-note">Khi đủ 15 slot, shop tổ chức bốc thăm 50 phiếu <b>offline</b>, rồi ghi nhận sản phẩm khách nhận theo từng slot bên dưới. Không chọn người thắng hay chia thưởng.</p>
      <p id="blindBagMessage" role="status" aria-live="polite">Đang tải túi mù…</p>
      <div id="blindBagPendingMessage" role="status"></div>
      <div class="blind-bag-toolbar">
        <label for="blindBagRound">Đợt túi mù</label><select id="blindBagRound" class="modern-input" onchange="selectBlindBag(this.value)"></select>
        <label for="blindBagQty">Số slot mua</label><input id="blindBagQty" class="modern-input" type="number" min="1" max="15" value="1">
        <button id="blindBagAdd" class="btn-ghost-primary" onclick="addBlindBagToCart()" disabled>Thêm slot vào giỏ</button>
      </div>
      <p class="blind-bag-note">Thêm slot vào cùng giỏ mỹ phẩm ở trên, nhập tên khách rồi xuất hóa đơn để ghi nhận mua. Slot trong giỏ chưa được giữ chỗ.</p>
      <div id="blindBagDetails"></div>
      <details class="blind-bag-create" ontoggle="if(this.open) prepareBlindBagProducts()">
        <summary>Tạo đợt túi mù mới · Chọn 15 sản phẩm</summary>
        <label for="blindBagName">Tên đợt</label><input id="blindBagName" class="modern-input" maxlength="100" placeholder="Ví dụ: Túi mù tháng 10">
        <p class="blind-bag-note">Mỗi vị trí là một sản phẩm thực tế. Có thể chọn cùng loại nhiều lần nếu shop có đủ số lượng.</p>
        <div id="blindBagProductPool" class="blind-bag-pool"></div>
        <button id="blindBagCreate" class="btn-ghost-primary" onclick="createBlindBag()">Tạo đợt 15 slot</button>
      </details>
    </div>`;
  document.getElementById('tabShop').appendChild(section);
  try { blindBagPending = JSON.parse(sessionStorage.getItem('blindBagPending') || 'null'); } catch (_) { /* Invalid saved request. */ }
  updateBlindBagPendingMessage();
  loadBlindBags();
});

function updateBlindBagPendingMessage() {
  document.getElementById('blindBagPendingMessage').innerHTML = blindBagPending
    ? '<p class="blind-bag-note">Đang có đơn túi mù chờ xác nhận. <button class="btn-ghost-primary" onclick="checkoutBlindBagCart()">Kiểm tra / xuất lại hóa đơn</button></p>' : '';
}

async function loadBlindBags() {
  const message = document.getElementById('blindBagMessage');
  try {
    const result = await blindBagAPI();
    blindBagRounds = result.data;
    if (!selectedBlindBag()) blindBagSelectedId = blindBagRounds[0]?.id || '';
    message.textContent = result.persistent ? '' : 'Chế độ thử nghiệm: chưa cấu hình Supabase, dữ liệu túi mù sẽ mất khi khởi động lại máy chủ.';
    renderBlindBags();
  } catch (error) {
    message.textContent = error.message;
    document.getElementById('blindBagAdd').disabled = true;
  }
}

function selectBlindBag(id) { blindBagSelectedId = id; renderBlindBags(); }

function renderBlindBags() {
  const select = document.getElementById('blindBagRound');
  select.innerHTML = blindBagRounds.length ? blindBagRounds.map(r => `<option value="${blindBagEscape(r.id)}">${blindBagEscape(r.data.name)} · ${r.data.slots.length}/15 · ${new Date(r.created_at).toLocaleDateString('vi-VN')}</option>`).join('') : '<option>Chưa có đợt túi mù</option>';
  select.value = blindBagSelectedId;
  const round = selectedBlindBag();
  document.getElementById('blindBagAdd').disabled = !round || round.data.slots.length >= 15 || blindBagBusy;
  const details = document.getElementById('blindBagDetails');
  if (!round) { details.innerHTML = '<p class="blind-bag-note">Tạo đợt mới và chọn 15 sản phẩm từ danh mục để bắt đầu.</p>'; return; }
  const { slots, pool, orders } = round.data;
  const buyers = new Map();
  for (const slot of slots) {
    const key = JSON.stringify([slot.customerName.toLocaleLowerCase('vi-VN'), slot.phone]);
    if (!buyers.has(key)) buyers.set(key, { name: slot.customerName, phone: slot.phone, numbers: [] });
    buyers.get(key).numbers.push(slot.number);
  }
  details.innerHTML = `
    <div class="blind-bag-progress"><strong>${blindBagStatus(round)}</strong><span>Đã bán ${slots.length}/15 · Còn ${15 - slots.length} slot</span></div>
    <progress max="15" value="${slots.length}" aria-label="Số slot túi mù đã bán"></progress>
    <h3>Danh sách người mua</h3>
    <div class="blind-bag-table-wrap"><table class="blind-bag-table"><thead><tr><th>Khách hàng</th><th>Số slot</th><th>Slot đã mua</th></tr></thead><tbody>
      ${[...buyers.values()].map(b => `<tr><td>${blindBagEscape(b.name)}${b.phone ? `<small>${blindBagEscape(b.phone)}</small>` : ''}</td><td>${b.numbers.length}</td><td>${b.numbers.map(n => '#' + n).join(', ')}</td></tr>`).join('') || '<tr><td colspan="3">Chưa có người mua.</td></tr>'}
    </tbody></table></div>
    <details class="blind-bag-results" ${slots.length === 15 ? 'open' : ''}><summary>15 slot & sản phẩm nhận sau bốc thăm offline</summary>
      <p class="blind-bag-note">${slots.length < 15 ? 'Danh sách 15 sản phẩm bên dưới đã được chuẩn bị cho đợt này. Đủ 15 slot mới có thể nhập kết quả.' : 'Chọn sản phẩm thực tế khách đã bốc được. Muốn chuyển một sản phẩm sang slot khác, chọn “Chưa gán” ở slot cũ trước.'}</p>
      <div class="blind-bag-table-wrap"><table class="blind-bag-table"><thead><tr><th>Slot</th><th>Người mua</th><th>Sản phẩm nhận</th></tr></thead><tbody>
      ${Array.from({ length: 15 }, (_, i) => {
        const slot = slots.find(s => s.number === i + 1);
        return `<tr><td>#${i + 1}</td><td>${slot ? blindBagEscape(slot.customerName) : '<span class="text-muted">Chưa bán</span>'}</td><td><select class="modern-input" aria-label="Sản phẩm nhận slot ${i + 1}" onchange="assignBlindBagProduct(${i + 1}, this.value)" ${slots.length < 15 || blindBagBusy ? 'disabled' : ''}>
          <option value="">Chưa gán</option>${pool.map(p => `<option value="${p.number}" ${slot?.productNumber === p.number ? 'selected' : ''} ${slots.some(s => s.number !== i + 1 && s.productNumber === p.number) ? 'disabled' : ''}>${p.number}. ${blindBagEscape(p.name)}</option>`).join('')}
        </select></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="blind-bag-note">Sản phẩm trong đợt: ${pool.map(p => `${p.number}. ${blindBagEscape(p.name)}`).join(' · ')}</p>
    </details>
    ${orders.length ? `<details class="blind-bag-results"><summary>Hóa đơn đã ghi nhận (${orders.length})</summary><div class="blind-bag-orders">${orders.map((o, i) => `<button class="btn-ghost-primary" onclick="showBlindBagOrder(${i})">${blindBagEscape(o.customerName)} · ${o.quantity} slot · ${formatVND(o.total)}</button>`).join('')}</div></details>` : ''}`;
}

function prepareBlindBagProducts() {
  const host = document.getElementById('blindBagProductPool');
  const previous = [...host.querySelectorAll('select')].map(s => s.value);
  host.innerHTML = Array.from({ length: 15 }, (_, i) => `<label>Sản phẩm ${i + 1}<select class="modern-input" aria-label="Sản phẩm túi mù ${i + 1}"><option value="">Chọn sản phẩm</option>${products.map(p => `<option value="${blindBagEscape(p.id)}" ${String(p.id) === previous[i] ? 'selected' : ''}>${blindBagEscape(p.name)}</option>`).join('')}</select></label>`).join('');
}

async function createBlindBag() {
  if (blindBagBusy) return;
  const productIds = [...document.querySelectorAll('#blindBagProductPool select')].map(s => s.value);
  if (productIds.length !== 15 || productIds.some(id => !id)) return alert('Vui lòng chọn đủ 15 sản phẩm.');
  blindBagBusy = true;
  document.getElementById('blindBagCreate').disabled = true;
  try {
    const result = await blindBagAPI('', { name: document.getElementById('blindBagName').value, productIds });
    blindBagSelectedId = result.data.id;
    document.querySelector('.blind-bag-create').open = false;
    await loadBlindBags();
    showToast('Đã tạo đợt túi mù 15 slot.');
  } catch (error) { alert(error.message); }
  finally { blindBagBusy = false; document.getElementById('blindBagCreate').disabled = false; renderBlindBags(); }
}

function blindBagCartLocked() {
  if (!blindBagBusy && !blindBagPending) return false;
  showToast('Vui lòng xác nhận xong đơn túi mù đang chờ trước khi sửa giỏ hàng.');
  return true;
}

function addBlindBagToCart() {
  if (blindBagCartLocked()) return;
  const round = selectedBlindBag();
  if (!round) return;
  const quantity = Number(document.getElementById('blindBagQty').value);
  const existing = cart.find(item => item.blindBagRoundId);
  if (existing && existing.blindBagRoundId !== round.id) return alert('Mỗi hóa đơn chỉ mua slot của một đợt túi mù. Hãy xuất hóa đơn hiện tại trước.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity + (existing?.qty || 0) > 15 - round.data.slots.length) return alert('Số lượng vượt quá slot túi mù còn lại.');
  if (existing) existing.qty += quantity;
  else cart.push({ blindBagRoundId: round.id, product: { id: 'blind-bag-' + round.id, name: `Túi mù · ${round.data.name}`, price: 414000 }, qty: quantity });
  renderCart();
  showToast('Đã thêm slot túi mù vào giỏ mỹ phẩm.');
}

async function assignBlindBagProduct(slotNumber, value) {
  if (blindBagBusy) return;
  const round = selectedBlindBag();
  const slot = round.data.slots.find(s => s.number === slotNumber);
  blindBagBusy = true;
  try {
    await blindBagAPI(`/${round.id}/assignment`, { slotNumber, productNumber: value ? Number(value) : null, previousProductNumber: slot.productNumber }, 'PUT');
    showToast('Đã lưu sản phẩm nhận của slot #' + slotNumber);
  } catch (error) { alert(error.message); }
  finally { blindBagBusy = false; await loadBlindBags(); }
}

async function checkoutBlindBagCart() {
  if (blindBagBusy) return;
  if (!blindBagPending) {
    const bag = cart.find(item => item.blindBagRoundId);
    if (!bag) return;
    const customerName = document.getElementById('shopCustomerName').value.trim();
    const discount = Number(document.getElementById('cartDiscount').value);
    if (!customerName) return alert('Vui lòng nhập tên người mua túi mù.');
    if (!Number.isSafeInteger(discount) || discount < 0) return alert('Giảm giá phải là số nguyên không âm.');
    blindBagPending = { roundId: bag.blindBagRoundId, body: {
      requestId: crypto.randomUUID(), customerName, phone: document.getElementById('shopCustomerPhone').value.trim(),
      quantity: bag.qty, discount, items: cart.filter(item => !item.blindBagRoundId).map(item => ({ productId: item.product.id, quantity: item.qty }))
    } };
    // Persist the idempotency key before sending, so an uncertain response can be retried safely.
    try { sessionStorage.setItem('blindBagPending', JSON.stringify(blindBagPending)); }
    catch (_) { blindBagPending = null; return alert('Không thể lưu mã đơn trên trình duyệt. Vui lòng cho phép lưu trữ rồi thử lại.'); }
  }
  blindBagBusy = true;
  document.getElementById('shopCheckoutButton').disabled = true;
  updateBlindBagPendingMessage();
  try {
    const result = await blindBagAPI(`/${blindBagPending.roundId}/checkout`, blindBagPending.body);
    const { round, order } = result.data;
    blindBagPending = null;
    sessionStorage.removeItem('blindBagPending');
    cart = [];
    document.getElementById('cartDiscount').value = 0;
    renderCart();
    renderBlindBagInvoice(round, order);
    showToast('Đã ghi nhận người mua và slot túi mù.');
  } catch (error) {
    if (error.status >= 400 && error.status < 500) { blindBagPending = null; sessionStorage.removeItem('blindBagPending'); }
    alert(error.message + (blindBagPending ? ' Bấm kiểm tra / xuất lại hóa đơn để xác nhận cùng đơn, không tạo đơn mới.' : ''));
  } finally {
    blindBagBusy = false;
    document.getElementById('shopCheckoutButton').disabled = false;
    updateBlindBagPendingMessage();
    await loadBlindBags();
  }
}

function showBlindBagOrder(index) {
  const round = selectedBlindBag();
  renderBlindBagInvoice(round, round.data.orders[index]);
}

function renderBlindBagInvoice(round, order) {
  const items = order.items.map(item => ({ product: { name: item.name, price: item.price }, qty: item.quantity }));
  items.push({ product: { name: `Túi mù · ${round.data.name} · Slot ${order.slots.map(n => '#' + n).join(', ')}`, price: 414000 }, qty: order.quantity });
  displayShopBill(items, order.customerName, order.discount, order);
  currentBillData.gameName = `Mỹ phẩm & Túi mù · ${round.data.name}`;
  currentBillData.slotsList = order.slots;
  document.getElementById('billTitle').innerText = 'HÓA ĐƠN MỸ PHẨM & TÚI MÙ';
  document.getElementById('billQuantityLabel').textContent = 'Slot túi mù:';
  document.getElementById('billGameName').innerText = round.data.name + ' · Túi mù bán lẻ';
  document.getElementById('billSlotsList').innerText = order.slots.map(n => '#' + n).join(', ') + ` (${order.quantity} slot túi mù)`;
}
