/**
 * MODEL LAYER: Quản lý Dữ liệu Kèo Slot theo Từng Menu & Từng Chuyến (Rounds)
 * Hỗ trợ nhiều Menu, trong mỗi Menu hiển thị 2-3 chuyến hoặc mở thêm chuyến tùy ý.
 */
const fs = require('fs');
const path = require('path');
const { supabase, isConfigured } = require('../config/supabase.config');
const MenuModel = require('./MenuModel');

// Quản lý trạng thái Menu đang chọn trong bộ nhớ
let currentActiveMenuId = 'menu-150k';

// Map lưu danh sách tất cả các chuyến theo từng menu: { [menuId]: Array<roundGameObj> }
const roundsByMenu = {};

// Map lưu số chuyến đang active của từng menu: { [menuId]: roundNumber }
const activeRoundNumberByMenu = {};

// File lưu trữ dữ liệu bền vững (tránh mất sau 2 phút do serverless / server restart)
const STORAGE_DIR = path.join(__dirname, '../data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'rounds_storage.json');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    try {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    } catch (e) {}
  }
}

function saveStorage() {
  try {
    ensureStorageDir();
    const payload = {
      currentActiveMenuId,
      roundsByMenu,
      activeRoundNumberByMenu,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.warn("Lỗi lưu storage:", e.message);
  }
}

function loadStorage() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data) {
        if (data.currentActiveMenuId) currentActiveMenuId = data.currentActiveMenuId;
        if (data.roundsByMenu && typeof data.roundsByMenu === 'object') {
          Object.assign(roundsByMenu, data.roundsByMenu);
        }
        if (data.activeRoundNumberByMenu && typeof data.activeRoundNumberByMenu === 'object') {
          Object.assign(activeRoundNumberByMenu, data.activeRoundNumberByMenu);
        }
      }
    }
  } catch (e) {
    console.warn("Lỗi đọc storage:", e.message);
  }
}

// Khởi chạy đọc dữ liệu đã lưu
loadStorage();

/**
 * Helper tạo đối tượng Chuyến (Round)
 */
function createRoundGame(menu, roundNumber, options = {}) {
  const totalSlots = options.totalSlots || menu.total_slots || 12;
  const slots = [];
  for (let i = 1; i <= totalSlots; i++) {
    const ownerName = options.slotsPlayerMap ? (options.slotsPlayerMap[i] || null) : null;
    slots.push({ slot_number: i, player_name: ownerName ? ownerName.trim() : null });
  }

  return {
    id: `round-${menu.id}-${roundNumber}-${Date.now()}`,
    menuId: menu.id,
    menuCode: menu.code,
    name: options.name || `${menu.name} • Chuyến #${roundNumber}`,
    roundNumber: Number(roundNumber),
    totalSlots: Number(totalSlots),
    slotPrice: Number(options.slotPrice || menu.slot_price),
    prizeValue: Number(options.prizeValue || menu.prize_value),
    status: options.status || 'open', // 'open' | 'full' | 'finished'
    settleMode: options.settleMode || 'solo', // 'solo' | 'split2' | 'split3'
    winners: options.winners || [],
    slots: slots,
    finishedResults: options.finishedResults || null,
    finishedAt: options.finishedAt || (options.status === 'finished' ? new Date() : null),
    createdAt: options.createdAt || new Date(),
    updatedAt: new Date()
  };
}

/**
 * Khởi tạo sẵn các chuyến cho từng Menu
 */
function initDefaultRoundsForMenu(menu) {
  if (roundsByMenu[menu.id] && roundsByMenu[menu.id].length > 0) {
    return roundsByMenu[menu.id];
  }

  const rounds = [];
  const r1 = createRoundGame(menu, 1, {
    status: 'open',
    settleMode: 'solo',
    winners: [],
    slotsPlayerMap: {}
  });
  rounds.push(r1);

  activeRoundNumberByMenu[menu.id] = 1;
  roundsByMenu[menu.id] = rounds;
  saveStorage();
  return rounds;
}

const GameModel = {
  getCurrentActiveMenuId() {
    return currentActiveMenuId;
  },

  async switchActiveMenu(menuId) {
    const menu = await MenuModel.getMenuById(menuId);
    if (menu) {
      currentActiveMenuId = menu.id;
    }
    return this.getCurrentGame(currentActiveMenuId);
  },

  async getCurrentGame(menuId = null, roundNumber = null) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);

    const rounds = initDefaultRoundsForMenu(menu);

    let targetRoundNum = roundNumber !== null ? Number(roundNumber) : activeRoundNumberByMenu[menu.id];
    if (!targetRoundNum) {
      targetRoundNum = rounds[rounds.length - 1].roundNumber;
      activeRoundNumberByMenu[menu.id] = targetRoundNum;
    }

    let game = rounds.find(r => r.roundNumber === targetRoundNum);
    if (!game) {
      game = rounds[rounds.length - 1];
      activeRoundNumberByMenu[menu.id] = game.roundNumber;
    }

    game.slotPrice = menu.slot_price;
    game.prizeValue = menu.prize_value;
    game.menuCode = menu.code;

    return game;
  },

  async switchActiveRound(menuId, roundNumber) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    initDefaultRoundsForMenu(menu);

    const num = Number(roundNumber);
    activeRoundNumberByMenu[targetMenuId] = num;
    return this.getCurrentGame(targetMenuId, num);
  },

  async createNewRound(menuId, options = {}) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    const rounds = initDefaultRoundsForMenu(menu);

    const maxRoundNumber = rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0);
    const nextRoundNumber = maxRoundNumber + 1;

    const totalSlots = options.totalSlots ? Number(options.totalSlots) : (menu.total_slots || 12);
    const slotPrice = options.slotPrice !== undefined ? Number(options.slotPrice) : menu.slot_price;
    const prizeValue = options.prizeValue !== undefined ? Number(options.prizeValue) : (menu.prize_value || (slotPrice * totalSlots));
    const name = options.name || `${menu.name} • Chuyến #${nextRoundNumber}`;

    const newRound = createRoundGame(menu, nextRoundNumber, {
      name,
      totalSlots,
      slotPrice,
      prizeValue,
      status: options.status || 'open',
      settleMode: options.settleMode || 'solo',
      winners: []
    });

    rounds.push(newRound);
    activeRoundNumberByMenu[targetMenuId] = nextRoundNumber;
    saveStorage();
    return newRound;
  },

  async updateRound(menuId, roundNumber, options = {}) {
    const targetMenuId = menuId || currentActiveMenuId;
    const game = await this.getCurrentGame(targetMenuId, roundNumber);
    if (!game) throw new Error('Không tìm thấy chuyến cần chỉnh sửa!');

    if (options.name) game.name = options.name;
    if (options.slotPrice !== undefined) game.slotPrice = Number(options.slotPrice);
    if (options.prizeValue !== undefined) game.prizeValue = Number(options.prizeValue);
    if (options.status) game.status = options.status;
    if (options.settleMode) game.settleMode = options.settleMode;

    if (options.totalSlots) {
      const newTotal = Number(options.totalSlots);
      game.totalSlots = newTotal;
      while (game.slots.length < newTotal) {
        game.slots.push({ slot_number: game.slots.length + 1, player_name: null });
      }
      while (game.slots.length > newTotal) {
        game.slots.pop();
      }
    }

    game.updatedAt = new Date();
    saveStorage();
    return game;
  },

  async deleteRound(menuId, roundNumber) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    let rounds = roundsByMenu[targetMenuId] || [];

    const num = Number(roundNumber);
    const idx = rounds.findIndex(r => r.roundNumber === num);
    if (idx < 0) {
      throw new Error('Không tìm thấy chuyến cần xóa!');
    }

    if (rounds.length <= 1) {
      // Nếu là chuyến duy nhất của Menu, xóa và tạo lại Chuyến #1 mới sạch sẽ
      const cleanRound = createRoundGame(menu, 1, {
        status: 'open',
        settleMode: 'solo',
        winners: []
      });
      roundsByMenu[targetMenuId] = [cleanRound];
      activeRoundNumberByMenu[targetMenuId] = 1;
      saveStorage();
      return cleanRound;
    }

    rounds.splice(idx, 1);
    const lastRound = rounds[rounds.length - 1];
    activeRoundNumberByMenu[targetMenuId] = lastRound.roundNumber;
    saveStorage();
    return lastRound;
  },

  getRoundsList(menuId = null) {
    const targetMenuId = menuId || currentActiveMenuId;
    const rounds = roundsByMenu[targetMenuId] || [];
    return rounds.map(r => ({
      id: r.id,
      roundNumber: r.roundNumber,
      name: r.name,
      status: r.status,
      totalSlots: r.totalSlots,
      occupiedSlots: (r.slots || []).filter(s => s.player_name && s.player_name.trim()).length,
      winners: r.winners || [],
      prizeValue: r.prizeValue,
      slotPrice: r.slotPrice,
      finishedAt: r.finishedAt,
      createdAt: r.createdAt
    }));
  },

  async getGameById(gameId) {
    for (const rounds of Object.values(roundsByMenu)) {
      const found = rounds.find(r => r.id === gameId);
      if (found) return found;
    }
    return this.getCurrentGame();
  },

  async updateGameConfig({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber }) {
    const game = await this.getCurrentGame(menuId, roundNumber);
    if (name) game.name = name;
    if (totalSlots) {
      game.totalSlots = Number(totalSlots);
      while (game.slots.length < game.totalSlots) {
        game.slots.push({ slot_number: game.slots.length + 1, player_name: null });
      }
      while (game.slots.length > game.totalSlots) {
        game.slots.pop();
      }
    }
    if (slotPrice) game.slotPrice = Number(slotPrice);
    if (prizeValue) game.prizeValue = Number(prizeValue);
    game.updatedAt = new Date();
    saveStorage();
    return game;
  },

  async resetGame({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber }) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    const currentGame = await this.getCurrentGame(targetMenuId, roundNumber);

    const count = totalSlots || currentGame.totalSlots || menu.total_slots || 12;

    const newSlots = [];
    for (let i = 1; i <= count; i++) {
      newSlots.push({ slot_number: i, player_name: null });
    }

    currentGame.slots = newSlots;
    currentGame.status = 'open';
    currentGame.winners = [];
    currentGame.finishedResults = null;
    currentGame.finishedAt = null;
    if (name) currentGame.name = name;
    if (slotPrice) currentGame.slotPrice = Number(slotPrice);
    if (prizeValue) currentGame.prizeValue = Number(prizeValue);
    currentGame.updatedAt = new Date();
    saveStorage();
    return currentGame;
  },

  async finishAndStartNextRound(menuId = null, settlementResults = null, winners = null, settleMode = null, slots = null) {
    const targetMenuId = menuId || currentActiveMenuId;
    const currentGame = await this.getCurrentGame(targetMenuId);

    currentGame.status = 'finished';
    currentGame.finishedAt = new Date();

    if (winners && Array.isArray(winners) && winners.length > 0) {
      currentGame.winners = winners;
    } else if (settlementResults && settlementResults.winners) {
      currentGame.winners = settlementResults.winners;
    }

    if (settleMode) {
      currentGame.settleMode = settleMode;
    } else if (settlementResults && settlementResults.settleMode) {
      currentGame.settleMode = settlementResults.settleMode;
    }

    if (settlementResults) {
      if (Array.isArray(settlementResults)) {
        currentGame.finishedResults = settlementResults;
      } else if (settlementResults.finishedResults) {
        currentGame.finishedResults = settlementResults.finishedResults;
      }
    }

    if (slots && Array.isArray(slots)) {
      currentGame.slots = slots.map(s => ({
        slot_number: s.id || s.slot_number,
        player_name: (s.owner || s.player_name || '').trim() || null
      }));
    }

    saveStorage();
    const nextGame = await this.createNewRound(targetMenuId);
    saveStorage();

    return {
      completedRound: currentGame,
      nextRound: nextGame
    };
  },

  async finalizeGame(menuId, data = {}) {
    const targetMenuId = menuId || currentActiveMenuId;
    const currentGame = await this.getCurrentGame(targetMenuId);

    currentGame.status = 'finished';
    currentGame.finishedAt = new Date();
    if (data.winners && Array.isArray(data.winners)) currentGame.winners = data.winners;
    if (data.settleMode) currentGame.settleMode = data.settleMode;
    if (data.finishedResults) currentGame.finishedResults = data.finishedResults;
    if (data.customerAttachedProducts) currentGame.attachedProducts = data.customerAttachedProducts;
    if (data.deductSlotCost !== undefined) currentGame.deductSlotCost = data.deductSlotCost;
    if (data.slots && Array.isArray(data.slots)) {
      currentGame.slots = data.slots.map(s => ({
        slot_number: s.id || s.slot_number,
        player_name: (s.owner || s.player_name || '').trim() || null
      }));
    }
    currentGame.updatedAt = new Date();
    saveStorage();
    return currentGame;
  },

  getRoundHistory(menuId = null) {
    return this.getAllRounds(menuId).filter(r => r.status === 'finished');
  },

  getAllRounds(menuId = null) {
    if (menuId) {
      return roundsByMenu[menuId] || [];
    }
    let all = [];
    Object.values(roundsByMenu).forEach(rounds => {
      all = all.concat(rounds);
    });
    return all;
  },

  saveCurrentStorage() {
    saveStorage();
  }
};

module.exports = GameModel;
