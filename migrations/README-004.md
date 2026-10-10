# Túi mù: mỗi slot 3 món, shop thu lại đồ và quyết toán chung

Chạy `004_blind_bag_three_products.sql` trong Supabase SQL Editor của dự án.
Migration có thể chạy lại, không xóa dữ liệu. Đợt cũ giữ 1 món/slot; đợt mới dùng 15 slot và 45 món.
Nếu chưa chạy migration 003 cho giá tùy chỉnh, chạy `003_blind_bag_custom_price.sql` trước.

## Admin thao tác

1. Mỹ phẩm bán lẻ → Túi mù → Tạo đợt mới. Chọn đủ 45 món, có thể lặp loại sản phẩm.
2. Bán slot như trước. Một khách mua nhiều slot sẽ nhận 3 món cho mỗi slot.
3. Khi đủ 15 slot, bốc thăm offline. Chọn 3 sản phẩm thực tế của mỗi slot, bấm **Lưu sản phẩm**.
4. Nếu khách pass đồ, bấm **Shop thu lại đồ**, đánh dấu 1, 2 hoặc cả 3 món rồi xác nhận.
   Tiền thu lại lấy từ giá bán hiện tại trong danh mục và lưu cố định trên phiếu.
   Một món không được pass hai lần. Phiếu nhập nhầm có thể hủy, vẫn giữ lịch sử.
5. Tab **Người mua & Hóa đơn** → đánh dấu **Khách đã trả tiền** khi xác nhận đã nhận đủ tiền hóa đơn.
   Hóa đơn cũ chưa có trạng thái cũng được xem là chưa xác nhận trả tiền; admin cần đối chiếu lại.
6. Tab **Thống kê & Xuất file** → **Quyết toán chung: Bàn kèo + Túi mù + Pass** → **Xuất Excel tổng hợp**.

Số cuối = Số dư bàn kèo − Hóa đơn Túi mù còn thiếu + Tiền pass.
Số dương: shop trả khách. Số âm: khách trả shop.
Tên khách được đối chiếu theo chữ hoa/thường và khoảng trắng; giữ dấu tiếng Việt để không gộp nhầm người.
Nhập cùng tên cho khách ở bàn kèo và Túi mù.

Báo cáo chung gồm toàn bộ dữ liệu đã lưu, cả chuyến bàn kèo chưa chốt. Tiền pass là khoản ghi có,
không phải xác nhận đã chuyển tiền cho khách. Các báo cáo riêng menu/chuyến vẫn giữ phạm vi bàn kèo.
Hóa đơn bán lẻ không kèm Túi mù không thuộc báo cáo chung này.
