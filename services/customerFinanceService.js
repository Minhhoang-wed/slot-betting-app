const { key } = require('../views/js/settlement-core');
const { assignedNumbers } = require('./blindBagService');

function summarize(slotReport, blindRounds) {
  const customers = new Map();
  function get(name) {
    const id=key(name);
    if (!customers.has(id)) customers.set(id,{customerName:name,slotNet:0,bagTotal:0,bagPaid:0,bagDue:0,buybackTotal:0,netAmount:0,events:[]});
    return customers.get(id);
  }
  for (const row of slotReport.customers) {
    const customer=get(row.customerName);customer.slotNet=row.netAmount;
    for (const menu of Object.values(row.menuBreakdown)) for (const round of menu.rounds || []) {
      const bought='Mua '+(round.slots || []).map(n=>'#'+n).join(', ');
      const wins=Array.isArray(round.winningSlotsList) ? (round.winningSlotsList.length ? 'Thắng '+round.winningSlotsList.map(n=>'#'+n).join(', ') : 'Không có slot thắng') : (round.status==='finished' ? 'Kết quả cũ chưa lưu slot thắng' : 'Chưa chọn slot thắng');
      customer.events.push({type:'Bàn kèo',context:menu.menuName,slots:'Chuyến #'+round.roundNumber,name:bought+' · '+wins,quantity:round.slotCount,amount:round.net,status:round.status==='finished'?'Đã chốt':'Chưa chốt',winningSlotsList:round.winningSlotsList,winningSlotCount:round.winningSlotCount,prizeWon:round.prizeWon});
    }
  }
  for (const round of blindRounds) {
    for (const order of round.data.orders) {
      const customer=get(order.customerName),amount=Number(order.total);
      customer.bagTotal+=amount;
      if (order.paid) customer.bagPaid+=amount;else customer.bagDue+=amount;
      customer.events.push({type:'Mua túi mù và hàng kèm',context:round.data.name,slots:order.slots.join(', '),name:'Hóa đơn '+new Date(order.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),quantity:order.quantity,amount,status:order.paid?'Đã trả tiền':'Chưa xác nhận trả tiền'});
    }
    for (const slot of round.data.slots) for (const number of assignedNumbers(slot)) {
      const gift=round.data.pool.find(p=>p.number===number);
      get(slot.customerName).events.push({type:'Sản phẩm bốc được',context:round.data.name,slots:String(slot.number),name:gift?.name||String(number),quantity:1,amount:0,status:'Món #'+number});
    }
    for (const receipt of round.data.returns || []) {
      const customer=get(receipt.customerName);
      if (!receipt.voided) customer.buybackTotal+=receipt.total;
      for (const item of receipt.items) customer.events.push({type:'Shop thu lại',context:round.data.name,slots:String(receipt.slotNumber),name:item.name,quantity:1,amount:item.price,status:receipt.voided?'Đã hủy phiếu':'Ghi có cho khách'});
    }
  }
  for (const customer of customers.values()) {
    customer.netAmount=customer.slotNet-customer.bagDue+customer.buybackTotal;
    customer.shopPays=Math.max(0,customer.netAmount);customer.customerPays=Math.max(0,-customer.netAmount);
  }
  const rows=[...customers.values()];
  const sum=prop=>rows.reduce((n,r)=>n+r[prop],0);
  return {customers:rows,totalCustomers:rows.length,slotNet:sum('slotNet'),bagTotal:sum('bagTotal'),bagPaid:sum('bagPaid'),bagDue:sum('bagDue'),buybackTotal:sum('buybackTotal'),shopPays:sum('shopPays'),customerPays:sum('customerPays')};
}
function forCustomer(summary, name) {
  const id=key(name);
  if (!id) return null;
  const customer=summary.customers.find(c=>key(c.customerName)===id);
  if (!customer) return null;
  const result={customers:[customer],totalCustomers:1};
  for (const field of ['slotNet','bagTotal','bagPaid','bagDue','buybackTotal','shopPays','customerPays']) result[field]=customer[field];
  return result;
}
module.exports={summarize,forCustomer};
