/**
 * CONTROLLER LAYER: Điều khiển Thống kê dữ liệu & Xuất Báo Cáo File Excel (CSV)
 */
const ReportModel = require('../models/ReportModel');

const ReportController = {
  // Lấy dữ liệu báo cáo thống kê cho 1 Menu cụ thể
  async getMenuReport(req, res) {
    try {
      const { menuId } = req.params;
      const data = await ReportModel.getCustomerStatsByMenu(menuId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Lấy dữ liệu báo cáo tổng hợp toàn bộ các Menu
  async getAllMenusReport(req, res) {
    try {
      const data = await ReportModel.getAllCustomersSummary();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Tra cứu nhanh lịch sử mua slot của 1 khách hàng
  async searchCustomer(req, res) {
    try {
      const { name } = req.query;
      const data = await ReportModel.searchCustomer(name);
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Tải file CSV báo cáo của 1 Menu cụ thể
  async downloadMenuCsv(req, res) {
    try {
      const { menuId } = req.params;
      const csv = await ReportModel.exportMenuReportCsv(menuId);
      const filename = `Bao_Cao_Menu_${menuId}_${Date.now()}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Tải file CSV báo cáo tổng hợp toàn bộ các Menu
  async downloadAllMenusCsv(req, res) {
    try {
      const csv = await ReportModel.exportAllMenusSummaryCsv();
      const filename = `Bao_Cao_Tong_Hop_Tat_Ca_Menu_${Date.now()}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Tải file CSV chi tiết từng chuyến
  async downloadRoundsCsv(req, res) {
    try {
      const { menuId } = req.query;
      const csv = await ReportModel.exportDetailedRoundsCsv(menuId || null);
      const filename = `Chi_Tiet_Cac_Chuyen_${Date.now()}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Lấy chi tiết toàn bộ lịch sử đa menu, đa chuyến của 1 khách hàng
  async getCustomerDetail(req, res) {
    try {
      const { name } = req.query;
      if (!name) return res.status(400).json({ success: false, error: 'Thiếu tên khách hàng' });
      const data = await ReportModel.searchCustomer(name);
      res.json({ success: true, data: (data && data.length > 0) ? data[0] : null });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Tải file CSV chi tiết theo từng khách hàng (vd: Khách A)
  async downloadCustomerDetailCsv(req, res) {
    try {
      const customerName = req.query.name || (req.body ? req.body.name : '');
      const attachedProducts = req.body && req.body.attachedProducts ? req.body.attachedProducts : [];
      if (!customerName) return res.status(400).json({ success: false, error: 'Thiếu tên khách hàng' });

      const csv = await ReportModel.exportCustomerDetailCsv(customerName, attachedProducts);
      const asciiName = customerName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      const filename = `Chi_Tiet_Khach_${asciiName || 'Khach'}_${Date.now()}.csv`;
      const encodedFilename = encodeURIComponent(`Chi_Tiet_Khach_${customerName}_${Date.now()}.csv`);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = ReportController;
