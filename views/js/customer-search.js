(function (root) {
  // Search normalization is separate from customer identity and settlement keys.
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().trim().replace(/\s+/g, ' ');
  const matches = (name, query) => normalize(name).includes(normalize(query));
  const api = { normalize, matches };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CustomerSearch = api;
})(typeof window === 'undefined' ? this : window);
