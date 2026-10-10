const GameModel = require('./GameModel');
const core = require('../views/js/settlement-core');
module.exports = {
 async calculateSettlement(settleMode, winners, gameId = null, deductSlotCost = true) {
  const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();
  const settlementList = core.calculate(game, settleMode, winners, deductSlotCost);
  const winningRows = settlementList.filter(row => row.isWinner);
  const prizeByWinner = Object.fromEntries(winningRows.map(row => [core.key(row.playerName), row.prizeWon]));
  const prizePerWinner = winningRows.every(row => row.prizeWon === winningRows[0].prizeWon) ? winningRows[0].prizeWon : null;
  return { gameId: game.id, menuId: game.menuId, gameName: game.name, roundNumber: game.roundNumber,
   totalPrize: game.prizeValue, settleMode, winners, prizeRule: 'winner_slots', prizeByWinner, prizePerWinner, settlementList };
 }
};
