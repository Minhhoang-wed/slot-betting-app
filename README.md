# 🎰 LUCKY SLOT & SHOP PRO V2.5 (KIẾN TRÚC MVC + SUPABASE)

Hệ thống quản lý **Kèo Livestream Đa Menu (150K, 200K, 100K, 300K VIP...)**, điều hành **Nhiều Chuyến (Rounds)** liên tục, tự động tích lũy số slot của từng khách hàng và **Xuất Báo Cáo Excel (CSV UTF-8 BOM chuẩn tiếng Việt 100%)** cho Admin chốt sổ.

---

## 🌟 TÍNH NĂNG NÂNG CẤP MỚI V2.5 (THEO YÊU CẦU LIVESTREAM)

1. **Quản Lý Đa Menu Kèo (Multi-Menu)**:
   - Chạy đồng thời nhiều Menu: **Menu Kèo 150K**, **Menu Kèo 200K**, **Menu Kèo 100K**, **Menu Kèo 300K VIP**...
   - Tự do thêm menu mới linh hoạt với giá slot, số slot bàn đấu và tổng giải thưởng tùy ý.
   - Chuyển đổi giữa các Menu trên giao diện chỉ với 1 click, giữ nguyên trạng thái từng bàn cược.

2. **Quản Lý Nhiều Chuyến (Multi-Round / Chuyến Kèo)**:
   - Mỗi Menu chạy liên tục nhiều Chuyến: Chuyến #1, Chuyến #2, Chuyến #3...
   - Nút **"Chốt & Mở Chuyến Mới"**: Lưu kết quả chuyến hiện tại vào lịch sử và tự động làm sạch bàn cược để bắt đầu chuyến tiếp theo cho khách chơi.
   - Xem lại lịch sử chi tiết từng chuyến đã kết thúc (ai thắng, giải thưởng bao nhiêu).

3. **Tích Lũy Thống Kê Theo Từng Khách Hàng (Customer Aggregation)**:
   - Trả lời tức thì câu hỏi: **"Khách A đã vô bao nhiêu slot ở Menu 150K?"**
   - Xem chi tiết khách A đã mua những chuyến nào (Chuyến 1: 2 slot, Chuyến 2: 3 slot...), tổng tiền cược, tổng tiền thưởng, và số tiền thực tế (Net).
   - Ô tra cứu thông minh: Gõ tên khách (vd: "Người A") để xem bảng phân tích toàn diện khách đó qua mọi Menu.

4. **Trung Tâm Xuất Báo Cáo File Excel (CSV UTF-8 BOM Chuẩn Tiếng Việt)**:
   - 📥 **Xuất File Riêng Cho Từng Menu**: File Excel riêng cho Menu 150K (gồm bảng tổng hợp từng khách và chi tiết từng chuyến).
   - 📥 **Xuất Báo Cáo Tổng Hợp Tất Cả Menu**: Bảng ma trận toàn bộ khách hàng x tất cả các Menu trong buổi live.
   - 📥 **Xuất File Lịch Sử Từng Chuyến**: Chi tiết từng ô slot của mọi ván đấu.
   - Mở bằng Microsoft Excel hoặc Google Sheets chuẩn 100% không bị vỡ font hay lỗi dấu tiếng Việt.

---

## 📁 CẤU TRÚC DỰ ÁN CHUẨN MVC

```text
D:\slot-betting-app\
├── .env                     <-- Cấu hình SUPABASE_URL, SUPABASE_ANON_KEY & Shop VietQR
├── schema.sql               <-- File SQL tạo bảng tự động trên Supabase (menus, games, slots, bills)
├── server.js                <-- Entry point khởi chạy server Express
├── package.json
│
├── config/
│   ├── env.config.js        <-- Đọc và kiểm tra biến môi trường
│   ├── supabase.config.js   <-- Kết nối Supabase Client
│   └── shop.config.js       <-- Cấu hình thông tin Shop & STK VietQR
│
├── models/
│   ├── MenuModel.js         <-- [MỚI] Quản lý danh mục Menu kèo (150k, 200k, 100k...)
│   ├── GameModel.js         <-- [NÂNG CẤP] Quản lý ván đấu theo Menu, từng Chuyến & lưu lịch sử
│   ├── ReportModel.js       <-- [MỚI] Thống kê tích lũy khách hàng & sinh file Excel/CSV UTF-8
│   ├── SlotModel.js         <-- Quản lý từng ô slot bàn cược
│   ├── SettlementModel.js   <-- Xử lý Solo Win, Chia 2, Chia 3
│   ├── BillModel.js         <-- Quản lý hóa đơn riêng kèm mã VietQR
│   └── ProductModel.js      <-- Quản lý mỹ phẩm bán lẻ
│
├── controllers/
│   ├── MenuController.js    <-- [MỚI] Điều khiển API danh mục Menu
│   ├── ReportController.js  <-- [MỚI] Điều khiển API thống kê & tải file CSV báo cáo
│   ├── GameController.js    <-- Điều khiển bàn cược, chuyển menu, sang chuyến mới
│   ├── SettlementController.js
│   ├── BillController.js
│   └── ProductController.js
│
├── routes/
│   └── api.routes.js        <-- Định tuyến toàn bộ RESTful API
│
└── views/
    ├── index.html           <-- Giao diện Luxury Dark Neon (Kèo Slot, Báo Cáo Excel, Mỹ Phẩm, Settings)
    ├── css/style.css        <-- Phong cách thiết kế hiện đại
    └── js/app.js            <-- Logic Frontend & Audio Synthesizer
```

---

## ⚡ HƯỚNG DẪN KẾT NỐI SUPABASE & CHẠY ỨNG DỤNG

### Bước 1: Khởi tạo Database trên Supabase
1. Vào [Supabase Dashboard](https://supabase.com) -> Mở dự án của bạn -> Chọn mục **SQL Editor**.
2. Mở file `schema.sql` trong thư mục dự án, copy toàn bộ nội dung và bấm nút **Run**.
3. Bảng `menus`, `games`, `slots`, `bills`, `products` sẽ được tạo và cập nhật đầy đủ.

### Bước 2: Cấu hình file `.env`
Điền thông tin kết nối Supabase vào file `.env`:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
```

### Bước 3: Chạy ứng dụng
Mở terminal tại thư mục `D:\slot-betting-app`:
```bash
npm start
```
Truy cập trình duyệt: 👉 **`http://localhost:3000`**

*(Hệ thống hỗ trợ cơ chế kép: Vừa lưu trữ trực tiếp vào Supabase, vừa có Fallback In-Memory an toàn 100% nếu chưa cấu hình DB).*
