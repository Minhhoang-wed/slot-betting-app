const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('transfer cards keep customer debts and shop payouts separate, follow name filters and hide while loading', () => {
  const elements = Object.fromEntries(['financeBody','financeSearch','financeTransferSummary','financeShopPaysTotal','financeCustomerPaysTotal','financeShopPaysCount','financeCustomerPaysCount'].map(id => [id,{value:'',textContent:'',innerHTML:'',hidden:false}]));
  const ctx = vm.createContext({ URLSearchParams, document:{getElementById:id=>elements[id]}, CustomerSearch:require('../views/js/customer-search'), formatVND:String, blindBagEscape:String });
  vm.runInContext(fs.readFileSync(require.resolve('../views/js/blind-bag-finance.js'),'utf8'),ctx);
  vm.runInContext(`financeRows=[{customerName:'Kiều',shopPays:800000,customerPays:0,slotNet:800000,bagDue:0,buybackTotal:0},{customerName:'Lan',shopPays:0,customerPays:300000,slotNet:-300000,bagDue:0,buybackTotal:0}];financeLoaded=true;renderFinanceSummary()`,ctx);
  assert.equal(elements.financeShopPaysTotal.textContent,'800000');
  assert.equal(elements.financeCustomerPaysTotal.textContent,'300000');
  assert.match(elements.financeShopPaysCount.textContent,/1 khách cần nhận tiền · 2 khách/);
  elements.financeSearch.value='KIEU';ctx.renderFinanceSummary();
  assert.equal(elements.financeShopPaysTotal.textContent,'800000');
  assert.equal(elements.financeCustomerPaysTotal.textContent,'0');
  assert.match(elements.financeBody.innerHTML,/Kiều/);assert.doesNotMatch(elements.financeBody.innerHTML,/Lan/);
  vm.runInContext('financeLoaded=false;financeRows=[];renderFinanceSummary()',ctx);
  assert.equal(elements.financeTransferSummary.hidden,true);
});
