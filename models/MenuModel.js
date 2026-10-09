/**
 * MODEL LAYER: Quản lý danh mục các Menu Kèo (150K, 200K, 100K, 300K...)
 * Dùng Supabase khi đã cấu hình; bộ nhớ cục bộ chỉ dùng cho thử nghiệm.
 */
const { supabase, isConfigured } = require('../services/durableDatabase');

// Danh sách Menu mặc định
let inMemoryMenus = [
  {
    id: 'menu-150k',
    code: 'MENU_150K',
    name: 'Menu Kèo 150K',
    slot_price: 150000,
    total_slots: 12,
    prize_value: 1500000,
    description: 'Kèo phổ thông 150.000 đ/slot - 12 ô (Set Son & Serum)',
    created_at: new Date()
  },
  {
    id: 'menu-200k',
    code: 'MENU_200K',
    name: 'Menu Kèo 200K',
    slot_price: 200000,
    total_slots: 12,
    prize_value: 2000000,
    description: 'Kèo cao cấp 200.000 đ/slot - 12 ô (Set YSL + Serum B5)',
    created_at: new Date()
  },
  {
    id: 'menu-100k',
    code: 'MENU_100K',
    name: 'Menu Kèo 100K',
    slot_price: 100000,
    total_slots: 10,
    prize_value: 900000,
    description: 'Kèo Mini 100.000 đ/slot - 10 ô (Nước Hoa Mini)',
    created_at: new Date()
  },
  {
    id: 'menu-300k',
    code: 'MENU_300K',
    name: 'Menu Kèo 300K VIP',
    slot_price: 300000,
    total_slots: 12,
    prize_value: 3200000,
    description: 'Kèo VIP Luxury 300.000 đ/slot - 12 ô (Trọn Bộ Mỹ Phẩm)',
    created_at: new Date()
  }
];

let menusCache = null;

const MenuModel = {
  /**
   * Lấy danh sách tất cả các Menu (Có Cache tối ưu siêu tốc < 1ms)
   */
  async getAllMenus(forceRefresh = false) {
    if (!isConfigured() && !forceRefresh && menusCache && menusCache.length > 0) {
      return menusCache;
    }

    if (isConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('menus')
          .select('*')
          .order('slot_price', { ascending: true });

        if (!error && data) {
          menusCache = data.map(m => ({
            id: m.id,
            code: m.code,
            name: m.name,
            slot_price: Number(m.slot_price),
            total_slots: Number(m.total_slots || 12),
            prize_value: Number(m.prize_value),
            description: m.description,
            created_at: m.created_at
          }));
          return menusCache;
        }
      } catch (err) { if (isConfigured()) throw err;
        // Fallback in-memory nếu chưa tạo bảng menus trên Supabase
      }
    }
    menusCache = inMemoryMenus;
    return menusCache;
  },

  /**
   * Lấy thông tin Menu theo ID hoặc Code (Siêu tốc < 1ms)
   */
  async getMenuById(idOrCode) {
    const menus = await this.getAllMenus();
    const menu = idOrCode ? menus.find(m => m.id === idOrCode || m.code === idOrCode) : menus[0];
    if (!menu) throw new Error('Không tìm thấy Menu');
    return menu;
  },

  /**
   * Tạo Menu Kèo mới
   */
  async createMenu({ name, slotPrice, totalSlots, prizeValue, description }) {
    const code = 'MENU_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const newMenu = {
      id: 'menu-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      code,
      name: name || `Menu Kèo ${Number(slotPrice).toLocaleString('vi-VN')} đ`,
      slot_price: Number(slotPrice) || 150000,
      total_slots: Number(totalSlots) || 12,
      prize_value: Number(prizeValue) || (Number(slotPrice) * (Number(totalSlots) || 12)),
      description: description || '',
      created_at: new Date()
    };

    if (isConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('menus')
          .insert({
            code: newMenu.code,
            name: newMenu.name,
            slot_price: newMenu.slot_price,
            total_slots: newMenu.total_slots,
            prize_value: newMenu.prize_value,
            description: newMenu.description
          })
          .select()
          .single();

        if (!error && data) {
          menusCache = null;
          return {
            id: data.id,
            code: data.code,
            name: data.name,
            slot_price: Number(data.slot_price),
            total_slots: Number(data.total_slots),
            prize_value: Number(data.prize_value),
            description: data.description,
            created_at: data.created_at
          };
        }
      } catch (err) { if (isConfigured()) throw err;
        // Fallback
      }
    }

    inMemoryMenus.push(newMenu);
    menusCache = null;
    return newMenu;
  },

  /**
   * Cập nhật thông số Menu
   */
  async updateMenu(id, { name, slotPrice, totalSlots, prizeValue, description }) {
    const current = await this.getMenuById(id);
    const changes = {
      name: name === undefined ? current.name : name,
      slot_price: slotPrice === undefined ? current.slot_price : Number(slotPrice),
      total_slots: totalSlots === undefined ? current.total_slots : Number(totalSlots),
      prize_value: prizeValue === undefined ? current.prize_value : Number(prizeValue),
      description: description === undefined ? current.description : description
    };
    if (!Number.isSafeInteger(changes.slot_price) || changes.slot_price < 0 ||
        !Number.isSafeInteger(changes.prize_value) || changes.prize_value < 0 ||
        !Number.isInteger(changes.total_slots) || changes.total_slots < 1 || changes.total_slots > 100) {
      throw new Error('Giá hoặc số ghế không hợp lệ');
    }
    menusCache = null;
    if (isConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('menus')
          .update(changes)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) return data;
      } catch (err) { if (isConfigured()) throw err;}
    }

    const menu = inMemoryMenus.find(m => m.id === id);
    if (menu) {
      Object.assign(menu, changes);
      return menu;
    }
    throw new Error('Không tìm thấy Menu');
  },

  /**
   * Xóa Menu
   */
  async deleteMenu(id) {
    const menus = await this.getAllMenus();
    if (menus.length <= 1) {
      throw new Error('Hệ thống phải có ít nhất 1 Menu kèo!');
    }

    menusCache = null;
    if (isConfigured() && supabase) {
      try {
        await supabase.from('menus').delete().eq('id', id);
      } catch (err) { if (isConfigured()) throw err;}
    }

    inMemoryMenus = inMemoryMenus.filter(m => m.id !== id);
    return true;
  }
};

module.exports = MenuModel;
