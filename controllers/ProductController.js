/**
 * CONTROLLER LAYER: Điều khiển danh mục sản phẩm mỹ phẩm
 */
const ProductModel = require('../models/ProductModel');

const ProductController = {
  async getProducts(req, res) {
    try {
      const items = await ProductModel.getAll();
      res.json({ success: true, data: items });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  async addProduct(req, res) {
    try {
      const { name, price, image_url } = req.body;
      const created = await ProductModel.addProduct({ name, price: Number(price), image_url });
      res.json({ success: true, data: created });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const { name, price, image_url } = req.body;
      const updated = await ProductModel.updateProduct(id, { name, price: Number(price), image_url });
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      await ProductModel.deleteProduct(id);
      res.json({ success: true, message: 'Đã xóa sản phẩm thành công' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = ProductController;
