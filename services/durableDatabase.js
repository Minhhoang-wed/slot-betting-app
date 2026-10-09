// Configured deployments must never silently substitute process-local data.
const config = require('../config/supabase.config');
function checked(query) {
  return new Proxy(query, {
    get(target, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve(target).then(result => {
        if (result.error) throw new Error('Không thể lưu/đọc DB: ' + result.error.message);
        return result;
      }).then(resolve, reject);
      const value = target[key];
      return typeof value === 'function' ? (...args) => checked(value.apply(target, args)) : value;
    }
  });
}
module.exports = {
  isConfigured: config.isConfigured,
  supabase: config.supabase ? {
    from: (...args) => checked(config.supabase.from(...args)),
    rpc: (...args) => checked(config.supabase.rpc(...args))
  } : null
};
