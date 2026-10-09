/**
 * ENTRY POINT: Khởi chạy Express Server
 * Kiến trúc MVC + Supabase Backend
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const env = require('./config/env.config');
const apiRoutes = require('./routes/api.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ thư mục giao diện Views tĩnh
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, 'views', 'css')));
app.use(express.static(path.join(__dirname, 'views', 'js')));

// Gắn API Routes
app.use('/api', (req,res,next)=>{res.set('Cache-Control','no-store');next();}, apiRoutes);

// Phục vụ trang chủ Web (index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Khởi chạy server nếu chạy trực tiếp (Local, VPS, Docker, Render)
const PORT = env.port || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🚀 LUCKY SLOT & SHOP PRO (MVC ARCHITECTURE)`);
    console.log(`🌐 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`📂 Trạng thái Supabase: ${env.isSupabaseConfigured() ? '✅ ĐÃ KẾT NỐI DB' : '⚠️ CHẾ ĐỘ MOCK (CHƯA ĐIỀN KEY)'}`);
    console.log('====================================================');
  });
}

// Export app cho môi trường Serverless (Vercel)
module.exports = app;
