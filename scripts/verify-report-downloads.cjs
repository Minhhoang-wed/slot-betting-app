const fs=require('node:fs');
const ExcelJS=require('exceljs');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.REPORT_TEST_URL || 'http://127.0.0.1:3107';
 const name=process.env.REPORT_TEST_CUSTOMER || 'kiều';
 fs.mkdirSync('outputs/admin-report-preview',{recursive:true});
 const menus=(await(await fetch(base+'/api/menus')).json()).data;
 const cases=[['Khach_Kieu','/api/reports/export/customer?format=xlsx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}],
 ['Tong_hop','/api/reports/export/all?format=xlsx'],['Lich_su','/api/reports/export/rounds?format=xlsx'],
 ['Menu','/api/reports/export/menu/'+menus[0].id+'?format=xlsx']];
 if(base.includes('127.0.0.1'))cases.push(['Chuyen','/api/reports/export/round?menuId='+menus[0].id+'&roundNumber=1']);
 for(const [label,url,options] of cases){
   const response=await fetch(base+url,options);
   if(!response.ok)throw Error(label+': '+await response.text());
   assert.match(response.headers.get('content-type'),/spreadsheetml/);
   const bytes=Buffer.from(await response.arrayBuffer());
   const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);
   assert.ok(wb.worksheets.length);
   if(label==='Khach_Kieu')assert.equal(wb.worksheets[0].getCell('F9').value,1976000);
   fs.writeFileSync('outputs/admin-report-preview/'+label+'.xlsx',bytes);
   console.log('PASS '+label+': '+wb.worksheets.map(w=>w.name).join(', '));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
