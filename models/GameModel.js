/**
 * MODEL LAYER: Quản lý Dữ liệu Kèo Slot theo Từng Menu & Từng Chuyến (Rounds)
 * Hỗ trợ lưu trữ bền vững vĩnh viễn trên Supabase Database
 * Cơ chế Hybrid In-Memory Caching siêu tốc (< 1ms) + Fallback Disk an toàn 100%.
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

// File lưu trữ dữ liệu bền vững dự phòng cục bộ
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
          for (const [mId, rList] of Object.entries(data.roundsByMenu)) {
            if (Array.isArray(rList) && rList.length > 0) {
              const validList = rList.filter(r => r && r.id && !String(r.id).startsWith('round-'));
              if (validList.length > 0) {
                roundsByMenu[mId] = validList;
              }
            }
          }
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

// Đọc storage dự phòng ban đầu
loadStorage();

/**
 * Helper định dạng game object từ Supabase row
 */
function mapGameRowToRound(g, menu) {
  const totalSlots = Number(g.total_slots || menu.total_slots || 12);
  const dbSlots = Array.isArray(g.slots) ? g.slots : [];
  const slotsMap = {};
  dbSlots.forEach(s => {
    slotsMap[s.slot_number] = s;
  });

  const slots = [];
  for (let i = 1; i <= totalSlots; i++) {
    const s = slotsMap[i];
    slots.push({
      id: s ? s.id : null,
      slot_number: i,
      player_name: (s && s.player_name) ? s.player_name.trim() : null
    });
  }

  return {
    id: g.id,
    menuId: menu.id,
    menuCode: menu.code,
    name: g.name,
    roundNumber: Number(g.round_number),
    totalSlots: totalSlots,
    slotPrice: Number(g.slot_price || menu.slot_price),
    prizeValue: Number(g.prize_value || menu.prize_value),
    status: g.status || 'open',
    settleMode: g.settle_mode || 'solo',
    winners: Array.isArray(g.winners) ? g.winners : [],
    slots: slots,
    finishedResults: g.finished_results || null,
    finishedAt: g.finished_at || null,
    createdAt: g.created_at || new Date(),
    updatedAt: g.updated_at || new Date()
  };
}

// Cờ đánh dấu đã load dữ liệu menu từ Supabase vào RAM
const loadedFromDb = {};

/**
 * Tải danh sách Chuyến cho Menu từ Supabase (có cache trong memory)
 */
async function loadOrInitRoundsForMenu(menu) {
  if (!menu) return [];

  // Nếu đã được load từ Supabase và có trong bộ nhớ -> Trả về siêu tốc < 1ms
  if (loadedFromDb[menu.id] && roundsByMenu[menu.id] && roundsByMenu[menu.id].length > 0) {
    return roundsByMenu[menu.id];
  }

  // 1. Tải từ Supabase Database (Source of Truth)
  if (isConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*, slots(*)')
        .eq('menu_id', menu.id)
        .order('round_number', { ascending: true });

      if (!error && data && data.length > 0) {
        roundsByMenu[menu.id] = data.map(g => mapGameRowToRound(g, menu));
        loadedFromDb[menu.id] = true;

        // Xác định chuyến active: ưu tiên chuyến đang mở (open), nếu không có thì chuyến mới nhất
        if (!activeRoundNumberByMenu[menu.id]) {
          const openRound = roundsByMenu[menu.id].slice().reverse().find(r => r.status !== 'finished');
          activeRoundNumberByMenu[menu.id] = openRound
            ? openRound.roundNumber
            : roundsByMenu[menu.id][roundsByMenu[menu.id].length - 1].roundNumber;
        }

        saveStorage();
        return roundsByMenu[menu.id];
      }
    } catch (e) {
      console.warn(`Lỗi tải games từ Supabase cho menu [${menu.name}]:`, e.message);
    }
  }

  // 2. Nếu DB chưa có chuyến nào cho menu này, tự động khởi tạo Chuyến #1 trên Supabase
  const totalSlots = Number(menu.total_slots || 12);
  const slotPrice = Number(menu.slot_price || 150000);
  const prizeValue = Number(menu.prize_value || (slotPrice * totalSlots));
  const name = `${menu.name} • Chuyến #1`;

  let gameId = `round-${menu.id}-1-${Date.now()}`;
  let slots = [];
  for (let i = 1; i <= totalSlots; i++) {
    slots.push({ id: null, slot_number: i, player_name: null });
  }

  if (isConfigured() && supabase) {
    try {
      const { data: gData, error: gErr } = await supabase
        .from('games')
        .insert({
          menu_id: menu.id,
          round_number: 1,
          name: name,
          total_slots: totalSlots,
          slot_price: slotPrice,
          prize_value: prizeValue,
          status: 'open',
          settle_mode: 'solo',
          winners: []
        })
        .select()
        .single();

      if (!gErr && gData) {
        gameId = gData.id;
        const slotInserts = [];
        for (let i = 1; i <= totalSlots; i++) {
          slotInserts.push({ game_id: gData.id, slot_number: i, player_name: null });
        }
        const { data: sData } = await supabase.from('slots').insert(slotInserts).select();
        if (sData) {
          slots = sData.sort((a, b) => a.slot_number - b.slot_number).map(s => ({
            id: s.id,
            slot_number: s.slot_number,
            player_name: null
          }));
        }
      }
    } catch (e) {
      console.warn("Lỗi tạo Chuyến #1 trên Supabase:", e.message);
    }
  }

  const r1 = {
    id: gameId,
    menuId: menu.id,
    menuCode: menu.code,
    name: name,
    roundNumber: 1,
    totalSlots: totalSlots,
    slotPrice: slotPrice,
    prizeValue: prizeValue,
    status: 'open',
    settleMode: 'solo',
    winners: [],
    slots: slots,
    finishedResults: null,
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  roundsByMenu[menu.id] = [r1];
  activeRoundNumberByMenu[menu.id] = 1;
  loadedFromDb[menu.id] = true;
  saveStorage();
  return roundsByMenu[menu.id];
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

    const rounds = await loadOrInitRoundsForMenu(menu);

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

    game.slotPrice = Number(menu.slot_price);
    game.prizeValue = Number(menu.prize_value);
    game.menuCode = menu.code;

    return game;
  },

  async switchActiveRound(menuId, roundNumber) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    await loadOrInitRoundsForMenu(menu);

    const num = Number(roundNumber);
    activeRoundNumberByMenu[targetMenuId] = num;
    return this.getCurrentGame(targetMenuId, num);
  },

  async createNewRound(menuId, options = {}) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    const rounds = await loadOrInitRoundsForMenu(menu);

    const maxRoundNumber = rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0);
    const nextRoundNumber = maxRoundNumber + 1;

    const totalSlots = options.totalSlots ? Number(options.totalSlots) : (menu.total_slots || 12);
    const slotPrice = options.slotPrice !== undefined ? Number(options.slotPrice) : Number(menu.slot_price);
    const prizeValue = options.prizeValue !== undefined ? Number(options.prizeValue) : (menu.prize_value || (slotPrice * totalSlots));
    const name = options.name || `${menu.name} • Chuyến #${nextRoundNumber}`;

    let gameId = `round-${menu.id}-${nextRoundNumber}-${Date.now()}`;
    let slots = [];
    for (let i = 1; i <= totalSlots; i++) {
      slots.push({ id: null, slot_number: i, player_name: null });
    }

    if (isConfigured() && supabase) {
      try {
        const { data: gData, error: gErr } = await supabase
          .from('games')
          .insert({
            menu_id: menu.id,
            round_number: nextRoundNumber,
            name: name,
            total_slots: totalSlots,
            slot_price: slotPrice,
            prize_value: prizeValue,
            status: options.status || 'open',
            settle_mode: options.settleMode || 'solo',
            winners: options.winners || []
          })
          .select()
          .single();

        if (!gErr && gData) {
          gameId = gData.id;
          const slotInserts = [];
          for (let i = 1; i <= totalSlots; i++) {
            slotInserts.push({ game_id: gData.id, slot_number: i, player_name: null });
          }
          const { data: sData } = await supabase.from('slots').insert(slotInserts).select();
          if (sData) {
            slots = sData.sort((a, b) => a.slot_number - b.slot_number).map(s => ({
              id: s.id,
              slot_number: s.slot_number,
              player_name: null
            }));
          }
        }
      } catch (e) {
        console.warn("Lỗi lưu Chuyến mới vào Supabase:", e.message);
      }
    }

    const newRound = {
      id: gameId,
      menuId: menu.id,
      menuCode: menu.code,
      name,
      roundNumber: Number(nextRoundNumber),
      totalSlots: Number(totalSlots),
      slotPrice: Number(slotPrice),
      prizeValue: Number(prizeValue),
      status: options.status || 'open',
      settleMode: options.settleMode || 'solo',
      winners: options.winners || [],
      slots: slots,
      finishedResults: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

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
      const oldTotal = game.totalSlots;
      game.totalSlots = newTotal;
      if (newTotal > oldTotal) {
        for (let i = oldTotal + 1; i <= newTotal; i++) {
          game.slots.push({ id: null, slot_number: i, player_name: null });
          if (isConfigured() && supabase && game.id) {
            try {
              supabase.from('slots').insert({ game_id: game.id, slot_number: i, player_name: null }).then();
            } catch (e) {}
          }
        }
      } else if (newTotal < oldTotal) {
        game.slots = game.slots.filter(s => s.slot_number <= newTotal);
        if (isConfigured() && supabase && game.id) {
          try {
            supabase.from('slots').delete().eq('game_id', game.id).gt('slot_number', newTotal).then();
          } catch (e) {}
        }
      }
    }

    game.updatedAt = new Date();

    if (isConfigured() && supabase && game.id) {
      try {
        await supabase.from('games').update({
          name: game.name,
          slot_price: game.slotPrice,
          prize_value: game.prizeValue,
          status: game.status,
          settle_mode: game.settleMode,
          total_slots: game.totalSlots,
          updated_at: game.updatedAt
        }).eq('id', game.id);
      } catch (e) {
        console.warn('Lỗi updateRound Supabase:', e.message);
      }
    }

    saveStorage();
    return game;
  },

  async deleteRound(menuId, roundNumber) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    let rounds = await loadOrInitRoundsForMenu(menu);

    const num = Number(roundNumber);
    const idx = rounds.findIndex(r => r.roundNumber === num);
    if (idx < 0) {
      throw new Error('Không tìm thấy chuyến cần xóa!');
    }

    const roundToDelete = rounds[idx];
    if (isConfigured() && supabase && roundToDelete.id) {
      try {
        await supabase.from('games').delete().eq('id', roundToDelete.id);
      } catch (e) {
        console.warn('Lỗi xóa chuyến trên Supabase:', e.message);
      }
    }

    if (rounds.length <= 1) {
      // Nếu là chuyến duy nhất, xóa và tạo lại Chuyến #1 mới sạch sẽ
      roundsByMenu[targetMenuId] = [];
      const cleanRound = await this.createNewRound(targetMenuId, { name: `${menu.name} • Chuyến #1` });
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
      const found = (rounds || []).find(r => r.id === gameId);
      if (found) return found;
    }

    if (isConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('games').select('*, slots(*)').eq('id', gameId).single();
        if (!error && data) {
          const menu = await MenuModel.getMenuById(data.menu_id);
          if (menu) {
            await loadOrInitRoundsForMenu(menu);
            const found = (roundsByMenu[menu.id] || []).find(r => r.id === gameId);
            if (found) return found;
          }
        }
      } catch (e) {}
    }

    return this.getCurrentGame();
  },

  async updateGameConfig({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber }) {
    return this.updateRound(menuId, roundNumber, { name, totalSlots, slotPrice, prizeValue });
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

    if (isConfigured() && supabase && currentGame.id) {
      try {
        await supabase.from('games').update({
          status: 'open',
          winners: [],
          finished_results: null,
          finished_at: null,
          name: currentGame.name,
          slot_price: currentGame.slotPrice,
          prize_value: currentGame.prizeValue,
          updated_at: currentGame.updatedAt
        }).eq('id', currentGame.id);

        await supabase.from('slots').update({
          player_name: null,
          updated_at: new Date()
        }).eq('game_id', currentGame.id);
      } catch (e) {
        console.warn('Lỗi resetGame Supabase:', e.message);
      }
    }

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
        id: s.db_id || s.id,
        slot_number: s.slot_number || s.id,
        player_name: (s.owner || s.player_name || '').trim() || null
      }));
    }
    currentGame.updatedAt = new Date();

    // 1. Lưu ván vừa chốt vào Supabase
    if (isConfigured() && supabase && currentGame.id) {
      try {
        await supabase.from('games').update({
          status: 'finished',
          settle_mode: currentGame.settleMode,
          winners: currentGame.winners,
          finished_results: currentGame.finishedResults,
          finished_at: currentGame.finishedAt,
          updated_at: currentGame.updatedAt
        }).eq('id', currentGame.id);

        if (currentGame.slots && currentGame.slots.length > 0) {
          for (const s of currentGame.slots) {
            await supabase.from('slots').update({
              player_name: s.player_name,
              updated_at: new Date()
            }).eq('game_id', currentGame.id).eq('slot_number', s.slot_number);
          }
        }
      } catch (e) {
        console.warn('Lỗi chốt chuyến trên Supabase:', e.message);
      }
    }

    saveStorage();

    // 2. Tự động mở chuyến tiếp theo (sẽ tự động tạo trên Supabase)
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
        id: s.db_id || s.id,
        slot_number: s.slot_number || s.id,
        player_name: (s.owner || s.player_name || '').trim() || null
      }));
    }
    currentGame.updatedAt = new Date();

    if (isConfigured() && supabase && currentGame.id) {
      try {
        await supabase.from('games').update({
          status: 'finished',
          settle_mode: currentGame.settleMode,
          winners: currentGame.winners,
          finished_results: currentGame.finishedResults,
          finished_at: currentGame.finishedAt,
          updated_at: currentGame.updatedAt
        }).eq('id', currentGame.id);

        if (currentGame.slots && currentGame.slots.length > 0) {
          for (const s of currentGame.slots) {
            await supabase.from('slots').update({
              player_name: s.player_name,
              updated_at: new Date()
            }).eq('game_id', currentGame.id).eq('slot_number', s.slot_number);
          }
        }
      } catch (e) {
        console.warn('Lỗi finalizeGame Supabase:', e.message);
      }
    }

    saveStorage();
    return currentGame;
  },

  async getRoundHistory(menuId = null) {
    const rounds = await this.getAllRounds(menuId);
    return (rounds || []).filter(r => r.status === 'finished');
  },

  async getAllRounds(menuId = null) {
    if (menuId) {
      const menu = await MenuModel.getMenuById(menuId);
      if (menu) {
        return await loadOrInitRoundsForMenu(menu);
      }
      return roundsByMenu[menuId] || [];
    }

    const menus = await MenuModel.getAllMenus();
    let all = [];
    for (const m of menus) {
      const rList = await loadOrInitRoundsForMenu(m);
      all = all.concat(rList);
    }
    return all;
  },

  saveCurrentStorage() {
    saveStorage();
  }
};

module.exports = GameModel;
