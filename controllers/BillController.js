/**
 * CONTROLLER LAYER: Điều khiển nghiệp vụ Hóa đơn (Bills)
 */
const BillModel = require('../models/BillModel');
const shopConfig = require('../config/shop.config');

const BillController = {
  // Tạo bill mới
  async createBill(req, res) {
    try {
      const billData = req.body;
      const bill = await BillModel.createBill(billData);
      res.json({ success: true, data: bill, shop: shopConfig });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Lấy danh sách bills
  async getBills(req, res) {
    try {
      const bills = await BillModel.getRecentBills();
      res.json({ success: true, data: bills });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Lấy thông tin shop cấu hình
  getShopConfig(req, res) {
    res.json({ success: true, data: shopConfig });
  }
};

module.exports = BillController;
