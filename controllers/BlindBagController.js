const model = require('../models/BlindBagModel');
const handle = action => async (req, res) => {
  try { res.json({ success: true, data: await action(req), persistent: model.persistent }); }
  catch (err) { res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Không thể xử lý túi mù. Vui lòng thử lại.' }); }
};
module.exports = {
  list: handle(() => model.list()),
  create: handle(req => model.create(req.body)),
  update: handle(req => model.update(req.params.id, req.body)),
  checkout: handle(req => model.checkout(req.params.id, req.body)),
  assign: handle(req => model.assign(req.params.id, req.body))
};
