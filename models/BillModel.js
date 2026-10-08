/**
 * MODEL LAYER: Quản lý Hóa đơn (Bills / File Beal)
 */
const { supabase, isConfigured } = require('../config/supabase.config');
const vietQrService = require('../services/vietQrService');
const shopConfig = require('../config/shop.config');

let inMemoryBills = [];

const BillModel = {
  /**
   * Tạo phiếu Bill thanh toán riêng cho từng khách
   */
  async createBill(billData) {
    const billCode = 'BILL-' + Date.now().toString().slice(-6);
    const qrUrl = billData.netAmount < 0 
      ? vietQrService.generateQrUrl(Math.abs(billData.netAmount), `SLOT ${billData.customerName}`)
      : null;

    const newBill = {
      bill_code: billCode,
      game_id: billData.gameId || null,
      customer_name: billData.customerName,
      game_name: billData.gameName,
      slot_count: billData.slotCount || 0,
      slots_list: billData.slotsList || [],
      buy_cost: billData.buyCost || 0,
      prize_won: billData.prizeWon || 0,
      net_amount: billData.netAmount || 0,
      qr_url: qrUrl,
      status: 'pending',
      created_at: new Date()
    };

    if (isConfigured() && supabase) {
      const { data, error } = await supabase
        .from('bills')
        .insert(newBill)
        .select()
        .single();

      if (!error && data) return data;
    }

    inMemoryBills.unshift(newBill);
    return newBill;
  },

  /**
   * Lấy danh sách bills gần nhất
   */
  async getRecentBills() {
    if (isConfigured() && supabase) {
      const { data } = await supabase
        .from('bills')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) return data;
    }
    return inMemoryBills;
  }
};

module.exports = BillModel;
