const Report = require('./ReportModel');
const BlindBag = require('./BlindBagModel');
const { summarize } = require('../services/customerFinanceService');
const { key } = require('../views/js/settlement-core');
const search = require('../views/js/customer-search');
module.exports={
  async getSummary(options={}) {
    const [slotReport,rounds]=await Promise.all([Report.getAllCustomersSummary(),BlindBag.list()]);
    return summarize(slotReport,rounds,options);
  },
  async searchCustomers(name) {
    if (typeof name !== 'string' || !name.trim()) return [];
    const [slotReport,rounds]=await Promise.all([Report.getAllCustomersSummary(),BlindBag.list()]);
    const summary=summarize(slotReport,rounds);
    const slotMatches=new Map((await Report.searchCustomer(name,slotReport)).map(c=>[key(c.customerName),c]));
    return summary.customers.filter(c=>search.matches(c.customerName,name)).map(finance=>({
      customerName:finance.customerName,totalSlots:0,totalBuyCost:0,totalPrizeWon:0,totalAttachedCost:0,
      netAmount:0,detailedMenus:[],attachedItems:[],
      ...slotMatches.get(key(finance.customerName)),finance,financePeriod:summary.period
    }));
  }
};
