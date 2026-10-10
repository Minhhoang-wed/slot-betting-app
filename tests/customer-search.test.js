const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const search=require('../views/js/customer-search');
const {isolatedModels}=require('../scripts/audit-customer-session.cjs');

test('partial names, capitals, accents and Vietnamese đ match without merging identities',async()=>{
  const names=['Kiều','Khánh','Kim','Lan','Đào'];
  for(const q of ['k','K'])assert.deepEqual(names.filter(n=>search.matches(n,q)),['Kiều','Khánh','Kim']);
  for(const q of ['KIỀU','kiều','kieu','KIEU','Kie\u0302\u0300u'])assert.ok(search.matches('Kiều',q));
  assert.ok(search.matches('Đào','DAO'));
  const report=isolatedModels().Report;
  report.getAllCustomersSummary=async()=>({customers:names.map(customerName=>({customerName,menuBreakdown:{}}))});
  assert.deepEqual((await report.searchCustomer('K')).map(c=>c.customerName),['Kiều','Khánh','Kim']);
  assert.equal((await report.searchCustomer('không tồn tại')).length,0);
});

function ui(){
  const elements={reportSearchCustomerInput:{value:''},clearCustomerSearchBtn:{style:{}},customerQuickInsight:{style:{},replaceChildren(){},textContent:''}};
  const timers=[],pending=[],shown=[];
  const context={document:{getElementById:id=>elements[id]},window:{},AbortController,clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;},loadReports(){},
    fetch:()=>new Promise(resolve=>pending.push(resolve))};
  vm.createContext(context);
  const source=fs.readFileSync('views/js/app.js','utf8');
  vm.runInContext(source.slice(source.indexOf('let customerSearchRevision'),source.indexOf('const activeReportDownloads')),context);
  const render=context.renderCustomerSearchMatches;
  context.renderCustomerSearchMatches=data=>shown.push(data);
  const reply=(i,name)=>pending[i]({ok:true,json:async()=>({success:true,data:[{customerName:name}]})});
  return {context,elements,timers,pending,shown,reply,render};
}
test('all matches remain selectable and names are literal text',()=>{
  class Element {
    constructor(){this.style={};this.children=[];this.attrs={};this.events={};}
    replaceChildren(){this.children=[];}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.append(node);}
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(k,fn){this.events[k]=fn;}
    querySelectorAll(){return this.children;}
    querySelector(){return this.children[0];}
    click(){this.events.click();}
  }
  const u=ui(),box=new Element(),selected=[];
  u.elements.customerQuickInsight=box;
  u.context.document.createElement=()=>new Element();
  u.context.formatVND=n=>String(n);
  u.context.renderCustomerSearchDetail=customer=>selected.push(customer.customerName);
  u.render([{customerName:'Kiều',totalSlots:2,totalPrizeWon:0},{customerName:'Kim <shop>',totalSlots:1,totalPrizeWon:100}], 'k');
  const list=box.children[1];assert.equal(list.children.length,2);assert.equal(selected.length,0);
  assert.equal(list.children[1].children[0].textContent,'Kim <shop>');
  list.children[1].click();assert.equal(selected[0],'Kim <shop>');assert.equal(list.children[1].attrs['aria-pressed'],'true');
  list.children[0].click();assert.equal(selected[1],'Kiều');assert.equal(list.children[1].attrs['aria-pressed'],'false');
});
test('late responses cannot replace results for a newer query or cleared input',async()=>{
  const u=ui();u.elements.reportSearchCustomerInput.value='k';u.context.filterCustomerReports();const old=u.timers.shift()();
  u.elements.reportSearchCustomerInput.value='lan';u.context.filterCustomerReports();const recent=u.timers.shift()();
  u.reply(1,'Lan');await recent;u.reply(0,'Kiều');await old;
  assert.equal(u.shown.length,1);assert.equal(u.shown[0][0].customerName,'Lan');
  u.elements.reportSearchCustomerInput.value='k';u.context.filterCustomerReports();const cleared=u.timers.shift()();
  u.elements.reportSearchCustomerInput.value='';u.context.filterCustomerReports();u.reply(2,'Kiều');await cleared;
  assert.equal(u.shown.length,1);assert.equal(u.elements.customerQuickInsight.style.display,'none');
});
