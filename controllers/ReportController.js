/**
 * CONTROLLER LAYER: Điều khiển Thống kê dữ liệu & Xuất Báo Cáo File Excel (CSV)
 */
const ReportModel = require('../models/ReportModel');
const GameModel = require('../models/GameModel');
const reportWorkbook = require('../services/reportWorkbookService');
const FinanceModel = require('../models/FinanceModel');
const { forCustomer } = require('../services/customerFinanceService');
const { resolvePeriod } = require('../services/financePeriodService');
const { key } = require('../views/js/settlement-core');

async function sendWorkbook(res, workbook, name, reportDate) {
  const date = reportDate || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'});
  const filename = `${name}_${date}.xlsx`;
  const bytes = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="Bao_cao_${date}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(Buffer.from(bytes));
}

const ReportController = {
  async getFinance(req,res) {
    try {resolvePeriod(req.query.date);res.json({success:true,data:await FinanceModel.getSummary({date:req.query.date})});}
    catch(err){res.status(err.status||503).json({success:false,error:err.message});}
  },
  async downloadFinance(req,res) {
    try {resolvePeriod(req.query.date);const data=await FinanceModel.getSummary({date:req.query.date});await sendWorkbook(res,reportWorkbook.finance(data),'Quyet_toan_ban_keo_tui_mu_pass',data.period?.date||'tat_ca');}
    catch(err){res.status(err.status||503).json({success:false,error:err.message});}
  },
  async downloadCustomerFinance(req,res) {
    try {
      const name=req.query.name;
      if (typeof name!=='string' || !key(name)) return res.status(400).json({success:false,error:'Vui lòng chọn khách cần xuất file.'});
      resolvePeriod(req.query.date);
      const data=forCustomer(await FinanceModel.getSummary({date:req.query.date}),name);
      if (!data) return res.status(404).json({success:false,error:'Không tìm thấy khách hàng. Hãy làm mới danh sách và chọn lại.'});
      const customerName=data.customers[0].customerName;
      const safeName=customerName.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').trim().slice(0,80);
      await sendWorkbook(res,reportWorkbook.finance(data,{customerName}),`Quyet_toan_${safeName}`,data.period?.date||'tat_ca');
    } catch(err){res.status(err.status||503).json({success:false,error:err.message});}
  },
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
      const data = await FinanceModel.searchCustomers(name);
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  },

  // Tải file CSV báo cáo của 1 Menu cụ thể
  async downloadMenuCsv(req, res) {
    try {
      const { menuId } = req.params;
      if (req.query?.format === 'xlsx') return await sendWorkbook(res,reportWorkbook.menu(await ReportModel.getCustomerStatsByMenu(menuId)),'Bao_cao_menu');
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
      if (req.query?.format === 'xlsx') return await sendWorkbook(res,reportWorkbook.all(await ReportModel.getAllCustomersSummary()),'Tong_hop_thu_va_tra');
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
      if (req.query?.format === 'xlsx') return await sendWorkbook(res,reportWorkbook.history(await GameModel.getAllRounds(menuId || null)),'Lich_su_cac_chuyen');
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

      if (req.query?.format === 'xlsx') {
        const matches = await ReportModel.searchCustomer(customerName);
        const customer = (matches || []).find(c=>key(c.customerName)===key(customerName));
        return await sendWorkbook(res,reportWorkbook.customer(customer,attachedProducts),`Khach_${customerName}`);
      }

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
  },

  async downloadRoundWorkbook(req,res) {
    try {
      const {menuId,roundNumber}=req.query;
      if (!menuId || !Number.isInteger(Number(roundNumber)) || Number(roundNumber)<1) throw new Error('Chọn menu và chuyến trước khi xuất file');
      const game=await GameModel.getCurrentGame(menuId,Number(roundNumber));
      if (!game.finishedResults?.length) throw new Error('Chưa lưu kết quả chuyến. Hãy chốt chuyến trước khi xuất file');
      await sendWorkbook(res,reportWorkbook.round(game),`Chuyen_${game.roundNumber}`);
    }catch(err){res.status(400).json({success:false,error:err.message});}
  }
};

module.exports = ReportController;
