const { supabase, isConfigured } = require('../config/supabase.config');
const ProductModel = require('./ProductModel');
const { createBlindBagService, createMemoryStore } = require('../services/blindBagService');

function unwrap({ data, error }) {
  // Never silently fall back to memory when a configured database fails.
  if (error) {
    if (error.code === '23514') {
      throw Object.assign(new Error('Giá túi mù tùy chỉnh yêu cầu cập nhật cơ sở dữ liệu. Vui lòng chạy migrations/003_blind_bag_custom_price.sql trong Supabase SQL Editor.'), { status: 400 });
    }
    throw Object.assign(new Error('Không thể lưu/đọc túi mù. Kiểm tra kết nối và chạy migration 001_blind_bags.sql.'), { status: 503 });
  }
  return data;
}
const databaseStore = {
  async list() { return unwrap(await supabase.from('blind_bag_rounds').select('*').order('created_at', { ascending: false })); },
  async get(id) { return unwrap(await supabase.from('blind_bag_rounds').select('*').eq('id', id).maybeSingle()); },
  async create(row) { return unwrap(await supabase.from('blind_bag_rounds').insert(row).select().single()); },
  async save(row, version) {
    const saved = unwrap(await supabase.from('blind_bag_rounds').update({ data: row.data, version: version + 1 })
      .eq('id', row.id).eq('version', version).select('id'));
    if (!saved.length) return false;
    row.version = version + 1;
    return true;
  }
};
const persistent = isConfigured();
const catalog = {
  async getAll() {
    if (!persistent) return ProductModel.getAll();
    // A missing/failed catalog must never turn into demo products for a real sale.
    return unwrap(await supabase.from('products').select('*').order('id'));
  }
};
const service = createBlindBagService(persistent ? databaseStore : createMemoryStore(), catalog);
module.exports = { ...service, persistent };
