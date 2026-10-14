let bbBillPaymentContext = null;

function resetBlindBagBillPayment() {
  bbBillPaymentContext = null;
  document.getElementById('bbBillPaymentControls').hidden = true;
  document.getElementById('bbBillPaymentStatus').hidden = true;
}

function showBlindBagBillPayment(round, order) {
  bbBillPaymentContext = { roundId: round.id, orderId: order.id, paid: !!order.paid, total: order.total, saving: false };
  renderBlindBagBillPayment();
}

function renderBlindBagBillPayment(message = '', failed = false) {
  const context = bbBillPaymentContext;
  if (!context) return;
  document.getElementById('bbBillPaymentControls').hidden = false;
  const paidButton = document.getElementById('bbBillPaid');
  const unpaidButton = document.getElementById('bbBillUnpaid');
  for (const [button, active] of [[paidButton, context.paid], [unpaidButton, !context.paid]]) {
    button.setAttribute('aria-pressed', String(active));
    button.disabled = context.saving || context.unavailable || active;
  }
  const notice = document.getElementById('bbBillPaymentMessage');
  notice.textContent = message || (context.paid ? 'Đã lưu: hóa đơn này không còn tính vào tiền nợ túi mè.' : 'Hóa đơn này đang tính vào tiền khách còn nợ shop.');
  notice.classList.toggle('bb-payment-error', failed);
  const status = document.getElementById('bbBillPaymentStatus');
  status.hidden = false;
  status.className = 'bb-bill-payment-status ' + (context.paid ? 'is-paid' : 'is-unpaid');
  status.textContent = context.paid ? 'ĐÃ THANH TOÁN · Còn nợ: 0 đ' : 'CHƯA THANH TOÁN / CÒN NỢ: ' + formatVND(context.total);
  if (currentBillData) currentBillData.blindBagPayment = { paid: context.paid };
  document.getElementById('billNetTitle').textContent = context.paid ? 'TỔNG TIỀN ĐÃ THANH TOÁN' : 'TỔNG TIỀN CÒN NỢ';
  document.getElementById('billNetAmount').textContent = formatVND(context.total);
  document.getElementById('billNetExplain').textContent = context.paid ? 'Shop đã xác nhận nhận đủ tiền hóa đơn này. Khách không cần chuyển thêm.' : 'Chưa ghi nhận thanh toán. Khách vui lòng chuyển tiền theo mã VietQR bên dưới.';
  document.getElementById('billQrSection').style.display = context.paid ? 'none' : 'flex';
}

function syncBlindBagBillPayment() {
  const context = bbBillPaymentContext;
  if (!context || context.saving) return;
  const round = blindBagRounds.find(r => r.id === context.roundId);
  const order = round?.data.orders.find(o => o.id === context.orderId);
  if (!order) {
    context.unavailable = true;
    renderBlindBagBillPayment('Hóa đơn đã xóa hoặc thay đổi. Đóng bill và mở lại từ danh sách người mua.', true);
    return;
  }
  // Slot CRUD can split or rename an invoice. Reopen it so all receipt fields stay consistent.
  renderBlindBagInvoice(round, order);
}

async function setBlindBagBillPayment(paid) {
  const context = bbBillPaymentContext;
  if (!context || context.saving || context.unavailable || context.paid === paid) return;
  if (blindBagBusy) {
    renderBlindBagBillPayment('Đang xử lý giao dịch khác. Vui lòng thử lại sau.', true);
    return;
  }
  context.saving = true;
  blindBagBusy = true;
  renderBlindBagBillPayment('Đang lưu trạng thái thanh toán...');
  try {
    const result = await blindBagAPI(`/${context.roundId}/payment`, {
      orderId: context.orderId, paid, previousPaid: context.paid
    }, 'PUT');
    // Update only after the server confirms persistence, and only the invoice still open.
    context.paid = !!result.data.order.paid;
    context.total = result.data.order.total;
    blindBagRounds = blindBagRounds.map(r => r.id === context.roundId ? result.data.round : r);
    if (bbBillPaymentContext === context) renderBlindBagBillPayment('Đã lưu trạng thái thanh toán.');
    showToast(paid ? 'Đã ghi nhận khách thanh toán tiền túi mè.' : 'Đã ghi nhận hóa đơn chưa thanh toán / còn nợ.');
  } catch (error) {
    if (bbBillPaymentContext === context) renderBlindBagBillPayment('Chưa xác nhận được trạng thái: ' + error.message + ' Bấm lại để kiểm tra / lưu.', true);
  } finally {
    context.saving = false;
    blindBagBusy = false;
    if (bbBillPaymentContext === context) {
      document.getElementById('bbBillPaid').disabled = context.paid;
      document.getElementById('bbBillUnpaid').disabled = !context.paid;
    }
    renderBlindBags();
    await loadFinanceSummary();
    if (document.getElementById('reportSearchCustomerInput')?.value?.trim()) filterCustomerReports();
  }
}

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
  modal.innerHTML=`<div class="bb-modal-dialog bb-modal-sm"><div class="bb-modal-header"><h3>Shop thu lại đồ khách pass</h3><button class="bb-modal-close-btn" onclick="closeBlindBagPass()">&times;</button></div><div class="bb-modal-body"><p id="bbPassCustomer"></p><p>Chọn món khách muốn pass. Shop thu theo giá bán hiện tại trong danh mục.</p><div id="bbPassProducts"></div><p class="bb-pass-total">Khách được ghi có: <b id="bbPassTotal">0 đ</b></p><p>Tiền này sẽ cộng vào quyết toán chung với bàn kèo và hóa đơn Túi mè còn thiếu.</p></div><div class="bb-modal-footer"><button class="btn-action-dim" onclick="closeBlindBagPass()">Đóng</button><button id="bbPassSave" class="btn-neon-green" onclick="saveBlindBagPass()">Xác nhận shop thu lại</button></div></div>`;
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
function financeExportURL(name,period=financePeriod) {
  const base=name===undefined?'/api/reports/export/finance':'/api/reports/export/finance/customer';
  const params=new URLSearchParams({date:period.date || 'all'});
  if(name!==undefined)params.set('name',name);
  return base+'?'+params.toString();
}
function changeFinancePeriod() {
  document.getElementById('financeDateInput').hidden=document.getElementById('financePeriodSelect').value!=='custom';
  loadFinanceSummary();
}
function createFinancePanel() {
  const panel=document.createElement('section');panel.id='financePanel';panel.className='surface-card bb-finance-panel';
  panel.innerHTML=`
    <div class="card-top-bar finance-heading">
      <div class="finance-heading-title">
        <span class="finance-heading-icon" aria-hidden="true"><i class="fa-solid fa-wallet"></i></span>
        <div><span class="finance-eyebrow">BÀN KÈO · TÚI MÈ · SHOP THU LẠI ĐỒ</span><h2>Tổng kết tiền khách hàng</h2><p>Xem rõ shop cần trả bao nhiêu và khách còn nợ bao nhiêu.</p></div>
      </div>
      <div class="bb-finance-actions"><a id="financeExportAll" class="btn-neon-green" aria-disabled="true"><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Xuất Excel cả danh sách</a><button class="btn-ghost-primary" onclick="loadFinanceSummary()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Làm mới</button></div>
    </div>
    <div class="card-content">
      <div class="finance-filters">
        <div><label for="financePeriodSelect">1. Chọn ngày cần xem</label><select id="financePeriodSelect" class="modern-input" onchange="changeFinancePeriod()"><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="custom">Chọn ngày</option><option value="all">Tất cả các ngày</option></select></div>
        <div><label for="financeDateInput" class="sr-only">Chọn ngày cần xem</label><input type="date" id="financeDateInput" class="modern-input" hidden onchange="loadFinanceSummary()"></div>
        <div><label for="financeSearch">2. Tìm khách hàng</label><input id="financeSearch" class="modern-input" placeholder="Nhập tên hoặc một chữ, ví dụ: kiều, k..." oninput="renderFinanceSummary()"></div>
      </div>
      <p class="finance-period-label" id="financePeriodLabel">Đang tải giao dịch hôm nay...</p>
      <div id="financeTransferSummary" class="finance-transfer-summary" hidden aria-label="Tổng tiền của khách đang hiển thị">
        <div class="finance-transfer-card finance-transfer-out"><span class="finance-transfer-direction" aria-hidden="true">↗</span><div><h3>Shop cần trả khách</h3><strong id="financeShopPaysTotal">—</strong><p id="financeShopPaysCount"></p></div></div>
        <div class="finance-transfer-card finance-transfer-in"><span class="finance-transfer-direction" aria-hidden="true">↙</span><div><h3>Khách cần trả shop</h3><strong id="financeCustomerPaysTotal">—</strong><p id="financeCustomerPaysCount"></p></div></div>
      </div>
      <p class="finance-scope-note">Số tiền theo ngày đang chọn. Chuyến bàn kèo chưa chốt vẫn là tạm tính.</p>
      <div class="finance-list-heading"><h3>Chi tiết từng khách</h3><span>Nhấn “Xem chi tiết” để kiểm tra từng giao dịch.</span></div>
      <div id="financeMessage" role="status"></div>
      <div class="bb-finance-scroll"><table class="bb-table"><thead><tr><th>Khách hàng</th><th class="finance-final-out">Shop cần trả khách</th><th class="finance-final-in">Khách cần trả shop</th><th>Số dư bàn kèo</th><th>Nợ túi mè</th><th>Tiền shop thu đồ pass</th><th>Chi tiết / File</th></tr></thead><tbody id="financeBody"></tbody></table></div>
      <details class="finance-explanation"><summary>Cách tính số tiền và ngày giao dịch</summary><p>Tiền cuối của khách = số dư bàn kèo − tiền túi mè còn nợ + tiền shop thu lại đồ pass. Số dương là shop trả khách; số âm là khách trả shop. Hóa đơn đã thanh toán không bị trừ lại.</p><p>Ngày giao dịch là ngày mở chuyến, ngày mua túi mè hoặc ngày shop thu lại đồ, theo giờ Việt Nam. Chỉ gồm giao dịch của ngày đã chọn; chọn “Tất cả các ngày” để xem tổng của mọi ngày. Trạng thái thanh toán là trạng thái hiện tại.</p></details>
    </div>`;
  document.getElementById('tabReports')?.prepend(panel);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  document.getElementById('financeDateInput').value=today;
  document.getElementById('financeBody').addEventListener('click',event=>{const button=event.target.closest('[data-finance-detail]');if(button)openFinanceDetail(Number(button.dataset.financeDetail));});
  createFinanceDetailModal();
  const shortcut=document.createElement('a');shortcut.href='#financePanel';shortcut.className='btn-neon-green';shortcut.textContent='Tổng kết tiền khách / Xuất Excel';shortcut.onclick=()=>{switchTab('reports');loadFinanceSummary();panel.scrollIntoView({behavior:'smooth',block:'start'});};
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
  const summary=document.getElementById('financeTransferSummary');
  if(summary) {
    summary.hidden=!financeLoaded;
    document.getElementById('financeShopPaysTotal').textContent=formatVND(rows.reduce((sum,c)=>sum+c.shopPays,0));
    document.getElementById('financeCustomerPaysTotal').textContent=formatVND(rows.reduce((sum,c)=>sum+c.customerPays,0));
    const scope=rows.length+' khách đang hiển thị';
    document.getElementById('financeShopPaysCount').textContent=rows.filter(c=>c.shopPays>0).length+' khách cần nhận tiền · '+scope;
    document.getElementById('financeCustomerPaysCount').textContent=rows.filter(c=>c.customerPays>0).length+' khách còn nợ · '+scope;
  }
  host.innerHTML=rows.length?rows.map(c=>`<tr><td data-label="Khách hàng" class="finance-customer-name"><b>${blindBagEscape(c.customerName)}</b></td><td data-label="Shop cần trả khách" class="finance-final-amount ${c.shopPays?'bb-finance-receive':''}"><b>${c.shopPays?formatVND(c.shopPays):'—'}</b></td><td data-label="Khách cần trả shop" class="finance-final-amount ${c.customerPays?'bb-finance-pay':''}"><b>${c.customerPays?formatVND(c.customerPays):'—'}</b></td><td data-label="Số dư bàn kèo">${formatVND(c.slotNet)}</td><td data-label="Nợ túi mè">${formatVND(c.bagDue)}</td><td data-label="Tiền shop thu đồ pass">${formatVND(c.buybackTotal)}</td><td data-label="Chi tiết / File"><div class="finance-row-actions"><button class="btn-ghost-primary" data-finance-detail="${financeRows.indexOf(c)}" aria-label="Xem chi tiết ${blindBagEscape(c.customerName)}">Xem chi tiết</button><a class="btn-ghost-primary" href="${blindBagEscape(financeExportURL(c.customerName))}" aria-label="Xuất Excel riêng cho ${blindBagEscape(c.customerName)}">Xuất Excel riêng</a></div></td></tr>`).join(''):`<tr><td colspan="7">${financeLoaded?'Không có giao dịch phù hợp trong '+blindBagEscape(financePeriod.label.toLowerCase())+'.':'Chưa tải xong dữ liệu.'}</td></tr>`;
}
function createFinanceDetailModal() {
  const modal=document.createElement('dialog');modal.id='financeDetailModal';modal.className='finance-detail-dialog';modal.setAttribute('aria-labelledby','financeDetailTitle');
  modal.innerHTML=`<div class="bb-modal-header"><div><h3 id="financeDetailTitle">Chi tiết khách hàng</h3><p id="financeDetailPeriod"></p></div><button class="bb-modal-close-btn" aria-label="Đóng chi tiết khách hàng" onclick="closeFinanceDetail()">&times;</button></div><div id="financeDetailContent" class="bb-modal-body"></div><div class="bb-modal-footer"><button class="btn-ghost-primary" onclick="closeFinanceDetail()">Đóng</button><a id="financeDetailExport" class="btn-neon-green">Xuất Excel khách này theo ngày</a></div>`;
  document.body.appendChild(modal);
}
function closeFinanceDetail(){const modal=document.getElementById('financeDetailModal');if(modal?.open)modal.close();}
function openFinanceDetail(index) {
  const customer=financeRows[index];if(!customer||!financeLoaded)return;
  showFinanceCustomerDetail(customer,financePeriod);
}
function showFinanceCustomerDetail(customer,period) {
  const escape=blindBagEscape;
  const time=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa lưu ngày';
  const groups=[['1. Bàn kèo',['Bàn kèo']],['2. Túi mè và sản phẩm bốc được',['Mua túi mè và hàng kèm','Sản phẩm bốc được']],['3. Shop thu lại đồ pass',['Shop thu lại']]];
  document.getElementById('financeDetailTitle').textContent='Chi tiết khách: '+customer.customerName;
  document.getElementById('financeDetailPeriod').textContent=period.label+' · Giờ Việt Nam';
  document.getElementById('financeDetailExport').href=financeExportURL(customer.customerName,period);
  document.getElementById('financeDetailExport').textContent=period.date?'Xuất Excel khách này theo ngày':'Xuất Excel quyết toán tổng của khách';
  const note=e=>e.type==='Bàn kèo'?`<p>Tổng vào: ${formatVND(e.buyCost || 0)} · Hoa hậu: ${formatVND(e.prizeWon || 0)} · Hàng kèm: ${formatVND(e.attachedCost || 0)}</p>`:'';
  const items=e=>(e.items||e.attachedItems||[]).length?'<p>'+(e.items||e.attachedItems).map(p=>escape(p.name)+' × '+Number(p.quantity??p.qty??1)).join(', ')+'</p>':'';
  const sections=groups.map(([title,types])=>{const events=customer.events.filter(e=>types.includes(e.type));return `<section class="finance-detail-section"><h4>${title}</h4>${events.length?`<div class="finance-detail-scroll"><table class="bb-table"><thead><tr><th>Thời gian</th><th>Menu / đợt</th><th>Chuyến / slot</th><th>Nội dung</th><th>Số tiền / số dư</th><th>Trạng thái</th></tr></thead><tbody>${events.map(e=>`<tr><td>${escape(time(e.occurredAt))}</td><td>${escape(e.context)}</td><td>${escape(e.slots)}</td><td><b>${escape(e.name)}</b>${note(e)}${items(e)}${e.type==='Mua túi mè và hàng kèm'&&e.discount?'<p>Giảm giá: '+formatVND(e.discount)+'</p>':''}</td><td>${e.type==='Sản phẩm bốc được'?'—':formatVND(e.amount)}</td><td>${escape(e.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Không có giao dịch trong phần này.</p>'}</section>`;}).join('');
  const final=customer.customerPays?'KHÁCH CẦN TRẢ SHOP: '+formatVND(customer.customerPays):customer.shopPays?'SHOP CẦN TRẢ KHÁCH: '+formatVND(customer.shopPays):'KHÔNG CÒN CHÊNH LỆCH';
  document.getElementById('financeDetailContent').innerHTML=`<div class="finance-detail-summary"><div>Số dư bàn kèo<strong>${formatVND(customer.slotNet)}</strong></div><div>Túi mè còn thiếu<strong>${formatVND(customer.bagDue)}</strong></div><div>Tiền pass<strong>${formatVND(customer.buybackTotal)}</strong></div></div><p class="finance-detail-final ${customer.customerPays?'bb-finance-pay':'bb-finance-receive'}">${final}</p><p class="finance-help">Số cuối = số dư bàn kèo − túi mè còn thiếu + tiền pass. Hóa đơn đã trả không bị trừ lại. Phiếu pass đã hủy không được cộng tiền. Chuyến chưa chốt còn tạm tính.</p>${sections}`;
  document.getElementById('financeDetailModal').showModal();
}
