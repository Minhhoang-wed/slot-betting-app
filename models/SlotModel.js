/**
 * MODEL LAYER: Quản lý chi tiết các ô Slot (Slots)
 */
const { supabase, isConfigured } = require('../config/supabase.config');
const GameModel = require('./GameModel');

const SlotModel = {
  /**
   * Gán hoặc cập nhật người chơi vào 1 slot
   */
  async assignSlot(gameId, slotNumber, playerName) {
    const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();

    if (isConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('slots')
          .update({
            player_name: playerName,
            updated_at: new Date()
          })
          .eq('game_id', game.id)
          .eq('slot_number', slotNumber)
          .select()
          .single();

        if (!error && data) return data;
      } catch (e) {}
    }

    const slot = game.slots.find(s => s.slot_number === slotNumber);
    if (slot) {
      slot.player_name = playerName;
    }
    game.updatedAt = new Date();
    return slot;
  },

  /**
   * Đăng ký nhanh N slot cho khách
   */
  async quickRegister(gameId, playerName, slotCount) {
    const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();
    const freeSlots = game.slots.filter(s => !s.player_name);

    if (freeSlots.length < slotCount) {
      throw new Error(`Chỉ còn ${freeSlots.length} slot trống, không đủ để lấy ${slotCount} slot!`);
    }

    const assigned = [];
    for (let i = 0; i < slotCount; i++) {
      const target = freeSlots[i];
      await this.assignSlot(game.id, target.slot_number, playerName);
      assigned.push(target.slot_number);
    }

    return assigned;
  },

  /**
   * Giải phóng tất cả slot của 1 người chơi
   */
  async releasePlayerSlots(gameId, playerName) {
    const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();

    if (isConfigured() && supabase) {
      try {
        await supabase
          .from('slots')
          .update({ player_name: null, updated_at: new Date() })
          .eq('game_id', game.id)
          .eq('player_name', playerName);
      } catch (e) {}
    }

    game.slots.forEach(s => {
      if (s.player_name === playerName) s.player_name = null;
    });
    game.winners = game.winners.filter(w => w !== playerName);
    game.updatedAt = new Date();
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

    if (isConfigured() && supabase) {
      try {
        await supabase
          .from('games')
          .update({ total_slots: newSlotNumber, updated_at: new Date() })
          .eq('id', game.id);

        const { data, error } = await supabase
          .from('slots')
          .insert({
            game_id: game.id,
            slot_number: newSlotNumber,
            player_name: null
          })
          .select()
          .single();

        if (!error && data) return data;
      } catch (e) {}
    }

    const newSlot = { slot_number: newSlotNumber, player_name: null };
    if (!game.slots) game.slots = [];
    game.slots.push(newSlot);
    game.totalSlots = newSlotNumber;
    game.updatedAt = new Date();
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

    if (isConfigured() && supabase) {
      try {
        await supabase
          .from('slots')
          .delete()
          .eq('game_id', game.id)
          .eq('slot_number', lastSlotNumber);

        await supabase
          .from('games')
          .update({ total_slots: lastSlotNumber - 1, updated_at: new Date() })
          .eq('id', game.id);
      } catch (e) {}
    }

    game.slots.pop();
    game.totalSlots = game.slots.length;
    game.updatedAt = new Date();
    return { success: true, remaining: game.slots.length };
  }
};

module.exports = SlotModel;
