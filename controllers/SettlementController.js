/**
 * CONTROLLER LAYER: Điều khiển tính toán quyết toán, Winner & Chia giải
 */
const SettlementModel = require('../models/SettlementModel');

const SettlementController = {
  // Quyết toán trận đấu
  async settle(req, res) {
    try {
      const { settleMode, winners, gameId, menuId, roundNumber, winningSlots, deductSlotCost, customerAttachedProducts } = req.body;
      const targetGameId = gameId || (menuId ? (await require('../models/GameModel').getCurrentGame(menuId, roundNumber ?? null)).id : null);
      const result = await SettlementModel.calculateSettlement(settleMode || 'solo', winners || [], targetGameId, deductSlotCost ?? true, winningSlots, customerAttachedProducts || {});
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
};

module.exports = SettlementController;
