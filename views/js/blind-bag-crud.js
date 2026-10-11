// Each CRUD request carries the version shown when the administrator opens the form.
let bbCrudDialog=null;
function blindBagCrudDialog(title,body,saveLabel,action) {
  if(!bbCrudDialog) {
    bbCrudDialog=document.createElement('dialog');bbCrudDialog.className='finance-detail-dialog bb-crud-dialog';
    bbCrudDialog.setAttribute('aria-labelledby','bbCrudTitle');document.body.appendChild(bbCrudDialog);
  }
  bbCrudDialog.innerHTML=`<form id="bbCrudForm"><div class="bb-modal-header"><h3 id="bbCrudTitle">${blindBagEscape(title)}</h3><button type="button" class="bb-modal-close-btn" aria-label="Đóng quản lý Túi mù">×</button></div><div class="bb-modal-body">${body}<p id="bbCrudMessage" role="status"></p></div><div class="bb-modal-footer"><button type="button" class="btn-ghost-primary" id="bbCrudClose">Đóng</button>${action?`<button type="submit" class="btn-neon-green" id="bbCrudSave">${blindBagEscape(saveLabel)}</button>`:''}</div></form>`;
  bbCrudDialog.querySelector('.bb-modal-close-btn').onclick=()=>bbCrudDialog.close();
  bbCrudDialog.querySelector('#bbCrudClose').onclick=()=>bbCrudDialog.close();
  bbCrudDialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(blindBagBusy||!action)return;
    blindBagBusy=true;const button=bbCrudDialog.querySelector('#bbCrudSave');button.disabled=true;
    try {await action();bbCrudDialog.close();showToast('Đã lưu thay đổi Túi mù.');}
    catch(error){bbCrudDialog.querySelector('#bbCrudMessage').textContent=error.message;}
    finally {blindBagBusy=false;button.disabled=false;await loadBlindBags();}
  };
  bbCrudDialog.showModal();
}
function blindBagCrudReady() {
  if(blindBagBusy)return false;
  if(blindBagPending){showToast('Hãy xử lý hóa đơn Túi mù đang chờ trước khi sửa/xóa.');return false;}
  return true;
}
const bbCrudField=(id,label,value,type='text')=>`<label class="bb-crud-field" for="${id}">${label}<input id="${id}" class="modern-input" type="${type}" value="${blindBagEscape(value)}" ${type==='number'?'min="0" step="1"':'maxlength="100"'} required></label>`;
function openBlindBagRoundEditor() {
  const round=selectedBlindBag();if(!round||!blindBagCrudReady())return;
  const previousVersion=round.version;
  blindBagCrudDialog('Sửa đợt Túi mù',bbCrudField('bbCrudName','Tên đợt',round.data.name)+bbCrudField('bbCrudPrice','Giá mỗi slot (đ)',round.data.price,'number')+'<p>Giá mới áp dụng cho slot bán tiếp theo. Các hóa đơn đã bán giữ nguyên số tiền.</p>','Lưu đợt',async()=>{
    const name=document.getElementById('bbCrudName').value.trim(),price=Number(document.getElementById('bbCrudPrice').value);
    await blindBagAPI('/'+round.id,{name,price,previousVersion},'PUT');
    const item=cart.find(i=>i.blindBagRoundId===round.id);if(item){item.product.price=price;renderCart();}
  });
}
function openBlindBagRoundDelete() {
  const round=selectedBlindBag();if(!round||!blindBagCrudReady())return;
  const previousVersion=round.version;
  blindBagCrudDialog('Xóa đợt '+round.data.name,`<p>Đợt có <b>${round.data.slots.length} slot</b> và <b>${round.data.orders.length} hóa đơn</b>.</p><p>Đợt, hóa đơn và tiền pass của đợt sẽ được bỏ khỏi quyết toán. Bạn có thể khôi phục ở <b>Đợt đã xóa</b>.</p><p>Thao tác này sửa dữ liệu, không tạo giao dịch hoàn tiền.</p>`,'Xóa đợt này',async()=>{
    await blindBagAPI('/'+round.id,{previousVersion},'DELETE');
    cart=cart.filter(i=>i.blindBagRoundId!==round.id);renderCart();
  });
}
function openBlindBagSlotEditor(number) {
  const round=selectedBlindBag();if(!round||!blindBagCrudReady())return;
  const slot=round.data.slots.find(s=>s.number===number),previousVersion=round.version;
  const body=bbCrudField('bbCrudCustomer','Tên khách',slot?.customerName || document.getElementById('shopCustomerName')?.value || '')+`<label class="bb-crud-field" for="bbCrudPhone">Số điện thoại<input id="bbCrudPhone" class="modern-input" maxlength="30" value="${blindBagEscape(slot?.phone || '')}"></label>`;
  blindBagCrudDialog((slot?'Sửa':'Thêm khách vào')+' slot #'+number,body+(slot?'<p>Chỉ đổi khách của slot này. Hàng mua kèm ở hóa đơn cũ được giữ cho khách cũ; tiền slot và giảm giá được tách riêng. Sản phẩm bốc được và tiền pass của slot đi cùng khách mới.</p>':`<p>Giá slot: <b>${formatVND(round.data.price)}</b>. Tạo hóa đơn riêng, ban đầu là chưa trả tiền.</p>`),slot?'Lưu slot':'Thêm khách',async()=>{
    const customerName=document.getElementById('bbCrudCustomer').value.trim(),phone=document.getElementById('bbCrudPhone').value;
    if(slot)await blindBagAPI(`/${round.id}/slots/${number}`,{customerName,phone,previousVersion},'PUT');
    else await blindBagAPI(`/${round.id}/checkout`,{requestId:crypto.randomUUID(),customerName,phone,quantity:1,slotNumber:number,items:[],discount:0});
  });
}
function openBlindBagSlotDelete(number) {
  const round=selectedBlindBag(),slot=round?.data.slots.find(s=>s.number===number);if(!slot||!blindBagCrudReady())return;
  const previousVersion=round.version;
  blindBagCrudDialog('Xóa slot #'+number,`<p>Khách: <b>${blindBagEscape(slot.customerName)}</b>.</p><p>Xóa phần hóa đơn của slot này và bỏ tiền pass của slot khỏi quyết toán. Các slot khác, hàng mua kèm và phần giảm giá còn lại được giữ nguyên.</p><p>Có thể khôi phục ở <b>Slot đã xóa</b>. Thao tác này không tạo giao dịch hoàn tiền.</p>`,'Xóa slot này',()=>blindBagAPI(`/${round.id}/slots/${number}`,{previousVersion},'DELETE'));
}
async function openBlindBagTrash() {
  if(!blindBagCrudReady())return;
  try {
    const {data}=await blindBagAPI('?deleted=true');
    blindBagCrudDialog('Đợt Túi mù đã xóa',data.length?data.map((r,i)=>`<div class="bb-crud-trash-row"><div><b>${blindBagEscape(r.data.name)}</b><br>${r.data.slots.length} slot · ${r.data.orders.length} hóa đơn</div><button type="button" class="btn-ghost-primary" data-restore-round="${i}">Khôi phục đợt</button></div>`).join(''):'<p>Chưa có đợt đã xóa.</p>');
    bbCrudDialog.querySelectorAll('[data-restore-round]').forEach(button=>button.onclick=()=>restoreBlindBagCrud('/'+data[Number(button.dataset.restoreRound)].id+'/restore',{previousVersion:data[Number(button.dataset.restoreRound)].version}));
  }catch(error){showToast(error.message);}
}
function openBlindBagSlotTrash() {
  const round=selectedBlindBag();if(!round||!blindBagCrudReady())return;
  const entries=round.data.deletedSlots || [];
  blindBagCrudDialog('Slot đã xóa — '+round.data.name,entries.length?entries.map((e,i)=>`<div class="bb-crud-trash-row"><div><b>Slot #${e.slot.number} · ${blindBagEscape(e.slot.customerName)}</b><br>Hóa đơn: ${formatVND(e.order.total)}</div><button type="button" class="btn-ghost-primary" data-restore-slot="${i}">Khôi phục slot</button></div>`).join(''):'<p>Chưa có slot đã xóa.</p>');
  bbCrudDialog.querySelectorAll('[data-restore-slot]').forEach(button=>button.onclick=()=>restoreBlindBagCrud(`/${round.id}/slots/restore`,{previousVersion:round.version,deletedSlotId:entries[Number(button.dataset.restoreSlot)].id}));
}
async function restoreBlindBagCrud(path,body) {
  if(blindBagBusy)return;blindBagBusy=true;
  try {await blindBagAPI(path,body);bbCrudDialog.close();showToast('Đã khôi phục dữ liệu và quyết toán.');}
  catch(error){bbCrudDialog.querySelector('#bbCrudMessage').textContent=error.message;}
  finally {blindBagBusy=false;await loadBlindBags();}
}
