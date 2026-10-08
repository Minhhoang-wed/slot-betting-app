/**
 * CONFIG LAYER: Đọc và xác thực biến môi trường
 */
require('dotenv').config();

const envConfig = {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  
  // Kiểm tra xem đã điền thông tin Supabase hợp lệ chưa
  isSupabaseConfigured() {
    return (
      Boolean(this.supabaseUrl) &&
      Boolean(this.supabaseAnonKey) &&
      !this.supabaseUrl.includes('your-project-id') &&
      !this.supabaseAnonKey.includes('your-anon-key-here')
    );
  }
};

module.exports = envConfig;
