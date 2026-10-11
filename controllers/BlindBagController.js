const model = require('../models/BlindBagModel');
const handle = action => async (req, res) => {
  try { res.json({ success: true, data: await action(req), persistent: model.persistent }); }
  catch (err) { res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Không thể xử lý túi mù. Vui lòng thử lại.' }); }
};
module.exports = {
  list: handle(req => model.list({deleted:req.query.deleted==='true'})),
  create: handle(req => model.create(req.body)),
  update: handle(req => model.update(req.params.id, req.body)),
  remove: handle(req => model.remove(req.params.id,req.body)),
  restore: handle(req => model.restore(req.params.id,req.body)),
  updateSlot: handle(req => model.updateSlot(req.params.id,{...req.body,slotNumber:Number(req.params.slot)})),
  removeSlot: handle(req => model.removeSlot(req.params.id,{...req.body,slotNumber:Number(req.params.slot)})),
  restoreSlot: handle(req => model.restoreSlot(req.params.id,req.body)),
  checkout: handle(req => model.checkout(req.params.id, req.body)),
  assign: handle(req => model.assign(req.params.id, req.body)),
  payment: handle(req => model.payment(req.params.id, req.body)),
  buyback: handle(req => model.buyback(req.params.id, req.body)),
  voidBuyback: handle(req => model.voidBuyback(req.params.id, req.body))
};
