/**
 * CONTROLLER LAYER: Điều khiển các hành động liên quan đến Menu Kèo
 */
const MenuModel = require('../models/MenuModel');

const MenuController = {
  // Lấy toàn bộ danh sách Menu
  async getMenus(req, res) {
    try {
      const menus = await MenuModel.getAllMenus();
      res.json({ success: true, data: menus });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Tạo Menu mới
  async createMenu(req, res) {
    try {
      const newMenu = await MenuModel.createMenu(req.body);
      res.json({ success: true, message: 'Đã tạo Menu mới thành công', data: newMenu });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Sửa Menu
  async updateMenu(req, res) {
    try {
      const updated = await MenuModel.updateMenu(req.params.id, req.body);
      res.json({ success: true, message: 'Đã cập nhật Menu thành công', data: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Xóa Menu
  async deleteMenu(req, res) {
    try {
      await MenuModel.deleteMenu(req.params.id);
      res.json({ success: true, message: 'Đã xóa Menu thành công' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
};

module.exports = MenuController;
