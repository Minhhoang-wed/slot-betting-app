(function (root) {
  const key = name => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  function allocate(total, winners) {
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Giải thưởng phải là số đồng nguyên không âm');
    const base = Math.floor(total / winners.length), remainder = total % winners.length;
    return Object.fromEntries(winners.map((name, i) => [key(name), base + (i < remainder ? 1 : 0)]));
  }
  function groups(game) {
    const grouped = new Map();
    for (const s of game.slots) {
      const owner = String(s.player_name || s.owner || '').trim();
      if (!owner) continue;
      const shares = Array.isArray(s.shares) && s.shares.length ? s.shares : [{ name:owner, percent:100 }];
      if (shares.some(p => !key(p.name) || !Number.isInteger(p.percent) || p.percent < 1 || p.percent > 100) || shares.reduce((n,p)=>n+p.percent,0)!==100 || new Set(shares.map(p=>key(p.name))).size!==shares.length) throw new Error('Tỷ lệ ghế chung phải đủ 100%, tên khác nhau');
      const price = Number(game.slotPrice);
      if (!Number.isSafeInteger(price) || price < 0) throw new Error('Giá ghế không hợp lệ');
      const costs=shares.map(p=>Math.floor(price*p.percent/100));
      let remainder=price-costs.reduce((sum,c)=>sum+c,0);
      for(let i=0;remainder>0;i++,remainder--)costs[i%costs.length]++;
      shares.forEach((p,i)=>{
        const id=key(p.name);
        if(!grouped.has(id))grouped.set(id,{name:p.name.trim(),slots:[],slotCount:0,totalCost:0});
        const entry=grouped.get(id);entry.slots.push(s.slot_number || s.id);entry.slotCount+=p.percent/100;entry.totalCost+=costs[i];
      });
    }
    return grouped;
  }
  function calculate(game, mode, winners, deduct = true, attached = {}) {
    const count = { solo: 1, split2: 2, split3: 3 }[mode];
    if (!count || !Array.isArray(winners) || winners.length !== count) throw new Error('Chọn đúng số người nhận giải theo chế độ');
    const players = groups(game);
    const ids = winners.map(key);
    if (new Set(ids).size !== count || ids.some(id => !players.has(id))) throw new Error('Người nhận giải phải khác nhau và có ghế trong chuyến');
    const awards = allocate(Number(game.prizeValue), winners);
    return [...players].map(([id, p]) => {
      const items = Object.entries(attached).filter(([name]) => key(name) === id).flatMap(([,items]) => items);
      const attachedTotalCost = items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty || 1), 0);
      if (!Number.isSafeInteger(attachedTotalCost) || attachedTotalCost < 0) throw new Error('Tiền mỹ phẩm không hợp lệ');
      const buyCost = p.totalCost, isWinner = ids.includes(id), prizeWon = awards[id] || 0;
      const netAmount = (isWinner && !deduct ? prizeWon : prizeWon - buyCost) - attachedTotalCost;
      return { playerName: p.name, slotCount: p.slotCount, slotsList: p.slots, buyCost, prizeWon, netAmount, isWinner,
        deducted: isWinner && deduct, attachedItems: items, attachedTotalCost, settleType: netAmount > 0 ? 'shop_pays_player' : 'player_pays_shop' };
    });
  }
  const api = { key, allocate, groups, calculate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SettlementCore = api;
})(typeof window === 'undefined' ? this : window);
