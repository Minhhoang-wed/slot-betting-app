const ExcelJS = require('exceljs');
const { key } = require('../views/js/settlement-core');

const colors = { navy:'243B53', blue:'EAF2FA', ink:'172B4D', muted:'52606D', line:'D9E2EC', orange:'FFF1DE', green:'E3F3EA' };
const money = '#,##0" đ"';
const count = '0.##';
const sum = (rows, prop) => rows.reduce((n,r)=>n+Number(r[prop] || 0),0);
const direction = value => ({ pay:Math.max(0,-Number(value || 0)), receive:Math.max(0,Number(value || 0)) });
const timeVN = value => new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const slotList = slots => (slots || []).map(slot=>'#'+slot).join(', ');
function winningDetails(row) {
  if (Array.isArray(row.winningSlotsList)) {
    return { text:slotList(row.winningSlotsList) || 'Không trúng', count:Number(row.winningSlotCount ?? row.winningSlotsList.length) };
  }
  return { text:row.status==='finished'?'Không lưu slot thắng':'Chưa chốt', count:'—' };
}
function savedWinnerText(round) {
  const selected=(round.finishedResults || []).filter(r=>Array.isArray(r.winningSlotsList)&&r.winningSlotsList.length);
  if(selected.length)return selected.map(r=>`${r.playerName} · ${slotList(r.winningSlotsList)} · ${Number(r.prizeWon || 0).toLocaleString('vi-VN')} đ`).join('\n');
  return (round.winners || []).join(', ') || 'Chưa chọn';
}
function selectedSlotsText(round) {
  if(Array.isArray(round.winningSlots))return slotList(round.winningSlots) || 'Chưa chọn';
  const selected=(round.finishedResults || []).find(r=>Array.isArray(r.winningSlots));
  if(selected)return slotList(selected.winningSlots) || 'Chưa chọn';
  return round.status==='finished'?'Không lưu slot thắng':'Chưa chốt';
}
function workbook(){ const wb=new ExcelJS.Workbook();wb.creator='BETTING';wb.created=new Date();return wb; }
function sheet(wb,name,title,context,widths){
  const ws=wb.addWorksheet(name,{properties:{defaultRowHeight:32,tabColor:{argb:colors.navy}},views:[{showGridLines:false,zoomScale:100}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.25,right:0.25,top:0.4,bottom:0.4,header:0.2,footer:0.2}}});
  ws.columns=widths.map(width=>({width}));
  band(ws,2,title,{size:22,fill:null});
  band(ws,3,context+' · Xuất lúc '+timeVN(new Date())+' (giờ Việt Nam)',{size:12,fill:null,color:colors.muted});
  ws.headerFooter.oddFooter='Trang &P / &N';return ws;
}
function base(row){row.height=36;row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:14,color:{argb:colors.ink}};cell.alignment={vertical:'middle',horizontal:typeof cell.value==='number'?'right':'left',wrapText:true,indent:1};});}
function band(ws,index,text,{size=14,fill=colors.blue,color=colors.ink}={}){
  ws.mergeCells(index,1,index,Math.max(8,ws.columnCount));const cell=ws.getCell(index,1);cell.value=text;cell.font={name:'Arial',size,bold:true,color:{argb:color}};cell.alignment={vertical:'middle',wrapText:true};if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};ws.getRow(index).height=size>18?44:34;
}
function summary(ws,index,label,value,{currency=true,fill=null}={}){
  ws.mergeCells(index,1,index,5);ws.mergeCells(index,6,index,8);ws.getCell(index,1).value=label;ws.getCell(index,6).value=value;const row=ws.getRow(index);base(row);row.height=36;ws.getCell(index,6).numFmt=currency?money:(Number.isInteger(value)?'0':count);ws.getCell(index,6).alignment={horizontal:'right',vertical:'middle'};
  if(fill){for(let col=1;col<=8;col++)ws.getCell(index,col).fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};row.font={name:'Arial',size:16,bold:true,color:{argb:colors.ink}};row.height=42;}
}
function table(ws,start,headers,rows,{moneyCols=[],countCols=[],payCols=[],receiveCols=[],filter=true}={}){
  const head=ws.getRow(start);head.values=headers;base(head);head.height=50;head.eachCell(cell=>{cell.font={name:'Arial',size:14,bold:true,color:{argb:'FFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.navy}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
  rows.forEach((values,i)=>{const row=ws.getRow(start+i+1);row.values=values;base(row);
    const lines=Math.max(1,...values.map((value,col)=>typeof value==='string'?value.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(8,(ws.getColumn(col+1).width || 18)-4))),0):1));
    row.height=Math.max(40,Math.min(360,lines*24+14));
    row.eachCell(cell=>{if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F4F7FA'}};cell.border={bottom:{style:'hair',color:{argb:colors.line}}};});
    for(const c of moneyCols){row.getCell(c).numFmt=money;row.getCell(c).alignment={horizontal:'right',vertical:'middle'};}
    for(const c of countCols)row.getCell(c).numFmt=Number.isInteger(row.getCell(c).value)?'0':count;
    for(const [columns,color] of [[payCols,colors.orange],[receiveCols,colors.green]])for(const c of columns)if(Number(row.getCell(c).value)>0){row.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};row.getCell(c).font={name:'Arial',size:14,bold:true,color:{argb:colors.ink}};}
  });
  if(rows.length&&filter){ws.autoFilter={from:{row:start,column:1},to:{row:start+rows.length,column:headers.length}};ws.views=[{state:'frozen',ySplit:3,xSplit:1,showGridLines:false,zoomScale:100}];ws.pageSetup.printTitlesRow=`${start}:${start}`;}
  if(!rows.length)band(ws,start+1,'Chưa có dữ liệu trong phần này.',{fill:null,color:colors.muted});
  return start+Math.max(1,rows.length)+1;
}
function total(ws,index,label,columns,first,last){
  const row=ws.getRow(index);row.getCell(1).value=label;
  for(const c of columns){const letter=ws.getColumn(c).letter;row.getCell(c).value={formula:`SUM(${letter}${first}:${letter}${last})`,result:sum([...Array(Math.max(0,last-first+1))].map((_,i)=>({n:ws.getCell(first+i,c).value})),'n')};row.getCell(c).numFmt=money;}
  base(row);row.font={name:'Arial',size:14,bold:true,color:{argb:colors.ink}};row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.blue}};});
}
function pendingNote(ws,index,n){band(ws,index,n?`TẠM TÍNH: còn ${n} chuyến chưa chốt. Tiền cần trả có thể thay đổi khi chốt kết quả.`:'Đã chốt kết quả. Số tiền dưới đây chưa xác nhận đã thu hoặc đã chuyển.',{fill:n?colors.orange:colors.blue});ws.getRow(index).height=42;}
function customer(who,products=[]){
  if(!who)throw new Error('Không tìm thấy khách hàng');
  const wb=workbook(),ws=sheet(wb,'Khách hàng','BÁO CÁO KHÁCH HÀNG',who.customerName,[32,18,10,18,18,20,20,18]);
  const detail=(who.detailedMenus||[]).flatMap(m=>m.rounds.map(r=>({...r,menuName:m.menuName})));
  const items=products.length?products:(who.attachedItems||[]),productCost=items.reduce((n,p)=>n+Number(p.price)*Number(p.qty??1),0);
  const net=Number(who.netAmount)+(Number(who.totalAttachedCost)||0)-productCost,action=direction(net);
  summary(ws,5,'Tổng số slot đã mua',who.totalSlots,{currency:false});summary(ws,6,'Tổng tiền mua slot',who.totalBuyCost);summary(ws,7,'Tổng tiền thưởng',who.totalPrizeWon);summary(ws,8,'Tổng tiền hàng mua kèm',productCost);
  summary(ws,9,action.pay?'KHÁCH CẦN TRẢ SHOP':action.receive?'SHOP CẦN TRẢ KHÁCH':'KHÔNG CÒN CHÊNH LỆCH',action.pay||action.receive,{fill:action.pay?colors.orange:colors.green});
  pendingNote(ws,11,detail.filter(r=>r.status!=='finished').length);
  band(ws,13,'1. SLOT ĐÃ MUA VÀ KẾT QUẢ TỪNG CHUYẾN');
  const rows=detail.map(r=>{const d=direction(Number(r.net)+Number(r.attachedCost||0)),win=winningDetails(r);return [r.menuName,'#'+r.roundNumber+'\nSlot đã mua: '+(r.slots||r.slotsList||[]).join(', '),r.slotCount,r.buyCost,r.prizeWon,d.pay,d.receive,r.status==='finished'?'Đã chốt\n'+(Array.isArray(r.winningSlotsList)?'Slot thắng: '+win.text:win.text):'Chưa chốt'];});
  const end=table(ws,14,['Menu','Chuyến / slot đã mua','Số slot đã mua','Tiền mua slot','Tiền thưởng','Khách cần trả','Shop cần trả','Kết quả / slot thắng'],rows,{moneyCols:[4,5,6,7],countCols:[3],payCols:[6],receiveCols:[7]});
  if(rows.length)total(ws,end,'TỔNG',[4,5,6,7],15,end-1);
  band(ws,end+2,'Tiền trả ở phần 1 chưa tính hàng mua kèm. Số cần trả cuối cùng nằm ở đầu file.',{fill:null,color:colors.muted});ws.getRow(end+2).height=42;
  band(ws,end+4,'2. HÀNG MUA KÈM');
  table(ws,end+5,['Sản phẩm','Số lượng','Đơn giá','Thành tiền'],items.map(p=>[p.name,Number(p.qty??1),Number(p.price),Number(p.price)*Number(p.qty??1)]),{moneyCols:[3,4],countCols:[2],filter:false});
  seatDetails(wb,[{customerName:who.customerName,roundsDetails:detail}],'Tất cả chuyến của '+who.customerName);
  return wb;
}
function collection(customers,title,context,pending=0,details=null){
  const wb=workbook(),ws=sheet(wb,'Thu và trả',title,context,[30,10,19,19,19,21,21,20]);
  summary(ws,5,'Số khách cần đối chiếu',customers.length,{currency:false});summary(ws,6,'Tổng tiền mua slot',sum(customers,'totalBuyCost'));summary(ws,7,'Tổng tiền thưởng',sum(customers,'totalPrizeWon'));summary(ws,8,'Tổng hàng mua kèm',sum(customers,'totalAttachedCost'));
  summary(ws,9,'TỔNG KHÁCH CẦN TRẢ SHOP',customers.reduce((n,c)=>n+direction(c.netAmount).pay,0),{fill:colors.orange});summary(ws,10,'TỔNG SHOP CẦN TRẢ KHÁCH',customers.reduce((n,c)=>n+direction(c.netAmount).receive,0),{fill:colors.green});pendingNote(ws,12,pending);
  band(ws,14,'1. DANH SÁCH CẦN THU VÀ CẦN TRẢ');
  const rows=customers.map(c=>{const d=direction(c.netAmount);return [c.customerName,c.totalSlots,c.totalBuyCost,c.totalPrizeWon,c.totalAttachedCost||0,d.pay,d.receive,d.pay?'Khách trả shop':d.receive?'Shop trả khách':'Không chênh lệch'];});
  const end=table(ws,15,['Khách hàng','Số slot đã mua','Tiền mua slot','Tiền thưởng','Hàng mua kèm','Khách cần trả','Shop cần trả','Đối chiếu'],rows,{moneyCols:[3,4,5,6,7],countCols:[2],payCols:[6],receiveCols:[7]});if(rows.length)total(ws,end,'TỔNG',[3,4,5,6,7],16,end-1);
  if(details){const ds=sheet(wb,'Từng menu','CHI TIẾT THEO MENU',context,[30,30,14,19,19,19,21,21]);table(ds,5,['Khách hàng','Menu','Số slot đã mua','Tiền mua slot','Tiền thưởng','Hàng mua kèm','Khách cần trả','Shop cần trả'],details,{moneyCols:[4,5,6,7,8],countCols:[3],payCols:[7],receiveCols:[8]});}
  return wb;
}
function seatDetails(wb, customers, context) {
  const ws=sheet(wb,'Từng chuyến','SLOT ĐÃ MUA VÀ SLOT ĐƯỢC CHỌN THẮNG',context,[28,30,25,14,19,19,21,21,29,15]);
  const rows=customers.flatMap(c=>(c.roundsDetails||[]).map(r=>{const d=direction(r.net),win=winningDetails(r);return [c.customerName,r.menuName||context,'#'+r.roundNumber+'\nSlot đã mua: '+(r.slots||r.slotsList||[]).join(', '),r.slotCount,r.buyCost,r.prizeWon,d.pay,d.receive,win.text,win.count];}));
  const end=table(ws,5,['Khách hàng','Menu','Chuyến / slot đã mua','Số slot đã mua','Tiền mua slot','Tiền thưởng','Khách cần trả','Shop cần trả','Slot thắng','Số slot thắng'],rows,{moneyCols:[5,6,7,8],countCols:[4,10],payCols:[7],receiveCols:[8]});
  band(ws,end+2,'Tiền mua tính trên tất cả slot đã mua. Tiền thưởng chỉ tính trên các slot được chọn thắng.',{fill:null,color:colors.muted});ws.getRow(end+2).height=46;
  band(ws,end+3,'Slot nhiều người chung: số slot đã mua và số slot thắng tính theo tỷ lệ sở hữu. Kết quả cũ giữ nguyên số tiền đã lưu.',{fill:null,color:colors.muted});ws.getRow(end+3).height=46;
}
function menu(data){const pending=new Set(data.customers.flatMap(c=>c.roundsDetails.filter(r=>r.status!=='finished').map(r=>r.roundNumber)));const wb=collection(data.customers,'BÁO CÁO MENU',data.menu.name,pending.size);seatDetails(wb,data.customers,data.menu.name);return wb;}
function all(data){
  const details=data.customers.flatMap(c=>Object.values(c.menuBreakdown).map(m=>{const d=direction(m.net);return [c.customerName,m.menuName,m.slotCount,m.buyCost,m.prizeWon,m.attachedCost,d.pay,d.receive];}));
  const roundIds=new Set(data.customers.flatMap(c=>Object.values(c.menuBreakdown).flatMap(m=>(m.rounds||[]).filter(r=>r.status!=='finished').map(r=>m.menuId+':'+r.roundNumber))));
  const wb=collection(data.customers,'TỔNG HỢP THU VÀ TRẢ','Tất cả menu',roundIds.size,details);
  const customers=data.customers.map(c=>({customerName:c.customerName,roundsDetails:Object.values(c.menuBreakdown).flatMap(m=>(m.rounds||[]).map(r=>({...r,menuName:m.menuName})))}));
  seatDetails(wb,customers,'Tất cả menu');return wb;
}
function round(game){
  const rows=(game.finishedResults||[]).map(r=>({customerName:r.playerName,totalSlots:r.slotCount,totalBuyCost:r.buyCost,totalPrizeWon:r.prizeWon,totalAttachedCost:r.attachedTotalCost||0,netAmount:r.netAmount,roundsDetails:[{roundNumber:game.roundNumber,status:game.status,slots:r.slotsList,slotCount:r.slotCount,buyCost:r.buyCost,prizeWon:r.prizeWon,net:r.netAmount,winningSlotsList:r.winningSlotsList,winningSlotCount:r.winningSlotCount,prizeRule:r.prizeRule}]}));
  const wb=collection(rows,'BÁO CÁO CHUYẾN',`${game.name} · Chuyến #${game.roundNumber}`,game.status==='finished'?0:1);seatDetails(wb,rows,game.name);return wb;
}
function history(rounds){const wb=workbook(),ws=sheet(wb,'Lịch sử','LỊCH SỬ CÁC CHUYẾN','Tất cả chuyến đã lưu',[30,10,16,14,18,46,20,24,30]);summary(ws,5,'Số chuyến đã chốt',rounds.filter(r=>r.status==='finished').length,{currency:false});summary(ws,6,'Số chuyến chưa chốt',rounds.filter(r=>r.status!=='finished').length,{currency:false});
 const end=table(ws,8,['Menu / tên chuyến','Chuyến','Kết quả','Slot đã bán','Giá mỗi slot','Người nhận giải / slot thắng','Tổng giải','Thời gian Việt Nam','Các slot được chọn thắng'],rounds.map(r=>[r.name,'#'+r.roundNumber,r.status==='finished'?'Đã chốt':'Chưa chốt',(r.slots||[]).filter(s=>s.player_name).length,r.slotPrice,savedWinnerText(r),r.prizeValue,timeVN(r.finishedAt||r.createdAt),selectedSlotsText(r)]),{moneyCols:[5,7],countCols:[4]});
 band(ws,end+2,'Kết quả cũ không lưu slot thắng: giữ nguyên tên và số tiền đã chốt; không suy ra tất cả slot của người thắng.',{fill:null,color:colors.muted});ws.getRow(end+2).height=46;return wb;
}
function finance(data,{customerName}={}) {
  const context=customerName?'Khách hàng: '+customerName:'Số tiền theo dữ liệu đang lưu';
  const wb=workbook(),ws=sheet(wb,'Tổng hợp',customerName?'QUYẾT TOÁN RIÊNG KHÁCH HÀNG':'QUYẾT TOÁN BÀN KÈO, TÚI MÙ VÀ PASS',context,[28,21,21,21,21,21,23,23]);
  summary(ws,5,customerName?'KHÁCH CẦN TRẢ SHOP':'TỔNG KHÁCH CẦN TRẢ SHOP',data.customerPays,{fill:colors.orange});
  summary(ws,6,customerName?'SHOP CẦN TRẢ KHÁCH':'TỔNG SHOP CẦN TRẢ KHÁCH',data.shopPays,{fill:colors.green});
  band(ws,8,'Số cuối = Số dư bàn kèo − Hóa đơn túi mù còn thiếu + Tiền shop thu lại.',{fill:null,color:colors.muted});ws.getRow(8).height=46;
  band(ws,9,'Hóa đơn chưa xác nhận trả tiền được tính là còn thiếu. Bàn kèo gồm cả chuyến chưa chốt.',{fill:null,color:colors.muted});ws.getRow(9).height=46;
  const rows=data.customers.map(c=>[c.customerName,c.slotNet,c.bagTotal,c.bagPaid,c.bagDue,c.buybackTotal,c.shopPays,c.customerPays]);
  const end=table(ws,11,['Khách hàng','Số dư bàn kèo','Tổng hóa đơn túi mù','Khách đã trả','Túi mù còn thiếu','Tiền pass được nhận','SHOP TRẢ KHÁCH','KHÁCH TRẢ SHOP'],rows,{moneyCols:[2,3,4,5,6,7,8],payCols:[8],receiveCols:[7]});
  rows.forEach((_,i)=>{const r=12+i,c=data.customers[i];ws.getCell(r,5).value={formula:`C${r}-D${r}`,result:c.bagDue};ws.getCell(r,7).value={formula:`MAX(0,B${r}-E${r}+F${r})`,result:c.shopPays};ws.getCell(r,8).value={formula:`MAX(0,E${r}-B${r}-F${r})`,result:c.customerPays};});
  if(rows.length){
    total(ws,end,'TỔNG',[2,3,4,5,6,7,8],12,end-1);
    ws.getCell('F5').value={formula:`SUM(H12:H${end-1})`,result:data.customerPays};
    ws.getCell('F6').value={formula:`SUM(G12:G${end-1})`,result:data.shopPays};
    ws.views=[{state:'frozen',ySplit:11,xSplit:1,showGridLines:false,zoomScale:100}];
  }
  const source=sheet(wb,'Chi tiết','CHI TIẾT GIAO DỊCH',customerName?context:'Phiếu pass đã hủy không được cộng vào tổng tiền khách nhận',[28,28,28,16,40,12,23,30]);
  table(source,5,['Khách hàng','Loại giao dịch','Menu / đợt túi mù','Chuyến / slot','Sản phẩm / hóa đơn','Số lượng','Số tiền','Trạng thái'],data.customers.flatMap(c=>c.events.map(e=>[c.customerName,e.type,e.context,e.slots,e.name,e.quantity,e.amount,e.status])),{moneyCols:[7],countCols:[6]});
  source.views=[{state:'frozen',ySplit:5,xSplit:1,showGridLines:false,zoomScale:100}];
  if(customerName){band(source,source.rowCount+2,'Phiếu pass đã hủy không được cộng vào tổng tiền khách nhận.',{fill:null,color:colors.muted});source.getRow(source.rowCount).height=46;}
  return wb;
}
module.exports={customer,menu,all,round,history,finance};
