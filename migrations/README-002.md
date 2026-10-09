# Cập nhật lưu lịch sử chuyến

## Thứ tự áp dụng

1. Mở Supabase của website → SQL Editor → New query.
2. Sao chép toàn bộ `migrations/002_durable_rounds.sql` và bấm Run.
3. Sau khi SQL chạy thành công, triển khai bản code đã sửa lên Vercel.
4. Tải lại website để lấy JavaScript mới.

Chỉ chạy file migration 002 này. **Không chạy `schema.sql`** vì file đó có lệnh xóa bảng cũ. Migration 002 thêm cột, hàm và trigger; không xóa các giao dịch đã lưu. Có thể chạy lại migration 002.

## Kiểm tra sau triển khai

- Tạo chuyến thử, gán khách, đổi giá riêng của chuyến rồi tải lại: giá và khách phải còn.
- Chốt chuyến bằng nút tính kết quả: chuyến phải xuất hiện trong lịch sử sau khi tải lại và mở bằng phiên trình duyệt khác.
- Chuyển sang chuyến tiếp theo: lịch sử chuyến cũ phải còn. Gửi lại yêu cầu mở chuyến tiếp theo không tạo thêm chuyến trùng.
- Xuất CSV khách: tiền ghế, tiền thưởng và số dư phải khớp kết quả đã lưu.
- Nếu DB lỗi, giao diện phải báo lỗi; không được hiện lưu thành công.

Ghế chung phải nhập tỷ lệ rõ ràng, ví dụ `Ngọc=50; Bàn Tay=50`. Tên có dấu cộng nhưng không có tỷ lệ vẫn là một tên nhóm, không tự chia.

## Giới hạn khôi phục

Dữ liệu từng chỉ nằm trong RAM của server cũ và chưa ghi vào Supabase không thể được khôi phục bằng migration. Những chuyến còn trong DB được giữ lại; chuyến đang mở chưa có kết quả chốt không được tính là lịch sử quyết toán.

## Kết quả kiểm thử bản sửa

- `npm test`: 13/13 đạt, gồm migration trên PostgreSQL thử nghiệm, chạy SQL hai lần, rollback khi lỗi, chống dữ liệu cũ và chống mở chuyến trùng.
- `node scripts/audit-full-flow.cjs`: 18/18 đạt với model/controller thật và DB mô phỏng độc lập.
- `node scripts/audit-customer-session.cjs`: tổng menu và tiền ghế Kiều khớp dữ liệu khách gửi.
- Giao diện thử nghiệm: chốt chuyến, ghế chung, báo cáo và lịch sử sau tải lại hoạt động.

Các kết quả này thay thế trạng thái lỗi trước sửa trong `scripts/QA-2026-10-10.md`. Chưa xác nhận bản sửa trên web thật trước khi chạy SQL và triển khai code.
