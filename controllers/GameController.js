/**
 * CONTROLLER LAYER: Điều khiển các hành động liên quan đến Kèo Slot & Chuyến (Rounds)
 */
const GameModel = require('../models/GameModel');
const SlotModel = require('../models/SlotModel');

const GameController = {
  // Lấy thông tin ván hiện tại của Menu
  async getGame(req, res) {
    try {
      const { menuId, roundNumber } = req.query;
      const game = await GameModel.getCurrentGame(menuId, roundNumber ? Number(roundNumber) : null);
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, data: { ...game, roundsList } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Chuyển đổi Menu đang cược trên bàn
  async switchMenu(req, res) {
    try {
      const { menuId } = req.body;
      const game = await GameModel.switchActiveMenu(menuId);
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, message: `Đã chuyển sang Menu [${menuId}]`, data: { ...game, roundsList } });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Chuyển đổi Chuyến (Round) trong Menu
  async switchRound(req, res) {
    try {
      const { menuId, roundNumber } = req.body;
      const game = await GameModel.switchActiveRound(menuId, roundNumber);
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, message: `Đã chuyển sang Chuyến #${roundNumber}`, data: { ...game, roundsList } });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Tạo Chuyến mới trong Menu
  async createRound(req, res) {
    try {
      const { menuId, name, totalSlots, slotPrice, prizeValue } = req.body;
      const game = await GameModel.createNewRound(menuId, { name, totalSlots, slotPrice, prizeValue });
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, message: `Đã mở Chuyến #${game.roundNumber} thành công!`, data: { ...game, roundsList } });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Chỉnh sửa thông số Chuyến trong Menu
  async updateRound(req, res) {
    try {
      const { menuId, roundNumber, name, totalSlots, slotPrice, prizeValue, status, settleMode } = req.body;
      const game = await GameModel.updateRound(menuId, roundNumber, { name, totalSlots, slotPrice, prizeValue, status, settleMode });
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, message: `Đã cập nhật Chuyến #${roundNumber} thành công!`, data: { ...game, roundsList } });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Xóa Chuyến trong Menu
  async deleteRound(req, res) {
    try {
      const { menuId, roundNumber } = req.body;
      const game = await GameModel.deleteRound(menuId, roundNumber);
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, message: `Đã xóa Chuyến #${roundNumber}`, data: { ...game, roundsList } });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Cập nhật cấu hình kèo
  async updateConfig(req, res) {
    try {
      const { name, totalSlots, slotPrice, prizeValue, menuId, roundNumber } = req.body;
      const updated = await GameModel.updateGameConfig({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber });
      const roundsList = GameModel.getRoundsList(updated.menuId);
      res.json({ success: true, data: { ...updated, roundsList } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Reset kèo ván hiện tại
  async resetGame(req, res) {
    try {
      const { name, totalSlots, slotPrice, prizeValue, menuId, roundNumber } = req.body;
      const game = await GameModel.resetGame({ name, totalSlots, slotPrice, prizeValue, menuId, roundNumber });
      const roundsList = GameModel.getRoundsList(game.menuId);
      res.json({ success: true, message: 'Đã làm mới ván cược', data: { ...game, roundsList } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Chốt chuyến hiện tại & Sang chuyến mới (Lưu lịch sử chuyến)
  async nextRound(req, res) {
    try {
      const { menuId, settlementResults, winners, settleMode, slots } = req.body;
      const result = await GameModel.finishAndStartNextRound(menuId, settlementResults, winners, settleMode, slots);
      const roundsList = GameModel.getRoundsList(result.nextRound.menuId);
      res.json({
        success: true,
        message: `Đã chốt Chuyến #${result.completedRound.roundNumber} và mở Chuyến #${result.nextRound.roundNumber}!`,
        data: {
          ...result,
          nextRound: { ...result.nextRound, roundsList }
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Lấy lịch sử các chuyến đã kết thúc
  async getRoundHistory(req, res) {
    try {
      const { menuId } = req.query;
      const history = GameModel.getRoundHistory(menuId);
      res.json({ success: true, data: history });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Gán hoặc thay đổi người chơi cho 1 ô slot
  async updateSlot(req, res) {
    try {
      const { gameId, slotNumber, playerName, menuId, roundNumber } = req.body;
      const updated = await SlotModel.assignSlot(gameId, slotNumber, playerName || null, menuId, roundNumber);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Đăng ký nhanh N slot cho khách
  async quickRegister(req, res) {
    try {
      const { gameId, playerName, slotCount, menuId, roundNumber } = req.body;
      if (!playerName) {
        return res.status(400).json({ success: false, error: 'Thiếu tên người chơi' });
      }
      const slotsAssigned = await SlotModel.quickRegister(gameId, playerName, Number(slotCount) || 1, menuId, roundNumber);
      res.json({ success: true, message: `Đã đăng ký ${slotCount} slot cho ${playerName}`, slots: slotsAssigned });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Hủy toàn bộ slot của người chơi
  async removePlayer(req, res) {
    try {
      const { gameId, playerName, menuId, roundNumber } = req.body;
      await SlotModel.releasePlayerSlots(gameId, playerName, menuId, roundNumber);
      res.json({ success: true, message: `Đã hủy các slot của ${playerName}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Thêm 1 slot vào bàn cược
  async addSlot(req, res) {
    try {
      const { gameId } = req.body;
      const newSlot = await SlotModel.addSlot(gameId);
      res.json({ success: true, message: 'Đã thêm 1 ô slot thành công', data: newSlot });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Bớt 1 slot khỏi bàn cược
  async removeSlot(req, res) {
    try {
      const { gameId } = req.body;
      const result = await SlotModel.removeLastSlot(gameId);
      res.json({ success: true, message: 'Đã xóa bớt 1 ô slot', data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Đồng bộ kết quả chốt ván cược từ Client lên Server
  async finalizeGame(req, res) {
    try {
      const { menuId, winners, settleMode, deductSlotCost, finishedResults, customerAttachedProducts, slots } = req.body;
      const game = await GameModel.finalizeGame(menuId, {
        winners,
        settleMode,
        deductSlotCost,
        finishedResults,
        customerAttachedProducts,
        slots
      });
      res.json({ success: true, message: 'Đã lưu kết quả quyết toán ván đấu!', data: game });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = GameController;
