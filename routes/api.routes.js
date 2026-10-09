/**
 * ROUTE LAYER: Khai báo toàn bộ API Endpoints
 */
const express = require('express');
const router = express.Router();

const GameController = require('../controllers/GameController');
const SettlementController = require('../controllers/SettlementController');
const BillController = require('../controllers/BillController');
const ProductController = require('../controllers/ProductController');
const MenuController = require('../controllers/MenuController');
const ReportController = require('../controllers/ReportController');

// --- MENUS KÈO (150K, 200K, 100K...) ---
router.get('/menus', MenuController.getMenus);
router.post('/menus', MenuController.createMenu);
router.put('/menus/:id', MenuController.updateMenu);
router.delete('/menus/:id', MenuController.deleteMenu);

// --- GAME & SLOTS ENDPOINTS ---
router.get('/game', GameController.getGame);
router.post('/game/switch-menu', GameController.switchMenu);
router.post('/game/switch-round', GameController.switchRound);
router.post('/game/create-round', GameController.createRound);
router.put('/game/round', GameController.updateRound);
router.delete('/game/round', GameController.deleteRound);
router.post('/game/config', GameController.updateConfig);
router.post('/game/reset', GameController.resetGame);
router.post('/game/next-round', GameController.nextRound);
router.get('/game/history', GameController.getRoundHistory);
router.post('/game/slot', GameController.updateSlot);
router.post('/game/slot/add', GameController.addSlot);
router.post('/game/slot/remove', GameController.removeSlot);
router.post('/game/quick-register', GameController.quickRegister);
router.post('/game/remove-player', GameController.removePlayer);
router.post('/game/finalize', GameController.finalizeGame);

// --- SETTLEMENT (CHỐT WINNER & CHIA THƯỞNG 2/3) ---
router.post('/settle', SettlementController.settle);

// --- THỐNG KÊ & XUẤT BÁO CÁO FILE EXCEL (CSV UTF-8 BOM) ---
router.get('/reports/menu/:menuId', ReportController.getMenuReport);
router.get('/reports/all-menus', ReportController.getAllMenusReport);
router.get('/reports/search', ReportController.searchCustomer);
router.get('/reports/customer-detail', ReportController.getCustomerDetail);
router.get('/reports/export/customer', ReportController.downloadCustomerDetailCsv);
router.post('/reports/export/customer', ReportController.downloadCustomerDetailCsv);
router.get('/reports/export/menu/:menuId', ReportController.downloadMenuCsv);
router.get('/reports/export/all', ReportController.downloadAllMenusCsv);
router.get('/reports/export/rounds', ReportController.downloadRoundsCsv);

// --- BILLS & INVOICE ---
router.post('/bills', BillController.createBill);
router.get('/bills', BillController.getBills);
router.get('/shop-config', BillController.getShopConfig);

// --- PRODUCTS (MỸ PHẨM BÁN LẺ) ---
router.get('/products', ProductController.getProducts);
router.post('/products', ProductController.addProduct);
router.put('/products/:id', ProductController.updateProduct);
router.delete('/products/:id', ProductController.deleteProduct);

module.exports = router;
