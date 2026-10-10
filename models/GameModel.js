/**
 * MODEL LAYER: Quản lý Dữ liệu Kèo Slot theo Từng Menu & Từng Chuyến (Rounds)
 * Hỗ trợ lưu trữ bền vững vĩnh viễn trên Supabase Database
 * Đọc DB ở mỗi yêu cầu khi đã cấu hình; bộ nhớ và file chỉ dùng để thử cục bộ.
 */
const fs = require('fs');
const path = require('path');
const { supabase, isConfigured } = require('../services/durableDatabase');
const MenuModel = require('./MenuModel');

// Quản lý trạng thái Menu đang chọn trong bộ nhớ
let currentActiveMenuId = null;

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
    } catch (e) { if (isConfigured()) throw e;}
  }
}

function saveStorage() {
  if (isConfigured()) return;
  try {
    ensureStorageDir();
    const payload = {
      currentActiveMenuId,
      roundsByMenu,
      activeRoundNumberByMenu,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) { if (isConfigured()) throw e;
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
  } catch (e) { if (isConfigured()) throw e;
    console.warn("Lỗi đọc storage:", e.message);
  }
}

// Đọc storage dự phòng ban đầu
if (!isConfigured()) loadStorage();

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
      shares: s?.shares || [],
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
    slotPrice: Number(g.slot_price ?? menu.slot_price),
    prizeValue: Number(g.prize_value ?? menu.prize_value),
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
async function loadOrInitRoundsForMenu(menu, initialize = true) {
  if (!menu) return [];

  // Nếu đã được load từ Supabase và có trong bộ nhớ -> Trả về siêu tốc < 1ms
  if (!isConfigured() && loadedFromDb[menu.id] && roundsByMenu[menu.id] && roundsByMenu[menu.id].length > 0) {
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
    } catch (e) { if (isConfigured()) throw e;
      console.warn(`Lỗi tải games từ Supabase cho menu [${menu.name}]:`, e.message);
    }
  }

  if (!initialize) { roundsByMenu[menu.id] = []; return []; }
  if (isConfigured() && supabase) {
    const { data: gameId } = await supabase.rpc('create_slot_round', { p_menu_id: menu.id, p_options: { initializeOnly:true } });
    const { data } = await supabase.from('games').select('*, slots(*)').eq('id', gameId).single();
    if (!data) throw new Error('Không tải được chuyến vừa tạo');
    const round = mapGameRowToRound(data, menu);
    roundsByMenu[menu.id] = [round]; activeRoundNumberByMenu[menu.id] = round.roundNumber;
    return [round];
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
    } catch (e) { if (isConfigured()) throw e;
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
    if (!game && roundNumber !== null) throw new Error('Không tìm thấy chuyến');
    if (!game) {
      game = rounds[rounds.length - 1];
      activeRoundNumberByMenu[menu.id] = game.roundNumber;
    }

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
    if (isConfigured() && supabase) {
      const { data: id } = await supabase.rpc('create_slot_round', { p_menu_id: menu.id, p_options: options });
      const round = await this.getGameById(id);
      activeRoundNumberByMenu[menu.id] = round.roundNumber;
      return round;
    }
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
      } catch (e) { if (isConfigured()) throw e;
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
    if (isConfigured() && supabase) {
      await supabase.rpc('mutate_slot_round', { p_game_id: game.id, p_action: 'config', p_payload: options });
      return this.getGameById(game.id);
    }

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
              await supabase.from('slots').insert({ game_id: game.id, slot_number: i, player_name: null });
            } catch (e) { if (isConfigured()) throw e;}
          }
        }
      } else if (newTotal < oldTotal) {
        game.slots = game.slots.filter(s => s.slot_number <= newTotal);
        if (isConfigured() && supabase && game.id) {
          try {
            await supabase.from('slots').delete().eq('game_id', game.id).gt('slot_number', newTotal);
          } catch (e) { if (isConfigured()) throw e;}
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
      } catch (e) { if (isConfigured()) throw e;
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
      } catch (e) { if (isConfigured()) throw e;
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
    for (const rounds of (isConfigured() ? [] : Object.values(roundsByMenu))) {
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
      } catch (e) { if (isConfigured()) throw e;}
    }

    throw new Error('Không tìm thấy chuyến');
  },

  async updateGameConfig({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber }) {
    return this.updateRound(menuId, roundNumber, { name, totalSlots, slotPrice, prizeValue });
  },

  async resetGame({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber }) {
    const targetMenuId = menuId || currentActiveMenuId;
    const menu = await MenuModel.getMenuById(targetMenuId);
    const currentGame = await this.getCurrentGame(targetMenuId, roundNumber);

    if (isConfigured() && supabase) {
      await supabase.rpc('mutate_slot_round', { p_game_id: currentGame.id, p_action: 'reset', p_payload: { name, totalSlots, slotPrice, prizeValue } });
      return this.getGameById(currentGame.id);
    }
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
      } catch (e) { if (isConfigured()) throw e;
        console.warn('Lỗi resetGame Supabase:', e.message);
      }
    }

    saveStorage();
    return currentGame;
  },

  async finishAndStartNextRound(menuId, settlementResults, winners, settleMode, slots, roundNumber, options = {}) {
    return this.persistSettlement(menuId, { ...options, roundNumber, winners, settleMode }, true);
  },

  async finalizeGame(menuId, data = {}) {
    return (await this.persistSettlement(menuId, data, false)).completedRound;
  },

  async persistSettlement(menuId, data, openNext) {
    const game = await this.getCurrentGame(menuId, data.roundNumber ?? null);
    const core = require('../views/js/settlement-core');
    const winners = data.winners || game.winners || [];
    const settleMode = data.settleMode || game.settleMode;
    const attached = data.customerAttachedProducts ?? Object.fromEntries((game.finishedResults || []).map(r=>[r.playerName,r.attachedItems || []]));
    const deduct = data.deductSlotCost ?? (game.finishedResults || []).find(r=>r.isWinner)?.deducted ?? true;
    const results = winners.length ? core.calculate(game, settleMode, winners, deduct, attached) : [];
    if (!winners.length && !openNext) throw new Error('Chưa chọn người nhận giải');
    if (isConfigured() && supabase) {
      const { data: saved } = await supabase.rpc('finish_slot_round', {
        p_game_id: game.id, p_menu_id: game.menuId, p_expected_updated_at: game.updatedAt,
        p_winners: winners, p_mode: settleMode, p_results: results, p_open_next: openNext
      });
      const completedRound = await this.getGameById(saved.completedId);
      const nextRound = saved.nextId ? await this.getGameById(saved.nextId) : null;
      return { completedRound, nextRound };
    }
    game.status = 'finished'; game.winners = winners; game.settleMode = settleMode;
    game.finishedResults = results; game.finishedAt = new Date(); game.updatedAt = new Date();
    saveStorage();
    let nextRound = game.nextRoundId ? await this.getGameById(game.nextRoundId) : null;
    if (openNext && !nextRound) { nextRound = await this.createNewRound(game.menuId); game.nextRoundId = nextRound.id; saveStorage(); }
    return { completedRound: game, nextRound };
  },

  async getRoundHistory(menuId = null) {
    const rounds = await this.getAllRounds(menuId);
    return (rounds || []).filter(r => r.status === 'finished');
  },

  async getAllRounds(menuId = null) {
    if (menuId) {
      const menu = await MenuModel.getMenuById(menuId);
      if (menu) {
        return await loadOrInitRoundsForMenu(menu, false);
      }
      return roundsByMenu[menuId] || [];
    }

    const menus = await MenuModel.getAllMenus();
    if (isConfigured() && supabase) {
      const data = [];
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from('games').select('*, slots(*)').order('id', { ascending:true }).range(offset, offset + 499);
        if (page.error) throw new Error('Không đọc được lịch sử: ' + page.error.message);
        data.push(...(page.data || []));
        if ((page.data || []).length < 500) break;
      }
      const byId = new Map(menus.map(m=>[m.id,m]));
      return (data || []).filter(g=>byId.has(g.menu_id)).map(g=>mapGameRowToRound(g,byId.get(g.menu_id)));
    }
    let all = [];
    for (const m of menus) {
      const rList = await loadOrInitRoundsForMenu(m, false);
      all = all.concat(rList);
    }
    return all;
  },

  saveCurrentStorage() {
    saveStorage();
  }
};

module.exports = GameModel;
