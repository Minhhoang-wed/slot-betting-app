/**
 * SERVICE LAYER: Tạo mã VietQR tự động theo chuẩn Napas 247
 */
const shopConfig = require('../config/shop.config');

const vietQrService = {
  /**
   * Tạo link ảnh QR VietQR động
   * @param {number} amount - Số tiền cần thanh toán
   * @param {string} content - Nội dung chuyển khoản
   * @param {object} customBank - Thông tin ngân hàng ghi đè nếu có
   */
  generateQrUrl(amount, content, customBank = null) {
    const bank = customBank || shopConfig;
    const cleanAmount = Math.max(0, Math.round(amount));
    const cleanContent = (content || 'THANH TOAN').replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase();
    
    // API VietQR chuẩn ảnh compact2
    return `https://img.vietqr.io/image/${bank.bankCode}-${bank.accountNumber}-compact2.png?amount=${cleanAmount}&addInfo=${encodeURIComponent(cleanContent)}&accountName=${encodeURIComponent(bank.accountOwner)}`;
  }
};

module.exports = vietQrService;
