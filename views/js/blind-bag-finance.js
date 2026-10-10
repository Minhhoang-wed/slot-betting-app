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

let financeRows=[],financeRevision=0;
function createFinancePanel() {
  const panel=document.createElement('section');panel.id='financePanel';panel.className='surface-card bb-finance-panel';
  panel.innerHTML=`<div class="card-top-bar"><div><h2>Quyết toán chung: Bàn kèo + Túi mù + Pass</h2><p>Số cuối = Số dư bàn kèo − Hóa đơn Túi mù còn thiếu + Tiền pass.</p></div><div class="bb-finance-actions"><a class="btn-neon-green" href="/api/reports/export/finance">Xuất Excel tổng hợp</a><button class="btn-ghost-primary" onclick="loadFinanceSummary()">Làm mới</button></div></div><div class="card-content"><p>Hóa đơn chưa xác nhận trả tiền được tính là còn thiếu. Bàn kèo gồm cả chuyến chưa chốt. Đối chiếu tên khách giống nhau để cấn trừ đúng người.</p><label for="financeSearch">Tìm tên khách</label><input id="financeSearch" class="modern-input" placeholder="Ví dụ: kiều, KIEU, k..." oninput="renderFinanceSummary()"><div id="financeMessage" role="status"></div><div class="bb-finance-scroll"><table class="bb-table"><thead><tr><th>Khách hàng</th><th>Số dư bàn kèo</th><th>Túi mù còn thiếu</th><th>Tiền pass</th><th>SHOP TRẢ KHÁCH</th><th>KHÁCH TRẢ SHOP</th></tr></thead><tbody id="financeBody"></tbody></table></div></div>`;
  document.getElementById('tabReports')?.prepend(panel);
  const shortcut=document.createElement('a');shortcut.href='#financePanel';shortcut.className='btn-neon-green';shortcut.textContent='Xem quyết toán chung / Xuất Excel';shortcut.onclick=()=>{switchTab('reports');loadFinanceSummary();panel.scrollIntoView({behavior:'smooth',block:'start'});};
  document.getElementById('blindBagSection').querySelector('.bb-top-actions').prepend(shortcut);
}
async function loadFinanceSummary() {
  const revision=++financeRevision;
  const message=document.getElementById('financeMessage');if(!message)return;
  message.textContent='Đang tải quyết toán...';
  try {
    const response=await fetch('/api/reports/finance'),json=await response.json();
    if(!response.ok||!json.success)throw new Error(json.error||'Không tải được quyết toán.');
    if(revision!==financeRevision)return;
    financeRows=json.data.customers;renderFinanceSummary();message.textContent='Đã cập nhật quyết toán theo dữ liệu đang lưu.';
  }catch(error){if(revision===financeRevision){financeRows=[];document.getElementById('financeBody').innerHTML='';message.textContent=error.message;}}
}
function renderFinanceSummary() {
  const host=document.getElementById('financeBody');if(!host)return;
  const query=document.getElementById('financeSearch').value;
  const rows=financeRows.filter(c=>CustomerSearch.matches(c.customerName,query));
  host.innerHTML=rows.length?rows.map(c=>`<tr><td><b>${blindBagEscape(c.customerName)}</b></td><td>${formatVND(c.slotNet)}</td><td>${formatVND(c.bagDue)}</td><td>${formatVND(c.buybackTotal)}</td><td class="bb-finance-receive"><b>${formatVND(c.shopPays)}</b></td><td class="bb-finance-pay"><b>${formatVND(c.customerPays)}</b></td></tr>`).join(''):'<tr><td colspan="6">Không có khách phù hợp.</td></tr>';
}
