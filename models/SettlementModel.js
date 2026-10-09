const GameModel = require('./GameModel');
const core = require('../views/js/settlement-core');
module.exports = {
 async calculateSettlement(settleMode, winners, gameId = null, deductSlotCost = true) {
  const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();
  const settlementList = core.calculate(game, settleMode, winners, deductSlotCost);
  return { gameId: game.id, menuId: game.menuId, gameName: game.name, roundNumber: game.roundNumber,
   totalPrize: game.prizeValue, settleMode, winners, prizePerWinner: Math.floor(game.prizeValue / winners.length), settlementList };
 }
};
