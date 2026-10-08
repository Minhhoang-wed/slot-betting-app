/**
 * MODEL LAYER: Xử lý logic quyết toán ván cược, Chốt Winner & Chia giải (Chia 2 / Chia 3)
 */
const GameModel = require('./GameModel');

const SettlementModel = {
  /**
   * Tính toán quyết toán tài chính trận đấu
   * @param {string} settleMode - 'solo' | 'split2' | 'split3'
   * @param {Array<string>} winners - Danh sách tên người nhận giải
   * @param {string|null} gameId - ID ván đấu (nếu có)
   * @param {boolean} deductSlotCost - Cấn trừ tiền slot hay không (mặc định true)
   */
  async calculateSettlement(settleMode, winners, gameId = null, deductSlotCost = true) {
    const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();

    if (!winners || winners.length === 0) {
      throw new Error('Cần tick chọn ít nhất một người nhận giải!');
    }

    if (settleMode === 'split2' && winners.length !== 2) {
      throw new Error('Chế độ Chia Đôi (Chia 2) yêu cầu chọn chính xác 2 người!');
    }

    if (settleMode === 'split3' && winners.length !== 3) {
      throw new Error('Chế độ Chia Ba (Chia 3) yêu cầu chọn chính xác 3 người!');
    }

    // Nhóm người chơi theo tên và tính số slot đã mua
    const playerMap = {};
    game.slots.forEach(s => {
      if (s.player_name) {
        if (!playerMap[s.player_name]) {
          playerMap[s.player_name] = {
            name: s.player_name,
            slots: [],
            totalCost: 0
          };
        }
        playerMap[s.player_name].slots.push(s.slot_number);
        playerMap[s.player_name].totalCost += game.slotPrice;
      }
    });

    const prizePerWinner = Math.round(game.prizeValue / winners.length);

    // Tính toán số tiền Net cho từng người
    const results = Object.values(playerMap).map(p => {
      const isWinner = winners.includes(p.name);
      const prizeWon = isWinner ? prizePerWinner : 0;
      let netAmount = 0;
      if (isWinner) {
        netAmount = deductSlotCost ? (prizeWon - p.totalCost) : prizeWon;
      } else {
        netAmount = -p.totalCost;
      }

      return {
        playerName: p.name,
        slotCount: p.slots.length,
        slotsList: p.slots,
        buyCost: p.totalCost,
        prizeWon: prizeWon,
        netAmount: netAmount,
        isWinner: isWinner,
        settleType: netAmount > 0 ? 'shop_pays_player' : 'player_pays_shop'
      };
    });

    return {
      gameId: game.id,
      menuId: game.menuId,
      gameName: game.name,
      roundNumber: game.roundNumber,
      totalPrize: game.prizeValue,
      settleMode,
      winners,
      prizePerWinner,
      settlementList: results
    };
  }
};

module.exports = SettlementModel;
