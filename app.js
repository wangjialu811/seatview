const venueDescription = "计划收录的热门演唱会场馆。正式上线前需要补充官方容量、座位图和真实视角内容。";
const availableTags = ["无遮挡", "轻微遮挡", "距离近", "距离中等", "距离较远", "大屏清晰", "适合拍照", "适合录像", "正面", "侧面", "偏后"];

let venues = [
  ["beijing-birdnest", "北京", "国家体育场（鸟巢）", "体育场"],
  ["beijing-workers-stadium", "北京", "北京工人体育场", "体育场"],
  ["beijing-national-indoor-stadium", "北京", "国家体育馆", "体育馆"],
  ["beijing-wukesong-arena", "北京", "五棵松体育馆", "体育馆"],
  ["shanghai-stadium", "上海", "上海体育场", "体育场"],
  ["shanghai-mercedes-benz-arena", "上海", "梅赛德斯-奔驰文化中心", "室内馆"],
  ["shanghai-oriental-sports-center", "上海", "东方体育中心", "体育中心"],
  ["guangzhou-olympic-stadium", "广州", "广东奥林匹克体育中心体育场", "体育场"],
  ["guangzhou-gymnasium", "广州", "广州体育馆", "体育馆"],
  ["shenzhen-bay-sports-center", "深圳", "深圳湾体育中心", "体育中心"],
  ["shenzhen-universiade-stadium", "深圳", "深圳大运中心体育场", "体育场"],
  ["nanjing-olympic-stadium", "南京", "南京奥林匹克体育中心体育场", "体育场"],
  ["nanjing-olympic-gymnasium", "南京", "南京奥林匹克体育中心体育馆", "体育馆"],
  ["hangzhou-olympic-stadium", "杭州", "杭州奥体中心体育场", "体育场"],
  ["hangzhou-olympic-gymnasium", "杭州", "杭州奥体中心体育馆", "体育馆"],
  ["chengdu-dongan-lake-main-stadium", "成都", "东安湖体育公园主体育场", "体育场"],
  ["chengdu-phoenix-mountain-football-stadium", "成都", "凤凰山体育公园专业足球场", "足球场"],
  ["wuhan-sports-center-stadium", "武汉", "武汉体育中心体育场", "体育场"],
  ["wuhan-optics-valley-tennis-center", "武汉", "光谷国际网球中心", "网球中心"],
  ["xian-olympic-stadium", "西安", "西安奥林匹克体育中心体育场", "体育场"]
].map(([id, city, name, type]) => ({
  id,
  city,
  name,
  type,
  capacity: "待核验",
  address: "",
  description: venueDescription,
  coverImage: "",
  isHot: true,
  status: "已发布"
}));

let seatMaps = [];
let sections = [];
let viewRecords = [];
let xhsDrafts = [];
let selectedVenueId = venues[0].id;
let selectedSectionId = null;
let zoom = 1;
let recordFilter = { section: "", row: "", seat: "" };
let showAllVenueRecords = true;
let searchTimer;
let searchExpanded = false;
let hotVenuesExpanded = false;
let searchQuery = '';
let recommendationEpoch = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const isAdminPage = !!$("#admin");
const isFrontPage = !!$("#venueGrid");

function slugify(text) {
  return `${Date.now()}-${text}`.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || !file.name) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function loadServerState() {
  try {
    let response = await fetch(isFrontPage ? "/api/public-state" : "/api/state");
    if (isFrontPage && response.status === 404) response = await fetch("/api/state");
    if (!response.ok) return;
    const saved = await response.json();
    if (Array.isArray(saved.venues) && saved.venues.length) venues = saved.venues;
    if (Array.isArray(saved.seatMaps)) seatMaps = saved.seatMaps;
    if (Array.isArray(saved.sections)) sections = saved.sections;
    if (Array.isArray(saved.viewRecords)) viewRecords = saved.viewRecords;
    if (Array.isArray(saved.xhsDrafts)) xhsDrafts = saved.xhsDrafts;
    selectedVenueId = venues.some(v=>v.id===new URLSearchParams(location.search).get('venue')) ? new URLSearchParams(location.search).get('venue') : selectedVenueId;
  } catch (error) {
    console.warn("SeatView database could not be loaded.", error);
  }
}

async function saveState() {
  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venues, seatMaps, sections, viewRecords, xhsDrafts })
    });
    if (response.status === 401) {
      alert("后台登录已过期，请重新登录。");
      window.location.href = "/login.html";
      return;
    }
    if (!response.ok) throw new Error("Server save failed");
  } catch (error) {
    alert("保存到项目数据库失败：请确认是通过 server.js 启动的网站。");
    console.warn("SeatView database could not be saved.", error);
    await loadServerState();
    renderAll();
  }
}

function currentVenue() {
  return venues.find((venue) => venue.id === selectedVenueId) || venues[0];
}

function visibleVenues() {
  return venues.filter((venue) => venue.status !== "已下架");
}

function venueSeatMaps(venueId) {
  return seatMaps.filter((item) => item.venueId === venueId);
}

function venueSections(venueId) {
  return sections.filter((item) => item.venueId === venueId);
}

function sectionRecords(sectionId) {
  return viewRecords.filter((record) => record.sectionId === sectionId && record.status === "已发布");
}

function defaultSeatMap(venueId) {
  const maps = venueSeatMaps(venueId);
  return maps.find((map) => map.isDefault) || maps[0];
}

function ensureSelectedSection() {
  const availableSections = venueSections(selectedVenueId);
  const stillValid = availableSections.some((section) => section.id === selectedSectionId);
  if (!stillValid) selectedSectionId = availableSections[0]?.id || null;
}

function setFormTags(tags = []) {
  const wrap = $("#tagCheckboxes");
  if (!wrap) return;
  wrap.innerHTML = [...new Set([...availableTags, ...tags])].map((tag) => `
    <label class="tag-check"><input type="checkbox" name="tags" value="${escapeHtml(tag)}" ${tags.includes(tag) ? "checked" : ""} /> ${escapeHtml(tag)}</label>
  `).join("");
}

function selectedFormTags(form) {
  return [...form.querySelectorAll('input[name="tags"]:checked')].map((input) => input.value);
}

function renderStats() {
  const publishedRecords = viewRecords.filter((record) => record.status === "已发布");
  const pendingRecords = viewRecords.filter((record) => record.status === "草稿" || record.status === "待审核");
  if ($("#venueCount")) $("#venueCount").textContent = visibleVenues().length;
  if ($("#seatMapCount")) $("#seatMapCount").textContent = seatMaps.length;
  if ($("#sectionCount")) $("#sectionCount").textContent = sections.length;
  if ($("#recordCount")) $("#recordCount").textContent = publishedRecords.length;
  if ($("#adminVenueCount")) $("#adminVenueCount").textContent = venues.length;
  if ($("#adminSectionCount")) $("#adminSectionCount").textContent = sections.length;
  if ($("#adminRecordCount")) $("#adminRecordCount").textContent = viewRecords.length;
  if ($("#adminPendingCount")) $("#adminPendingCount").textContent = pendingRecords.length;
}

function renderVenueOptions() {
  if (!isAdminPage) return;
  $$(".venue-select, #recordVenueSelect").forEach((select) => {
    const value = select.value || selectedVenueId;
    select.innerHTML = venues.map((venue) => `<option value="${escapeHtml(venue.id)}">${escapeHtml(venue.city)} · ${escapeHtml(venue.name)}</option>`).join("");
    select.value = venues.some((venue) => venue.id === value) ? value : selectedVenueId;
  });
}

function renderVenues(list = visibleVenues().filter(venue => venue.isHot !== false)) {
  const venueGrid = $("#venueGrid");
  if (!venueGrid) return;
  venueGrid.innerHTML = "";
  if (!list.length) {
    venueGrid.innerHTML = `<article class="empty-state"><h3>没有找到场馆</h3><p>换个城市或场馆名称试试。</p></article>`;
    return;
  }

  const ordered = [...list].sort((a, b) => venueSections(b.id).length - venueSections(a.id).length);
  if ($('#showMoreVenues')) { $('#showMoreVenues').hidden = ordered.length <= 6; $('#showMoreVenues').textContent = hotVenuesExpanded ? '收起场馆 ↑' : '展开更多场馆 ↓'; }
  (hotVenuesExpanded ? ordered : ordered.slice(0, 6)).forEach((venue) => {
    const button = document.createElement("button");
    const mapCount = venueSeatMaps(venue.id).length;
    const sectionCount = venueSections(venue.id).length;
    button.type = "button";
    button.className = "venue-card";
    button.innerHTML = `
      <p class="eyebrow">${escapeHtml(venue.city)} · ${escapeHtml(venue.type)}</p>
      <h3>${escapeHtml(venue.name)}</h3>
      <p>${mapCount ? "座位图已收录" : "座位图待补充"} · ${sectionCount ? `${sectionCount} 个座区可查看` : "视角待补充"}</p>
      <div class="mini-meta">
        <span>查看座位图与 AI 推荐 →</span>


      </div>
    `;
    button.addEventListener("click", () => selectVenue(venue.id));
    venueGrid.appendChild(button);
  });
}

function renderHotCities() {
  const wrap = $("#hotCityGrid");
  if (!wrap) return;
  const cityCounts = visibleVenues().reduce((acc, venue) => {
    acc[venue.city] = (acc[venue.city] || 0) + 1;
    return acc;
  }, {});
  wrap.innerHTML = Object.entries(cityCounts).map(([city, count]) => `
    <button type="button" data-city-query="${city}"><strong>${city}</strong><span>${count} 个场馆</span></button>
  `).join("");
  $$("[data-city-query]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $("#searchInput");
      if (input) input.value = button.dataset.cityQuery;
      search();
      $("#searchInput")?.scrollIntoView({ block: "center", behavior: "instant" });
      $("#searchInput")?.focus({ preventScroll: true });
    });
  });
}

function renderRecentUpdates() {
  const wrap = $("#recentUpdateGrid");
  if (!wrap) return;
  const latest = viewRecords.filter(r=>r.status === "已发布").slice(-4).reverse();
  wrap.innerHTML = latest.length ? latest.map((record) => {
    const venue = venues.find((item) => item.id === record.venueId);
    const section = sections.find((item) => item.id === record.sectionId);
    return `<article class="review-card"><h3>${escapeHtml(venue?.name || "未知场馆")}</h3><p>${escapeHtml(section?.name || "未知座区")} · ${escapeHtml(record.row || "排数待补充")} · ${escapeHtml(record.status)}</p></article>`;
  }).join("") : `<article class="empty-state"><h3>暂无最近更新</h3><p>后台录入视角记录后，这里会自动展示。</p></article>`;
}

function selectVenue(id, { historyMode = 'push', scroll = true } = {}) {
  const venue = visibleVenues().find(item => item.id === id);
  if (!venue) { showHome({ historyMode: 'replace' }); return; }
  clearTimeout(searchTimer);
  resetAssistant();
  selectedVenueId = id;
  selectedSectionId = venueSections(id)[0]?.id || null;
  recordFilter = { section: '', row: '', seat: '' };
  showAllVenueRecords = true;
  zoom = 1;
  if ($('#zoomValue')) $('#zoomValue').textContent = '100%';
  if (isFrontPage) {
    const state = { query: $('#searchInput').value, expanded: searchExpanded };
    if (historyMode !== 'none') {
      if (historyMode === 'push') history.replaceState(state, '', location.href);
      history[historyMode === 'replace' ? 'replaceState' : 'pushState'](state, '', '/?venue=' + encodeURIComponent(id) + '#viewer');
    }
    $('#homeContent').hidden = true;
    $('#viewer').hidden = false;
    document.body.classList.add('detail-view');
    document.title = venue.name + ' | SeatView';
  }
  renderAll();
  if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); $('#viewer')?.focus({ preventScroll: true }); }
}

function showHome({ historyMode = 'push', hash = '#home', focus = true } = {}) {
  if (!isFrontPage) return;
  clearTimeout(searchTimer);
  resetAssistant();
  $('#homeContent').hidden = false;
  $('#viewer').hidden = true;
  document.body.classList.remove('detail-view');
  document.title = 'SeatView | 演唱会座区决策助手';
  if (historyMode !== 'none') history[historyMode === 'replace' ? 'replaceState' : 'pushState']({ query: $('#searchInput').value, expanded: searchExpanded }, '', '/' + hash);
  search({ keepExpanded: true });
  if (focus) { window.scrollTo({ top: 0, behavior: 'instant' }); $('#searchInput').focus({ preventScroll: true }); }
}

function restoreFrontRoute({ initial = false } = {}) {
  if (!isFrontPage) return;
  const id = new URLSearchParams(location.search).get('venue');
  if (history.state?.query !== undefined) $('#searchInput').value = history.state.query;
  searchExpanded = Boolean(history.state?.expanded);
  if (id && visibleVenues().some(v => v.id === id)) {
    if (initial || $('#viewer').hidden || selectedVenueId !== id) selectVenue(id, { historyMode: 'none', scroll: true });
  } else if (!id && location.hash === '#viewer' && currentVenue()) {
    selectVenue(selectedVenueId, { historyMode: 'replace' });
  } else {
    showHome({ historyMode: 'none', focus: !initial });
    if (id) { $('#routeNotice').hidden = false; $('#routeNotice').textContent = '该场馆不存在或已下架，请重新搜索。'; }
  }
}

function renderSeatMap() {
  const seatMap = $("#seatMap");
  const sectionPicker = $("#seatSectionPicker");
  if (!seatMap) return;
  if (sectionPicker) sectionPicker.replaceChildren();
  const venue = currentVenue();
  if (!venue) { seatMap.innerHTML="<p>暂无场馆，请在后台新增场馆。</p>"; return; }
  const map = defaultSeatMap(venue.id);
  const sectionList = venueSections(venue.id);
  $("#selectedVenueName").textContent = venue.name;
  if ($("#selectedVenueDescription")) $("#selectedVenueDescription").textContent = venue.description || venueDescription;
  $("#selectedVenueMeta").textContent = `${venue.city} · ${venue.type} · ${map ? map.name : "座位图待补充"}`;
  seatMap.style.transform = `scale(${zoom})`;

  sectionList.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `section-button ${section.id === selectedSectionId ? "active" : ""}`;
    button.setAttribute("aria-pressed", String(section.id === selectedSectionId));
    button.textContent = section.name;
    button.addEventListener("click", () => {
      selectedSectionId = section.id;
      showAllVenueRecords = false;
      recordFilter = { section: "", row: "", seat: "" };
      renderSeatMap();
      renderDetail();
    });
    sectionPicker?.appendChild(button);
  });

  if (!map) {
    seatMap.innerHTML = `
      <div class="stage">STAGE</div>
      <div class="seat-map-empty">
        <h3>暂无正式座位图</h3>
        <p>后台上传默认座位图后，前台会在这里展示；维护座区后可点击查看视角内容。</p>
      </div>
    `;
    return;
  }

  seatMap.innerHTML = `<img class="seat-map-image" src="${map.url}" alt="${map.name}" />`;
}

function renderDetail() {
  const detailSectionName = $("#detailSectionName");
  if (!detailSectionName) return;
  const venue = currentVenue();
  if (!venue) return;
  const section = sections.find((item) => item.id === selectedSectionId);
  const venueRecords = viewRecords.filter((record) => record.venueId === venue.id && record.status === "已发布");
  const filteredVenueRecords = getFilteredVenueRecords(venueRecords);
  const hasRecordFilter = hasActiveRecordFilter();
  const records = hasRecordFilter || showAllVenueRecords ? filteredVenueRecords : section ? sectionRecords(section.id) : [];
  const allSectionRecords = section ? viewRecords.filter((record) => record.sectionId === section.id) : [];
  const firstRecord = records[0];
  if ($("#sectionSearchInput")) $("#sectionSearchInput").value = recordFilter.section;
  if ($("#rowSearchInput")) $("#rowSearchInput").value = recordFilter.row;
  if ($("#seatSearchInput")) $("#seatSearchInput").value = recordFilter.seat;

  if (!section && !records.length) {
    $("#detailCoverImage").src = venue.coverImage || "assets/concert-seatview-hero.png";
    $("#detailSectionLevel").textContent = "座区详情";
    detailSectionName.textContent = "暂无座区数据";
    $("#detailReview").textContent = "后台录入视角记录后，这里会展示座区、排数、评价、标签和来源链接。";
    $("#detailRating").textContent = "暂无";
    $("#tagList").innerHTML = "";
    $("#frontRecordList").innerHTML = "";
    return;
  }

  $("#detailCoverImage").src = firstRecord?.imageUrl || defaultSeatMap(venue.id)?.url || venue.coverImage || "assets/concert-seatview-hero.png";
  $("#detailSectionLevel").textContent = hasRecordFilter ? "筛选结果" : showAllVenueRecords ? "全部视角" : `${venue.name} · ${section?.position || "座区视角"}`;
  detailSectionName.textContent = hasRecordFilter ? `${recordFilter.section} 的匹配结果` : showAllVenueRecords ? `${venue.name} 全部视角` : section.name;
  $("#detailReview").textContent = firstRecord
    ? (hasRecordFilter ? `共找到 ${records.length} 条匹配视角。` : firstRecord.reviewText || "暂无文字评价")
    : (hasRecordFilter ? "没有找到匹配的已发布视角记录。" : allSectionRecords.length ? "该座区已有视角记录，但状态还不是“已发布”，所以暂不展示给前台用户。" : "该座区暂无视角记录。");
  $("#detailRating").textContent = firstRecord?.tags?.length ? `${firstRecord.tags.length} 标签` : "暂无";
  $("#tagList").innerHTML = firstRecord?.tags?.length ? firstRecord.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : "";
  $("#frontRecordList").innerHTML = records.length ? records.map(renderFrontRecordCard).join("") : `<article class="front-record"><p>暂无已发布视角记录。</p></article>`;
}

function getFilteredVenueRecords(records) {
  const sectionQuery = recordFilter.section.trim().toLowerCase();
  const rowQuery = recordFilter.row.trim().toLowerCase();
  const seatQuery = recordFilter.seat.trim().toLowerCase();
  if (!sectionQuery && !rowQuery && !seatQuery) return records;
  return records.filter((record) => {
    const section = sections.find((item) => item.id === record.sectionId);
    const sectionText = `${escapeHtml(section?.name || "")}`.toLowerCase();
    const rowText = `${escapeHtml(record.row || "")}`.toLowerCase();
    const seatText = `${escapeHtml(record.seatNo || "")}`.toLowerCase();
    return sectionText.includes(sectionQuery)
      && (!rowQuery || rowText.includes(rowQuery))
      && (!seatQuery || seatText.includes(seatQuery));
  });
}

function hasActiveRecordFilter() {
  return !!(recordFilter.section.trim() || recordFilter.row.trim() || recordFilter.seat.trim());
}

function safeUrl(value) { return /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,|assets\/|\/api\/media\/)/.test(value || '') ? value : ''; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function resetAssistant() {
  recommendationEpoch++;
  if ($('#recommendResult')) $('#recommendResult').replaceChildren();
  if ($('#recommendStatus')) $('#recommendStatus').textContent = '';
  if ($('#recommendationSection')) $('#recommendationSection').hidden = true;
  if ($('#viewRecommendation')) $('#viewRecommendation').hidden = true;
}
function renderFrontRecordCard(record) {
  const section = sections.find((item) => item.id === record.sectionId);
  return `
    <article class="front-record">
      ${record.imageUrl ? `<img class="front-record-image" loading="lazy" decoding="async" src="${escapeHtml(safeUrl(record.imageUrl))}" alt="${escapeHtml(section?.name || "座区")}视角" />` : ""}
      <strong>${escapeHtml(section?.name || "未知座区")} · ${escapeHtml(record.row || "排数待补充")}</strong>
      <div class="tag-list">${(record.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      ${['stageDistance','viewingAngle','obstruction','shootingFriendly'].map((k,i)=>'<div class="record-fact">'+['距离舞台','观看角度','遮挡','拍摄友好度'][i]+'：'+escapeHtml(record[k] || '待补充')+'</div>').join('')}
      ${record.shootingFriendly ? '<p>拍摄参考：'+(/较好|优秀/.test(record.shootingFriendly)?'★★★★☆':/较差/.test(record.shootingFriendly)?'★★☆☆☆':'★★★☆☆')+'（依据文字评价）</p>' : ''}
      <p>${escapeHtml(record.description || record.reviewText || "暂无文字评价")}</p>
      <span>来源：${escapeHtml(record.source || record.sourcePlatform || "来源待补充")}</span><p>${escapeHtml(record.createdAt || '')}</p>
      ${record.sourceUrl ? `<a href="${escapeHtml(safeUrl(record.sourceUrl))}" target="_blank" rel="noreferrer">查看原帖</a>` : ""}
    </article>
  `;
}

function renderReviews() {
  const reviewGrid = $("#reviewGrid");
  if (!reviewGrid) return;
  const published = viewRecords.filter((record) => record.status === "已发布");
  reviewGrid.innerHTML = published.length ? published.slice(-6).reverse().map((record) => {
    const venue = venues.find((item) => item.id === record.venueId);
    const section = sections.find((item) => item.id === record.sectionId);
    return `<article class="review-card"><div class="review-topline"><h3>${escapeHtml(venue?.name || "未知场馆")} · ${escapeHtml(section?.name || "未知座区")}</h3><span class="rating-pill">${escapeHtml(record.row || "排数待补充")}</span></div><p>${escapeHtml(record.reviewText || "暂无文字评价")}</p></article>`;
  }).join("") : `<article class="empty-state"><h3>暂无真实视角</h3><p>后台发布视角记录后，这里会展示最新内容。</p></article>`;
}

function renderAdminLists() {
  if (!isAdminPage) return;
  $("#venueAdminList").innerHTML = venues.map((venue) => `
    <article class="admin-list-item">
      <strong>${escapeHtml(venue.city)} · ${escapeHtml(venue.name)}</strong>
      <p>${escapeHtml(venue.capacity || "容量待核验")} · ${escapeHtml(venue.status || "已发布")} · ${venue.isHot ? "热门" : "普通"}</p>
      <span>${escapeHtml(venue.description || "简介待补充")}</span>
      <button class="inline-action" type="button" data-edit-venue="${escapeHtml(venue.id)}">编辑</button>
      <button class="inline-action danger" type="button" data-delete-venue="${escapeHtml(venue.id)}">删除</button>
    </article>
  `).join("");

  $("#seatMapAdminList").innerHTML = seatMaps.length ? seatMaps.map((map) => {
    const venue = venues.find((item) => item.id === map.venueId);
    return `<article class="admin-list-item"><strong>${map.name}</strong><p>${escapeHtml(venue?.name || "")} · ${map.type} · ${map.isDefault ? "默认图" : "非默认"}</p><span>${map.sourceNote || "来源待补充"}</span><button class="inline-action danger" type="button" data-delete-map="${map.id}">删除</button></article>`;
  }).join("") : `<article class="empty-state"><h3>暂无座位图</h3><p>上传后会显示在这里。</p></article>`;

  $("#sectionAdminList").innerHTML = sections.length ? sections.map((section) => {
    const venue = venues.find((item) => item.id === section.venueId);
    return `<article class="admin-list-item"><strong>${escapeHtml(section.name)}</strong><p>${escapeHtml(venue?.name || "")} · ${escapeHtml(section.sectionType || "类型待补充")} · ${escapeHtml(section.position || "位置待补充")}</p><span>${escapeHtml(section.note || "备注待补充")}</span><button class="inline-action" type="button" data-edit-section="${escapeHtml(section.id)}">编辑</button><button class="inline-action danger" type="button" data-delete-section="${escapeHtml(section.id)}">删除</button></article>`;
  }).join("") : `<article class="empty-state"><h3>暂无座区</h3><p>可手动添加，也可在录入视角时自动生成。</p></article>`;

  $("#recordAdminList").innerHTML = viewRecords.length ? viewRecords.map((record) => {
    const venue = venues.find((item) => item.id === record.venueId);
    const section = sections.find((item) => item.id === record.sectionId);
    return `<article class="admin-list-item"><strong>${escapeHtml(venue?.name || "")} · ${escapeHtml(section?.name || "")}</strong><p>${escapeHtml(record.row || "排数待补充")} · ${escapeHtml(record.status)}</p><span>${escapeHtml(record.sourcePlatform || "来源待补充")}</span><button class="inline-action" type="button" data-edit-record="${escapeHtml(record.id)}">修改</button><button class="inline-action danger" type="button" data-delete-record="${escapeHtml(record.id)}">删除</button></article>`;
  }).join("") : `<article class="empty-state"><h3>暂无视角记录</h3><p>录入记录并设置为已发布后，前台才会展示。</p></article>`;

  const queue = viewRecords.filter((record) => record.status === "草稿" || record.status === "待审核");
  $("#reviewQueueList").innerHTML = queue.length ? queue.map((record) => `<article class="admin-list-item"><strong>${escapeHtml(sections.find(item => item.id === record.sectionId)?.name || "待审核内容")}</strong><p>请核对场馆、座区、排数、评价和标签。确认后改为“已发布”。</p><span>当前状态：${escapeHtml(record.status)}</span><button class="inline-action" type="button" data-edit-record="${escapeHtml(record.id)}">编辑</button><button class="inline-action danger" type="button" data-delete-record="${escapeHtml(record.id)}">删除</button></article>`).join("") : `<article class="empty-state"><h3>暂无待审核内容</h3><p>MVP 暂不开放用户投稿。</p></article>`;
}

function renderAll() {
  ensureSelectedSection();
  if ($("#assistantVenue")) $("#assistantVenue").textContent = `当前场馆：${currentVenue()?.name || ""}`;
  renderStats();
  renderVenueOptions();
  if (!$("#recordForm")?.elements.recordId.value) setFormTags();
  renderVenues();
  renderHotCities();
  renderRecentUpdates();
  renderSeatMap();
  renderDetail();
  renderReviews();
  renderAdminLists();
  if (isFrontPage) search({ keepExpanded: true });
}

function search({ keepExpanded = false } = {}) {
  if (!isFrontPage) return;
  clearTimeout(searchTimer);
  const query = $('#searchInput').value.trim();
  if (query !== searchQuery || !keepExpanded) searchExpanded = false;
  searchQuery = query;
  const active = Boolean(query);
  $('#searchResults').hidden = !active;
  $('#routeNotice').hidden = true;
  $('#homeContent').classList.toggle('is-searching', active);
  const results = visibleVenues().filter(venue => SeatViewSearch.matchesVenue(venue, query));
  $('#searchResultCount').textContent = active ? '找到 ' + results.length + ' 个相关场馆' : '';
  $('#searchResultList').replaceChildren();
  $('#showAllSearchResults').hidden = !active || searchExpanded || results.length <= 4;
  if (!active) return;
  if (!results.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = '暂未找到相关场馆，试试其他城市或场馆名称。';
    $('#searchResultList').appendChild(empty);
    return;
  }
  for (const venue of searchExpanded ? results : results.slice(0, 4)) {
    const link = document.createElement('a');
    const count = venueSections(venue.id).length;
    link.className = 'search-result-card';
    link.href = '/?venue=' + encodeURIComponent(venue.id) + '#viewer';
    link.innerHTML = '<div><strong>' + escapeHtml(venue.name) + '</strong><span>' + escapeHtml(venue.city) + ' · ' + escapeHtml(venue.type || '场馆') + ' · ' + (count ? count + ' 个座区可查看' : '视角待补充') + '</span></div><span class="result-cta">查看座位图与 AI 座区推荐 →</span>';
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); selectVenue(venue.id);
    });
    $('#searchResultList').appendChild(link);
  }
  $('#showAllSearchResults').textContent = '查看全部 ' + results.length + ' 个结果 ↓';
}

function fillVenueForm(id) {
  const venue = venues.find((item) => item.id === id);
  const form = $("#venueForm");
  if (!venue || !form) return;
  form.querySelector('[name="venueId"]').value = venue.id;
  form.querySelector('[name="city"]').value = venue.city || "";
  form.querySelector('[name="name"]').value = venue.name || "";
  form.querySelector('[name="type"]').value = venue.type || "";
  form.querySelector('[name="capacity"]').value = venue.capacity || "";
  form.querySelector('[name="address"]').value = venue.address || "";
  form.querySelector('[name="status"]').value = venue.status || "已发布";
  form.querySelector('[name="isHot"]').checked = !!venue.isHot;
  form.querySelector('[name="description"]').value = venue.description || "";
  $('[data-admin-tab="venueAdmin"]')?.click();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillSectionForm(id) {
  const section = sections.find((item) => item.id === id);
  const form = $("#sectionForm");
  if (!section || !form) return;
  form.querySelector('[name="sectionId"]').value = section.id;
  form.querySelector('[name="venueId"]').value = section.venueId;
  form.querySelector('[name="name"]').value = section.name || "";
  form.querySelector('[name="sectionType"]').value = section.sectionType || "";
  form.querySelector('[name="level"]').value = section.level || "";
  form.querySelector('[name="position"]').value = section.position || "";
  form.querySelector('[name="note"]').value = section.note || "";
  $('[data-admin-tab="sectionAdmin"]')?.click();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillRecordForm(id) {
  const record = viewRecords.find((item) => item.id === id);
  const form = $("#recordForm");
  if (!record || !form) return;
  const section = sections.find((item) => item.id === record.sectionId);
  form.querySelector('[name="recordId"]').value = record.id;
  form.querySelector('[name="venueId"]').value = record.venueId;
  form.querySelector('[name="sectionName"]').value = section?.name || "";
  form.querySelector('[name="row"]').value = record.row || "";
  form.querySelector('[name="seatNo"]').value = record.seatNo || "";
  form.querySelector('[name="image"]').value = "";
  showRecordImage(record.imageUrl || record.image || "");
  form.querySelector('[name="publishedAt"]').value = record.publishedAt || "";
  form.querySelector('[name="sourcePlatform"]').value = record.sourcePlatform || "";
  form.querySelector('[name="sourceUrl"]').value = record.sourceUrl || "";
  form.querySelector('[name="status"]').value = record.status || "已发布";
  form.querySelector('[name="reviewText"]').value = record.reviewText || "";
  for (const k of ['stageDistance','viewingAngle','obstruction','shootingFriendly']) form.elements[k].value = record[k] || '';
  setFormTags(record.tags || []);
  $('[data-admin-tab="recordAdmin"]')?.click();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showRecordImage(url) {
  const preview = $("#recordImagePreview");
  if (!preview) return;
  const src = safeUrl(url);
  preview.hidden = !src;
  if (src) preview.src = src;
  else preview.removeAttribute("src");
}

function bindEvents() {
  $('#recordForm [name="image"]')?.addEventListener('change', async (event) => {
    const image = await fileToDataUrl(event.target.files[0]);
    const previous = viewRecords.find(item => item.id === $('#recordForm').elements.recordId.value);
    showRecordImage(image || previous?.imageUrl || previous?.image || '');
  });
  $("#logoutButton")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });

  $("#searchButton")?.addEventListener("click", () => search());
  $("#searchInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); search(); }
  });
  $('#searchInput')?.addEventListener('input', event => {
    clearTimeout(searchTimer);
    if (event.isComposing) return;
    if (!event.target.value.trim()) search();
    else searchTimer = setTimeout(() => search(), 160);
  });
  $('#searchInput')?.addEventListener('compositionend', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(), 160); });
  $('#clearSearch')?.addEventListener('click', () => { $('#searchInput').value = ''; search(); $('#searchInput').focus(); });
  $('#showAllSearchResults')?.addEventListener('click', () => { searchExpanded = true; search({ keepExpanded: true }); });
  $('#showMoreVenues')?.addEventListener('click', () => { hotVenuesExpanded = !hotVenuesExpanded; renderVenues(); });
  $('#backToHome')?.addEventListener('click', () => showHome());
  $('#openAiAssistant')?.addEventListener('click', () => { $('#aiAssistantBox').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('#recommendText').focus({ preventScroll: true }); });
  $$('[data-home-link]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const hash = link.getAttribute('href').startsWith('#') ? link.getAttribute('href') : '#home';
    if (hash !== '#home') { $('#searchInput').value = ''; searchExpanded = false; }
    showHome({ hash });
    if (!searchQuery && hash !== '#home') $(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }));
  window.addEventListener('popstate', () => restoreFrontRoute());
  $$(".quick-tags button").forEach((button) => button.addEventListener("click", () => {
    $("#searchInput").value = button.dataset.query;
    search();
  }));
  $("#zoomIn")?.addEventListener("click", () => {
    zoom = Math.min(1.35, zoom + 0.1);
    $("#zoomValue").textContent = `${Math.round(zoom * 100)}%`;
    renderSeatMap();
  });
  $("#zoomOut")?.addEventListener("click", () => {
    zoom = Math.max(0.75, zoom - 0.1);
    $("#zoomValue").textContent = `${Math.round(zoom * 100)}%`;
    renderSeatMap();
  });
  $("#recordSearchButton")?.addEventListener("click", () => {
    const sectionValue = ($("#sectionSearchInput")?.value || "").trim();
    if (!sectionValue) {
      alert("请先输入座区，例如：552区。排数和座位号可以不填。");
      return;
    }
    recordFilter = {
      section: sectionValue,
      row: ($("#rowSearchInput")?.value || "").trim(),
      seat: ($("#seatSearchInput")?.value || "").trim()
    };
    showAllVenueRecords = false;
    renderDetail();
  });
  ["#sectionSearchInput", "#rowSearchInput", "#seatSearchInput"].forEach((selector) => {
    $(selector)?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      $("#recordSearchButton")?.click();
    });
  });
  $("#recordShowAllButton")?.addEventListener("click", () => {
    recordFilter = { section: "", row: "", seat: "" };
    showAllVenueRecords = true;
    if ($("#sectionSearchInput")) $("#sectionSearchInput").value = "";
    if ($("#rowSearchInput")) $("#rowSearchInput").value = "";
    if ($("#seatSearchInput")) $("#seatSearchInput").value = "";
    renderDetail();
  });
  $("#submitReviewButton")?.addEventListener("click", () => {
    if (typeof $("#reviewDialog")?.showModal === "function") $("#reviewDialog").showModal();
  });
  $$(".admin-sidebar button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".admin-sidebar button").forEach((item) => item.classList.remove("active"));
      $$(".admin-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.adminTab}`)?.classList.add("active");
    });
  });
  document.addEventListener("click", async (event) => {
    const editVenue = event.target.closest("[data-edit-venue]");
    const deleteVenue = event.target.closest("[data-delete-venue]");
    const deleteMap = event.target.closest("[data-delete-map]");
    const editSection = event.target.closest("[data-edit-section]");
    const deleteSection = event.target.closest("[data-delete-section]");
    const editRecord = event.target.closest("[data-edit-record]");
    const deleteRecord = event.target.closest("[data-delete-record]");
    if (editVenue) return fillVenueForm(editVenue.dataset.editVenue);
    if (editSection) return fillSectionForm(editSection.dataset.editSection);
    if (editRecord) return fillRecordForm(editRecord.dataset.editRecord);
    if (deleteVenue) {
      venues = venues.filter((venue) => venue.id !== deleteVenue.dataset.deleteVenue);
      seatMaps = seatMaps.filter((map) => map.venueId !== deleteVenue.dataset.deleteVenue);
      sections = sections.filter((section) => section.venueId !== deleteVenue.dataset.deleteVenue);
      viewRecords = viewRecords.filter((record) => record.venueId !== deleteVenue.dataset.deleteVenue);
    }
    if (deleteMap) seatMaps = seatMaps.filter((map) => map.id !== deleteMap.dataset.deleteMap);
    if (deleteSection) {
      sections = sections.filter((section) => section.id !== deleteSection.dataset.deleteSection);
      viewRecords = viewRecords.filter((record) => record.sectionId !== deleteSection.dataset.deleteSection);
    }
    if (deleteRecord) viewRecords = viewRecords.filter((record) => record.id !== deleteRecord.dataset.deleteRecord);
    if (deleteVenue || deleteMap || deleteSection || deleteRecord) {
      selectedVenueId = venues[0]?.id || "";
      await saveState();
      renderAll();
    }
  });
}

async function bindForms() {
  $("#venueForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const venueId = data.get("venueId");
    const coverImage = await fileToDataUrl(data.get("coverImage"));
    const venue = {
      id: venueId || slugify(data.get("name")),
      city: data.get("city"),
      name: data.get("name"),
      type: data.get("type"),
      capacity: data.get("capacity") || "待核验",
      address: data.get("address"),
      description: data.get("description") || venueDescription,
      coverImage: coverImage || venues.find((item) => item.id === venueId)?.coverImage || "",
      isHot: data.get("isHot") === "on",
      status: data.get("status")
    };
    venues = venueId ? venues.map((item) => item.id === venueId ? venue : item) : [...venues, venue];
    selectedVenueId = venue.id;
    form.reset();
    await saveState();
    renderAll();
  });

  $("#seatMapForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const venueId = data.get("venueId");
    const map = {
      id: slugify(data.get("name")),
      venueId,
      name: data.get("name"),
      url: await fileToDataUrl(data.get("file")),
      type: data.get("mapType"),
      sourceNote: data.get("sourceNote"),
      note: data.get("note"),
      uploadedAt: new Date().toLocaleString("zh-CN"),
      isDefault: data.get("isDefault") === "on"
    };
    if (map.isDefault) seatMaps = seatMaps.map((item) => item.venueId === venueId ? { ...item, isDefault: false } : item);
    seatMaps.push(map);
    selectedVenueId = venueId;
    form.reset();
    await saveState();
    renderAll();
  });

  $("#sectionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const sectionId = data.get("sectionId");
    const section = {
      id: sectionId || slugify(`${data.get("venueId")}-${data.get("name")}`),
      venueId: data.get("venueId"),
      name: data.get("name"),
      sectionType: data.get("sectionType"),
      level: data.get("level"),
      position: data.get("position"),
      note: data.get("note")
    };
    sections = sectionId ? sections.map((item) => item.id === sectionId ? section : item) : [...sections, section];
    selectedVenueId = section.venueId;
    selectedSectionId = section.id;
    form.reset();
    await saveState();
    renderAll();
  });

  $("#recordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const venueId = data.get("venueId");
    const recordId = data.get("recordId");
    const sectionName = String(data.get("sectionName") || "").trim();
    let section = sections.find((item) => item.venueId === venueId && item.name === sectionName);
    if (!section) {
      section = {
        id: slugify(`${venueId}-${sectionName}`),
        venueId,
        name: sectionName,
        sectionType: "视角录入生成",
        level: "",
        position: "",
        note: "由视角记录自动生成"
      };
      sections.push(section);
    }
    const previous = viewRecords.find((item) => item.id === recordId);
    const imageUrl = await fileToDataUrl(data.get("image"));
    const record = {
      ...previous,
      stageDistance: data.get('stageDistance') || null, viewingAngle: data.get('viewingAngle') || null, obstruction: data.get('obstruction') || null, shootingFriendly: data.get('shootingFriendly') || null,
      description: data.get('reviewText'), source: data.get('sourcePlatform'), createdAt: previous?.createdAt || new Date().toISOString(), venueName: venues.find(v=>v.id===venueId)?.name, section: section.name,
      id: recordId || slugify(`${venueId}-${escapeHtml(section.id)}`),
      venueId,
      sectionId: section.id,
      row: data.get("row"),
      seatNo: data.get("seatNo"),
      publishedAt: data.get("publishedAt"),
      imageUrl: imageUrl || previous?.imageUrl || previous?.image || "",
      image: imageUrl || previous?.imageUrl || previous?.image || "",
      reviewText: data.get("reviewText"),
      sourcePlatform: data.get("sourcePlatform"),
      sourceUrl: data.get("sourceUrl"),
      tags: selectedFormTags(form),
      status: data.get("status") || previous?.status || "已发布"
    };
    delete record.artist;
    delete record.eventName;
    viewRecords = recordId ? viewRecords.map((item) => item.id === recordId ? record : item) : [...viewRecords, record];
    selectedVenueId = venueId;
    selectedSectionId = section.id;
    form.reset();
    form.elements.recordId.value = "";
    showRecordImage("");
    setFormTags();
    await saveState();
    renderAll();
  });
}

async function boot() {
  await loadServerState();
  bindEvents();
  bindForms();
  renderAll();
  restoreFrontRoute({ initial: true });
}

boot();
