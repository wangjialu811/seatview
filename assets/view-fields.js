(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeatViewFields = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const options = Object.freeze({
    stageDistance: ['非常近','较近','近','正常','较远','远','非常远'],
    viewingAngle: ['正面','偏正面','侧面','偏侧面','侧后方','后方'],
    obstruction: ['完全无遮挡','基本无遮挡','轻微遮挡','部分遮挡','严重遮挡'],
    shootingFriendly: ['非常适合','比较适合','一般','不太适合','不适合']
  });
  const rules = {
    stageDistance: [ [/非常近|特别近|很近|超近/, '非常近'], [/非常远|特别远|很远|超远/,'非常远'], [/较近|比较近|挺近/,'较近'], [/较远|比较远|略远|不近/,'较远'], [/中等|正常|适中/,'正常'], [/近/,'近'], [/远/,'远'] ],
    viewingAngle: [ [/侧后|斜后/,'侧后方'], [/后方|背面|后面/,'后方'], [/偏侧|较侧|斜侧/,'偏侧面'], [/侧面|侧视/,'侧面'], [/偏正|略微偏|稍偏|微侧/,'偏正面'], [/正面|正中|^正$/,'正面'] ],
    obstruction: [ [/基本无|基本没有|没有明显|无明显|几乎无/,'基本无遮挡'], [/完全无|完全没有|没有.*遮挡|无遮挡|^无$/,'完全无遮挡'], [/严重|明显遮挡|大面积|完全遮挡/,'严重遮挡'], [/轻微|少量|略有|一点|栏杆/,'轻微遮挡'], [/部分|局部|有遮挡|挡住/,'部分遮挡'] ],
    shootingFriendly: [ [/不太适合|不太好|较差|一般偏差/,'不太适合'], [/不适合|不能拍|无法拍|很差/,'不适合'], [/非常适合|特别适合|非常好|优秀|很好/,'非常适合'], [/比较适合|较好|适合.*拍|拍.*还可以|^好$|^可以$/,'比较适合'], [/一般|还行|普通|中等/,'一般'] ]
  };
  function normalize(field, value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    if (options[field]?.includes(text)) return text;
    return rules[field]?.find(([pattern])=>pattern.test(text))?.[1] || null;
  }
  function normalizeRecord(record) {
    const result = {...record};
    for (const field of Object.keys(options)) result[field] = normalize(field, record[field]);
    return result;
  }
  // Populate both admin forms from the same enum. Do not silently discard old values.
  function initializeForm(form) {
    if (!form) return;
    for (const [field, values] of Object.entries(options)) {
      const select = form.elements[field];
      if (!select || select.tagName !== 'SELECT') continue;
      select.replaceChildren();
      for (const value of ['', ...values]) {
        const option = document.createElement('option');
        option.value = value; option.textContent = value || '待确认 / 未填写';
        select.appendChild(option);
      }
    }
  }
  function fillField(form, field, original) {
    const select = form.elements[field];
    if (!select) return;
    const value = normalize(field, original) || '';
    select.value = value;
    if (original && original !== value) select.title = `原始值：${original}${value ? `；对应：${value}` : '；暂无法匹配，留空保存会保留原值'}`;
    else select.removeAttribute?.('title');
    if (select.tagName === 'SELECT') {
      let note = select.parentElement.querySelector('.legacy-field-note');
      if (!note) { note = document.createElement('small'); note.className = 'legacy-field-note'; select.parentElement.appendChild(note); }
      note.textContent = original && original !== value ? select.title : '';
      note.hidden = !note.textContent;
    }
  }
  function seatDetails(text) {
    const section = text.match(/((?:内场)?[A-Za-z]\d*|\d{2,4})\s*区/)?.[1] || text.match(/\b([A-Za-z]\d+)\b/)?.[1] || null;
    const row = text.match(/(?:第\s*)?([0-9]+|[一二三四五六七八九十百]+)\s*排/)?.[1];
    const seatNo = text.match(/(?:(?:(?:内场)?[A-Za-z]\d*|\d{2,4})\s*区\s*)?(?:(?:第\s*)?(?:\d+|[一二三四五六七八九十百]+)\s*排\s*)?(?:第\s*)?\d+\s*(?:号座位|号座|座位|座|号)/)?.[0] || null;
    return {section, row:row ? row+'排' : null, seatNo};
  }
  return {options, normalize, normalizeRecord, initializeForm, fillField, seatDetails};
});
