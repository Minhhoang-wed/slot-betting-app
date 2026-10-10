# 🎰 LUCKY SLOT & SHOP PRO V2.5 (KIẾN TRÚC MVC + SUPABASE)

## Chốt theo slot thắng trên phiếu

1. Điền khách mua vào từng slot như bình thường.
2. Trong **Chọn Slot Thắng & Chốt Kết Quả**, bấm đúng từng số slot thắng trên phiếu. Không giới hạn số khách hoặc số slot thắng.
3. Kiểm tra tiền thưởng và chọn trạng thái tiền slot của người thắng. **Chưa trả** trừ tất cả slot đã mua; **Đã trả** không trừ lại tiền slot của người thắng. Người không thắng vẫn có tiền slot cần trả.
4. Bấm **Chốt kết quả · Lưu lịch sử** rồi xuất Excel. Các lựa chọn trước khi chốt chỉ là bản xem trước.

Ví dụ tổng giải 1.200.000đ, Mayne mua slot #2 và #9 nhưng chỉ #2 thắng; Freefire thắng #4 và #6: chọn #2, #4, #6. Mỗi slot thắng nhận 400.000đ, Mayne nhận thưởng 400.000đ, Freefire 800.000đ. Nếu mỗi khách chưa trả 2 slot × 135.000đ, thực nhận tương ứng 130.000đ và 530.000đ. Slot chung chia tiền thưởng của chính slot đó theo tỷ lệ sở hữu.

Lịch sử và Excel lưu riêng slot đã mua, slot thắng và tiền thưởng. Kết quả cũ giữ số tiền đã lưu và ghi rõ nếu chưa lưu số slot thắng; admin có thể chọn lại slot rồi chốt để sửa. Bản cập nhật này không cần migration SQL mới, dùng JSON `finished_results` hiện có sau migration `002_durable_rounds.sql`. Dữ liệu thay đổi sau lúc tải chuyến sẽ yêu cầu tải lại trước khi chốt.

Kiểm thử giao diện riêng bằng `node scripts/preview-winning-slots.cjs --serve --port=3114`. Script dùng bộ nhớ riêng, chặn Supabase và không ghi đè dữ liệu thật.

## Túi mù trong Mỹ phẩm bán lẻ

- Mỗi đợt gồm **15 slot, 414.000đ/slot**, độc lập với bàn kèo, người thắng và quyết toán thưởng.
- Trong tab **Mỹ Phẩm Bán Lẻ**, kéo xuống **TÚI MÙ**, mở **Tạo đợt túi mù mới** và chọn 15 đơn vị sản phẩm trong danh mục. Một loại có thể xuất hiện nhiều lần nếu có đủ hàng thực tế.
- Thêm số slot vào giỏ cùng mỹ phẩm (hoặc mua riêng slot), nhập tên khách và xuất hóa đơn. Chỉ khi máy chủ ghi nhận thành công, slot mới được bán. Danh sách tổng hợp theo tên khách và số điện thoại; tên giống nhau nhưng khác số điện thoại là hai khách.
- Khi đủ 15 slot, shop bốc **50 phiếu offline**. Hệ thống chỉ lưu sản phẩm nhận của từng slot, mỗi đơn vị sản phẩm được gán một lần. Có thể bỏ gán để sửa kết quả.
- Đợt cũ và hóa đơn được giữ lại trong bộ chọn đợt. Đơn có túi mù lưu cả mỹ phẩm mua chung và giảm giá; có thể mở lại hóa đơn mà không mua thêm slot. Slot túi mù không đưa vào báo cáo kèo.
- Đơn đang chờ phản hồi được lưu mã trong sessionStorage của tab; bấm **Kiểm tra / xuất lại hóa đơn** để gửi lại cùng mã, tránh mua trùng.

### Cập nhật cơ sở dữ liệu đang sử dụng

Chạy **chỉ** file `migrations/001_blind_bags.sql` trong Supabase SQL Editor để thêm bảng riêng. Migration này không xóa dữ liệu hiện có. **Không chạy lại `schema.sql` trên dữ liệu thật** vì file đó có lệnh DROP TABLE. Với cài đặt mới, chạy migration sau schema.

Khi Supabase đã cấu hình mà bảng mới chưa có hoặc kết nối lỗi, Túi mù báo lỗi thay vì ghi vào bộ nhớ tạm. Nếu chưa cấu hình Supabase, tính năng chạy thử trong RAM, có thông báo trên giao diện, và mất dữ liệu khi máy chủ khởi động lại. Migration giữ mô hình quyền truy cập hiện tại của ứng dụng.

Chạy `npm test` để kiểm tra giới hạn slot, mua chung mỹ phẩm, gửi trùng đơn, mua đồng thời, gán kết quả và lỗi lưu dữ liệu.

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
