/**
 * MODEL LAYER: Quản lý chi tiết các ô Slot (Slots)
 * Hỗ trợ đồng bộ thời gian thực với Supabase Database
 */
const { supabase, isConfigured } = require('../config/supabase.config');
const GameModel = require('./GameModel');

const SlotModel = {
  /**
   * Gán hoặc cập nhật người chơi vào 1 slot
   */
  async assignSlot(gameId, slotNumber, playerName, menuId = null, roundNumber = null) {
    const trimmedName = playerName ? playerName.trim() : null;
    let game;
    if (gameId) {
      game = await GameModel.getGameById(gameId);
    } else {
      game = await GameModel.getCurrentGame(menuId, roundNumber);
    }

    if (isConfigured() && supabase && game && game.id) {
      try {
        const { data, error } = await supabase
          .from('slots')
          .update({
            player_name: trimmedName,
            updated_at: new Date()
          })
          .eq('game_id', game.id)
          .eq('slot_number', slotNumber)
          .select()
          .maybeSingle();

        if (!error && !data) {
          await supabase.from('slots').upsert({
            game_id: game.id,
            slot_number: slotNumber,
            player_name: trimmedName,
            updated_at: new Date()
          }, { onConflict: 'game_id,slot_number' });
        }
      } catch (e) {
        console.warn('Lỗi assignSlot Supabase:', e.message);
      }
    }

    if (game && game.slots) {
      let slot = game.slots.find(s => s.slot_number === slotNumber);
      if (slot) {
        slot.player_name = trimmedName;
      } else {
        slot = { slot_number: slotNumber, player_name: trimmedName };
        game.slots.push(slot);
      }
      game.updatedAt = new Date();
      GameModel.saveCurrentStorage();
      return slot;
    }
    return null;
  },

  /**
   * Đăng ký nhanh N slot cho khách
   */
  async quickRegister(gameId, playerName, slotCount, menuId = null, roundNumber = null) {
    const trimmedName = playerName ? playerName.trim() : null;
    let game;
    if (gameId) {
      game = await GameModel.getGameById(gameId);
    } else {
      game = await GameModel.getCurrentGame(menuId, roundNumber);
    }
    const freeSlots = (game.slots || []).filter(s => !s.player_name);

    if (freeSlots.length < slotCount) {
      throw new Error(`Chỉ còn ${freeSlots.length} slot trống, không đủ để lấy ${slotCount} slot!`);
    }

    const assigned = [];
    for (let i = 0; i < slotCount; i++) {
      const target = freeSlots[i];
      await this.assignSlot(game.id, target.slot_number, trimmedName, menuId, roundNumber);
      assigned.push(target.slot_number);
    }

    GameModel.saveCurrentStorage();
    return assigned;
  },

  /**
   * Giải phóng tất cả slot của 1 người chơi
   */
  async releasePlayerSlots(gameId, playerName, menuId = null, roundNumber = null) {
    const trimmedName = playerName ? playerName.trim() : null;
    let game;
    if (gameId) {
      game = await GameModel.getGameById(gameId);
    } else {
      game = await GameModel.getCurrentGame(menuId, roundNumber);
    }

    if (isConfigured() && supabase && game && game.id) {
      try {
        await supabase
          .from('slots')
          .update({ player_name: null, updated_at: new Date() })
          .eq('game_id', game.id)
          .eq('player_name', trimmedName);
      } catch (e) {
        console.warn('Lỗi releasePlayerSlots Supabase:', e.message);
      }
    }

    if (game && game.slots) {
      game.slots.forEach(s => {
        if (s.player_name === trimmedName) s.player_name = null;
      });
      game.winners = (game.winners || []).filter(w => w !== trimmedName);
      game.updatedAt = new Date();
      GameModel.saveCurrentStorage();
    }
    return true;
  },

  /**
   * Xóa / Giải phóng 1 slot cụ thể về trống
   */
  async clearSlot(gameId, slotNumber) {
    return this.assignSlot(gameId, slotNumber, null);
  },

  /**
   * Thêm 1 slot mới vào bàn cược
   */
  async addSlot(gameId) {
    const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();
    const newSlotNumber = (game.slots ? game.slots.length : 0) + 1;

    let slotId = null;
    if (isConfigured() && supabase && game && game.id) {
      try {
        await supabase
          .from('games')
          .update({ total_slots: newSlotNumber, updated_at: new Date() })
          .eq('id', game.id);

        const { data } = await supabase
          .from('slots')
          .insert({
            game_id: game.id,
            slot_number: newSlotNumber,
            player_name: null
          })
          .select()
          .single();

        if (data) slotId = data.id;
      } catch (e) {
        console.warn('Lỗi addSlot Supabase:', e.message);
      }
    }

    const newSlot = { id: slotId, slot_number: newSlotNumber, player_name: null };
    if (!game.slots) game.slots = [];
    game.slots.push(newSlot);
    game.totalSlots = newSlotNumber;
    game.updatedAt = new Date();
    GameModel.saveCurrentStorage();
    return newSlot;
  },

  /**
   * Xóa bớt slot cuối cùng khỏi bàn cược
   */
  async removeLastSlot(gameId) {
    const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();
    if (!game.slots || game.slots.length <= 1) {
      throw new Error('Bàn cược phải có ít nhất 1 slot!');
    }
    const lastSlotNumber = game.slots.length;
    const removedSlot = game.slots.pop();
    game.totalSlots = game.slots.length;

    if (isConfigured() && supabase && game && game.id) {
      try {
        await supabase
          .from('slots')
          .delete()
          .eq('game_id', game.id)
          .eq('slot_number', lastSlotNumber);

        await supabase
          .from('games')
          .update({ total_slots: game.totalSlots, updated_at: new Date() })
          .eq('id', game.id);
      } catch (e) {
        console.warn('Lỗi removeLastSlot Supabase:', e.message);
      }
    }

    game.updatedAt = new Date();
    GameModel.saveCurrentStorage();
    return { success: true, remaining: game.slots.length, removed: removedSlot };
  }
};

module.exports = SlotModel;
