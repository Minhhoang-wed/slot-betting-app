/**
 * CONFIG LAYER: Cấu hình thông tin Shop & Ngân hàng nhận thanh toán VietQR
 */
require('dotenv').config();

const shopConfig = {
  name: process.env.SHOP_NAME || 'NGỌC COSMETICS & LUCKY GAME',
  phone: process.env.SHOP_PHONE || '0988 123 456',
  bankCode: process.env.SHOP_BANK_CODE || 'MB',
  bankName: process.env.SHOP_BANK_NAME || 'MB Bank (Quân Đội)',
  accountNumber: process.env.SHOP_BANK_ACCOUNT || '999988886666',
  accountOwner: process.env.SHOP_BANK_OWNER || 'DUONG THI KHANH NGOC',
  billFooter: 'Cảm ơn quý khách đã tham gia và ủng hộ Shop! Vui lòng chuyển khoản đúng nội dung.'
};

module.exports = shopConfig;
