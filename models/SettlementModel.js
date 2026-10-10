const GameModel = require('./GameModel');
const core = require('../views/js/settlement-core');
module.exports = {
 async calculateSettlement(settleMode, winners, gameId = null, deductSlotCost = true, winningSlots = undefined, attached = {}) {
  const game = gameId ? await GameModel.getGameById(gameId) : await GameModel.getCurrentGame();
  const bySlots = winningSlots !== undefined;
  const settlementList = bySlots ? core.calculateBySlots(game, winningSlots, deductSlotCost, attached) : core.calculate(game, settleMode, winners, deductSlotCost, attached);
  const winningRows = settlementList.filter(row => row.isWinner);
  if (bySlots) { winners = winningRows.map(row=>row.playerName); settleMode = core.modeForWinningSlots(winningSlots); }
  const prizeByWinner = Object.fromEntries(winningRows.map(row => [core.key(row.playerName), row.prizeWon]));
  const prizePerWinner = winningRows.every(row => row.prizeWon === winningRows[0].prizeWon) ? winningRows[0].prizeWon : null;
  return { gameId: game.id, menuId: game.menuId, gameName: game.name, roundNumber: game.roundNumber,
   totalPrize: game.prizeValue, settleMode, winners, winningSlots:bySlots ? settlementList[0].winningSlots : null,
   prizeRule: bySlots ? 'winning_slots' : 'winner_slots', prizeByWinner, prizePerWinner, settlementList };
 }
};
