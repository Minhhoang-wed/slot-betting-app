/**
 * CONFIG LAYER: Khởi tạo kết nối Supabase Client
 */
const { createClient } = require('@supabase/supabase-js');
const env = require('./env.config');

let supabase = null;

if (env.isSupabaseConfigured()) {
  try {
    supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false }
    });
    console.log('✅ Đã kết nối thành công tới Supabase Database:', env.supabaseUrl);
  } catch (err) {
    console.error('❌ Lỗi khởi tạo Supabase Client:', err.message);
  }
} else {
  console.log('⚠️ CHÚ Ý: Chưa cấu hình Supabase URL & Key trong file .env');
  console.log('👉 Hệ thống đang tự động kích hoạt chế độ "In-Memory / Local Storage Mock" để chạy thử nghiệm.');
  console.log('👉 Hãy mở file .env và điền SUPABASE_URL, SUPABASE_ANON_KEY để kết nối DB thật.');
}

module.exports = {
  supabase,
  isConfigured: () => env.isSupabaseConfigured()
};
