/**
 * MODEL LAYER: Quản lý Hóa đơn (Bills / File Beal)
 */
const { supabase, isConfigured } = require('../services/durableDatabase');
const vietQrService = require('../services/vietQrService');
const shopConfig = require('../config/shop.config');

let inMemoryBills = [];
const sameItems = (a, b) => JSON.stringify((a || []).map(p=>[p.productId,p.name,Number(p.price),Number(p.qty)])) === JSON.stringify((b || []).map(p=>[p.productId,p.name,Number(p.price),Number(p.qty)]));

const BillModel = {
  /**
   * Tạo phiếu Bill thanh toán riêng cho từng khách
   */
  async createBill(billData) {
    const billCode = 'BILL-' + (billData.requestId || require('crypto').randomUUID());
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
      attached_products: billData.attachedProducts || [],
      attached_total_cost: billData.attachedTotalCost || 0,
      net_amount: billData.netAmount || 0,
      qr_url: qrUrl,
      status: 'pending',
      created_at: new Date()
    };

    if (isConfigured() && supabase) {
      const { data: existing } = await supabase.from('bills').select('*').eq('bill_code', billCode).maybeSingle();
      if (existing) {
        if (existing.customer_name !== newBill.customer_name || Number(existing.net_amount) !== newBill.net_amount || !sameItems(existing.attached_products,newBill.attached_products)) throw new Error('Mã yêu cầu đã được dùng cho giỏ khác');
        return existing;
      }
      let result;
      try { result = await supabase
        .from('bills')
        .insert(newBill)
        .select()
        .single(); }
      catch (error) {
        if (!billData.requestId) throw error;
        const { data: retry } = await supabase.from('bills').select('*').eq('bill_code',billCode).maybeSingle();
        if (!retry || retry.customer_name !== newBill.customer_name || Number(retry.net_amount) !== newBill.net_amount || !sameItems(retry.attached_products,newBill.attached_products)) throw error;
        return retry;
      }
      const { data, error } = result;

      if (!error && data) return data;
    }

    const existing = inMemoryBills.find(b=>b.bill_code === billCode);
    if (existing) return existing;
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
