// =================================================================
// TÚI MÙ (BLIND BAGS) - RETAIL MYSTERY BOX SYSTEM
// Trực quan, dễ dùng, không chữ thừa, tích hợp xuất bill VietQR
// =================================================================

let blindBagRounds = [];
let blindBagSelectedId = '';
let blindBagBusy = false;
let blindBagPending = null;
let blindBagActiveTab = 'board'; // 'board' | 'buyers' | 'pool'

const blindBagEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const selectedBlindBag = () => blindBagRounds.find(r => r.id === blindBagSelectedId);

const blindBagStatus = round => {
  if (round.data.slots.length < 15) return { text: 'Đang mở bán', class: 'bb-status-open' };
  if (round.data.slots.every(s => s.productNumber !== null)) return { text: 'Đã hoàn thành', class: 'bb-status-done' };
  return { text: 'Đủ 15 slot · Chờ bốc thăm', class: 'bb-status-waiting' };
};

async function blindBagAPI(path = '', body, method = 'POST') {
  const response = await fetch(`/api/blind-bags${path}`, body === undefined ? {} : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw Object.assign(new Error(json.error || 'Không thể tải túi mù.'), { status: response.status });
  }
  return json;
}

document.addEventListener('DOMContentLoaded', () => {
  const tabShop = document.getElementById('tabShop');
  if (!tabShop) return;

  // Khung giao diện chính Túi mù
  const section = document.createElement('section');
  section.className = 'surface-card blind-bag-panel';
  section.id = 'blindBagSection';
  section.innerHTML = `
    <div class="card-top-bar">
      <div class="top-bar-title">
        <div class="bb-icon-badge"><i class="fa-solid fa-gift"></i></div>
        <div class="bb-heading-group">
          <h2>TÚI MÙ</h2>
          <span class="bb-chip bb-chip-gold"><i class="fa-solid fa-gem"></i> 414.000 đ / slot</span>
          <span class="bb-chip bb-chip-emerald"><i class="fa-solid fa-boxes-packing"></i> 15 slot / đợt</span>
        </div>
      </div>
      <div class="bb-top-actions">
        <button class="btn-neon-gold" onclick="openBlindBagCreateModal()">
          <i class="fa-solid fa-plus"></i> Tạo đợt mới
        </button>
        <button class="btn-ghost-primary" onclick="loadBlindBags()" title="Làm mới dữ liệu">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>
    </div>
    <div class="card-content">
      <div id="blindBagPendingMessage"></div>
      <div id="blindBagMessage" style="display:none;"></div>
      <div id="blindBagMainContent"></div>
    </div>`;
  tabShop.appendChild(section);

  // Modal tạo đợt mới
  createBlindBagModalDOM();

  // Khôi phục pending đơn nếu có
  try {
    blindBagPending = JSON.parse(sessionStorage.getItem('blindBagPending') || 'null');
  } catch (_) { /* Bỏ qua nếu lỗi */ }
  updateBlindBagPendingMessage();

  // Tải dữ liệu ban đầu
  loadBlindBags();

  // Đồng bộ tên khách hàng giữa giỏ hàng shop và ô nhập túi mù
  const shopCustomerName = document.getElementById('shopCustomerName');
  if (shopCustomerName) {
    shopCustomerName.addEventListener('input', () => {
      const bbName = document.getElementById('bbCustomerName');
      if (bbName && document.activeElement === shopCustomerName) bbName.value = shopCustomerName.value;
    });
  }
  const shopCustomerPhone = document.getElementById('shopCustomerPhone');
  if (shopCustomerPhone) {
    shopCustomerPhone.addEventListener('input', () => {
      const bbPhone = document.getElementById('bbCustomerPhone');
      if (bbPhone && document.activeElement === shopCustomerPhone) bbPhone.value = shopCustomerPhone.value;
    });
  }
});

function createBlindBagModalDOM() {
  if (document.getElementById('bbCreateModal')) return;
  const modal = document.createElement('div');
  modal.id = 'bbCreateModal';
  modal.className = 'bb-modal-overlay';
  modal.innerHTML = `
    <div class="bb-modal-dialog">
      <div class="bb-modal-header">
        <h3><i class="fa-solid fa-gift" style="color: #b45309;"></i> Tạo Đợt Túi Mù Mới (15 Slot)</h3>
        <button class="bb-modal-close-btn" onclick="closeBlindBagCreateModal()">&times;</button>
      </div>
      <div class="bb-modal-body">
        <div class="bb-input-field">
          <label for="blindBagName">Tên đợt túi mù</label>
          <input id="blindBagName" class="modern-input" maxlength="100" placeholder="Ví dụ: Túi mù đợt 1">
        </div>
        <div class="bb-modal-toolbar">
          <div class="bb-modal-quick-actions">
            <button class="bb-btn-tool" onclick="autoFillRandomProducts()">
              <i class="fa-solid fa-dice"></i> Chọn ngẫu nhiên 15 món
            </button>
            <button class="bb-btn-tool" onclick="autoFillPreviousProducts()">
              <i class="fa-solid fa-copy"></i> Dùng lại 15 món đợt trước
            </button>
            <button class="bb-btn-tool" onclick="resetCreateModalProducts()">
              <i class="fa-solid fa-rotate-left"></i> Xóa chọn
            </button>
          </div>
          <span id="bbCreateProgressBadge" class="bb-chip bb-chip-gold">Đã chọn: 0/15</span>
        </div>
        <div id="blindBagProductPool" class="bb-modal-grid-15"></div>
      </div>
      <div class="bb-modal-footer">
        <button class="btn-action-dim" onclick="closeBlindBagCreateModal()">Hủy</button>
        <button id="blindBagCreate" class="btn-neon-gold" onclick="createBlindBag()">
          <i class="fa-solid fa-check"></i> Xác nhận tạo đợt
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Đóng modal khi click ra ngoài backdrop
  modal.addEventListener('click', e => {
    if (e.target === modal) closeBlindBagCreateModal();
  });
}

function updateBlindBagPendingMessage() {
  const container = document.getElementById('blindBagPendingMessage');
  if (!container) return;
  if (!blindBagPending) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="bb-round-full-banner mb-3" style="background:#fffbeb; border-color:#f59e0b;">
      <div class="bb-round-full-banner-left">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <span>Đang có đơn túi mù chờ xác nhận xuất hóa đơn.</span>
      </div>
      <button class="btn-neon-gold" onclick="checkoutBlindBagCart()">
        <i class="fa-solid fa-receipt"></i> Kiểm tra / Xuất lại hóa đơn
      </button>
    </div>`;
}

async function loadBlindBags() {
  const message = document.getElementById('blindBagMessage');
  try {
    const result = await blindBagAPI();
    blindBagRounds = result.data;
    if (!selectedBlindBag()) blindBagSelectedId = blindBagRounds[0]?.id || '';
    if (message) {
      if (!result.persistent) {
        message.style.display = 'block';
        message.className = 'bb-chip bb-chip-gold mb-3';
        message.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Chế độ thử nghiệm: dữ liệu túi mù lưu trong RAM.';
      } else {
        message.style.display = 'none';
      }
    }
    renderBlindBags();
  } catch (error) {
    if (message) {
      message.style.display = 'block';
      message.className = 'bb-chip bb-chip-obsidian mb-3';
      message.textContent = error.message;
    }
    renderBlindBags();
  }
}

function selectBlindBag(id) {
  blindBagSelectedId = id;
  renderBlindBags();
}

function switchBlindBagTab(tabName) {
  blindBagActiveTab = tabName;
  renderBlindBags();
}

function renderBlindBags() {
  const host = document.getElementById('blindBagMainContent');
  if (!host) return;

  const round = selectedBlindBag();

  // Trường hợp chưa có đợt nào
  if (!round) {
    host.innerHTML = `
      <div class="bb-empty-state">
        <i class="fa-solid fa-gift"></i>
        <h3>Chưa có đợt túi mù nào</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Hãy tạo đợt túi mù 15 slot để bắt đầu bán lẻ cho khách hàng.</p>
        <button class="btn-neon-gold" onclick="openBlindBagCreateModal()" style="margin-top: 8px;">
          <i class="fa-solid fa-plus"></i> Tạo đợt túi mù ngay
        </button>
      </div>`;
    return;
  }

  const { slots, pool, orders } = round.data;
  const remaining = 15 - slots.length;
  const statusInfo = blindBagStatus(round);
  const percent = Math.min(100, Math.round((slots.length / 15) * 100));

  // Nhóm danh sách người mua
  const buyers = new Map();
  for (const slot of slots) {
    const key = JSON.stringify([slot.customerName.toLocaleLowerCase('vi-VN'), slot.phone]);
    if (!buyers.has(key)) {
      buyers.set(key, { name: slot.customerName, phone: slot.phone, numbers: [] });
    }
    buyers.get(key).numbers.push(slot.number);
  }

  // Lấy giá trị tên/sđt hiện tại để giữ trạng thái khi render lại
  const currentName = document.getElementById('bbCustomerName')?.value || document.getElementById('shopCustomerName')?.value || '';
  const currentPhone = document.getElementById('bbCustomerPhone')?.value || document.getElementById('shopCustomerPhone')?.value || '';
  const currentQty = Math.max(1, Math.min(remaining || 1, parseInt(document.getElementById('blindBagQty')?.value) || 1));

  let html = `
    <!-- HERO CONTROL BAR -->
    <div class="bb-hero-bar">
      <div class="bb-round-selector-box">
        <label for="blindBagRound">Đợt túi mù đang chọn</label>
        <select id="blindBagRound" class="modern-input" onchange="selectBlindBag(this.value)">
          ${blindBagRounds.map(r => `
            <option value="${blindBagEscape(r.id)}" ${r.id === round.id ? 'selected' : ''}>
              ${blindBagEscape(r.data.name)} (${r.data.slots.length}/15 slot) · ${new Date(r.created_at).toLocaleDateString('vi-VN')}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="bb-hero-stats">
        <div class="bb-hero-stats-row">
          <span class="bb-status-indicator ${statusInfo.class}">
            <i class="fa-solid fa-circle-dot"></i> ${statusInfo.text}
          </span>
          <span class="bb-progress-label">
            Đã bán: <b>${slots.length}/15</b> slot · Còn: <b>${remaining}</b> slot
          </span>
        </div>
        <div class="bb-progress-track">
          <div class="bb-progress-fill" style="width: ${percent}%;"></div>
        </div>
      </div>
    </div>`;

  // KHU VỰC BÁN SLOT (Nếu còn slot)
  if (remaining > 0) {
    const defaultTotal = currentQty * 414000;
    const formattedTotal = (typeof formatVND === 'function') ? formatVND(defaultTotal) : defaultTotal.toLocaleString('vi-VN') + ' đ';

    html += `
      <div class="bb-quick-sell">
        <div class="bb-quick-sell-title">
          <span><i class="fa-solid fa-bolt text-gold"></i> Bán slot cho khách</span>
          <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: normal;">
            Còn trống ${remaining} slot trong đợt này
          </span>
        </div>
        <div class="bb-sell-form-grid">
          <div class="bb-input-field">
            <label for="bbCustomerName">Tên khách hàng <span style="color:#e11d48;">*</span></label>
            <input id="bbCustomerName" class="modern-input" placeholder="Nhập tên khách..." value="${blindBagEscape(currentName)}" oninput="syncFromBBNames()">
          </div>
          <div class="bb-input-field">
            <label for="bbCustomerPhone">Số điện thoại</label>
            <input id="bbCustomerPhone" class="modern-input" placeholder="09xxxxxxx" value="${blindBagEscape(currentPhone)}" oninput="syncFromBBNames()">
          </div>
          <div class="bb-input-field">
            <label>Số slot mua</label>
            <div class="bb-qty-control">
              <button class="bb-qty-btn" type="button" onclick="changeBlindBagQty(-1)" ${currentQty <= 1 ? 'disabled' : ''}>-</button>
              <input id="blindBagQty" class="modern-input bb-qty-input" type="number" min="1" max="${remaining}" value="${currentQty}" onchange="validateBlindBagQtyInput()">
              <button class="bb-qty-btn" type="button" onclick="changeBlindBagQty(1)" ${currentQty >= remaining ? 'disabled' : ''}>+</button>
            </div>
            <div class="bb-quick-chips">
              <button type="button" class="bb-quick-chip-btn" onclick="setBlindBagQty(1)">1</button>
              ${remaining >= 2 ? '<button type="button" class="bb-quick-chip-btn" onclick="setBlindBagQty(2)">2</button>' : ''}
              ${remaining >= 3 ? '<button type="button" class="bb-quick-chip-btn" onclick="setBlindBagQty(3)">3</button>' : ''}
              ${remaining >= 5 ? '<button type="button" class="bb-quick-chip-btn" onclick="setBlindBagQty(5)">5</button>' : ''}
              <button type="button" class="bb-quick-chip-btn" onclick="setBlindBagQty(${remaining})">Tất cả (${remaining})</button>
            </div>
          </div>
          <div class="bb-sell-actions-wrap">
            <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">&nbsp;</label>
            <div class="bb-sell-actions">
              <button id="bbQuickSellBtn" class="bb-btn-checkout" type="button" onclick="quickSellBlindBag()" ${blindBagBusy ? 'disabled' : ''}>
                <i class="fa-solid fa-receipt"></i>
                <span>Xuất bill (<span id="bbSellPricePreview">${formattedTotal}</span>)</span>
              </button>
              <button id="blindBagAdd" class="bb-btn-add-cart" type="button" onclick="addBlindBagToCart()" ${blindBagBusy ? 'disabled' : ''} title="Thêm vào giỏ chung với mỹ phẩm">
                <i class="fa-solid fa-cart-plus"></i> Vào giỏ
              </button>
            </div>
          </div>
        </div>
      </div>`;
  } else {
    // Đã bán đủ 15 slot
    html += `
      <div class="bb-round-full-banner">
        <div class="bb-round-full-banner-left">
          <i class="fa-solid fa-champagne-glasses"></i>
          <div>
            <div>Đợt đã bán đủ 15/15 slot!</div>
            <div style="font-size: 0.8rem; font-weight: normal; color: #a16207;">
              Hãy bốc thăm offline và chọn sản phẩm khách trúng tại từng ô slot bên dưới.
            </div>
          </div>
        </div>
        <button class="btn-ghost-primary" onclick="openBlindBagCreateModal()">
          <i class="fa-solid fa-plus"></i> Tạo đợt mới tiếp theo
        </button>
      </div>`;
  }

  // TABS NAVIGATION
  html += `
    <div class="bb-tabs-nav">
      <button class="bb-tab-pill ${blindBagActiveTab === 'board' ? 'active' : ''}" onclick="switchBlindBagTab('board')">
        <i class="fa-solid fa-boxes-stacked"></i> Bảng 15 Slot
        <span class="bb-tab-count">${slots.length}/15</span>
      </button>
      <button class="bb-tab-pill ${blindBagActiveTab === 'buyers' ? 'active' : ''}" onclick="switchBlindBagTab('buyers')">
        <i class="fa-solid fa-users"></i> Người mua & Hóa đơn
        <span class="bb-tab-count">${buyers.size}</span>
      </button>
      <button class="bb-tab-pill ${blindBagActiveTab === 'pool' ? 'active' : ''}" onclick="switchBlindBagTab('pool')">
        <i class="fa-solid fa-box-open"></i> 15 Món quà trong đợt
        <span class="bb-tab-count">15</span>
      </button>
    </div>`;

  // TAB NỘI DUNG
  if (blindBagActiveTab === 'board') {
    html += `
      <div class="bb-board-container">
        <div class="bb-slot-grid">
          ${Array.from({ length: 15 }, (_, i) => {
            const slotNum = i + 1;
            const slot = slots.find(s => s.number === slotNum);
            return renderSingleSlotCard(slotNum, slot, round);
          }).join('')}
        </div>
      </div>`;
  } else if (blindBagActiveTab === 'buyers') {
    html += `
      <div class="bb-buyers-view">
        <div class="bb-data-card">
          <div class="bb-data-card-header">
            <span><i class="fa-solid fa-user-group text-gold"></i> Danh sách khách hàng đã mua slot</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${buyers.size} khách hàng</span>
          </div>
          <table class="bb-table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Số điện thoại</th>
                <th>Số slot</th>
                <th>Các số slot đã mua</th>
              </tr>
            </thead>
            <tbody>
              ${buyers.size ? [...buyers.values()].map(b => `
                <tr>
                  <td><b>${blindBagEscape(b.name)}</b></td>
                  <td>${b.phone ? blindBagEscape(b.phone) : '<span style="color:#9ca3af;">-</span>'}</td>
                  <td><b>${b.numbers.length}</b> slot</td>
                  <td>
                    <div class="bb-slots-tags">
                      ${b.numbers.map(n => `<span class="bb-slot-tag">#${n}</span>`).join('')}
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 24px; color: #9ca3af;">Chưa có khách mua slot trong đợt này.</td></tr>'}
            </tbody>
          </table>
        </div>

        ${orders.length ? `
          <div class="bb-data-card">
            <div class="bb-data-card-header">
              <span><i class="fa-solid fa-receipt text-gold"></i> Hóa đơn đã xuất (${orders.length})</span>
            </div>
            <div class="bb-orders-grid">
              ${orders.map((o, idx) => `
                <div class="bb-order-btn-card" onclick="showBlindBagOrder(${idx})" title="Bấm để xem lại chi tiết hóa đơn & VietQR">
                  <div class="bb-order-btn-card-left">
                    <div class="bb-order-btn-customer"><i class="fa-solid fa-user"></i> ${blindBagEscape(o.customerName)}</div>
                    <div class="bb-order-btn-slots">Slot: ${o.slots.map(n => '#' + n).join(', ')}</div>
                  </div>
                  <div class="bb-order-btn-amount">${(typeof formatVND === 'function') ? formatVND(o.total) : o.total.toLocaleString('vi-VN') + ' đ'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>`;
  } else if (blindBagActiveTab === 'pool') {
    html += `
      <div class="bb-pool-grid">
        ${pool.map(p => {
          const assignedSlot = slots.find(s => s.productNumber === p.number);
          return `
            <div class="bb-pool-item">
              <div class="bb-pool-item-num">#${p.number}</div>
              <div class="bb-pool-item-info">
                <div class="bb-pool-item-name" title="${blindBagEscape(p.name)}">${blindBagEscape(p.name)}</div>
                <div class="bb-pool-item-status">
                  ${assignedSlot 
                    ? `<span style="color: #059669;"><i class="fa-solid fa-check"></i> Đã trúng: Slot #${assignedSlot.number} (${blindBagEscape(assignedSlot.customerName)})</span>`
                    : '<span style="color: #9ca3af;"><i class="fa-solid fa-box"></i> Còn trong hộp</span>'}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  host.innerHTML = html;
}

function renderSingleSlotCard(slotNum, slot, round) {
  const { slots, pool } = round.data;
  const isFull = slots.length === 15;

  if (!slot) {
    // Ô chưa bán (Trống)
    return `
      <div class="bb-slot-card" onclick="quickSelectSlot(${slotNum})" title="Bấm để chọn mua slot #${slotNum}">
        <div class="bb-slot-card-top">
          <span class="bb-slot-number-badge">#${slotNum}</span>
          <span class="bb-slot-status-pill bb-status-pill-empty">Trống</span>
        </div>
        <div class="bb-slot-empty-body">
          <div class="bb-slot-mystery-icon"><i class="fa-solid fa-gift"></i></div>
          <div class="bb-slot-empty-label">Chưa bán</div>
          <button type="button" class="bb-slot-quick-pick-btn" onclick="event.stopPropagation(); quickSelectSlot(${slotNum})">
            + Mua ô này
          </button>
        </div>
      </div>`;
  }

  // Ô đã bán
  let rewardSection = '';
  if (!isFull) {
    rewardSection = `
      <div class="bb-slot-reward-box">
        <div class="bb-reward-pending"><i class="fa-solid fa-hourglass-half"></i> Chờ đủ 15 slot</div>
      </div>`;
  } else if (slot.productNumber === null) {
    // Đã đủ 15 slot, chưa gán quà
    rewardSection = `
      <div class="bb-slot-reward-box">
        <select class="bb-reward-select" onchange="assignBlindBagProduct(${slotNum}, this.value)" ${blindBagBusy ? 'disabled' : ''}>
          <option value="">-- Chọn quà bốc trúng --</option>
          ${pool.map(p => {
            const takenByOther = slots.some(s => s.number !== slotNum && s.productNumber === p.number);
            return `<option value="${p.number}" ${takenByOther ? 'disabled' : ''}>${p.number}. ${blindBagEscape(p.name)} ${takenByOther ? '(Đã gán)' : ''}</option>`;
          }).join('')}
        </select>
      </div>`;
  } else {
    // Đã gán quà
    const wonItem = pool.find(p => p.number === slot.productNumber);
    rewardSection = `
      <div class="bb-slot-reward-box">
        <div class="bb-reward-won">
          <div class="bb-reward-won-content">
            <span class="bb-reward-won-label"><i class="fa-solid fa-gift"></i> Trúng quà</span>
            <span class="bb-reward-won-name" title="${wonItem ? blindBagEscape(wonItem.name) : ''}">
              ${wonItem ? blindBagEscape(wonItem.name) : 'Sản phẩm #' + slot.productNumber}
            </span>
          </div>
          <button class="bb-reward-edit-btn" onclick="assignBlindBagProduct(${slotNum}, '')" title="Bỏ gán / Chọn lại">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>`;
  }

  return `
    <div class="bb-slot-card bb-slot-taken">
      <div class="bb-slot-card-top">
        <span class="bb-slot-number-badge">#${slotNum}</span>
        <span class="bb-slot-status-pill bb-status-pill-sold"><i class="fa-solid fa-check"></i> Đã bán</span>
      </div>
      <div class="bb-slot-taken-body">
        <div class="bb-slot-buyer-meta">
          <div class="bb-slot-buyer-name" title="${blindBagEscape(slot.customerName)}">
            <i class="fa-solid fa-user"></i> ${blindBagEscape(slot.customerName)}
          </div>
          ${slot.phone ? `<div class="bb-slot-buyer-phone"><i class="fa-solid fa-phone"></i> ${blindBagEscape(slot.phone)}</div>` : ''}
        </div>
        ${rewardSection}
      </div>
    </div>`;
}

// ================= MODAL TẠO ĐỢT MỚI =================
function openBlindBagCreateModal() {
  const modal = document.getElementById('bbCreateModal');
  if (!modal) return;
  const nameInput = document.getElementById('blindBagName');
  if (nameInput) {
    nameInput.value = `Túi mù đợt ${blindBagRounds.length + 1}`;
  }
  prepareBlindBagProducts();
  modal.classList.add('active');
}

function closeBlindBagCreateModal() {
  const modal = document.getElementById('bbCreateModal');
  if (modal) modal.classList.remove('active');
}

function prepareBlindBagProducts() {
  const host = document.getElementById('blindBagProductPool');
  if (!host) return;
  const previous = [...host.querySelectorAll('select')].map(s => s.value);
  host.innerHTML = Array.from({ length: 15 }, (_, i) => `
    <div class="bb-modal-slot-picker">
      <label><i class="fa-solid fa-gift"></i> Quà slot #${i + 1}</label>
      <select class="modern-input" onchange="updateCreateProgress()">
        <option value="">-- Chọn sản phẩm --</option>
        ${products.map(p => `
          <option value="${blindBagEscape(p.id)}" ${String(p.id) === previous[i] ? 'selected' : ''}>
            ${blindBagEscape(p.name)}
          </option>
        `).join('')}
      </select>
    </div>
  `).join('');
  updateCreateProgress();
}

function updateCreateProgress() {
  const selects = [...document.querySelectorAll('#blindBagProductPool select')];
  const filled = selects.filter(s => s.value).length;
  const badge = document.getElementById('bbCreateProgressBadge');
  const createBtn = document.getElementById('blindBagCreate');
  if (badge) {
    badge.textContent = `Đã chọn: ${filled}/15`;
    badge.className = filled === 15 ? 'bb-chip bb-chip-emerald' : 'bb-chip bb-chip-gold';
  }
  if (createBtn) {
    createBtn.disabled = filled !== 15 || blindBagBusy;
  }
}

function autoFillRandomProducts() {
  if (!products || !products.length) return alert('Danh mục mỹ phẩm hiện chưa có sản phẩm.');
  const selects = [...document.querySelectorAll('#blindBagProductPool select')];
  selects.forEach(s => {
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    s.value = randomProduct.id;
  });
  updateCreateProgress();
  if (typeof showToast === 'function') showToast('Đã tự động chọn 15 sản phẩm ngẫu nhiên.');
}

function autoFillPreviousProducts() {
  const previousRound = selectedBlindBag() || blindBagRounds[0];
  if (!previousRound || !previousRound.data.pool) {
    return alert('Chưa có đợt túi mù trước đó để sao chép.');
  }
  const selects = [...document.querySelectorAll('#blindBagProductPool select')];
  previousRound.data.pool.forEach((item, idx) => {
    if (selects[idx]) selects[idx].value = item.productId;
  });
  updateCreateProgress();
  if (typeof showToast === 'function') showToast('Đã sao chép 15 sản phẩm từ đợt trước.');
}

function resetCreateModalProducts() {
  const selects = [...document.querySelectorAll('#blindBagProductPool select')];
  selects.forEach(s => s.value = '');
  updateCreateProgress();
}

async function createBlindBag() {
  if (blindBagBusy) return;
  const productIds = [...document.querySelectorAll('#blindBagProductPool select')].map(s => s.value);
  if (productIds.length !== 15 || productIds.some(id => !id)) {
    return alert('Vui lòng chọn đủ 15 sản phẩm cho 15 vị trí quà.');
  }
  blindBagBusy = true;
  const createBtn = document.getElementById('blindBagCreate');
  if (createBtn) createBtn.disabled = true;

  try {
    const name = document.getElementById('blindBagName')?.value.trim() || `Túi mù đợt ${blindBagRounds.length + 1}`;
    const result = await blindBagAPI('', { name, productIds });
    blindBagSelectedId = result.data.id;
    closeBlindBagCreateModal();
    await loadBlindBags();
    if (typeof showToast === 'function') showToast('Tạo đợt túi mù 15 slot thành công!');
    if (typeof playSound === 'function') playSound('coin');
  } catch (error) {
    alert(error.message);
  } finally {
    blindBagBusy = false;
    if (createBtn) createBtn.disabled = false;
    renderBlindBags();
  }
}

// ================= THAO TÁC BÁN VÀ MUA SLOT =================
function syncFromBBNames() {
  const bbName = document.getElementById('bbCustomerName');
  const bbPhone = document.getElementById('bbCustomerPhone');
  const shopName = document.getElementById('shopCustomerName');
  const shopPhone = document.getElementById('shopCustomerPhone');
  if (shopName && bbName) shopName.value = bbName.value;
  if (shopPhone && bbPhone) shopPhone.value = bbPhone.value;
}

function changeBlindBagQty(delta) {
  const round = selectedBlindBag();
  const remaining = round ? 15 - round.data.slots.length : 15;
  const qtyInput = document.getElementById('blindBagQty');
  if (!qtyInput) return;
  let val = parseInt(qtyInput.value) || 1;
  val = Math.max(1, Math.min(remaining, val + delta));
  qtyInput.value = val;
  updateSellPricePreview();
  renderBlindBagsQtyButtons(val, remaining);
}

function setBlindBagQty(num) {
  const round = selectedBlindBag();
  const remaining = round ? 15 - round.data.slots.length : 15;
  const qtyInput = document.getElementById('blindBagQty');
  if (!qtyInput) return;
  const val = Math.max(1, Math.min(remaining, num));
  qtyInput.value = val;
  updateSellPricePreview();
  renderBlindBagsQtyButtons(val, remaining);
}

function validateBlindBagQtyInput() {
  const round = selectedBlindBag();
  const remaining = round ? 15 - round.data.slots.length : 15;
  const qtyInput = document.getElementById('blindBagQty');
  if (!qtyInput) return;
  let val = parseInt(qtyInput.value) || 1;
  if (val < 1) val = 1;
  if (val > remaining) val = remaining;
  qtyInput.value = val;
  updateSellPricePreview();
  renderBlindBagsQtyButtons(val, remaining);
}

function renderBlindBagsQtyButtons(val, remaining) {
  const buttons = document.querySelectorAll('.bb-qty-btn');
  if (buttons.length >= 2) {
    buttons[0].disabled = val <= 1;
    buttons[1].disabled = val >= remaining;
  }
}

function updateSellPricePreview() {
  const qtyInput = document.getElementById('blindBagQty');
  const preview = document.getElementById('bbSellPricePreview');
  if (!qtyInput || !preview) return;
  const qty = parseInt(qtyInput.value) || 1;
  const total = qty * 414000;
  preview.textContent = (typeof formatVND === 'function') ? formatVND(total) : total.toLocaleString('vi-VN') + ' đ';
}

function quickSelectSlot(slotNum) {
  const round = selectedBlindBag();
  if (!round) return;
  const nameInput = document.getElementById('bbCustomerName');
  if (nameInput) {
    nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
    if (typeof showToast === 'function') showToast(`Nhập tên khách để bán slot #${slotNum}`);
  }
}

function blindBagCartLocked() {
  if (!blindBagBusy && !blindBagPending) return false;
  if (typeof showToast === 'function') {
    showToast('Đang có đơn túi mù chờ xử lý. Vui lòng xác nhận trước.');
  }
  return true;
}

// Bán nhanh: tạo đơn và xuất bill ngay lập tức
async function quickSellBlindBag() {
  if (blindBagCartLocked()) return;
  const round = selectedBlindBag();
  if (!round) return alert('Chưa chọn đợt túi mù.');
  const remaining = 15 - round.data.slots.length;
  if (remaining <= 0) return alert('Đợt túi mù này đã bán đủ 15 slot.');

  const nameInput = document.getElementById('bbCustomerName');
  const phoneInput = document.getElementById('bbCustomerPhone');
  const qtyInput = document.getElementById('blindBagQty');

  const customerName = (nameInput?.value || document.getElementById('shopCustomerName')?.value || '').trim();
  if (!customerName) {
    if (nameInput) nameInput.focus();
    return alert('Vui lòng nhập tên khách hàng.');
  }

  const phone = (phoneInput?.value || document.getElementById('shopCustomerPhone')?.value || '').trim();
  const quantity = Number(qtyInput?.value || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
    return alert(`Số lượng slot không hợp lệ (còn ${remaining} slot).`);
  }

  // Đồng bộ sang giỏ hàng
  syncFromBBNames();

  // Đảm bảo giỏ hàng có item túi mù này
  const existing = cart.find(item => item.blindBagRoundId);
  if (existing && existing.blindBagRoundId !== round.id) {
    return alert('Mỗi hóa đơn chỉ mua slot của một đợt túi mù. Hãy xuất hóa đơn hiện tại trước.');
  }
  if (existing) {
    existing.qty = quantity;
  } else {
    cart.push({
      blindBagRoundId: round.id,
      product: { id: 'blind-bag-' + round.id, name: `Túi mù · ${round.data.name}`, price: 414000 },
      qty: quantity
    });
  }
  if (typeof renderCart === 'function') renderCart();

  // Gọi trực tiếp checkout để mở modal bill và lưu slot
  await checkoutBlindBagCart();
}

// Thêm vào giỏ chung với mỹ phẩm
function addBlindBagToCart() {
  if (blindBagCartLocked()) return;
  const round = selectedBlindBag();
  if (!round) return;
  const remaining = 15 - round.data.slots.length;
  if (remaining <= 0) return alert('Đợt túi mù này đã đủ 15 slot.');

  const qtyInput = document.getElementById('blindBagQty');
  const quantity = Number(qtyInput ? qtyInput.value : 1);
  const existing = cart.find(item => item.blindBagRoundId);
  if (existing && existing.blindBagRoundId !== round.id) {
    return alert('Mỗi hóa đơn chỉ mua slot của một đợt túi mù. Hãy xuất hóa đơn hiện tại trước.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity + (existing?.qty || 0) > remaining) {
    return alert('Số lượng vượt quá số slot còn lại.');
  }

  syncFromBBNames();

  if (existing) {
    existing.qty += quantity;
  } else {
    cart.push({
      blindBagRoundId: round.id,
      product: { id: 'blind-bag-' + round.id, name: `Túi mù · ${round.data.name}`, price: 414000 },
      qty: quantity
    });
  }
  if (typeof renderCart === 'function') renderCart();
  if (typeof showToast === 'function') showToast(`Đã thêm ${quantity} slot túi mù vào giỏ hàng.`);
  if (typeof playSound === 'function') playSound('click');
}

// Gán sản phẩm bốc trúng offline cho slot
async function assignBlindBagProduct(slotNumber, value) {
  if (blindBagBusy) return;
  const round = selectedBlindBag();
  if (!round) return;
  const slot = round.data.slots.find(s => s.number === slotNumber);
  if (!slot) return;
  blindBagBusy = true;
  try {
    await blindBagAPI(`/${round.id}/assignment`, {
      slotNumber,
      productNumber: value ? Number(value) : null,
      previousProductNumber: slot.productNumber
    }, 'PUT');
    if (typeof showToast === 'function') {
      showToast(value ? `Đã lưu quà cho slot #${slotNumber}` : `Đã bỏ gán quà của slot #${slotNumber}`);
    }
    if (typeof playSound === 'function') playSound('success');
  } catch (error) {
    alert(error.message);
  } finally {
    blindBagBusy = false;
    await loadBlindBags();
  }
}

// Thanh toán và xuất hóa đơn
async function checkoutBlindBagCart() {
  if (blindBagBusy) return;
  if (!blindBagPending) {
    const bag = cart.find(item => item.blindBagRoundId);
    if (!bag) return;
    const customerName = document.getElementById('shopCustomerName')?.value.trim() || document.getElementById('bbCustomerName')?.value.trim();
    const discount = Number(document.getElementById('cartDiscount')?.value || 0);
    if (!customerName) return alert('Vui lòng nhập tên người mua túi mù.');
    if (!Number.isSafeInteger(discount) || discount < 0) return alert('Giảm giá phải là số nguyên không âm.');

    blindBagPending = {
      roundId: bag.blindBagRoundId,
      body: {
        requestId: crypto.randomUUID(),
        customerName,
        phone: document.getElementById('shopCustomerPhone')?.value.trim() || document.getElementById('bbCustomerPhone')?.value.trim() || '',
        quantity: bag.qty,
        discount,
        items: cart.filter(item => !item.blindBagRoundId).map(item => ({ productId: item.product.id, quantity: item.qty }))
      }
    };

    try {
      sessionStorage.setItem('blindBagPending', JSON.stringify(blindBagPending));
    } catch (_) {
      blindBagPending = null;
      return alert('Không thể lưu mã đơn trên trình duyệt. Vui lòng thử lại.');
    }
  }

  blindBagBusy = true;
  const shopBtn = document.getElementById('shopCheckoutButton');
  if (shopBtn) shopBtn.disabled = true;
  const quickBtn = document.getElementById('bbQuickSellBtn');
  if (quickBtn) quickBtn.disabled = true;

  updateBlindBagPendingMessage();
  try {
    const result = await blindBagAPI(`/${blindBagPending.roundId}/checkout`, blindBagPending.body);
    const { round, order } = result.data;
    blindBagPending = null;
    sessionStorage.removeItem('blindBagPending');
    cart = [];
    const discountEl = document.getElementById('cartDiscount');
    if (discountEl) discountEl.value = 0;
    if (typeof renderCart === 'function') renderCart();
    renderBlindBagInvoice(round, order);
    if (typeof showToast === 'function') showToast('Đã ghi nhận người mua và xuất hóa đơn túi mù!');
    if (typeof playSound === 'function') playSound('coin');
  } catch (error) {
    if (error.status >= 400 && error.status < 500) {
      blindBagPending = null;
      sessionStorage.removeItem('blindBagPending');
    }
    alert(error.message + (blindBagPending ? ' Bấm kiểm tra / xuất lại hóa đơn để xác nhận.' : ''));
  } finally {
    blindBagBusy = false;
    if (shopBtn) shopBtn.disabled = false;
    if (quickBtn) quickBtn.disabled = false;
    updateBlindBagPendingMessage();
    await loadBlindBags();
  }
}

function showBlindBagOrder(index) {
  const round = selectedBlindBag();
  if (round && round.data.orders[index]) {
    renderBlindBagInvoice(round, round.data.orders[index]);
  }
}

function renderBlindBagInvoice(round, order) {
  const items = order.items.map(item => ({ product: { name: item.name, price: item.price }, qty: item.quantity }));
  items.push({
    product: {
      name: `Túi mù · ${round.data.name} · Slot ${order.slots.map(n => '#' + n).join(', ')}`,
      price: 414000
    },
    qty: order.quantity
  });

  if (typeof displayShopBill === 'function') {
    displayShopBill(items, order.customerName, order.discount, order);
  }

  if (typeof currentBillData !== 'undefined' && currentBillData) {
    currentBillData.gameName = `Mỹ phẩm & Túi mù · ${round.data.name}`;
    currentBillData.slotsList = order.slots;
  }

  const titleEl = document.getElementById('billTitle');
  if (titleEl) titleEl.innerText = 'HÓA ĐƠN MỸ PHẨM & TÚI MÙ';
  const labelEl = document.getElementById('billQuantityLabel');
  if (labelEl) labelEl.textContent = 'Slot túi mù:';
  const gameNameEl = document.getElementById('billGameName');
  if (gameNameEl) gameNameEl.innerText = round.data.name + ' · Túi mù bán lẻ';
  const slotsListEl = document.getElementById('billSlotsList');
  if (slotsListEl) {
    slotsListEl.innerText = order.slots.map(n => '#' + n).join(', ') + ` (${order.quantity} slot túi mù)`;
  }
}
