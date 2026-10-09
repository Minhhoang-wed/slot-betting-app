// UI verification server. All models are isolated from network and real files.
const express=require('express');
const path=require('node:path');
const {isolatedModels}=require('./audit-customer-session.cjs');
async function main(){
 const models=isolatedModels();
 const game=models.load('controllers/GameController.js'),report=models.load('controllers/ReportController.js');
 const menu=models.load('controllers/MenuController.js'),product=models.load('controllers/ProductController.js'),bill=models.load('controllers/BillController.js');
 const app=express();app.use(express.json());
 app.get('/api/menus',menu.getMenus);app.post('/api/menus',menu.createMenu);
 app.get('/api/game',game.getGame);app.get('/api/game/history',game.getRoundHistory);
 app.post('/api/game/switch-menu',game.switchMenu);app.post('/api/game/switch-round',game.switchRound);
 app.post('/api/game/create-round',game.createRound);app.put('/api/game/round',game.updateRound);
 app.post('/api/game/slot',game.updateSlot);app.post('/api/game/quick-register',game.quickRegister);
 app.post('/api/game/remove-player',game.removePlayer);app.post('/api/game/slot/add',game.addSlot);app.post('/api/game/slot/remove',game.removeSlot);
 app.post('/api/game/finalize',game.finalizeGame);app.post('/api/game/next-round',game.nextRound);
 app.get('/api/reports/all-menus',report.getAllMenusReport);app.get('/api/reports/menu/:menuId',report.getMenuReport);
 app.get('/api/reports/search',report.searchCustomer);app.get('/api/reports/customer-detail',report.getCustomerDetail);
 app.get('/api/reports/export/menu/:menuId',report.downloadMenuCsv);app.get('/api/reports/export/all',report.downloadAllMenusCsv);
 app.get('/api/reports/export/rounds',report.downloadRoundsCsv);app.post('/api/reports/export/customer',report.downloadCustomerDetailCsv);
 app.get('/api/products',product.getProducts);app.post('/api/products',product.addProduct);app.put('/api/products/:id',product.updateProduct);app.delete('/api/products/:id',product.deleteProduct);
 app.post('/api/bills',bill.createBill);app.get('/api/bills',bill.getBills);app.get('/api/shop-config',bill.getShopConfig);
 app.get('/api/blind-bags',(_,res)=>res.json({success:true,data:[],persistent:false}));
 app.use('/api',(_,res)=>res.status(404).json({success:false,error:'QA route not implemented'}));
 app.use(express.static(path.join(__dirname,'../views')));
 app.listen(3104,'127.0.0.1',()=>console.log('QA LOCAL http://127.0.0.1:3104 (isolated memory only)'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
