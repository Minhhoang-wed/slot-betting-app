async function saveBlindBagRewards(slotNumber) {
  if (blindBagBusy) return;
  const round=selectedBlindBag(),slot=round.data.slots.find(s=>s.number===slotNumber);
  const productNumbers=[...document.querySelectorAll(`[data-bb-slot="${slotNumber}"]`)].map(s=>Number(s.value)).filter(Boolean);
  blindBagBusy=true;
  try {await blindBagAPI(`/${round.id}/assignment`,{slotNumber,productNumbers,previousProductNumbers:bbAssigned(slot)},'PUT');showToast('Đã lưu sản phẩm bốc được.');}
  catch(error){alert(error.message);}
  finally {blindBagBusy=false;await loadBlindBags();}
}

async function setBlindBagPayment(index,paid) {
  if(blindBagBusy)return;
  const round=selectedBlindBag(),order=round.data.orders[index];
  blindBagBusy=true;
  try {await blindBagAPI(`/${round.id}/payment`,{orderId:order.id,paid,previousPaid:!!order.paid},'PUT');}
  catch(error){alert(error.message);}
  finally {blindBagBusy=false;await loadBlindBags();}
}

let bbPassContext=null;
function createBlindBagPassModalDOM() {
  const modal=document.createElement('div');modal.id='bbPassModal';modal.className='bb-modal-overlay';
  modal.innerHTML=`<div class="bb-modal-dialog bb-modal-sm"><div class="bb-modal-header"><h3>Shop thu lại đồ khách pass</h3><button class="bb-modal-close-btn" onclick="closeBlindBagPass()">&times;</button></div><div class="bb-modal-body"><p id="bbPassCustomer"></p><p>Chọn món khách muốn pass. Shop thu theo giá bán hiện tại trong danh mục.</p><div id="bbPassProducts"></div><p class="bb-pass-total">Khách được ghi có: <b id="bbPassTotal">0 đ</b></p><p>Tiền này sẽ cộng vào quyết toán chung với bàn kèo và hóa đơn Túi mù còn thiếu.</p></div><div class="bb-modal-footer"><button class="btn-action-dim" onclick="closeBlindBagPass()">Đóng</button><button id="bbPassSave" class="btn-neon-green" onclick="saveBlindBagPass()">Xác nhận shop thu lại</button></div></div>`;
  document.body.appendChild(modal);
}
function closeBlindBagPass(){document.getElementById('bbPassModal').classList.remove('active');}
async function openBlindBagPass(slotNumber) {
  const round=selectedBlindBag(),slot=round.data.slots.find(s=>s.number===slotNumber);
  const modal=document.getElementById('bbPassModal');
  try {
    const response=await fetch('/api/products'),json=await response.json();
    if(!response.ok||!json.success)throw new Error(json.error||'Không tải được giá sản phẩm.');
    const catalog=json.data;
    const passed=(round.data.returns||[]).filter(r=>!r.voided).flatMap(r=>r.items.map(p=>p.productNumber));
    bbPassContext={roundId:round.id,slotNumber,requestId:crypto.randomUUID(),body:null};
    document.getElementById('bbPassCustomer').textContent=slot.customerName+' · Slot #'+slotNumber;
    document.getElementById('bbPassProducts').innerHTML=bbAssigned(slot).map(number=>{
      const gift=round.data.pool.find(p=>p.number===number),product=catalog.find(p=>String(p.id)===String(gift.productId));
      const unavailable=passed.includes(number)||!product;
      return `<label class="bb-pass-choice"><input type="checkbox" value="${number}" data-price="${product?.price||0}" onchange="updateBlindBagPassTotal()" ${unavailable?'disabled':''}><span><b>${blindBagEscape(gift.name)}</b><br>${passed.includes(number)?'Đã thu lại':product?formatVND(product.price):'Không còn trong danh mục'}</span></label>`;
    }).join('');
    updateBlindBagPassTotal();modal.classList.add('active');
  }catch(error){alert(error.message);}
}
function updateBlindBagPassTotal() {
  const checked=[...document.querySelectorAll('#bbPassProducts input:checked')];
  document.getElementById('bbPassTotal').textContent=formatVND(checked.reduce((sum,input)=>sum+Number(input.dataset.price),0));
  document.getElementById('bbPassSave').disabled=!checked.length||blindBagBusy;
}
async function saveBlindBagPass() {
  if(blindBagBusy||!bbPassContext)return;
  const state=bbPassContext;
  const numbers=[...document.querySelectorAll('#bbPassProducts input:checked')].map(input=>Number(input.value));
  if(!numbers.length)return;
  // Retry an uncertain response with the original payload and request ID.
  state.body ||= {requestId:state.requestId,slotNumber:state.slotNumber,productNumbers:numbers};
  blindBagBusy=true;document.getElementById('bbPassSave').disabled=true;
  try {
    const result=await blindBagAPI(`/${state.roundId}/buyback`,state.body);
    closeBlindBagPass();showToast('Đã ghi có cho khách '+formatVND(result.data.receipt.total));bbPassContext=null;
  }catch(error){alert(error.message);if(error.status>=400&&error.status<500){state.body=null;state.requestId=crypto.randomUUID();}}
  finally{blindBagBusy=false;await loadBlindBags();if(bbPassContext)updateBlindBagPassTotal();}
}
async function voidBlindBagPass(index) {
  if(blindBagBusy)return;
  const round=selectedBlindBag(),receipt=round.data.returns[index];
  if(!confirm('Hủy phiếu pass này? Tiền pass sẽ được bỏ khỏi quyết toán.'))return;
  blindBagBusy=true;
  try{await blindBagAPI(`/${round.id}/buyback/void`,{receiptId:receipt.id});}
  catch(error){alert(error.message);}
  finally{blindBagBusy=false;await loadBlindBags();}
}

let financeRows=[],financeRevision=0,financePeriod={date:null,label:'Tất cả các ngày'},financeLoaded=false;
function financeDateValue() {
  const choice=document.getElementById('financePeriodSelect')?.value || 'all';
  if(choice!=='custom')return choice;
  const date=document.getElementById('financeDateInput').value;
  if(!date)throw new Error('Hãy chọn ngày cần xem.');
  return date;
}
function financeExportURL(name) {
  const base=name===undefined?'/api/reports/export/finance':'/api/reports/export/finance/customer';
  const params=new URLSearchParams({date:financePeriod.date || 'all'});
  if(name!==undefined)params.set('name',name);
  return base+'?'+params.toString();
}
function changeFinancePeriod() {
  document.getElementById('financeDateInput').hidden=document.getElementById('financePeriodSelect').value!=='custom';
  loadFinanceSummary();
}
function createFinancePanel() {
  const panel=document.createElement('section');panel.id='financePanel';panel.className='surface-card bb-finance-panel';
  panel.innerHTML=`<div class="card-top-bar"><div><h2>Quyết toán chung: Bàn kèo + Túi mù + Pass</h2><p>Số cuối = Số dư bàn kèo − Hóa đơn Túi mù còn thiếu + Tiền pass.</p></div><div class="bb-finance-actions"><a id="financeExportAll" class="btn-neon-green" aria-disabled="true">Xuất Excel theo ngày</a><button class="btn-ghost-primary" onclick="loadFinanceSummary()">Làm mới</button></div></div><div class="card-content"><div class="finance-filters"><div><label for="financePeriodSelect">Ngày giao dịch</label><select id="financePeriodSelect" class="modern-input" onchange="changeFinancePeriod()"><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="custom">Chọn ngày</option><option value="all">Tất cả các ngày</option></select></div><div><label for="financeDateInput" class="sr-only">Chọn ngày cần xem</label><input type="date" id="financeDateInput" class="modern-input" hidden onchange="loadFinanceSummary()"></div><div><label for="financeSearch">Tìm tên khách</label><input id="financeSearch" class="modern-input" placeholder="Ví dụ: kiều, KIEU, k..." oninput="renderFinanceSummary()"></div></div><p class="finance-period-label" id="financePeriodLabel">Đang tải giao dịch hôm nay...</p><p class="finance-help">Ngày mở chuyến / ngày mua túi mù / ngày thu lại pass, theo giờ Việt Nam. Chỉ tính giao dịch của ngày chọn, không gồm công nợ ngày khác. Trạng thái trả tiền là trạng thái hiện tại; chuyến chưa chốt còn tạm tính.</p><div id="financeMessage" role="status"></div><div class="bb-finance-scroll"><table class="bb-table"><thead><tr><th>Khách hàng</th><th>Số dư bàn kèo</th><th>Túi mù còn thiếu</th><th>Tiền pass</th><th>SHOP TRẢ KHÁCH</th><th>KHÁCH TRẢ SHOP</th><th>CHI TIẾT / FILE</th></tr></thead><tbody id="financeBody"></tbody></table></div></div>`;
  document.getElementById('tabReports')?.prepend(panel);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  document.getElementById('financeDateInput').value=today;
  document.getElementById('financeBody').addEventListener('click',event=>{const button=event.target.closest('[data-finance-detail]');if(button)openFinanceDetail(Number(button.dataset.financeDetail));});
  createFinanceDetailModal();
  const shortcut=document.createElement('a');shortcut.href='#financePanel';shortcut.className='btn-neon-green';shortcut.textContent='Xem quyết toán chung / Xuất Excel';shortcut.onclick=()=>{switchTab('reports');loadFinanceSummary();panel.scrollIntoView({behavior:'smooth',block:'start'});};
  document.getElementById('blindBagSection').querySelector('.bb-top-actions').prepend(shortcut);
}
async function loadFinanceSummary() {
  const revision=++financeRevision;
  const message=document.getElementById('financeMessage');if(!message)return;
  message.textContent='Đang tải quyết toán...';
  financeLoaded=false;financeRows=[];renderFinanceSummary();closeFinanceDetail();
  const exportAll=document.getElementById('financeExportAll');exportAll?.removeAttribute('href');exportAll?.setAttribute('aria-disabled','true');
  try {
    const date=financeDateValue();
    const response=await fetch('/api/reports/finance?date='+encodeURIComponent(date)),json=await response.json();
    if(!response.ok||!json.success)throw new Error(json.error||'Không tải được quyết toán.');
    if(revision!==financeRevision)return;
    financeRows=json.data.customers;financePeriod=json.data.period;financeLoaded=true;renderFinanceSummary();
    document.getElementById('financePeriodLabel').textContent='Đang xem: '+financePeriod.label+' · '+financeRows.length+' khách';
    exportAll.href=financeExportURL();exportAll.removeAttribute('aria-disabled');
    message.textContent=json.data.undatedCount?`${json.data.undatedCount} giao dịch cũ chưa lưu ngày. Chọn Tất cả để xem các giao dịch đó.`:'Đã cập nhật giao dịch theo ngày đang chọn.';
  }catch(error){if(revision===financeRevision){financeRows=[];document.getElementById('financePeriodLabel').textContent='Chưa tải được dữ liệu cho ngày đang chọn.';message.textContent=error.message;renderFinanceSummary();}}
}
function renderFinanceSummary() {
  const host=document.getElementById('financeBody');if(!host)return;
  const query=document.getElementById('financeSearch').value;
  const rows=financeRows.filter(c=>CustomerSearch.matches(c.customerName,query));
  host.innerHTML=rows.length?rows.map(c=>`<tr><td><b>${blindBagEscape(c.customerName)}</b></td><td>${formatVND(c.slotNet)}</td><td>${formatVND(c.bagDue)}</td><td>${formatVND(c.buybackTotal)}</td><td class="bb-finance-receive"><b>${formatVND(c.shopPays)}</b></td><td class="bb-finance-pay"><b>${formatVND(c.customerPays)}</b></td><td><div class="finance-row-actions"><button class="btn-ghost-primary" data-finance-detail="${financeRows.indexOf(c)}" aria-label="Xem chi tiết ${blindBagEscape(c.customerName)}">Xem chi tiết</button><a class="btn-ghost-primary" href="${blindBagEscape(financeExportURL(c.customerName))}" aria-label="Xuất Excel riêng cho ${blindBagEscape(c.customerName)}">Xuất Excel riêng</a></div></td></tr>`).join(''):`<tr><td colspan="7">${financeLoaded?'Không có giao dịch phù hợp trong '+blindBagEscape(financePeriod.label.toLowerCase())+'.':'Chưa tải xong dữ liệu.'}</td></tr>`;
}
function createFinanceDetailModal() {
  const modal=document.createElement('dialog');modal.id='financeDetailModal';modal.className='finance-detail-dialog';modal.setAttribute('aria-labelledby','financeDetailTitle');
  modal.innerHTML=`<div class="bb-modal-header"><div><h3 id="financeDetailTitle">Chi tiết khách hàng</h3><p id="financeDetailPeriod"></p></div><button class="bb-modal-close-btn" aria-label="Đóng chi tiết khách hàng" onclick="closeFinanceDetail()">&times;</button></div><div id="financeDetailContent" class="bb-modal-body"></div><div class="bb-modal-footer"><button class="btn-ghost-primary" onclick="closeFinanceDetail()">Đóng</button><a id="financeDetailExport" class="btn-neon-green">Xuất Excel khách này theo ngày</a></div>`;
  document.body.appendChild(modal);
}
function closeFinanceDetail(){const modal=document.getElementById('financeDetailModal');if(modal?.open)modal.close();}
function openFinanceDetail(index) {
  const customer=financeRows[index];if(!customer||!financeLoaded)return;
  const escape=blindBagEscape;
  const time=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa lưu ngày';
  const groups=[['1. Bàn kèo',['Bàn kèo']],['2. Túi mù và sản phẩm bốc được',['Mua túi mù và hàng kèm','Sản phẩm bốc được']],['3. Shop thu lại đồ pass',['Shop thu lại']]];
  document.getElementById('financeDetailTitle').textContent='Chi tiết khách: '+customer.customerName;
  document.getElementById('financeDetailPeriod').textContent=financePeriod.label+' · Giờ Việt Nam';
  document.getElementById('financeDetailExport').href=financeExportURL(customer.customerName);
  const note=e=>e.type==='Bàn kèo'?`<p>Tiền slot: ${formatVND(e.buyCost || 0)} · Thưởng: ${formatVND(e.prizeWon || 0)} · Hàng kèm: ${formatVND(e.attachedCost || 0)}</p>`:'';
  const items=e=>(e.items||e.attachedItems||[]).length?'<p>'+(e.items||e.attachedItems).map(p=>escape(p.name)+' × '+Number(p.quantity??p.qty??1)).join(', ')+'</p>':'';
  const sections=groups.map(([title,types])=>{const events=customer.events.filter(e=>types.includes(e.type));return `<section class="finance-detail-section"><h4>${title}</h4>${events.length?`<div class="finance-detail-scroll"><table class="bb-table"><thead><tr><th>Thời gian</th><th>Menu / đợt</th><th>Chuyến / slot</th><th>Nội dung</th><th>Số tiền / số dư</th><th>Trạng thái</th></tr></thead><tbody>${events.map(e=>`<tr><td>${escape(time(e.occurredAt))}</td><td>${escape(e.context)}</td><td>${escape(e.slots)}</td><td><b>${escape(e.name)}</b>${note(e)}${items(e)}${e.type==='Mua túi mù và hàng kèm'&&e.discount?'<p>Giảm giá: '+formatVND(e.discount)+'</p>':''}</td><td>${e.type==='Sản phẩm bốc được'?'—':formatVND(e.amount)}</td><td>${escape(e.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Không có giao dịch trong phần này.</p>'}</section>`;}).join('');
  const final=customer.customerPays?'KHÁCH CẦN TRẢ SHOP: '+formatVND(customer.customerPays):customer.shopPays?'SHOP CẦN TRẢ KHÁCH: '+formatVND(customer.shopPays):'KHÔNG CÒN CHÊNH LỆCH';
  document.getElementById('financeDetailContent').innerHTML=`<div class="finance-detail-summary"><div>Số dư bàn kèo<strong>${formatVND(customer.slotNet)}</strong></div><div>Túi mù còn thiếu<strong>${formatVND(customer.bagDue)}</strong></div><div>Tiền pass<strong>${formatVND(customer.buybackTotal)}</strong></div></div><p class="finance-detail-final ${customer.customerPays?'bb-finance-pay':'bb-finance-receive'}">${final}</p><p class="finance-help">Số cuối = số dư bàn kèo − túi mù còn thiếu + tiền pass. Hóa đơn đã trả không bị trừ lại. Phiếu pass đã hủy không được cộng tiền. Chuyến chưa chốt còn tạm tính.</p>${sections}`;
  document.getElementById('financeDetailModal').showModal();
}
