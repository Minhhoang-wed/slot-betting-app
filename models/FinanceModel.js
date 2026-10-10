const Report = require('./ReportModel');
const BlindBag = require('./BlindBagModel');
const { summarize } = require('../services/customerFinanceService');
module.exports={
  async getSummary(options={}) {
    const [slotReport,rounds]=await Promise.all([Report.getAllCustomersSummary(),BlindBag.list()]);
    return summarize(slotReport,rounds,options);
  }
};
