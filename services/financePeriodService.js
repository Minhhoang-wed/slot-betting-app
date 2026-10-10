const timeZone='Asia/Ho_Chi_Minh';
function dayOf(value) {
  if (!value) return null;
  const date=new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=type=>parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function resolvePeriod(value='all',now=new Date()) {
  if(value==='today')value=dayOf(now);
  if(value==='yesterday')value=dayOf(new Date(new Date(now).getTime()-86400000));
  if(value==='all')return {date:null,label:'Tất cả các ngày',timeZone};
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value){
    const error=new Error('Ngày không hợp lệ. Hãy chọn Hôm nay, Hôm qua, Tất cả hoặc một ngày cụ thể.');error.status=400;throw error;
  }
  return {date:value,label:'Ngày '+value.split('-').reverse().join('/'),timeZone};
}
module.exports={dayOf,resolvePeriod};
