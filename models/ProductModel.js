/**
 * MODEL LAYER: Quản lý danh mục sản phẩm Mỹ Phẩm
 */
const { supabase, isConfigured } = require('../services/durableDatabase');

let inMemoryProducts = [
  { id: 1, name: "Son YSL Rouge Pur Couture #01", price: 850000, image_url: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300" },
  { id: 2, name: "Serum Phục Hồi La Roche-Posay B5", price: 420000, image_url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300" },
  { id: 3, name: "Nước Hoa Chanel Coco Mademoiselle 50ml", price: 2950000, image_url: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=300" },
  { id: 4, name: "Kem Chống Nắng Anessa Perfect UV 60ml", price: 460000, image_url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300" },
  { id: 5, name: "Phấn Phủ Bột Kiềm Dầu Laura Mercier", price: 920000, image_url: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=300" },
  { id: 6, name: "Nước Tẩy Trang Bioderma Hồng 500ml", price: 380000, image_url: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300" }
];

const ProductModel = {
  async getAll() {
    if (isConfigured() && supabase) {
      const { data } = await supabase.from('products').select('*').order('id');
      if (data) return data;
    }
    return inMemoryProducts;
  },

  async addProduct(product) {
    if (isConfigured() && supabase) {
      const { data } = await supabase.from('products').insert(product).select().single();
      if (data) return data;
    }
    const newP = { id: Date.now(), ...product };
    inMemoryProducts.push(newP);
    return newP;
  },

  async updateProduct(id, product) {
    const numId = Number(id);
    if (isConfigured() && supabase) {
      const { data, error } = await supabase
        .from('products')
        .update({
          name: product.name,
          price: Number(product.price),
          image_url: product.image_url
        })
        .eq('id', numId)
        .select()
        .single();
      if (!error && data) return data;
    }
    const idx = inMemoryProducts.findIndex(p => p.id === numId);
    if (idx !== -1) {
      inMemoryProducts[idx] = { ...inMemoryProducts[idx], ...product, price: Number(product.price) };
      return inMemoryProducts[idx];
    }
    throw new Error('Không tìm thấy sản phẩm');
  },

  async deleteProduct(id) {
    const numId = Number(id);
    if (isConfigured() && supabase) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', numId);
      if (!error) return true;
    }
    inMemoryProducts = inMemoryProducts.filter(p => p.id !== numId);
    return true;
  }
};

module.exports = ProductModel;
