(function (root) {
  const normalize = value => String(value || '').trim().toLowerCase()
    .replace(/奥林匹克/g, '奥体').replace(/奥体体育中心/g, '奥体中心')
    .replace(/[\s·（）()\-]/g, '');
  function matchesVenue(venue, query) {
    const terms = String(query || '').trim().split(/\s+/).map(normalize).filter(Boolean);
    if (!terms.length) return true;
    const aliases = Array.isArray(venue.aliases) ? venue.aliases : typeof venue.aliases === 'string' ? [venue.aliases] : [];
    const names = [venue.city, venue.name, venue.type, ...aliases].map(normalize);
    const combined = normalize((venue.city || '') + (venue.name || ''));
    return terms.every(term => names.some(name => name.includes(term)) || combined.includes(term)
      || (/^[\u4e00-\u9fff]{2,}$/.test(term) && isSubsequence(term, combined)));
  }
  function isSubsequence(needle, text) {
    let index = 0;
    for (const character of text) if (character === needle[index]) index++;
    return index === needle.length;
  }
  const api = { normalize, matchesVenue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeatViewSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
