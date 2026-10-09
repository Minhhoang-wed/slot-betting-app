/**
 * CONTROLLER LAYER: Điều khiển nghiệp vụ Hóa đơn (Bills)
 */
const BillModel = require('../models/BillModel');
const shopConfig = require('../config/shop.config');
const ProductModel = require('../models/ProductModel');

const BillController = {
  // Tạo bill mới
  async createBill(req, res) {
    try {
      let billData = req.body;
      if (billData.type === 'retail') {
        if (!/^[0-9a-f-]{36}$/i.test(billData.requestId || '') || !Array.isArray(billData.items) || !billData.items.length) throw new Error('Giỏ hàng hoặc mã yêu cầu không hợp lệ');
        const products = await ProductModel.getAll();
        const attachedProducts = billData.items.map(item => {
          const product = products.find(p => String(p.id) === String(item.productId));
          if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('Sản phẩm hoặc số lượng không hợp lệ');
          return { productId:product.id, name:product.name, price:Number(product.price), qty:item.quantity };
        });
        const subtotal = attachedProducts.reduce((sum,p) => sum+p.price*p.qty,0);
        if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(billData.discount) || billData.discount < 0 || billData.discount > subtotal) throw new Error('Giảm giá không hợp lệ');
        billData = { customerName:String(billData.customerName || '').trim(), gameName:'Mỹ phẩm bán lẻ',
          requestId:billData.requestId, attachedProducts, attachedTotalCost:subtotal,
          netAmount:-(subtotal-billData.discount) };
        if (!billData.customerName) throw new Error('Thiếu tên khách');
      }
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
