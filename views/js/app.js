/**
 * LUCKY SLOT PRO - UI/UX 2.0 LOGIC & AUDIO SYNTHESIZER
 * GameShow Livestream Management • 12 Slot Board • Split 2/3 • VietQR
 */

// --- GLOBAL APP STATE ---
let menusList = [];
let currentActiveMenuId = 'menu-150k';
let currentRoundNumber = 1;
let currentRoundsList = []; // Danh sách các chuyến của Menu đang chọn (Chuyến 1, 2, 3...)
let currentReportFilterMenuId = 'all';

let gameState = {
  menuId: 'menu-150k',
  roundNumber: 1,
  name: "Menu Kèo 150K",
  totalSlots: 12,
  slotPrice: 150000,
  prizeValue: 1500000,
  slots: [],
  status: "open", // 'open' | 'full' | 'finished'
  settleMode: "solo", // 'solo' | 'split2' | 'split3'
  winners: [],
  finishedResults: null
};

let shopSettings = {
  name: "NGỌC COSMETICS & LUCKY GAME",
  phone: "0988 123 456",
  bankCode: "MB",
  bankName: "MB Bank (Quân Đội)",
  accountNumber: "999988886666",
  accountOwner: "DUONG THI KHANH NGOC",
  billFooter: "Cảm ơn quý khách đã tham gia và ủng hộ Shop! Vui lòng chuyển khoản đúng nội dung."
};

let products = [
  { id: 1, name: "Son YSL Rouge Pur Couture #01", price: 850000, img: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300" },
  { id: 2, name: "Serum Phục Hồi La Roche-Posay B5", price: 420000, img: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300" },
  { id: 3, name: "Nước Hoa Chanel Coco Mademoiselle 50ml", price: 2950000, img: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=300" },
  { id: 4, name: "Kem Chống Nắng Anessa Perfect UV 60ml", price: 460000, img: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300" },
  { id: 5, name: "Phấn Phủ Bột Kiềm Dầu Laura Mercier", price: 920000, img: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=300" },
  { id: 6, name: "Nước Tẩy Trang Bioderma Hồng 500ml", price: 380000, img: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300" }
];

let cart = [];
let customerAttachedProducts = {}; // Map: playerName => Array<{ id, name, price, qty }>
let audioEnabled = true;
let audioCtx = null;

// --- ATTACHED PRODUCTS STATE HELPERS ---
function getCustomerAttachedProducts(customerName) {
  if (!customerName) return [];
  const key = customerName.trim();
  if (!customerAttachedProducts[key]) {
    customerAttachedProducts[key] = [];
  }
  return customerAttachedProducts[key];
}

function addAttachedProductToCustomer(customerName, productId, qty = 1) {
  if (!customerName) return;
  const key = customerName.trim();
  const prod = products.find(p => p.id == productId);
  if (!prod) return;

  const list = getCustomerAttachedProducts(key);
  const existing = list.find(item => item.id == productId);
  if (existing) {
    existing.qty += qty;
  } else {
    list.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      qty: qty
    });
  }
}

function removeAttachedProductFromCustomer(customerName, index) {
  if (!customerName) return;
  const key = customerName.trim();
  if (customerAttachedProducts[key]) {
    customerAttachedProducts[key].splice(index, 1);
  }
}

function updateProductSelectDropdowns() {
  const billSelect = document.getElementById("billProductSelect");
  const modalSelect = document.getElementById("attachModalProductSelect");
  if (!billSelect && !modalSelect) return;

  const optionsHtml = '<option value="">-- Chọn món mỹ phẩm mua kèm --</option>' + 
    products.map(p => `<option value="${p.id}">${p.name} - ${formatVND(p.price)}</option>`).join('');

  if (billSelect) {
    const curVal = billSelect.value;
    billSelect.innerHTML = optionsHtml;
    if (curVal) billSelect.value = curVal;
  }
  if (modalSelect) {
    const curVal = modalSelect.value;
    modalSelect.innerHTML = optionsHtml;
    if (curVal) modalSelect.value = curVal;
  }
}

// --- WEB AUDIO API SYNTHESIZER (ZERO EXTERNAL MP3 DEPENDENCIES) ---
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (type === 'click') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'tick') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  } else if (type === 'win') {
    // Fanfare chords
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.45);
    });
  } else if (type === 'coin') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  const btn = document.getElementById("soundToggleBtn");
  const label = document.getElementById("soundLabel");
  if (audioEnabled) {
    btn.classList.add("active");
    btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> <span>Âm thanh: BẬT</span>`;
    showToast("Đã bật âm thanh Gameshow 🔊");
    playSound('coin');
  } else {
    btn.classList.remove("active");
    btn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> <span>Âm thanh: TẮT</span>`;
    showToast("Đã tắt âm thanh");
  }
}

// Toggle Livestream Streamer HUD Mode
function toggleStreamHUD() {
  document.body.classList.toggle("hud-active");
  const isHud = document.body.classList.contains("hud-active");
  if (isHud) {
    showToast("📺 Đã kích hoạt Chế độ Trình chiếu Livestream (OBS HUD)!");
  } else {
    showToast("Đã trở về chế độ bình thường.");
  }
}

// --- INIT APP ---
document.addEventListener("DOMContentLoaded", () => {
  loadStoredSettings();
  initSlots(gameState.totalSlots);
  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  renderShopProducts();
  updateProductSelectDropdowns();
  updateHeroStats();
  updateSplitAmounts();
  fetchProductsFromAPI();
  initAppMenusAndGame();
});

// Format VND
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
}

function switchTab(tabId) {
  playSound('click');
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-pill").forEach(el => el.classList.remove("active"));

  if (tabId === 'game') {
    document.getElementById("tabGame").classList.add("active");
    document.getElementById("tabBtnGame").classList.add("active");
  } else if (tabId === 'reports') {
    document.getElementById("tabReports").classList.add("active");
    document.getElementById("tabBtnReports").classList.add("active");
    loadReports();
  } else if (tabId === 'shop') {
    document.getElementById("tabShop").classList.add("active");
    document.getElementById("tabBtnShop").classList.add("active");
  } else if (tabId === 'settings') {
    document.getElementById("tabSettings").classList.add("active");
    document.getElementById("tabBtnSettings").classList.add("active");
  }
}

// Initialize slots
function initSlots(count) {
  gameState.slots = [];
  for (let i = 1; i <= count; i++) {
    gameState.slots.push({ id: i, owner: null });
  }
}

function changeTotalSlots(count) {
  const newCount = parseInt(count);
  if (confirm(`Bạn có chắc muốn đổi số slot sang ${newCount}? Dữ liệu các slot thừa sẽ được làm mới.`)) {
    playSound('coin');
    gameState.totalSlots = newCount;
    const oldSlots = gameState.slots;
    gameState.slots = [];
    for (let i = 1; i <= newCount; i++) {
      const existing = oldSlots.find(s => s.id === i);
      gameState.slots.push({ id: i, owner: existing ? existing.owner : null });
    }
    document.getElementById("activeSlotPillBadge").innerText = `${newCount} Ô`;
    renderSlotBoard();
    renderPlayerTable();
    renderWinnerCheckboxes();
    updateHeroStats();
    showToast(`Đã chuyển sang kèo ${newCount} Slot!`);
  }
}

function updateGameConfig() {
  gameState.name = document.getElementById("gameName").value.trim() || "Kèo Slot";
  gameState.slotPrice = parseInt(document.getElementById("slotPriceInput").value) || 200000;
  gameState.prizeValue = parseInt(document.getElementById("prizeValueInput").value) || 1350000;

  document.getElementById("heroGameTitle").innerText = gameState.name;
  document.getElementById("liveTickerText").innerText = `🔥 KÈO HOT ${gameState.totalSlots} SLOT: ${gameState.name} • Giá ${formatVND(gameState.slotPrice)}/Slot • Giải thưởng ${formatVND(gameState.prizeValue)}`;

  updateHeroStats();
  updateSplitAmounts();
  renderSlotBoard();
  renderPlayerTable();
  showToast("Đã cập nhật cấu hình kèo!");
}

function updateSplitAmounts() {
  const solo = formatVND(gameState.prizeValue);
  const split2 = formatVND(gameState.prizeValue / 2);
  const split3 = formatVND(gameState.prizeValue / 3);
  const soloEl = document.getElementById("soloAmountText");
  if (soloEl) soloEl.innerText = solo;
  document.getElementById("split2AmountText").innerText = `Mỗi người nhận: ${split2}`;
  document.getElementById("split3AmountText").innerText = `Mỗi người nhận: ${split3}`;
}

function resetCurrentGame() {
  if (confirm("Bạn có chắc muốn tạo ván kèo mới?")) {
    playSound('click');
    initSlots(gameState.totalSlots);
    gameState.slots.forEach(s => s.owner = null);
    gameState.winners = [];
    gameState.status = "open";
    gameState.finishedResults = null;

    document.getElementById("finalSettlementTableBody").innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-5">
          <i class="fa-solid fa-hourglass-start text-xl mb-2 text-muted"></i>
          <p>Vui lòng bấm <b>"Tính Kết Quả & Xuất Báo Cáo"</b> ở trên để xem bảng quyết toán chi tiết.</p>
        </td>
      </tr>
    `;
    document.getElementById("summaryMetaBar").innerHTML = "";

    renderSlotBoard();
    renderPlayerTable();
    renderWinnerCheckboxes();
    updateHeroStats();
    showToast("Đã tạo kèo mới thành công!");
  }
}

// Render 12 Slot 3D Ticket Board
function renderSlotBoard() {
  const grid = document.getElementById("slotGrid");
  grid.innerHTML = "";

  gameState.slots.forEach(slot => {
    const isOccupied = slot.owner !== null;
    const isWinnerSlot = gameState.winners.includes(slot.owner);

    const tile = document.createElement("div");
    tile.className = `slot-tile ${isOccupied ? 'occupied' : ''} ${isWinnerSlot ? 'winner' : ''}`;
    tile.title = isOccupied ? `Slot #${slot.id}: ${slot.owner} (Click để giải phóng)` : `Slot #${slot.id}: Còn trống (Click để gán)`;

    const initial = isOccupied ? slot.owner.trim().charAt(0).toUpperCase() : '+';

    tile.innerHTML = `
      <div class="tile-number-badge">#${slot.id}</div>
      <div class="tile-center-content">
        ${isOccupied ? `
          <div class="tile-avatar">${initial}</div>
          <div class="tile-owner-name">${slot.owner}</div>
        ` : `
          <div class="tile-empty-label"><i class="fa-solid fa-plus text-xs"></i> Chọn</div>
        `}
      </div>
      <div class="tile-price-tag">${formatVND(gameState.slotPrice)}</div>
    `;

    tile.onclick = () => handleSlotClick(slot);
    grid.appendChild(tile);
  });

  renderQuickSlotSuggestions();
}

function renderQuickSlotSuggestions() {
  const container = document.getElementById("quickSlotSuggestions");
  container.innerHTML = "";
  const freeSlots = gameState.slots.filter(s => s.owner === null);

  if (freeSlots.length === 0) {
    container.innerHTML = `<span class="text-green text-xs font-bold"><i class="fa-solid fa-circle-check"></i> ĐÃ HẾT SLOT TRỐNG (FULL BÀN)</span>`;
    return;
  }

  freeSlots.slice(0, 6).forEach(s => {
    const btn = document.createElement("button");
    btn.className = "chip-btn";
    btn.innerText = `Slot #${s.id}`;
    btn.onclick = () => {
      const name = document.getElementById("regPlayerName").value.trim();
      if (!name) {
        showToast("Vui lòng nhập tên khách trước!", "warning");
        document.getElementById("regPlayerName").focus();
        return;
      }
      playSound('coin');
      s.owner = name;
      renderSlotBoard();
      renderPlayerTable();
      renderWinnerCheckboxes();
      updateHeroStats();
      showToast(`Đã gán Slot #${s.id} cho ${name}`);
    };
    container.appendChild(btn);
  });
}

function handleSlotClick(slot) {
  playSound('click');
  const modal = document.getElementById("slotActionModal");
  if (!modal) return;
  document.getElementById("slotActionModalTitle").innerText = `Quản Lý Ô Slot #${slot.id}`;
  document.getElementById("currentActionSlotId").value = slot.id;

  const statusBox = document.getElementById("slotModalCurrentStatus");
  const inputPlayer = document.getElementById("slotModalPlayerName");
  const btnRelease = document.getElementById("btnReleaseSlot");

  if (slot.owner) {
    statusBox.innerHTML = `
      <div>
        <span class="text-xs text-muted">Trạng thái:</span>
        <div class="font-bold text-accent" style="font-size: 0.95rem;">Đã có chủ: <b>${slot.owner}</b></div>
      </div>
      <span class="badge-gold-neon">#${slot.id}</span>
    `;
    inputPlayer.value = slot.owner;
    btnRelease.style.display = "inline-flex";
  } else {
    statusBox.innerHTML = `
      <div>
        <span class="text-xs text-muted">Trạng thái:</span>
        <div class="font-bold text-green" style="font-size: 0.95rem;">Slot Trống (Sẵn sàng)</div>
      </div>
      <span class="tile-number-badge">#${slot.id}</span>
    `;
    inputPlayer.value = document.getElementById("regPlayerName").value.trim() || "";
    btnRelease.style.display = "none";
  }

  // Gợi ý chọn nhanh khách đang có trên bàn
  const quickBox = document.getElementById("slotModalQuickPlayers");
  const currentPlayers = getGroupedPlayerData();
  if (quickBox) {
    if (currentPlayers.length > 0) {
      quickBox.innerHTML = currentPlayers.map(p => `
        <button type="button" class="slot-pill-player" onclick="setSlotModalPlayer('${p.name}')">${p.name}</button>
      `).join('');
    } else {
      quickBox.innerHTML = `<span class="text-xs text-muted italic">Chưa có khách nào đăng ký.</span>`;
    }
  }

  modal.classList.add("show");
  setTimeout(() => inputPlayer.focus(), 100);
}

function setSlotModalPlayer(name) {
  playSound('tick');
  document.getElementById("slotModalPlayerName").value = name;
}

function closeSlotModal() {
  playSound('click');
  const modal = document.getElementById("slotActionModal");
  if (modal) modal.classList.remove("show");
}

function saveSlotModal() {
  const slotId = parseInt(document.getElementById("currentActionSlotId").value);
  const playerName = document.getElementById("slotModalPlayerName").value.trim();
  if (!playerName) {
    alert("Vui lòng nhập tên khách hàng hoặc bấm 'Trả Về Trống'!");
    return;
  }

  const slot = gameState.slots.find(s => s.id === slotId);
  if (slot) {
    slot.owner = playerName;
    try {
      fetch('/api/game/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotNumber: slotId, playerName })
      }).catch(err => console.log('Sync slot backend:', err));
    } catch(e) {}
  }

  playSound('coin');
  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  updateHeroStats();
  closeSlotModal();
  showToast(`Đã gán Slot #${slotId} cho ${playerName}`);
}

function releaseCurrentSlot() {
  const slotId = parseInt(document.getElementById("currentActionSlotId").value);
  const slot = gameState.slots.find(s => s.id === slotId);
  if (slot) {
    slot.owner = null;
    try {
      fetch('/api/game/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotNumber: slotId, playerName: null })
      }).catch(err => console.log('Sync slot backend:', err));
    } catch(e) {}
  }

  playSound('click');
  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  updateHeroStats();
  closeSlotModal();
  showToast(`Đã giải phóng Slot #${slotId} về trống`);
}

function addSingleSlot() {
  playSound('coin');
  const newId = gameState.slots.length + 1;
  gameState.slots.push({ id: newId, owner: null });
  gameState.totalSlots = newId;

  const select = document.getElementById("totalSlotsSelect");
  if (select) {
    let opt = Array.from(select.options).find(o => parseInt(o.value) === newId);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = newId;
      opt.innerText = `${newId} Slot`;
      select.appendChild(opt);
    }
    select.value = newId;
  }

  try {
    fetch('/api/game/slot/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(e => {});
  } catch(e) {}

  document.getElementById("activeSlotPillBadge").innerText = `${newId} Ô`;
  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  updateHeroStats();
  showToast(`Đã thêm thành công Ô Slot #${newId}!`);
}

function removeSingleSlot() {
  if (gameState.slots.length <= 1) {
    alert("Bàn cược cần có ít nhất 1 slot!");
    return;
  }
  const last = gameState.slots[gameState.slots.length - 1];
  if (last.owner && !confirm(`Ô Slot #${last.id} đang có người chơi [${last.owner}]. Bạn có chắc muốn xóa ô này?`)) {
    return;
  }

  playSound('click');
  gameState.slots.pop();
  gameState.totalSlots = gameState.slots.length;

  const select = document.getElementById("totalSlotsSelect");
  if (select) select.value = gameState.totalSlots;

  try {
    fetch('/api/game/slot/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(e => {});
  } catch(e) {}

  document.getElementById("activeSlotPillBadge").innerText = `${gameState.totalSlots} Ô`;
  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  updateHeroStats();
  showToast(`Đã bớt 1 ô slot (Còn lại ${gameState.totalSlots} ô)`);
}

function quickRegisterSlots() {
  const name = document.getElementById("regPlayerName").value.trim();
  const count = parseInt(document.getElementById("regSlotCount").value) || 1;

  if (!name) {
    alert("Vui lòng nhập tên khách hàng!");
    return;
  }

  const freeSlots = gameState.slots.filter(s => s.owner === null);
  if (freeSlots.length === 0) return alert("Bàn đã đủ 100% slot!");
  if (count > freeSlots.length) return alert(`Chỉ còn ${freeSlots.length} slot trống, không đủ lấy ${count} slot!`);

  playSound('coin');
  for (let i = 0; i < count; i++) {
    freeSlots[i].owner = name;
  }

  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  updateHeroStats();
  showToast(`Đã đăng ký ${count} slot cho ${name}!`);
  document.getElementById("regPlayerName").value = "";
}

function getGroupedPlayerData() {
  const map = {};
  gameState.slots.forEach(s => {
    if (s.owner) {
      if (!map[s.owner]) {
        map[s.owner] = { name: s.owner, slots: [], totalCost: 0 };
      }
      map[s.owner].slots.push(s.id);
      map[s.owner].totalCost += gameState.slotPrice;
    }
  });
  return Object.values(map);
}

function renderPlayerTable() {
  const tbody = document.getElementById("playerTableBody");
  const players = getGroupedPlayerData();
  document.getElementById("playerCountBadge").innerText = `${players.length} Người Chơi`;

  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Chưa có người chơi nào đăng ký.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  players.forEach(p => {
    const initial = p.name.trim().charAt(0).toUpperCase();
    const attached = getCustomerAttachedProducts(p.name);
    const attachedTotal = attached.reduce((s, it) => s + (it.price * it.qty), 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="tile-avatar" style="width: 26px; height: 26px; font-size: 0.75rem;">${initial}</div>
          <div>
            <span class="font-bold text-accent">${p.name}</span>
            ${attached.length > 0 ? `
              <div style="margin-top: 3px;">
                <span class="badge-gold-neon" style="font-size: 0.68rem; padding: 1px 6px; cursor: pointer;" onclick="openAttachProductModal('${p.name}')" title="Bấm để xem/sửa mỹ phẩm">
                  <i class="fa-solid fa-bag-shopping"></i> Kèm ${attached.length} món (+${formatVND(attachedTotal)})
                </span>
              </div>
            ` : ''}
          </div>
        </div>
      </td>
      <td>
        <span class="badge-gold-neon" style="padding: 2px 8px; font-size: 0.7rem;">${p.slots.length} Slot</span>
        <span class="text-xs text-muted">(${p.slots.map(s => '#' + s).join(', ')})</span>
      </td>
      <td class="font-bold text-gold">
        <div>${formatVND(p.totalCost)}</div>
        ${attachedTotal > 0 ? `<div class="text-xs text-muted" style="font-weight: normal;">+ Hàng: ${formatVND(attachedTotal)}</div>` : ''}
      </td>
      <td class="text-right">
        <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
          <button class="btn-neon-purple" style="padding: 5px 10px; font-size: 0.75rem;" onclick="openAttachProductModal('${p.name}')" title="Chọn mỹ phẩm mua kèm cho khách này">
            <i class="fa-solid fa-bag-shopping"></i> + Hàng
          </button>
          <button class="btn-ghost-primary" style="padding: 5px 10px; font-size: 0.75rem;" onclick="openBillModal('${p.name}')" title="Xem Bill Combo">
            <i class="fa-solid fa-receipt"></i> Bill
          </button>
          <button class="btn-ghost-danger" onclick="removePlayer('${p.name}')" title="Xóa người chơi">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function removePlayer(name) {
  if (confirm(`Bạn có chắc muốn hủy tất cả slot của [${name}]?`)) {
    playSound('click');
    gameState.slots.forEach(s => {
      if (s.owner === name) s.owner = null;
    });
    gameState.winners = gameState.winners.filter(w => w !== name);
    renderSlotBoard();
    renderPlayerTable();
    renderWinnerCheckboxes();
    updateHeroStats();
    showToast(`Đã hủy toàn bộ slot của ${name}`);
  }
}

function updateHeroStats() {
  const occupiedCount = gameState.slots.filter(s => s.owner !== null).length;
  const isFull = occupiedCount === gameState.totalSlots;
  const percent = Math.round((occupiedCount / gameState.totalSlots) * 100);

  document.getElementById("heroPrizeDisplay").innerText = new Intl.NumberFormat('vi-VN').format(gameState.prizeValue);
  document.getElementById("heroSlotPrice").innerText = formatVND(gameState.slotPrice);
  document.getElementById("heroSlotRatio").innerText = `${occupiedCount} / ${gameState.totalSlots} Slot`;
  document.getElementById("heroPercent").innerText = `${percent}%`;

  const statusEl = document.getElementById("heroGameStatus");
  if (gameState.winners.length > 0) {
    statusEl.innerText = "👑 ĐÃ CÓ WINNER";
    statusEl.style.color = "#fbbf24";
  } else if (isFull) {
    statusEl.innerText = "🔥 ĐỦ 100% SLOT - SẴN SÀNG QUAY";
    statusEl.style.color = "#16a34a";
  } else {
    statusEl.innerText = "🟢 ĐANG MỞ ĐĂNG KÝ";
    statusEl.style.color = "#38bdf8";
  }

  // Cập nhật tag Menu và số Chuyến hiện tại
  const heroMenuEl = document.getElementById("heroActiveMenuTag");
  if (heroMenuEl) {
    const curMenu = menusList.find(m => m.id === currentActiveMenuId);
    heroMenuEl.innerHTML = `<i class="fa-solid fa-fire text-gold"></i> ${curMenu ? curMenu.name.toUpperCase() : 'MENU KÈO'}`;
  }
  const heroRoundEl = document.getElementById("heroActiveRoundTag");
  if (heroRoundEl) {
    heroRoundEl.innerHTML = `<i class="fa-solid fa-rotate text-accent"></i> CHUYẾN #${currentRoundNumber}`;
  }
  const roundBadgeText = document.getElementById("currentRoundNumberText");
  if (roundBadgeText) {
    roundBadgeText.innerText = `#${currentRoundNumber}`;
  }
}

// --- DEDUCT SLOT TOGGLE LOGIC ---
let deductSlotCost = true; // true: cấn trừ tiền slot (Net); false: nhận đủ 100% giải thưởng

function setDeductSlotCost(val) {
  playSound('click');
  deductSlotCost = val;
  const btnTrue = document.getElementById("btnDeductTrue");
  const btnFalse = document.getElementById("btnDeductFalse");
  const explain = document.getElementById("deductExplainText");

  if (val) {
    if (btnTrue) btnTrue.classList.add("active");
    if (btnFalse) btnFalse.classList.remove("active");
    if (explain) explain.innerHTML = `Đang chọn: <b>Tự động cấn trừ</b> (Người thắng nhận = Tiền giải - Tiền mua slot).`;
  } else {
    if (btnTrue) btnTrue.classList.remove("active");
    if (btnFalse) btnFalse.classList.add("active");
    if (explain) explain.innerHTML = `Đang chọn: <b>Nhận đủ 100% giải thưởng</b> (Dành cho khách đã thanh toán tiền slot trước).`;
  }
}

// --- SETTLEMENT SELECTION LOGIC (SOLO VS CHIA 2 VS CHIA 3) ---
function selectSettleMode(mode) {
  playSound('click');
  gameState.settleMode = mode;
  gameState.winners = [];

  document.querySelectorAll(".mode-card").forEach(el => el.classList.remove("active"));
  if (mode === 'solo') document.getElementById("modeCardSolo").classList.add("active");
  else if (mode === 'split2') document.getElementById("modeCardSplit2").classList.add("active");
  else if (mode === 'split3') document.getElementById("modeCardSplit3").classList.add("active");

  const guideText = document.getElementById("winnerSelectionGuideText");
  if (mode === 'solo') {
    guideText.innerHTML = `<i class="fa-solid fa-trophy text-gold"></i> Tick chọn <b>1 người thắng trọn giải</b>:`;
  } else if (mode === 'split2') {
    guideText.innerHTML = `<i class="fa-solid fa-people-arrows text-accent"></i> Tick chọn <b>2 người để chia đôi giải</b>:`;
  } else if (mode === 'split3') {
    guideText.innerHTML = `<i class="fa-solid fa-users-rays text-green"></i> Tick chọn <b>3 người để chia ba giải</b>:`;
  }

  renderWinnerCheckboxes();
}

function renderWinnerCheckboxes() {
  const container = document.getElementById("winnerCheckboxesList");
  const players = getGroupedPlayerData();
  document.getElementById("winnerSelectedCount").innerText = `Đã chọn: ${gameState.winners.length}`;

  if (players.length === 0) {
    container.innerHTML = `<p class="text-muted text-sm italic">Chưa có người chơi nào đăng ký slot.</p>`;
    return;
  }

  container.innerHTML = "";
  players.forEach(p => {
    const isChecked = gameState.winners.includes(p.name);
    const pill = document.createElement("div");
    pill.className = `winner-pill-item ${isChecked ? 'checked' : ''}`;
    pill.innerHTML = `
      <i class="fa-solid ${isChecked ? 'fa-circle-check text-gold' : 'fa-circle text-muted'}"></i>
      <span>${p.name} <span class="text-xs text-muted">(${p.slots.length} slot)</span></span>
    `;

    pill.onclick = () => toggleWinnerPill(p.name);
    container.appendChild(pill);
  });
}

function toggleWinnerPill(playerName) {
  playSound('click');
  const mode = gameState.settleMode;

  if (gameState.winners.includes(playerName)) {
    gameState.winners = gameState.winners.filter(w => w !== playerName);
  } else {
    if (mode === 'solo') {
      gameState.winners = [playerName];
    } else if (mode === 'split2') {
      if (gameState.winners.length >= 2) {
        alert("Chế độ Chia Đôi chỉ được chọn tối đa 2 người!");
        return;
      }
      gameState.winners.push(playerName);
    } else if (mode === 'split3') {
      if (gameState.winners.length >= 3) {
        alert("Chế độ Chia Ba chỉ được chọn tối đa 3 người!");
        return;
      }
      gameState.winners.push(playerName);
    }
  }

  renderWinnerCheckboxes();
  renderSlotBoard();
}

// Roulette Random Spinner with audio drumroll
function spinRandomWinner() {
  const players = getGroupedPlayerData();
  if (players.length === 0) return alert("Chưa có người chơi nào để quay!");

  const pool = [];
  gameState.slots.forEach(s => {
    if (s.owner) pool.push(s.owner);
  });

  // Suspense tick sound interval
  let count = 0;
  const timer = setInterval(() => {
    playSound('tick');
    count++;
    if (count > 15) {
      clearInterval(timer);
      executeSpinResult(pool);
    }
  }, 100);
}

function executeSpinResult(pool) {
  playSound('win');
  triggerConfetti();

  if (gameState.settleMode === 'solo') {
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    gameState.winners = [chosen];
    showToast(`🎉 CHÚC MỪNG [${chosen}] ĐÃ CHIẾN THẮNG TRỌN GIẢI!`);
  } else if (gameState.settleMode === 'split2') {
    const unique = [...new Set(pool)];
    if (unique.length < 2) return alert("Cần ít nhất 2 người chơi khác nhau để chia đôi!");
    const shuffled = unique.sort(() => 0.5 - Math.random());
    gameState.winners = [shuffled[0], shuffled[1]];
    showToast(`🎉 CHÚC MỪNG 2 NGƯỜI CHIA ĐÔI: [${shuffled[0]}] và [${shuffled[1]}]!`);
  } else if (gameState.settleMode === 'split3') {
    const unique = [...new Set(pool)];
    if (unique.length < 3) return alert("Cần ít nhất 3 người chơi khác nhau để chia ba!");
    const shuffled = unique.sort(() => 0.5 - Math.random());
    gameState.winners = [shuffled[0], shuffled[1], shuffled[2]];
    showToast(`🎉 CHÚC MỪNG 3 NGƯỜI CHIA BA: [${shuffled[0]}], [${shuffled[1]}], [${shuffled[2]}]!`);
  }

  renderWinnerCheckboxes();
  renderSlotBoard();
  updateHeroStats();
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }
}

// Finalize Results & Net Settlement
function finalizeGameResults() {
  const players = getGroupedPlayerData();
  if (players.length === 0) return alert("Chưa có người chơi nào!");
  if (gameState.winners.length === 0) return alert("Vui lòng chọn người thắng hoặc người nhận giải trước!");

  playSound('win');
  triggerConfetti();

  const prizePerWinner = Math.round(gameState.prizeValue / gameState.winners.length);

  const settlementList = players.map(p => {
    const isWinner = gameState.winners.includes(p.name);
    const prizeWon = isWinner ? prizePerWinner : 0;
    const attached = getCustomerAttachedProducts(p.name);
    const attachedTotal = attached.reduce((s, it) => s + (it.price * it.qty), 0);

    let netAmount = 0;
    if (isWinner) {
      netAmount = deductSlotCost ? (prizeWon - p.totalCost) : prizeWon;
    } else {
      netAmount = -p.totalCost;
    }
    netAmount -= attachedTotal;

    return {
      playerName: p.name,
      slotCount: p.slots.length,
      slotsList: p.slots,
      buyCost: p.totalCost,
      prizeWon,
      attachedItems: attached,
      attachedTotalCost: attachedTotal,
      netAmount,
      isWinner,
      deducted: isWinner && deductSlotCost
    };
  });

  gameState.finishedResults = settlementList;
  gameState.status = "finished";
  updateHeroStats();

  renderSettlementTableUI(settlementList, prizePerWinner);
  document.getElementById("finalResultCard").scrollIntoView({ behavior: 'smooth' });
  showToast("Đã quyết toán trận đấu thành công!");
}

function renderSettlementTableUI(settlementList, prizePerWinner = null) {
  const tbody = document.getElementById("finalSettlementTableBody");
  if (!tbody || !settlementList) return;
  tbody.innerHTML = "";

  settlementList.forEach(item => {
    const tr = document.createElement("tr");
    let statusBadge = "";
    if (item.netAmount > 0) {
      statusBadge = `<span class="net-pill-win"><i class="fa-solid fa-arrow-down"></i> SHOP TRẢ KHÁCH +${formatVND(item.netAmount)}</span>`;
    } else if (item.netAmount < 0) {
      statusBadge = `<span class="net-pill-pay"><i class="fa-solid fa-arrow-up"></i> KHÁCH TRẢ SHOP ${formatVND(Math.abs(item.netAmount))}</span>`;
    } else {
      statusBadge = `<span class="badge-gold-neon">HÒA TIỀN (0 đ)</span>`;
    }

    const attached = item.attachedItems || getCustomerAttachedProducts(item.playerName) || [];
    const attachedTotal = item.attachedTotalCost !== undefined ? item.attachedTotalCost : attached.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);

    tr.innerHTML = `
      <td>
        <span class="font-bold text-accent">${item.playerName}</span>
        ${attachedTotal > 0 ? `
          <div class="text-xs text-gold" style="margin-top: 2px;">
            <i class="fa-solid fa-bag-shopping"></i> Kèm ${attached.length} món (+${formatVND(attachedTotal)})
          </div>
        ` : ''}
      </td>
      <td><span class="badge-gold-neon" style="font-size: 0.72rem;">${item.slotCount} slot</span> <span class="text-xs text-muted">(#${(item.slotsList || []).join(', #')})</span></td>
      <td class="font-bold text-gold">${formatVND(item.buyCost)}</td>
      <td>
        ${item.isWinner ? `<span class="font-bold text-green"><i class="fa-solid fa-crown text-gold"></i> ${formatVND(item.prizeWon)}</span>` : `<span class="text-muted">0 đ</span>`}
      </td>
      <td class="font-bold ${item.netAmount > 0 ? 'text-green' : 'text-red'}">
        ${item.netAmount > 0 ? '+' : ''}${formatVND(item.netAmount)}
      </td>
      <td>${statusBadge}</td>
      <td class="text-right">
        <div style="display: flex; gap: 4px; justify-content: flex-end;">
          <button class="btn-neon-purple" style="padding: 6px 10px; font-size: 0.75rem;" onclick="openAttachProductModal('${item.playerName}')" title="Thêm/sửa mỹ phẩm mua kèm">
            <i class="fa-solid fa-bag-shopping"></i> + Hàng
          </button>
          <button class="btn-neon-green" style="padding: 6px 12px; font-size: 0.75rem;" onclick="openBillModal('${item.playerName}')">
            <i class="fa-solid fa-receipt"></i> Bill
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const summaryBar = document.getElementById("summaryMetaBar");
  if (summaryBar) {
    const winners = gameState.winners || [];
    let modeText = '';
    if (gameState.settleMode === 'solo') {
      modeText = `Solo Win: <b>${winners[0] || 'Chưa chốt'}</b> trúng trọn ${formatVND(gameState.prizeValue)}`;
    } else {
      const splitAmount = prizePerWinner || (winners.length > 0 ? Math.floor(gameState.prizeValue / winners.length) : 0);
      modeText = `Chia Thưởng (${winners.length} người): Mỗi người nhận <b>${formatVND(splitAmount)}</b> (${winners.join(', ')})`;
    }

    summaryBar.innerHTML = `
      <div><i class="fa-solid fa-circle-check text-green"></i> Đã quyết toán xong: <b>${gameState.name}</b> (Chuyến #${gameState.roundNumber || currentRoundNumber})</div>
      <div>${modeText}</div>
    `;
  }
}

// --- FILE BEAL / VIP BILL MODAL ---
let currentBillData = null;

function openBillModal(playerName) {
  playSound('coin');
  if (!gameState.finishedResults) {
    const p = getGroupedPlayerData().find(x => x.name === playerName);
    if (!p) return;
    currentBillData = {
      customerName: p.name,
      gameName: gameState.name,
      slotsList: p.slots,
      buyCost: p.totalCost,
      prizeWon: 0,
      netAmount: -p.totalCost,
      isWinner: false,
      deducted: deductSlotCost
    };
  } else {
    const found = gameState.finishedResults.find(x => x.playerName === playerName);
    if (found) {
      currentBillData = { ...found, customerName: found.playerName, gameName: gameState.name };
    }
  }

  if (!currentBillData) return;

  const custName = currentBillData.customerName || currentBillData.playerName;

  document.getElementById("billShopName").innerText = shopSettings.name;
  document.getElementById("billShopInfo").innerText = `Hotline/Zalo: ${shopSettings.phone}`;
  document.getElementById("billCode").innerText = `Mã Bill: #SLOT-${Date.now().toString().slice(-6)}`;
  document.getElementById("billDateTime").innerText = new Date().toLocaleString('vi-VN');
  document.getElementById("billCustomerName").innerText = custName;
  document.getElementById("billGameName").innerText = gameState.name;
  document.getElementById("billSlotsList").innerText = `Slot #${(currentBillData.slotsList || []).join(', #')} (${(currentBillData.slotsList || []).length} slot)`;

  updateProductSelectDropdowns();
  recalculateAndRenderBill();

  document.getElementById("billModal").classList.add("show");
}

function recalculateAndRenderBill() {
  if (!currentBillData) return;
  const custName = currentBillData.customerName || currentBillData.playerName;
  const attachedItems = getCustomerAttachedProducts(custName);
  const attachedTotalCost = attachedItems.reduce((s, it) => s + (it.price * it.qty), 0);

  // Render Attached Products Chips in Bill Header Tool
  const chipsContainer = document.getElementById("billAttachedProductsList");
  if (chipsContainer) {
    if (attachedItems.length === 0) {
      chipsContainer.innerHTML = `<span class="text-xs text-muted" style="font-style: italic;">Chưa chọn món mỹ phẩm mua kèm nào.</span>`;
    } else {
      chipsContainer.innerHTML = attachedItems.map((item, idx) => `
        <span class="attached-product-chip">
          <i class="fa-solid fa-bag-shopping text-gold"></i>
          <span>${item.name} <b>x${item.qty}</b> (${formatVND(item.price * item.qty)})</span>
          <button type="button" class="chip-remove" onclick="removeBillAttachedProduct(${idx})" title="Bỏ món này">&times;</button>
        </span>
      `).join('');
    }
  }

  // Calculate Net
  const buyCost = currentBillData.buyCost || 0;
  const prizeWon = currentBillData.prizeWon || 0;
  const isWinner = prizeWon > 0 || currentBillData.isWinner;
  const deducted = currentBillData.deducted !== undefined ? currentBillData.deducted : deductSlotCost;

  let baseSlotNet = 0;
  if (isWinner && prizeWon > 0) {
    baseSlotNet = deducted ? (prizeWon - buyCost) : prizeWon;
  } else {
    baseSlotNet = -buyCost;
  }

  const finalNet = baseSlotNet - attachedTotalCost;
  currentBillData.netAmount = finalNet;
  currentBillData.attachedItems = attachedItems;
  currentBillData.attachedTotalCost = attachedTotalCost;

  // Render Table Rows (Rõ ràng 2 phần: Slot và Mỹ phẩm)
  const tbody = document.getElementById("billItemsBody");
  let rowsHtml = `
    <tr class="ticket-section-row">
      <td colspan="2"><i class="fa-solid fa-ticket text-gold"></i> <b>PHẦN KÈO CƯỢC SLOT</b></td>
    </tr>
    <tr>
      <td>Tiền mua ${(currentBillData.slotsList || []).length} slot (${formatVND(gameState.slotPrice)}/slot)</td>
      <td class="text-right font-bold" style="color: #f43f5e;">-${formatVND(buyCost)}</td>
    </tr>
  `;

  if (prizeWon > 0) {
    rowsHtml += `
      <tr>
        <td><i class="fa-solid fa-crown text-gold"></i> Tiền thưởng trúng kèo</td>
        <td class="text-right font-bold text-green">+${formatVND(prizeWon)}</td>
      </tr>
    `;
  }

  if (attachedItems.length > 0) {
    rowsHtml += `
      <tr class="ticket-section-row">
        <td colspan="2"><i class="fa-solid fa-bag-shopping text-accent"></i> <b>SẢN PHẨM MỸ PHẨM MUA KÈM (${attachedItems.length} món)</b></td>
      </tr>
    `;
    attachedItems.forEach(it => {
      rowsHtml += `
        <tr>
          <td><span class="text-muted">•</span> ${it.name} <span class="badge-gold-neon" style="font-size: 0.68rem; padding: 1px 6px;">x${it.qty}</span></td>
          <td class="text-right font-bold" style="color: #f43f5e;">-${formatVND(it.price * it.qty)}</td>
        </tr>
      `;
    });
  }

  tbody.innerHTML = rowsHtml;

  // Net Box & QR
  const netBox = document.getElementById("billNetBox");
  const netTitle = document.getElementById("billNetTitle");
  const netAmount = document.getElementById("billNetAmount");
  const netExplain = document.getElementById("billNetExplain");
  const qrSection = document.getElementById("billQrSection");

  if (finalNet < 0) {
    netBox.className = "ticket-net-highlight";
    netTitle.innerText = "TỔNG TIỀN KHÁCH CẦN CHUYỂN SHOP";
    netAmount.innerText = formatVND(Math.abs(finalNet));
    netExplain.innerText = "Quý khách quét mã VietQR bên dưới để thanh toán nhanh:";

    qrSection.style.display = "flex";
    const amountVal = Math.abs(finalNet);
    const content = `SLOT ${custName}`.replace(/[^a-zA-Z0-9 ]/g, "").toUpperCase();
    const qrUrl = `https://img.vietqr.io/image/${shopSettings.bankCode}-${shopSettings.accountNumber}-compact2.png?amount=${amountVal}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(shopSettings.accountOwner)}`;

    document.getElementById("billQrImage").src = qrUrl;
    document.getElementById("billBankName").innerText = shopSettings.bankName;
    document.getElementById("billBankAcc").innerText = shopSettings.accountNumber;
    document.getElementById("billBankOwner").innerText = shopSettings.accountOwner;
    document.getElementById("billTransferContent").innerText = content;
  } else if (finalNet > 0) {
    netBox.className = "ticket-net-highlight win-mode";
    netTitle.innerText = "CHÚC MỪNG! SHOP SẼ CHUYỂN KHOẢN CHO BẠN";
    netAmount.innerText = `+${formatVND(finalNet)}`;
    netExplain.innerText = attachedTotalCost > 0 
      ? `(Đã cấn trừ tiền slot & ${formatVND(attachedTotalCost)} tiền mỹ phẩm mua kèm). Shop chuyển khoản phần thưởng còn lại!`
      : (deducted ? "(Đã trừ tiền mua slot). Shop sẽ chủ động chuyển số tiền này cho bạn!" : "Bạn nhận trọn vẹn 100% tiền thưởng!");
    qrSection.style.display = "none";
  } else {
    netBox.className = "ticket-net-highlight";
    netTitle.innerText = "HÒA TIỀN (0 đ)";
    netAmount.innerText = "0 đ";
    netExplain.innerText = "Tiền thưởng và tiền mua hàng cấn trừ vừa khớp 100%.";
    qrSection.style.display = "none";
  }

  document.getElementById("billFooterText").innerText = shopSettings.billFooter;
}

function addProductToCurrentBill() {
  if (!currentBillData) return;
  const custName = currentBillData.customerName || currentBillData.playerName;
  const select = document.getElementById("billProductSelect");
  const qtyInput = document.getElementById("billProductQty");
  const prodId = parseInt(select.value);
  const qty = parseInt(qtyInput.value) || 1;

  if (!prodId) {
    alert("Vui lòng chọn món mỹ phẩm cần thêm vào Bill!");
    return;
  }
  if (qty <= 0) {
    alert("Số lượng phải lớn hơn 0!");
    return;
  }

  playSound('coin');
  addAttachedProductToCustomer(custName, prodId, qty);
  recalculateAndRenderBill();
  renderPlayerTable();
  if (gameState.status === 'finished') finalizeGameResults();
  showToast(`Đã thêm vào Bill của ${custName}!`);
  select.value = "";
  qtyInput.value = "1";
}

function removeBillAttachedProduct(idx) {
  if (!currentBillData) return;
  const custName = currentBillData.customerName || currentBillData.playerName;
  playSound('click');
  removeAttachedProductFromCustomer(custName, idx);
  recalculateAndRenderBill();
  renderPlayerTable();
  if (gameState.status === 'finished') finalizeGameResults();
  showToast("Đã bớt món mỹ phẩm khỏi Bill");
}

// ================= MODAL: CHỌN SẢN PHẨM MUA KÈM CHO KHÁCH (ATTACH MODAL) =================
let currentAttachingCustomer = null;

function openAttachProductModal(playerName) {
  playSound('click');
  currentAttachingCustomer = playerName;
  document.getElementById("attachModalCustomerName").innerText = playerName;
  updateProductSelectDropdowns();
  renderAttachModalItems();
  document.getElementById("customerAttachProductModal").classList.add("show");
}

function closeAttachProductModal() {
  playSound('click');
  document.getElementById("customerAttachProductModal").classList.remove("show");
}

function renderAttachModalItems() {
  const container = document.getElementById("attachModalItemsList");
  const totalEl = document.getElementById("attachModalTotalAmount");
  if (!container || !currentAttachingCustomer) return;

  const items = getCustomerAttachedProducts(currentAttachingCustomer);
  const total = items.reduce((s, it) => s + (it.price * it.qty), 0);
  if (totalEl) totalEl.innerText = formatVND(total);

  if (items.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-3 text-xs italic">Chưa chọn món nào. Hãy chọn món ở trên và bấm "Thêm Món".</div>`;
    return;
  }

  container.innerHTML = items.map((it, idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface-elevated); padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; border: 1px solid var(--border-subtle);">
      <div>
        <b class="text-accent">${it.name}</b>
        <div class="text-xs text-muted">Đơn giá: ${formatVND(it.price)} × SL: <b>${it.qty}</b></div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="text-gold font-bold text-sm">${formatVND(it.price * it.qty)}</span>
        <button class="btn-ghost-danger" onclick="removeAttachModalProduct(${idx})" style="padding: 4px 8px; font-size: 0.75rem;"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>
  `).join('');
}

function addAttachModalProduct() {
  if (!currentAttachingCustomer) return;
  const select = document.getElementById("attachModalProductSelect");
  const qtyInput = document.getElementById("attachModalProductQty");
  const prodId = parseInt(select.value);
  const qty = parseInt(qtyInput.value) || 1;

  if (!prodId) return alert("Vui lòng chọn sản phẩm mỹ phẩm!");
  if (qty <= 0) return alert("Số lượng phải lớn hơn 0!");

  playSound('coin');
  addAttachedProductToCustomer(currentAttachingCustomer, prodId, qty);
  renderAttachModalItems();
  renderPlayerTable();
  if (gameState.status === 'finished') finalizeGameResults();
  showToast(`Đã thêm sản phẩm cho [${currentAttachingCustomer}]!`);
  select.value = "";
  qtyInput.value = "1";
}

function removeAttachModalProduct(idx) {
  if (!currentAttachingCustomer) return;
  playSound('click');
  removeAttachedProductFromCustomer(currentAttachingCustomer, idx);
  renderAttachModalItems();
  renderPlayerTable();
  if (gameState.status === 'finished') finalizeGameResults();
}

function saveAndOpenBillForCustomer() {
  if (!currentAttachingCustomer) return;
  const target = currentAttachingCustomer;
  closeAttachProductModal();
  openBillModal(target);
}

function closeBillModal() {
  playSound('click');
  document.getElementById("billModal").classList.remove("show");
}

function downloadBillImage() {
  playSound('coin');
  const billEl = document.getElementById("printableBill");
  showToast("Đang tạo ảnh hóa đơn PNG...");
  html2canvas(billEl, { scale: 2, useCORS: true }).then(canvas => {
    const link = document.createElement("a");
    const name = (currentBillData.customerName || currentBillData.playerName || "bill").replace(/\s+/g, '_');
    link.download = `Bill_${name}_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Đã tải ảnh hóa đơn VIP thành công!");
  });
}

function copyBillText() {
  playSound('click');
  if (!currentBillData) return;
  const name = currentBillData.customerName || currentBillData.playerName;
  const slots = (currentBillData.slotsList || []).join(', #');
  const net = currentBillData.netAmount;
  const attached = currentBillData.attachedItems || getCustomerAttachedProducts(name);
  const attachedTotal = currentBillData.attachedTotalCost || attached.reduce((s, it) => s + (it.price * it.qty), 0);

  let text = `🌸 [${shopSettings.name}] - PHIẾU BÁO GIÁ & KẾT QUẢ KÈO COMBO\n`;
  text += `👤 Khách hàng: ${name}\n`;
  text += `🎯 Kèo tham gia: ${gameState.name}\n`;
  text += `🎟️ Slot đã chọn: #${slots} (${(currentBillData.slotsList || []).length} slot)\n`;
  text += `💰 Tiền mua slot: -${formatVND(currentBillData.buyCost)}\n`;
  if (currentBillData.prizeWon > 0) {
    text += `👑 Tiền thưởng trúng: +${formatVND(currentBillData.prizeWon)}\n`;
  }
  
  if (attached.length > 0) {
    text += `---------------------------------\n`;
    text += `💄 SẢN PHẨM MỸ PHẨM MUA KÈM (${attached.length} món):\n`;
    attached.forEach(it => {
      text += `  • ${it.name} (x${it.qty}): -${formatVND(it.price * it.qty)}\n`;
    });
    text += `👉 Tổng tiền mỹ phẩm: -${formatVND(attachedTotal)}\n`;
  }

  text += `---------------------------------\n`;
  if (net < 0) {
    text += `👉 TỔNG TIỀN CẦN CHUYỂN SHOP: ${formatVND(Math.abs(net))}\n`;
    text += `🏦 STK: ${shopSettings.accountNumber} - ${shopSettings.bankName}\n`;
    text += `👤 Tên: ${shopSettings.accountOwner}\n`;
    text += `📝 Nội dung CK: SLOT ${name}\n`;
  } else if (net > 0) {
    text += `🎉 SHOP SẼ CHUYỂN KHOẢN CHO BẠN: +${formatVND(net)}${attachedTotal > 0 ? ' (Đã cấn trừ tiền slot & tiền mỹ phẩm mua kèm)' : (currentBillData.deducted ? ' (Đã cấn trừ tiền slot)' : ' (Nhận đủ 100% giải)')}\n`;
  } else {
    text += `👉 Kết quả: Hòa vốn (0 đ - Tiền trúng thưởng đã cấn trừ đủ tiền slot và tiền hàng)\n`;
  }
  text += `\nCảm ơn bạn đã tham gia và ủng hộ Shop! ❤️`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("Đã copy toàn bộ nội dung bill! Dán gửi Zalo/Messenger ngay.");
  });
}

function exportSummaryExcel() {
  if (!gameState.finishedResults || gameState.finishedResults.length === 0) {
    alert("Chưa có kết quả để xuất file!");
    return;
  }
  playSound('click');
  let csv = "Khách Hàng,Số Slot,Chi Tiết Slot,Tiền Mua Slot (VND),Tiền Thưởng (VND),Mỹ Phẩm Mua Kèm,Tiền Mỹ Phẩm (VND),Net Thực Nhận (VND),Ghi Chú\n";
  gameState.finishedResults.forEach(r => {
    const attached = getCustomerAttachedProducts(r.playerName);
    const attachedNames = attached.map(a => `${a.name} x${a.qty}`).join('; ');
    const attachedCost = attached.reduce((s, a) => s + (a.price * a.qty), 0);
    csv += `"${r.playerName}",${r.slotCount},"${r.slotsList.join('-')}",${r.buyCost},${r.prizeWon},"${attachedNames}",${attachedCost},${r.netAmount},"${r.netAmount > 0 ? 'Shop tra khach' : 'Khach tra shop'}"\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Bao_Cao_Keo_Slot_${Date.now()}.csv`;
  link.click();
  showToast("Đã xuất file báo cáo Excel (CSV) thành công!");
}

// --- TAB 2: COSMETICS CATALOG & CRUD OPERATIONS ---
async function fetchProductsFromAPI() {
  try {
    const res = await fetch('/api/products');
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      products = json.data.map(p => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        img: p.image_url || "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300"
      }));
      renderShopProducts();
    }
  } catch (err) {
    console.warn("Dùng danh sách sản phẩm cục bộ:", err);
  }
}

function renderShopProducts() {
  updateProductSelectDropdowns();
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const query = (document.getElementById("searchProductInput")?.value || "").toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Không tìm thấy sản phẩm nào. Bấm <b>"+ Thêm Món"</b> để tạo mới!</div>`;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement("div");
    card.className = "cosmetic-card";
    const imgUrl = p.img || p.image_url || "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300";
    card.innerHTML = `
      <div class="product-card-top-actions">
        <button class="btn-product-action" onclick="openEditProductModal(${p.id})" title="Sửa sản phẩm"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-product-action delete" onclick="deleteProductItem(${p.id})" title="Xóa sản phẩm"><i class="fa-solid fa-trash-can"></i></button>
      </div>
      <img src="${imgUrl}" alt="${p.name}" class="cosmetic-img">
      <div class="cosmetic-title" title="${p.name}">${p.name}</div>
      <div class="cosmetic-price">${formatVND(p.price)}</div>
      <button class="btn-ghost-primary" style="width: 100%; justify-content: center; margin-top: auto;" onclick="addToCart(${p.id})">
        <i class="fa-solid fa-cart-plus"></i> Chọn Mua
      </button>
    `;
    grid.appendChild(card);
  });
}

function filterProducts() {
  renderShopProducts();
}

function openAddProductModal() {
  playSound('click');
  document.getElementById("productModalTitle").innerText = "Thêm Sản Phẩm Mới";
  document.getElementById("editProductId").value = "";
  document.getElementById("editProductName").value = "";
  document.getElementById("editProductPrice").value = "";
  document.getElementById("editProductImg").value = "";
  document.getElementById("productModal").classList.add("show");
  setTimeout(() => document.getElementById("editProductName").focus(), 100);
}

function openEditProductModal(id) {
  playSound('click');
  const p = products.find(x => x.id == id);
  if (!p) return;
  document.getElementById("productModalTitle").innerText = "Chỉnh Sửa Sản Phẩm";
  document.getElementById("editProductId").value = p.id;
  document.getElementById("editProductName").value = p.name;
  document.getElementById("editProductPrice").value = p.price;
  document.getElementById("editProductImg").value = p.img || "";
  document.getElementById("productModal").classList.add("show");
}

function closeProductModal() {
  playSound('click');
  document.getElementById("productModal").classList.remove("show");
}

const sampleImgs = {
  son: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400",
  serum: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400",
  nuochoa: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400",
  kemchongnang: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400",
  phanphu: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400"
};

function setSampleImg(type) {
  playSound('tick');
  if (sampleImgs[type]) {
    document.getElementById("editProductImg").value = sampleImgs[type];
  }
}

async function saveProductForm() {
  const id = document.getElementById("editProductId").value;
  const name = document.getElementById("editProductName").value.trim();
  const price = parseInt(document.getElementById("editProductPrice").value) || 0;
  let img = document.getElementById("editProductImg").value.trim();

  if (!name) {
    alert("Vui lòng nhập tên sản phẩm!");
    return;
  }
  if (price <= 0) {
    alert("Vui lòng nhập giá bán hợp lệ (> 0 đ)!");
    return;
  }
  if (!img) {
    img = sampleImgs.son;
  }

  playSound('coin');
  if (id) {
    // UPDATE
    const p = products.find(x => x.id == id);
    if (p) {
      p.name = name;
      p.price = price;
      p.img = img;
    }
    // Cập nhật trong giỏ hàng nếu đang có
    const inCart = cart.find(c => c.product.id == id);
    if (inCart) {
      inCart.product.name = name;
      inCart.product.price = price;
      renderCart();
    }
    try {
      fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, image_url: img })
      }).catch(e => {});
    } catch(e) {}
    showToast(`Đã cập nhật sản phẩm [${name}]!`);
  } else {
    // CREATE
    const newId = Date.now();
    const newProd = { id: newId, name, price, img };
    products.unshift(newProd);
    try {
      fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, image_url: img })
      }).then(r => r.json()).then(data => {
        if (data.data && data.data.id) newProd.id = data.data.id;
      }).catch(e => {});
    } catch(e) {}
    showToast(`Đã thêm sản phẩm mới [${name}] thành công!`);
  }

  closeProductModal();
  renderShopProducts();
}

async function deleteProductItem(id) {
  const p = products.find(x => x.id == id);
  if (!p) return;
  if (!confirm(`Bạn có chắc muốn xóa sản phẩm [${p.name}]?`)) return;

  playSound('click');
  products = products.filter(x => x.id != id);
  cart = cart.filter(c => c.product.id != id);
  renderCart();

  try {
    fetch(`/api/products/${id}`, {
      method: 'DELETE'
    }).catch(e => {});
  } catch(e) {}

  renderShopProducts();
  showToast(`Đã xóa sản phẩm [${p.name}]!`);
}

function addToCart(productId) {
  playSound('coin');
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const existing = cart.find(item => item.product.id === productId);
  if (existing) existing.qty++;
  else cart.push({ product, qty: 1 });
  renderCart();
  showToast(`Đã thêm [${product.name}] vào giỏ!`);
}

function renderCart() {
  const container = document.getElementById("cartItemsContainer");
  if (cart.length === 0) {
    container.innerHTML = `<p class="text-muted text-center py-4">Chưa có sản phẩm nào trong giỏ hàng.</p>`;
    calculateCartTotal();
    return;
  }
  container.innerHTML = "";
  cart.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "cart-item-row";
    row.innerHTML = `
      <div style="flex: 2;">
        <div class="font-bold text-sm" style="color: #fff;">${item.product.name}</div>
        <div class="text-xs text-muted">${formatVND(item.product.price)} x ${item.qty}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn-ghost-light" style="padding: 2px 8px;" onclick="changeCartQty(${idx}, -1)">-</button>
        <span class="font-bold text-gold">${item.qty}</span>
        <button class="btn-ghost-light" style="padding: 2px 8px;" onclick="changeCartQty(${idx}, 1)">+</button>
        <button class="btn-ghost-danger" style="padding: 2px 8px;" onclick="removeCartItem(${idx})">&times;</button>
      </div>
    `;
    container.appendChild(row);
  });
  calculateCartTotal();
}

function changeCartQty(idx, delta) {
  playSound('click');
  if (cart[idx]) {
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart();
  }
}

function removeCartItem(idx) {
  playSound('click');
  cart.splice(idx, 1);
  renderCart();
}

function clearCart() {
  playSound('click');
  cart = [];
  renderCart();
}

function calculateCartTotal() {
  const subtotal = cart.reduce((acc, item) => acc + (item.product.price * item.qty), 0);
  const discount = parseInt(document.getElementById("cartDiscount").value) || 0;
  const total = Math.max(0, subtotal - discount);
  document.getElementById("cartSubtotal").innerText = formatVND(subtotal);
  document.getElementById("cartTotal").innerText = formatVND(total);
}

function checkoutShopBill() {
  if (cart.length === 0) return alert("Giỏ hàng đang trống!");
  playSound('coin');
  const customerName = document.getElementById("shopCustomerName").value.trim() || "Khách Hàng Lẻ";
  const subtotal = cart.reduce((acc, item) => acc + (item.product.price * item.qty), 0);
  const discount = parseInt(document.getElementById("cartDiscount").value) || 0;
  const total = Math.max(0, subtotal - discount);

  currentBillData = {
    customerName,
    gameName: "Hóa đơn bán lẻ mỹ phẩm",
    slotsList: [],
    buyCost: total,
    prizeWon: 0,
    netAmount: -total,
    isWinner: false
  };

  document.getElementById("billShopName").innerText = shopSettings.name;
  document.getElementById("billShopInfo").innerText = `Hotline: ${shopSettings.phone}`;
  document.getElementById("billTitle").innerText = "HÓA ĐƠN BÁN LẺ MỸ PHẨM";
  document.getElementById("billCode").innerText = `Mã HĐ: #BILL-${Date.now().toString().slice(-6)}`;
  document.getElementById("billDateTime").innerText = new Date().toLocaleString('vi-VN');
  document.getElementById("billCustomerName").innerText = customerName;
  document.getElementById("billGameName").innerText = "Mua hàng trực tiếp tại Shop";
  document.getElementById("billSlotsList").innerText = `${cart.length} món hàng`;

  const tbody = document.getElementById("billItemsBody");
  tbody.innerHTML = "";
  cart.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.product.name} (x${item.qty})</td><td class="text-right font-bold">${formatVND(item.product.price * item.qty)}</td>`;
    tbody.appendChild(tr);
  });
  if (discount > 0) {
    const trD = document.createElement("tr");
    trD.innerHTML = `<td style="color: #16a34a;">Chiết khấu / Giảm giá</td><td class="text-right font-bold text-green">-${formatVND(discount)}</td>`;
    tbody.appendChild(trD);
  }

  const netBox = document.getElementById("billNetBox");
  netBox.className = "ticket-net-highlight";
  document.getElementById("billNetTitle").innerText = "TỔNG TIỀN CẦN THANH TOÁN";
  document.getElementById("billNetAmount").innerText = formatVND(total);
  document.getElementById("billNetExplain").innerText = "Quý khách quét mã VietQR bên dưới để thanh toán:";

  const qrSection = document.getElementById("billQrSection");
  qrSection.style.display = "flex";
  const content = `HD ${customerName}`.replace(/[^a-zA-Z0-9 ]/g, "").toUpperCase();
  const qrUrl = `https://img.vietqr.io/image/${shopSettings.bankCode}-${shopSettings.accountNumber}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(shopSettings.accountOwner)}`;

  document.getElementById("billQrImage").src = qrUrl;
  document.getElementById("billBankName").innerText = shopSettings.bankName;
  document.getElementById("billBankAcc").innerText = shopSettings.accountNumber;
  document.getElementById("billBankOwner").innerText = shopSettings.accountOwner;
  document.getElementById("billTransferContent").innerText = content;
  document.getElementById("billFooterText").innerText = shopSettings.billFooter;

  document.getElementById("billModal").classList.add("show");
}


// Settings
function loadStoredSettings() {
  const saved = localStorage.getItem("lucky_slot_shop_settings");
  if (saved) {
    try {
      shopSettings = JSON.parse(saved);
      document.getElementById("cfgShopName").value = shopSettings.name;
      document.getElementById("cfgShopPhone").value = shopSettings.phone;
      document.getElementById("cfgBankName").value = shopSettings.bankCode;
      document.getElementById("cfgBankAccount").value = shopSettings.accountNumber;
      document.getElementById("cfgBankOwner").value = shopSettings.accountOwner;
      document.getElementById("cfgBillFooter").value = shopSettings.billFooter;
    } catch (e) {}
  }
}

function saveSettings() {
  playSound('coin');
  shopSettings.name = document.getElementById("cfgShopName").value.trim() || "NGỌC COSMETICS";
  shopSettings.phone = document.getElementById("cfgShopPhone").value.trim() || "0988 123 456";
  shopSettings.bankCode = document.getElementById("cfgBankName").value;
  shopSettings.bankName = document.getElementById("cfgBankName").options[document.getElementById("cfgBankName").selectedIndex].text;
  shopSettings.accountNumber = document.getElementById("cfgBankAccount").value.trim();
  shopSettings.accountOwner = document.getElementById("cfgBankOwner").value.trim();
  shopSettings.billFooter = document.getElementById("cfgBillFooter").value.trim();

  localStorage.setItem("lucky_slot_shop_settings", JSON.stringify(shopSettings));
  showToast("Đã lưu cấu hình shop thành công!");
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.className = `modern-toast show ${type === 'warning' ? 'border-gold' : ''}`;
  setTimeout(() => { toast.className = "modern-toast"; }, 3500);
}

// =================================================================
// LOGIC ĐA MENU, ĐIỀU HÀNH CHUYẾN & BÁO CÁO TÍCH LŨY KHÁCH HÀNG
// =================================================================

async function fetchMenus() {
  try {
    const res = await fetch('/api/menus');
    const json = await res.json();
    if (json.success && json.data) {
      menusList = json.data;
      renderMenuPills();
      populateReportMenuSelect();
      const badge = document.getElementById("reportCountBadge");
      if (badge) badge.innerText = `${menusList.length} Menu`;
    }
  } catch (err) {
    console.error("Lỗi tải danh sách menus:", err);
  }
}

function renderMenuPills() {
  const container = document.getElementById("menuPillsContainer");
  if (!container) return;
  container.innerHTML = "";

  menusList.forEach(m => {
    const btn = document.createElement("button");
    const isActive = m.id === currentActiveMenuId;
    btn.className = `menu-pill-btn ${isActive ? 'active' : ''}`;
    btn.innerHTML = `
      <i class="fa-solid ${isActive ? 'fa-fire text-gold' : 'fa-circle-dot text-muted'}"></i>
      <span>${m.name}</span>
      <span class="menu-pill-price-badge">${formatVND(m.slot_price)}</span>
    `;
    btn.onclick = () => selectMenu(m.id);
    container.appendChild(btn);
  });
}

async function selectMenu(menuId) {
  if (menuId === currentActiveMenuId) return;
  playSound('coin');

  // OPTIMISTIC UPDATE: Đổi active pill và cập nhật UI ngay lập tức (0.001s) không để người dùng chờ
  currentActiveMenuId = menuId;
  renderMenuPills();

  const selectedMenu = menusList.find(m => m.id === menuId);
  if (selectedMenu) {
    const heroMenuEl = document.getElementById("heroActiveMenuTag");
    if (heroMenuEl) heroMenuEl.innerHTML = `<i class="fa-solid fa-fire text-gold"></i> ${selectedMenu.name.toUpperCase()}`;
    const slotPriceEl = document.getElementById("heroSlotPrice");
    if (slotPriceEl) slotPriceEl.innerText = formatVND(selectedMenu.slot_price);
    const prizeEl = document.getElementById("heroPrizeDisplay");
    if (prizeEl) prizeEl.innerText = new Intl.NumberFormat('vi-VN').format(selectedMenu.prize_value);
    const nameInput = document.getElementById("gameName");
    if (nameInput) nameInput.value = selectedMenu.name;
    const priceInput = document.getElementById("slotPriceInput");
    if (priceInput) priceInput.value = selectedMenu.slot_price;
    const prizeInput = document.getElementById("prizeValueInput");
    if (prizeInput) prizeInput.value = selectedMenu.prize_value;
  }

  try {
    const res = await fetch('/api/game/switch-menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuId })
    });
    const json = await res.json();
    if (json.success && json.data) {
      applyGameData(json.data);
      showToast(`Đã chuyển sang ${json.data.name}`);
    }
  } catch (err) {
    console.error("Lỗi chuyển menu:", err);
  }
}

function applyGameData(data) {
  currentActiveMenuId = data.menuId || currentActiveMenuId;
  currentRoundNumber = data.roundNumber || 1;
  if (data.roundsList && Array.isArray(data.roundsList)) {
    currentRoundsList = data.roundsList;
  }

  gameState.menuId = currentActiveMenuId;
  gameState.roundNumber = currentRoundNumber;
  gameState.name = data.name;
  gameState.totalSlots = data.totalSlots;
  gameState.slotPrice = Number(data.slotPrice);
  gameState.prizeValue = Number(data.prizeValue);
  gameState.status = data.status || 'open';
  gameState.settleMode = data.settleMode || 'solo';
  gameState.winners = data.winners || [];
  gameState.finishedResults = data.finishedResults || null;

  gameState.slots = (data.slots || []).map(s => ({
    id: s.slot_number,
    owner: s.player_name || null
  }));

  const nameInput = document.getElementById("gameName");
  if (nameInput) nameInput.value = gameState.name;
  const slotPriceInput = document.getElementById("slotPriceInput");
  if (slotPriceInput) slotPriceInput.value = gameState.slotPrice;
  const prizeValueInput = document.getElementById("prizeValueInput");
  if (prizeValueInput) prizeValueInput.value = gameState.prizeValue;
  const totalSlotsSelect = document.getElementById("totalSlotsSelect");
  if (totalSlotsSelect) totalSlotsSelect.value = gameState.totalSlots;

  // Cập nhật settle mode radio
  const modeRadio = document.querySelector(`input[name="settleModeRadio"][value="${gameState.settleMode}"]`);
  if (modeRadio) modeRadio.checked = true;

  // Cập nhật Hero Tags
  const heroMenuEl = document.getElementById("heroActiveMenuTag");
  if (heroMenuEl) {
    const curMenu = menusList.find(m => m.id === currentActiveMenuId);
    heroMenuEl.innerHTML = `<i class="fa-solid fa-fire text-gold"></i> ${(curMenu ? curMenu.name : gameState.name).toUpperCase()}`;
  }
  const heroRoundEl = document.getElementById("heroActiveRoundTag");
  if (heroRoundEl) {
    heroRoundEl.innerHTML = `<i class="fa-solid fa-rotate text-accent"></i> CHUYẾN #${currentRoundNumber}`;
  }
  const heroGameStatus = document.getElementById("heroGameStatus");
  if (heroGameStatus) {
    if (gameState.status === 'finished') {
      heroGameStatus.innerHTML = `🏁 ĐÃ KẾT THÚC & QUYẾT TOÁN`;
      heroGameStatus.style.background = '#dcfce7';
      heroGameStatus.style.borderColor = '#bbf7d0';
      heroGameStatus.style.color = '#16a34a';
    } else {
      heroGameStatus.innerHTML = `🟢 ĐANG MỞ ĐĂNG KÝ`;
      heroGameStatus.style.background = 'rgba(16, 185, 129, 0.15)';
      heroGameStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      heroGameStatus.style.color = '#10b981';
    }
  }

  renderMenuPills();
  renderRoundPills();
  renderSlotBoard();
  renderPlayerTable();
  renderWinnerCheckboxes();
  updateHeroStats();
  updateSplitAmounts();
  updateRoundHistoryBadge();

  // Hiển thị ngay bảng quyết toán nếu chuyến đã xong
  if (gameState.status === 'finished' && gameState.finishedResults && gameState.finishedResults.length > 0) {
    renderSettlementTableUI(gameState.finishedResults);
  } else if (gameState.status === 'open') {
    const tbody = document.getElementById("finalSettlementTableBody");
    if (tbody && !gameState.finishedResults) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-5">
            <i class="fa-solid fa-ticket text-xl mb-2 text-accent"></i>
            <p>Chuyến #${currentRoundNumber} đang mở! Điền tên khách vào ô slot, chọn người trúng và bấm <b>"Tính Kết Quả & Xuất Báo Cáo"</b> khi kết thúc ván.</p>
          </td>
        </tr>
      `;
      const summaryBar = document.getElementById("summaryMetaBar");
      if (summaryBar) summaryBar.innerHTML = "";
    }
  }
}

// --- RENDERING & ĐIỀU HƯỚNG CÁC CHUYẾN (ROUNDS) CỦA MENU ---
function renderRoundPills() {
  const container = document.getElementById("roundsPillsContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!currentRoundsList || currentRoundsList.length === 0) {
    container.innerHTML = `
      <button class="round-pill-btn active">
        <i class="fa-solid fa-play text-accent"></i>
        <span>Chuyến #${currentRoundNumber}</span>
      </button>
    `;
    return;
  }

  currentRoundsList.forEach(r => {
    const btn = document.createElement("button");
    const isActive = r.roundNumber === currentRoundNumber;
    btn.className = `round-pill-btn ${isActive ? 'active' : ''}`;

    let iconHtml = '';
    let badgeHtml = '';

    if (r.status === 'finished') {
      iconHtml = '<i class="fa-solid fa-flag-checkered text-green"></i>';
      const winnerName = (r.winners && r.winners.length > 0) ? r.winners.join(', ') : 'Xong';
      badgeHtml = `<span class="round-pill-badge round-pill-badge-done">Đã xong (${winnerName})</span>`;
    } else {
      iconHtml = '<i class="fa-solid fa-play text-accent"></i>';
      badgeHtml = `<span class="round-pill-badge round-pill-badge-live">LIVE (${r.occupiedSlots || 0}/${r.totalSlots})</span>`;
    }

    btn.innerHTML = `
      ${iconHtml}
      <span>Chuyến #${r.roundNumber}</span>
      ${badgeHtml}
    `;
    btn.onclick = () => switchRound(r.roundNumber);
    container.appendChild(btn);
  });
}

async function switchRound(roundNumber) {
  if (roundNumber === currentRoundNumber) return;
  playSound('coin');

  // Optimistic update
  currentRoundNumber = roundNumber;
  renderRoundPills();

  const heroRoundEl = document.getElementById("heroActiveRoundTag");
  if (heroRoundEl) heroRoundEl.innerHTML = `<i class="fa-solid fa-rotate text-accent"></i> CHUYẾN #${roundNumber}`;

  try {
    const res = await fetch('/api/game/switch-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId: currentActiveMenuId,
        roundNumber: roundNumber
      })
    });
    const json = await res.json();
    if (json.success && json.data) {
      applyGameData(json.data);
      showToast(`Đã chuyển sang Chuyến #${roundNumber} của ${gameState.name}`);
    } else {
      showToast(json.error || "Không thể chuyển chuyến");
    }
  } catch (err) {
    console.error("Lỗi switch round:", err);
  }
}

// --- MODAL: CRUD QUẢN LÝ CHUYẾN (THÊM, SỬA, XÓA TÙY Ý) ---
function openAddRoundModal() {
  playSound('click');
  document.getElementById("roundModalMode").value = "create";
  document.getElementById("roundModalTargetNumber").value = "";

  const title = document.getElementById("roundModalTitle");
  if (title) title.innerHTML = `<i class="fa-solid fa-circle-play text-accent"></i> Thêm Chuyến Mới Cho [${gameState.name}]`;
  const saveBtn = document.getElementById("btnSaveRoundModal");
  if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Tạo Chuyến Mới`;

  const curMenu = menusList.find(m => m.id === currentActiveMenuId);
  const nextNum = (currentRoundsList && currentRoundsList.length > 0)
    ? Math.max(...currentRoundsList.map(r => r.roundNumber)) + 1
    : 1;

  document.getElementById("roundModalName").value = `${curMenu ? curMenu.name : gameState.name} • Chuyến #${nextNum}`;
  document.getElementById("roundModalSlotPrice").value = curMenu ? curMenu.slot_price : (gameState.slotPrice || 150000);
  document.getElementById("roundModalTotalSlots").value = curMenu ? (curMenu.total_slots || 12) : (gameState.totalSlots || 12);
  const price = parseInt(document.getElementById("roundModalSlotPrice").value) || 150000;
  const slots = parseInt(document.getElementById("roundModalTotalSlots").value) || 12;
  document.getElementById("roundModalPrizeValue").value = curMenu ? curMenu.prize_value : (price * slots);
  document.getElementById("roundModalStatus").value = "open";
  document.getElementById("roundModalSettleMode").value = "solo";

  document.getElementById("roundModal").classList.add("show");
  setTimeout(() => document.getElementById("roundModalName").focus(), 100);
}

function openEditActiveRoundModal() {
  playSound('click');
  document.getElementById("roundModalMode").value = "edit";
  document.getElementById("roundModalTargetNumber").value = currentRoundNumber;

  const title = document.getElementById("roundModalTitle");
  if (title) title.innerHTML = `<i class="fa-solid fa-pen-to-square text-accent"></i> Chỉnh Sửa Chuyến #${currentRoundNumber}`;
  const saveBtn = document.getElementById("btnSaveRoundModal");
  if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu Thay Đổi Chuyến`;

  document.getElementById("roundModalName").value = gameState.name;
  document.getElementById("roundModalSlotPrice").value = gameState.slotPrice;
  document.getElementById("roundModalTotalSlots").value = gameState.totalSlots || 12;
  document.getElementById("roundModalPrizeValue").value = gameState.prizeValue;
  document.getElementById("roundModalStatus").value = gameState.status || "open";
  document.getElementById("roundModalSettleMode").value = gameState.settleMode || "solo";

  document.getElementById("roundModal").classList.add("show");
  setTimeout(() => document.getElementById("roundModalName").focus(), 100);
}

function closeRoundModal() {
  playSound('click');
  document.getElementById("roundModal").classList.remove("show");
}

function autoCalculateRoundPrize() {
  const price = parseInt(document.getElementById("roundModalSlotPrice").value) || 0;
  const slots = parseInt(document.getElementById("roundModalTotalSlots").value) || 12;
  document.getElementById("roundModalPrizeValue").value = price * slots;
}

async function saveRoundForm() {
  const mode = document.getElementById("roundModalMode").value;
  const targetNum = document.getElementById("roundModalTargetNumber").value;
  const name = document.getElementById("roundModalName").value.trim();
  const slotPrice = parseInt(document.getElementById("roundModalSlotPrice").value);
  const totalSlots = parseInt(document.getElementById("roundModalTotalSlots").value);
  const prizeValue = parseInt(document.getElementById("roundModalPrizeValue").value);
  const status = document.getElementById("roundModalStatus").value;
  const settleMode = document.getElementById("roundModalSettleMode").value;

  if (!name || isNaN(slotPrice) || isNaN(prizeValue)) {
    alert("Vui lòng điền đầy đủ Tên Chuyến, Giá mỗi slot và Tổng giải thưởng!");
    return;
  }

  playSound('coin');

  try {
    if (mode === 'create') {
      const res = await fetch('/api/game/create-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuId: currentActiveMenuId,
          name,
          slotPrice,
          totalSlots,
          prizeValue
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        applyGameData(json.data);
        closeRoundModal();
        showToast(json.message || `Đã tạo Chuyến #${json.data.roundNumber} thành công!`);
      } else {
        alert(json.error || "Lỗi tạo chuyến");
      }
    } else {
      // EDIT MODE
      const res = await fetch('/api/game/round', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuId: currentActiveMenuId,
          roundNumber: targetNum,
          name,
          slotPrice,
          totalSlots,
          prizeValue,
          status,
          settleMode
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        applyGameData(json.data);
        closeRoundModal();
        showToast(`Đã cập nhật Chuyến #${targetNum} thành công!`);
      } else {
        alert(json.error || "Lỗi cập nhật chuyến");
      }
    }
  } catch (err) {
    console.error("Lỗi lưu round:", err);
    alert("Lỗi lưu chuyến: " + err.message);
  }
}

async function deleteActiveRound() {
  const confirmed = confirm(`Bạn có chắc chắn muốn XÓA Chuyến #${currentRoundNumber} của [${gameState.name}] không?\n\nNếu đây là chuyến duy nhất, hệ thống sẽ tự làm mới về Chuyến #1 sạch sẽ.`);
  if (!confirmed) return;

  playSound('coin');
  try {
    const res = await fetch('/api/game/round', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId: currentActiveMenuId,
        roundNumber: currentRoundNumber
      })
    });
    const json = await res.json();
    if (json.success && json.data) {
      applyGameData(json.data);
      showToast(json.message || `Đã xóa chuyến thành công!`);
    } else {
      alert(json.error || "Lỗi xóa chuyến");
    }
  } catch (err) {
    console.error("Lỗi xóa chuyến:", err);
    alert("Không thể xóa chuyến: " + err.message);
  }
}

async function addNewRoundToMenu() {
  openAddRoundModal();
}

async function initAppMenusAndGame() {
  await fetchMenus();
  try {
    const res = await fetch(`/api/game?menuId=${currentActiveMenuId}`);
    const json = await res.json();
    if (json.success && json.data) {
      applyGameData(json.data);
    }
  } catch (e) {
    console.warn("Lỗi fetch game khởi đầu, dùng in-memory:", e);
    initSlots(gameState.totalSlots);
    renderSlotBoard();
    renderPlayerTable();
    renderWinnerCheckboxes();
    updateHeroStats();
    updateSplitAmounts();
  }
}

// Chốt Chuyến Hiện Tại & Mở Chuyến Mới
async function triggerNextRound() {
  const confirmMsg = `Bạn có chắc muốn CHỐT Chuyến #${currentRoundNumber} của [${gameState.name}] và mở Chuyến #${currentRoundNumber + 1} mới?\n\nKết quả chuyến hiện tại sẽ được lưu vào lịch sử và tích lũy vào Báo Cáo.`;
  if (!confirm(confirmMsg)) return;

  playSound('coin');
  try {
    const res = await fetch('/api/game/next-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId: currentActiveMenuId,
        settlementResults: gameState.finishedResults
      })
    });
    const json = await res.json();
    if (json.success && json.data) {
      applyGameData(json.data.nextRound);
      showToast(json.message);
      updateRoundHistoryBadge();
    }
  } catch (err) {
    console.error("Lỗi sang chuyến mới:", err);
    alert("Không thể chuyển chuyến: " + err.message);
  }
}

async function updateRoundHistoryBadge() {
  try {
    const res = await fetch(`/api/game/history?menuId=${currentActiveMenuId}`);
    const json = await res.json();
    if (json.success && json.data) {
      const badge = document.getElementById("historyCountBadge");
      if (badge) badge.innerText = json.data.length;
    }
  } catch (e) {}
}

// --- QUẢN LÝ CRUD MENU KÈO (THÊM, SỬA, XÓA TÙY Ý) ---
function openAddMenuModal() {
  playSound('click');
  document.getElementById("editMenuId").value = "";
  const title = document.getElementById("menuModalTitle");
  if (title) title.innerHTML = `<i class="fa-solid fa-layer-group text-gold"></i> Thêm Menu Kèo Mới`;
  const saveBtn = document.getElementById("btnSaveMenu");
  if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Tạo Menu Mới`;

  document.getElementById("newMenuName").value = "";
  document.getElementById("newMenuSlotPrice").value = "150000";
  document.getElementById("newMenuTotalSlots").value = "12";
  document.getElementById("newMenuPrizeValue").value = "1500000";
  document.getElementById("newMenuDescription").value = "";
  document.getElementById("menuModal").classList.add("show");
  setTimeout(() => document.getElementById("newMenuName").focus(), 100);
}

function openEditActiveMenuModal() {
  playSound('click');
  const curMenu = menusList.find(m => m.id === currentActiveMenuId);
  if (!curMenu) {
    alert("Không tìm thấy Menu hiện tại để chỉnh sửa!");
    return;
  }

  document.getElementById("editMenuId").value = curMenu.id;
  const title = document.getElementById("menuModalTitle");
  if (title) title.innerHTML = `<i class="fa-solid fa-pen-to-square text-gold"></i> Chỉnh Sửa [${curMenu.name}]`;
  const saveBtn = document.getElementById("btnSaveMenu");
  if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu Thay Đổi`;

  document.getElementById("newMenuName").value = curMenu.name;
  document.getElementById("newMenuSlotPrice").value = curMenu.slot_price;
  document.getElementById("newMenuTotalSlots").value = curMenu.total_slots || 12;
  document.getElementById("newMenuPrizeValue").value = curMenu.prize_value;
  document.getElementById("newMenuDescription").value = curMenu.description || "";
  document.getElementById("menuModal").classList.add("show");
  setTimeout(() => document.getElementById("newMenuName").focus(), 100);
}

function closeMenuModal() {
  playSound('click');
  document.getElementById("menuModal").classList.remove("show");
}

function autoCalculateMenuPrize() {
  const price = parseInt(document.getElementById("newMenuSlotPrice").value) || 0;
  const slots = parseInt(document.getElementById("newMenuTotalSlots").value) || 12;
  document.getElementById("newMenuPrizeValue").value = price * slots;
}

async function saveMenuForm() {
  const editId = document.getElementById("editMenuId").value.trim();
  const name = document.getElementById("newMenuName").value.trim();
  const slotPrice = parseInt(document.getElementById("newMenuSlotPrice").value);
  const totalSlots = parseInt(document.getElementById("newMenuTotalSlots").value);
  const prizeValue = parseInt(document.getElementById("newMenuPrizeValue").value);
  const description = document.getElementById("newMenuDescription").value.trim();

  if (!name || !slotPrice || !prizeValue) {
    alert("Vui lòng điền đầy đủ Tên Menu, Giá mỗi slot và Tổng giải thưởng!");
    return;
  }

  playSound('coin');

  try {
    if (editId) {
      // CẬP NHẬT MENU
      const res = await fetch(`/api/menus/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slotPrice, totalSlots, prizeValue, description })
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Đã cập nhật Menu [${name}] thành công!`);
        closeMenuModal();
        await fetchMenus();
        await selectMenu(editId);
      } else {
        alert(json.error || 'Lỗi cập nhật menu');
      }
    } else {
      // TẠO MENU MỚI
      const res = await fetch('/api/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slotPrice, totalSlots, prizeValue, description })
      });
      const json = await res.json();
      if (json.success && json.data) {
        showToast(`Đã tạo Menu [${json.data.name}] thành công!`);
        closeMenuModal();
        await fetchMenus();
        await selectMenu(json.data.id);
      } else {
        alert(json.error || 'Lỗi tạo menu');
      }
    }
  } catch (err) {
    console.error(err);
    alert('Lỗi lưu menu: ' + err.message);
  }
}

async function deleteActiveMenu() {
  if (menusList.length <= 1) {
    alert("Hệ thống cần tối thiểu 1 Menu kèo, không thể xóa hết!");
    return;
  }

  const curMenu = menusList.find(m => m.id === currentActiveMenuId);
  const menuName = curMenu ? curMenu.name : currentActiveMenuId;

  const confirmed = confirm(`Bạn có chắc chắn muốn XÓA Menu [${menuName}] không?\n\nToàn bộ dữ liệu của menu này sẽ được dọn dẹp.`);
  if (!confirmed) return;

  playSound('coin');
  try {
    const res = await fetch(`/api/menus/${currentActiveMenuId}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Đã xóa [${menuName}] thành công!`);
      await fetchMenus();
      const nextMenu = menusList[0];
      if (nextMenu) {
        await selectMenu(nextMenu.id);
      }
    } else {
      alert(json.error || "Không thể xóa menu");
    }
  } catch (err) {
    console.error("Lỗi xóa menu:", err);
    alert("Lỗi xóa menu: " + err.message);
  }
}

// Modal Lịch Sử Các Chuyến
async function openRoundHistoryModal() {
  playSound('click');
  const modal = document.getElementById("roundHistoryModal");
  const container = document.getElementById("roundHistoryListContainer");
  container.innerHTML = `<div class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sử chuyến...</div>`;
  modal.classList.add("show");

  try {
    const res = await fetch(`/api/game/history?menuId=${currentActiveMenuId}`);
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      container.innerHTML = "";
      json.data.reverse().forEach(r => {
        const item = document.createElement("div");
        item.className = "round-history-item";
        const winnersText = (r.winners || []).join(', ') || 'Chưa chốt';
        const occupied = r.slots ? r.slots.filter(s => s.player_name).length : 0;
        item.innerHTML = `
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge-gold-neon">Chuyến #${r.roundNumber}</span>
              <span class="font-bold text-accent">${r.name}</span>
            </div>
            <div class="text-xs text-muted">
              <span>Đã cược: <b>${occupied}/${r.totalSlots} slot</b></span> • 
              <span>Giải thưởng: <b class="text-gold">${formatVND(r.prizeValue)}</b></span> • 
              <span>Winner: <b class="text-green">${winnersText}</b></span>
            </div>
          </div>
          <div class="text-right">
            <span class="badge-round-tag" style="background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; padding: 4px 8px; font-size: 0.72rem; border-radius: 6px;">ĐÃ KẾT THÚC</span>
            <div class="text-xs text-muted mt-1">${new Date(r.finishedAt || r.createdAt).toLocaleTimeString('vi-VN')}</div>
          </div>
        `;
        container.appendChild(item);
      });
    } else {
      container.innerHTML = `<div class="text-center py-6 text-muted"><i class="fa-solid fa-clock-rotate-left text-2xl mb-2 text-muted"></i><p>Chưa có chuyến nào kết thúc cho Menu này. Hãy bấm "Chốt & Mở Chuyến Mới" sau mỗi ván để lưu lại.</p></div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="text-center py-4 text-red">Lỗi tải lịch sử: ${err.message}</div>`;
  }
}

function closeRoundHistoryModal() {
  playSound('click');
  document.getElementById("roundHistoryModal").classList.remove("show");
}

// --- TRUNG TÂM BÁO CÁO & XUẤT FILE EXCEL / CSV LOGIC ---
function populateReportMenuSelect() {
  const select = document.getElementById("reportMenuSelect");
  if (!select) return;
  select.innerHTML = `<option value="all">📊 Tất Cả Các Menu (Tổng Hợp)</option>`;
  menusList.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.innerText = `🏷️ ${m.name} (${formatVND(m.slot_price)}/slot)`;
    select.appendChild(opt);
  });
}

function onReportMenuChange(val) {
  playSound('click');
  currentReportFilterMenuId = val;
  loadReports();
}

async function loadReports() {
  const isAll = currentReportFilterMenuId === 'all';
  const query = (document.getElementById("reportSearchCustomerInput")?.value || "").trim().toLowerCase();

  const singleMenuCard = document.getElementById("reportSingleMenuCard");
  const crossMatrixCard = document.getElementById("crossMenuMatrixCard");

  if (isAll) {
    if (singleMenuCard) singleMenuCard.style.display = "none";
    if (crossMatrixCard) crossMatrixCard.style.display = "block";
    await loadAllMenusReport(query);
  } else {
    if (singleMenuCard) singleMenuCard.style.display = "block";
    if (crossMatrixCard) crossMatrixCard.style.display = "none";
    await loadSingleMenuReport(currentReportFilterMenuId, query);
  }

  loadRoundsHistoryTable();
}

async function loadSingleMenuReport(menuId, query = '') {
  try {
    const res = await fetch(`/api/reports/menu/${menuId}`);
    const json = await res.json();
    if (json.success && json.data) {
      const data = json.data;
      const menu = data.menu;
      const summary = data.summary;

      document.getElementById("reportTableTitle").innerText = `Bảng Tổng Hợp Khách Hàng - ${menu.name} (${formatVND(menu.slot_price)}/Slot)`;
      document.getElementById("reportCustomerCountBadge").innerText = `${data.customers.length} Khách Hàng`;

      document.getElementById("repStatTotalCustomers").innerText = `${summary.totalCustomers} Người`;
      document.getElementById("repStatTotalSlots").innerText = `${summary.grandTotalSlots} Slot`;
      document.getElementById("repStatTotalBuyCost").innerText = formatVND(summary.grandTotalBuyCost);
      document.getElementById("repStatTotalPrizeWon").innerText = formatVND(summary.grandTotalPrizeWon);

      const tbody = document.getElementById("reportCustomersTableBody");
      tbody.innerHTML = "";

      let filtered = data.customers;
      if (query) {
        filtered = filtered.filter(c => c.customerName.toLowerCase().includes(query));
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-5">Không có dữ liệu khách hàng nào cho Menu này.</td></tr>`;
        return;
      }

      filtered.forEach((c, idx) => {
        const tr = document.createElement("tr");
        const roundsDetail = c.roundsDetails.map(r => `Chuyến ${r.roundNumber} (${r.slotCount} slot: #${r.slots.join('-')})`).join('; ');
        
        let statusBadge = "";
        if (c.netAmount > 0) {
          statusBadge = `<span class="net-pill-win">+${formatVND(c.netAmount)} (Shop trả)</span>`;
        } else if (c.netAmount < 0) {
          statusBadge = `<span class="net-pill-pay">${formatVND(Math.abs(c.netAmount))} (Khách trả)</span>`;
        } else {
          statusBadge = `<span class="badge-gold-neon">Hòa tiền</span>`;
        }

        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td><span class="font-bold text-accent">${c.customerName}</span></td>
          <td><span class="badge-gold-neon">${c.menuName}</span></td>
          <td class="font-bold">${c.roundsCount} Chuyến</td>
          <td><span class="font-bold text-gold" style="font-size: 1rem;">${c.totalSlots}</span> <span class="text-xs text-muted">slot</span></td>
          <td class="text-xs text-muted" style="max-width: 250px;">${roundsDetail}</td>
          <td class="font-bold text-gold">${formatVND(c.totalBuyCost)}</td>
          <td class="font-bold text-green">${formatVND(c.totalPrizeWon)}</td>
          <td class="font-bold ${c.netAmount >= 0 ? 'text-green' : 'text-red'}">${c.netAmount > 0 ? '+' : ''}${formatVND(c.netAmount)}</td>
          <td>${statusBadge}</td>
          <td class="text-right">
            <div style="display: flex; gap: 4px; justify-content: flex-end;">
              <button class="btn-neon-blue" style="padding: 4px 8px; font-size: 0.72rem;" onclick="downloadSingleCustomerDetailCsv('${c.customerName}')" title="Xuất file Excel/CSV chi tiết tất cả các chuyến + mỹ phẩm">
                <i class="fa-solid fa-file-excel"></i> Xuất File
              </button>
              <button class="btn-neon-green" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openBillModal('${c.customerName}')">
                <i class="fa-solid fa-receipt"></i> Bill
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Lỗi load single menu report:", err);
  }
}

async function loadAllMenusReport(query = '') {
  try {
    const res = await fetch('/api/reports/all-menus');
    const json = await res.json();
    if (json.success && json.data) {
      const data = json.data;
      const menus = data.menus;

      document.getElementById("repStatTotalCustomers").innerText = `${data.totalCustomers} Người`;
      document.getElementById("repStatTotalSlots").innerText = `${data.grandTotalSlots} Slot`;
      document.getElementById("repStatTotalBuyCost").innerText = formatVND(data.grandTotalBuyCost);
      document.getElementById("repStatTotalPrizeWon").innerText = formatVND(data.grandTotalPrizeWon);

      const thead = document.getElementById("matrixTableHead");
      let headHtml = `<tr><th>STT</th><th>Khách Hàng</th>`;
      menus.forEach(m => {
        headHtml += `<th>${m.name}<br><span class="text-xs text-muted">(${formatVND(m.slot_price)})</span></th>`;
      });
      headHtml += `<th>Tổng Slot</th><th>Tổng Tiền Cược</th><th>Tổng Tiền Thưởng</th><th>Net Ròng</th><th>Quyết Toán</th><th class="text-right">Thao Tác</th></tr>`;
      thead.innerHTML = headHtml;

      const tbody = document.getElementById("matrixTableBody");
      tbody.innerHTML = "";

      let filtered = data.customers;
      if (query) {
        filtered = filtered.filter(c => c.customerName.toLowerCase().includes(query));
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${menus.length + 8}" class="text-center text-muted py-5">Chưa có người chơi nào tham gia các Menu.</td></tr>`;
        return;
      }

      filtered.forEach((c, idx) => {
        const tr = document.createElement("tr");
        let rowHtml = `<td>${idx + 1}</td><td><span class="font-bold text-accent">${c.customerName}</span></td>`;
        menus.forEach(m => {
          const mInfo = c.menuBreakdown[m.id];
          const count = mInfo ? mInfo.slotCount : 0;
          rowHtml += `<td>${count > 0 ? `<b class="text-gold">${count}</b> slot` : `<span class="text-muted">-</span>`}</td>`;
        });

        let statusBadge = "";
        if (c.netAmount > 0) {
          statusBadge = `<span class="net-pill-win">+${formatVND(c.netAmount)}</span>`;
        } else if (c.netAmount < 0) {
          statusBadge = `<span class="net-pill-pay">${formatVND(Math.abs(c.netAmount))}</span>`;
        } else {
          statusBadge = `<span class="badge-gold-neon">Hòa tiền</span>`;
        }

        rowHtml += `
          <td><b class="text-gold" style="font-size: 1rem;">${c.totalSlots}</b> slot</td>
          <td class="font-bold text-gold">${formatVND(c.totalBuyCost)}</td>
          <td class="font-bold text-green">${formatVND(c.totalPrizeWon)}</td>
          <td class="font-bold ${c.netAmount >= 0 ? 'text-green' : 'text-red'}">${c.netAmount > 0 ? '+' : ''}${formatVND(c.netAmount)}</td>
          <td>${statusBadge}</td>
          <td class="text-right">
            <div style="display: flex; gap: 4px; justify-content: flex-end;">
              <button class="btn-neon-blue" style="padding: 4px 8px; font-size: 0.72rem;" onclick="downloadSingleCustomerDetailCsv('${c.customerName}')" title="Xuất file chi tiết khách này">
                <i class="fa-solid fa-file-excel"></i> Xuất File
              </button>
              <button class="btn-neon-green" style="padding: 4px 8px; font-size: 0.72rem;" onclick="openBillModal('${c.customerName}')" title="Xem Bill">
                <i class="fa-solid fa-receipt"></i> Bill
              </button>
            </div>
          </td>
        `;
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Lỗi load all menus report:", err);
  }
}

async function loadRoundsHistoryTable() {
  try {
    const res = await fetch('/api/game/history');
    const json = await res.json();
    const tbody = document.getElementById("roundsHistoryTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (json.success && json.data && json.data.length > 0) {
      json.data.reverse().forEach(r => {
        const tr = document.createElement("tr");
        const winners = (r.winners || []).join(', ') || 'Chưa chốt';
        const occupied = r.slots ? r.slots.filter(s => s.player_name).length : 0;
        tr.innerHTML = `
          <td><span class="badge-gold-neon">Chuyến #${r.roundNumber}</span></td>
          <td><b class="text-accent">${r.name}</b></td>
          <td>${formatVND(r.slotPrice)}</td>
          <td><span class="text-green font-bold">Đã hoàn thành</span></td>
          <td><b>${occupied}/${r.totalSlots}</b> slot</td>
          <td><span class="text-green font-bold">${winners}</span></td>
          <td class="font-bold text-gold">${formatVND(r.prizeValue)}</td>
          <td class="text-xs text-muted">${new Date(r.finishedAt || r.createdAt).toLocaleString('vi-VN')}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Chưa có chuyến nào được lưu lại.</td></tr>`;
    }
  } catch (err) {}
}

async function filterCustomerReports() {
  const query = (document.getElementById("reportSearchCustomerInput")?.value || "").trim();
  const insightBox = document.getElementById("customerQuickInsight");

  if (!query) {
    if (insightBox) insightBox.style.display = "none";
    loadReports();
    return;
  }

  try {
    const res = await fetch(`/api/reports/search?name=${encodeURIComponent(query)}`);
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      const match = json.data[0];
      if (insightBox) {
        insightBox.style.display = "flex";

        let menusBreakdownText = "";
        if (match.detailedMenus && match.detailedMenus.length > 0) {
          menusBreakdownText = match.detailedMenus.map(m => `
            <div style="background: var(--bg-surface-elevated); padding: 8px 12px; border-radius: 8px; margin-top: 6px; border-left: 3px solid #38bdf8;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <b class="text-accent" style="font-size: 0.95rem;">${m.menuName}</b>
                <span class="badge-gold-neon">${m.totalSlots} slot (${m.rounds.length} chuyến)</span>
              </div>
              <div class="text-xs text-muted" style="margin-bottom: 4px; line-height: 1.5;">
                ${m.rounds.map(r => `<span>• <b>Chuyến #${r.roundNumber}</b>: ${r.slotCount} slot (ô #${r.slots.join('-')}) ${r.isWinner ? '<span class="text-green font-bold">🏆 Thắng ' + formatVND(r.prizeWon) + '</span>' : ''}</span>`).join('<br>')}
              </div>
              <div class="text-xs" style="color: var(--text-secondary);">
                Cược: <b class="text-gold">${formatVND(m.totalBuyCost)}</b> | Thưởng: <b class="text-green">${formatVND(m.totalPrizeWon)}</b> | Net: <b class="${m.netAmount >= 0 ? 'text-green' : 'text-red'}">${m.netAmount > 0 ? '+' : ''}${formatVND(m.netAmount)}</b>
              </div>
            </div>
          `).join('');
        }

        // Kiểm tra mỹ phẩm mua kèm
        const attachedItems = getCustomerAttachedProducts(match.customerName) || [];
        const attachedTotalCost = attachedItems.reduce((s, it) => s + (it.price * it.qty), 0);
        let attachedText = "";
        if (attachedItems.length > 0) {
          attachedText = `
            <div style="background: rgba(200, 135, 74, 0.1); border: 1px solid rgba(200, 135, 74, 0.3); padding: 8px 12px; border-radius: 8px; margin-top: 6px;">
              <div class="text-xs text-accent font-bold"><i class="fa-solid fa-bag-shopping"></i> MỸ PHẨM MUA KÈM (${attachedItems.length} MÓN):</div>
              <div class="text-xs mt-1" style="line-height: 1.5;">
                ${attachedItems.map(it => `<span>• ${it.name} x${it.qty} = <b class="text-gold">${formatVND(it.price * it.qty)}</b></span>`).join('<br>')}
              </div>
              <div class="text-xs text-gold font-bold mt-1">Tổng tiền hàng mỹ phẩm: ${formatVND(attachedTotalCost)}</div>
            </div>
          `;
        }

        // Tính Net cuối cùng sau khi cấn trừ mỹ phẩm
        const finalNetWithProducts = match.netAmount - attachedTotalCost;

        insightBox.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; width: 100%;">
            <div class="font-bold text-gold" style="font-size: 1.15rem;">
              <i class="fa-solid fa-user-check"></i> Tra Cứu Khách Hàng: <b>[${match.customerName}]</b>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn-neon-gold" onclick="downloadSingleCustomerDetailCsv('${match.customerName}')" style="padding: 6px 14px; font-size: 0.85rem; font-weight: 700;">
                <i class="fa-solid fa-file-excel"></i> Xuất File Chi Tiết Excel / CSV
              </button>
              <button class="btn-neon-green" onclick="openBillModal('${match.customerName}')" style="padding: 6px 14px; font-size: 0.85rem; font-weight: 700;">
                <i class="fa-solid fa-receipt"></i> Mở Bill Khách Này
              </button>
            </div>
          </div>
          <div style="margin-top: 8px; display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.92rem; width: 100%;">
            <span>Tổng cược slot: <b class="text-gold">${formatVND(match.totalBuyCost)}</b> (${match.totalSlots} slot)</span>
            <span>Tổng trúng thưởng: <b class="text-green">${formatVND(match.totalPrizeWon)}</b></span>
            <span>Mỹ phẩm kèm: <b class="text-accent">${formatVND(attachedTotalCost)}</b></span>
            <span>SỐ DƯ RÒNG CUỐI CÙNG (NET): <b class="${finalNetWithProducts >= 0 ? 'text-green' : 'text-red'}" style="font-size: 1.05rem;">${finalNetWithProducts > 0 ? '+' : ''}${formatVND(finalNetWithProducts)}</b> (${finalNetWithProducts > 0 ? 'Shop trả khách' : finalNetWithProducts < 0 ? 'Khách trả shop' : 'Hòa tiền'})</span>
          </div>
          <div class="mt-2" style="width: 100%;">
            <span class="text-xs text-muted font-bold uppercase">CHI TIẾT CÁC MENU & CHUYẾN KHÁCH ĐÃ VÀO:</span>
            ${menusBreakdownText}
            ${attachedText}
          </div>
        `;
      }
    } else {
      if (insightBox) insightBox.style.display = "none";
    }
  } catch (e) {
    console.error("Lỗi search customer:", e);
  }

  loadReports();
}

async function downloadSingleCustomerDetailCsv(customerName) {
  if (!customerName) {
    alert("Vui lòng chỉ định tên khách hàng cần xuất file!");
    return;
  }
  playSound('coin');
  showToast(`Đang chuẩn bị file chi tiết cho khách [${customerName}]...`);

  // Lấy các sản phẩm mỹ phẩm mà khách đã mua đính kèm
  const attached = getCustomerAttachedProducts(customerName) || [];

  try {
    const res = await fetch('/api/reports/export/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customerName,
        attachedProducts: attached
      })
    });

    if (!res.ok) {
      throw new Error(`Lỗi tải file: HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = customerName.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    a.download = `Chi_Tiet_Khach_${safeName}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast(`Đã tải xong file chi tiết của khách [${customerName}]!`);
  } catch (err) {
    console.error("Lỗi xuất file khách:", err);
    // Fallback GET
    window.location.href = `/api/reports/export/customer?name=${encodeURIComponent(customerName)}`;
  }
}

function downloadCurrentFilterMenuCsv() {
  playSound('coin');
  if (currentReportFilterMenuId === 'all') {
    window.location.href = '/api/reports/export/all';
  } else {
    window.location.href = `/api/reports/export/menu/${currentReportFilterMenuId}`;
  }
  showToast("Đang tải xuống file Báo Cáo Excel (CSV)...");
}

function downloadAllMenusSummaryCsv() {
  playSound('coin');
  window.location.href = '/api/reports/export/all';
  showToast("Đang tải xuống file Tổng Hợp Tất Cả Menu (CSV)...");
}

function downloadRoundsDetailCsv() {
  playSound('coin');
  window.location.href = '/api/reports/export/rounds';
  showToast("Đang tải xuống file Chi Tiết Các Chuyến (CSV)...");
}

function exportCurrentMenuCsv() {
  playSound('coin');
  window.location.href = `/api/reports/export/menu/${currentActiveMenuId}`;
  showToast(`Đang tải file Báo Cáo của ${gameState.name}...`);
}

