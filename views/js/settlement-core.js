(function (root) {
  const key = name => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  function allocate(total, winners, weights = winners.map(() => 1)) {
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Giải thưởng phải là số đồng nguyên không âm');
    if (!winners.length || weights.length !== winners.length || weights.some(w => !Number.isSafeInteger(w) || w <= 0)) throw new Error('Số slot người thắng không hợp lệ');
    const denominator = weights.reduce((sum, w) => sum + BigInt(w), 0n);
    const shares = weights.map((w, i) => {
      const numerator = BigInt(total) * BigInt(w);
      return { i, amount: Number(numerator / denominator), remainder: numerator % denominator };
    });
    // Largest remainders receive the leftover đồng; ties follow winner selection order.
    const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
    const leftover = total - shares.reduce((sum, share) => sum + share.amount, 0);
    for (let i = 0; i < leftover; i++) ranked[i].amount++;
    return Object.fromEntries(shares.map((share, i) => [key(winners[i]), share.amount]));
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
    const awards = allocate(Number(game.prizeValue), winners, ids.map(id => Math.round(players.get(id).slotCount * 100)));
    return [...players].map(([id, p]) => {
      const items = Object.entries(attached).filter(([name]) => key(name) === id).flatMap(([,items]) => items);
      const attachedTotalCost = items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty || 1), 0);
      if (!Number.isSafeInteger(attachedTotalCost) || attachedTotalCost < 0) throw new Error('Tiền mỹ phẩm không hợp lệ');
      const buyCost = p.totalCost, isWinner = ids.includes(id), prizeWon = awards[id] || 0;
      const netAmount = (isWinner && !deduct ? prizeWon : prizeWon - buyCost) - attachedTotalCost;
      return { playerName: p.name, slotCount: p.slotCount, slotsList: p.slots, buyCost, prizeWon, netAmount, isWinner,
        prizeRule: 'winner_slots', deducted: isWinner && deduct, attachedItems: items, attachedTotalCost, settleType: netAmount > 0 ? 'shop_pays_player' : 'player_pays_shop' };
    });
  }
  function winningSlotNumbers(game, selected) {
    if (!Array.isArray(selected) || !selected.length) throw new Error('Chọn ít nhất một slot thắng');
    if (selected.some(n => typeof n !== 'number' && !(typeof n === 'string' && /^\d+$/.test(n.trim())))) throw new Error('Slot thắng phải là số ghế');
    const numbers = selected.map(n => Number(n));
    if (numbers.some(n => !Number.isSafeInteger(n) || n < 1) || new Set(numbers).size !== numbers.length) throw new Error('Slot thắng phải là số ghế khác nhau');
    const slots = new Map(game.slots.map(s => [Number(s.slot_number || s.id), s]));
    if (numbers.some(n => !slots.has(n) || !String(slots.get(n).player_name || slots.get(n).owner || '').trim())) throw new Error('Chỉ chọn slot đã có khách trong chuyến');
    return numbers.sort((a,b) => a-b);
  }
  function winningSlotsFromResults(results) {
    if (!Array.isArray(results) || !results.some(r => r.prizeRule === 'winning_slots')) return null;
    return [...new Set(results.flatMap(r => Array.isArray(r.winningSlots) ? r.winningSlots : r.winningSlotsList || []))].sort((a,b)=>a-b);
  }
  function withAttachedProducts(results, attached) {
    if (!Array.isArray(results) || !attached || typeof attached !== 'object' || Array.isArray(attached)) throw new Error('Danh sách mỹ phẩm không hợp lệ');
    return results.map(row => {
      const items = Object.entries(attached).filter(([name]) => key(name) === key(row.playerName)).flatMap(([,list]) => {
        if (!Array.isArray(list)) throw new Error('Danh sách mỹ phẩm không hợp lệ');
        return list.map(item => {
          const price=Number(item.price),qty=Number(item.qty ?? 1);
          if (!Number.isSafeInteger(price) || price<0 || !Number.isSafeInteger(qty) || qty<1) throw new Error('Tiền mỹ phẩm không hợp lệ');
          return {...item,price,qty};
        });
      });
      const attachedTotalCost=items.reduce((sum,item)=>sum+item.price*item.qty,0);
      if (!Number.isSafeInteger(attachedTotalCost)) throw new Error('Tiền mỹ phẩm không hợp lệ');
      const prizeWon=Number(row.prizeWon || 0),buyCost=Number(row.buyCost || 0);
      if (!Number.isSafeInteger(prizeWon) || prizeWon<0 || !Number.isSafeInteger(buyCost) || buyCost<0) throw new Error('Số tiền đã lưu không hợp lệ');
      const netAmount=(row.isWinner && row.deducted===false ? prizeWon : prizeWon-buyCost)-attachedTotalCost;
      if (!Number.isSafeInteger(netAmount)) throw new Error('Số tiền quyết toán không hợp lệ');
      return {...row,attachedItems:items,attachedTotalCost,netAmount,settleType:netAmount>0?'shop_pays_player':'player_pays_shop'};
    });
  }
  function modeForWinningSlots(selected) {
    return selected.length === 1 ? 'solo' : selected.length === 2 ? 'split2' : 'split3';
  }
  function calculateBySlots(game, selected, deduct = true, attached = {}) {
    const players = groups(game);
    const winningSlots = winningSlotNumbers(game, selected);
    const slotAwards = allocate(Number(game.prizeValue), winningSlots.map(String));
    const slots = new Map(game.slots.map(s => [Number(s.slot_number || s.id), s]));
    const awards = new Map();
    for (const number of winningSlots) {
      const slot = slots.get(number);
      const owner = String(slot.player_name || slot.owner).trim();
      const shares = Array.isArray(slot.shares) && slot.shares.length ? slot.shares : [{name:owner, percent:100}];
      const split = allocate(slotAwards[String(number)], shares.map(p=>p.name), shares.map(p=>p.percent));
      for (const share of shares) {
        const id=key(share.name);
        if (!awards.has(id)) awards.set(id,{amount:0,slots:[],count:0});
        const award=awards.get(id);
        award.amount+=split[id];award.slots.push(number);award.count+=share.percent/100;
      }
    }
    return [...players].map(([id,p]) => {
      const items=Object.entries(attached).filter(([name])=>key(name)===id).flatMap(([,items])=>items);
      const attachedTotalCost=items.reduce((sum,it)=>sum+Number(it.price)*Number(it.qty||1),0);
      if (!Number.isSafeInteger(attachedTotalCost) || attachedTotalCost < 0) throw new Error('Tiền mỹ phẩm không hợp lệ');
      const award=awards.get(id),isWinner=!!award,prizeWon=award?.amount || 0,buyCost=p.totalCost;
      const netAmount=(isWinner && !deduct ? prizeWon : prizeWon-buyCost)-attachedTotalCost;
      return {playerName:p.name,slotCount:p.slotCount,slotsList:p.slots,buyCost,prizeWon,netAmount,isWinner,
        prizeRule:'winning_slots',winningSlots:[...winningSlots],winningSlotsList:award?.slots || [],winningSlotCount:award?.count || 0,
        deducted:isWinner && deduct,attachedItems:items,attachedTotalCost,settleType:netAmount>0?'shop_pays_player':'player_pays_shop'};
    });
  }
  const api = { key, allocate, groups, calculate, calculateBySlots, winningSlotNumbers, winningSlotsFromResults, modeForWinningSlots, withAttachedProducts };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SettlementCore = api;
})(typeof window === 'undefined' ? this : window);
