/* ═══════════════════════════════════════════════════════════
   南島 2026 · 地點分頁的共用邏輯
   手機優先：清單／地圖切換、底部 tab、觸控友善
   資料來源：頁面內的 <script id="places-data" type="application/json">
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var dataEl = document.getElementById('places-data');
  if (!dataEl) return;
  var DB = JSON.parse(dataEl.textContent);
  var CATS = DB.meta.cats;
  var DAYS = DB.meta.days;
  var dayByNum = {};
  DAYS.forEach(function (d) { dayByNum[d.d] = d; });

  var root = document.getElementById('app');
  if (!root) return;

  // data-cat 可以寫成 "glacier" 或 "sight,book" 多個分類。
  // 另外，一個地點可以用 also:["mtcook"] 借放到別的分頁，
  // 而不必離開它原本的分類（例如胡克谷步道本質是景點，但也要出現在健行頁）。
  var PAGE_CATS = (root.dataset.cat || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
  var PAGE_IDS = (root.dataset.ids || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
  var pool = DB.places.filter(function (p) {
    if (!p.lat || !p.lng) return false;
    if (PAGE_IDS.length) return PAGE_IDS.indexOf(p.id) >= 0;
    if (!PAGE_CATS.length) return true;
    return PAGE_CATS.some(function (c) {
      return p.cat === c || (p.also || []).indexOf(c) >= 0;
    });
  }).sort(function (a, b) { return (a.day || 0) - (b.day || 0); });

  /* ── 狀態 ── */
  var state = { days: new Set(), flags: new Set(), view: 'list', q: '' };

  /* ── 小工具 ── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function gmapUrl(p) {
    var q = p.addr ? p.name + ' ' + p.addr : (p.q || p.name + ' New Zealand');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function bookUrls(p) {
    var q = encodeURIComponent(p.bk || (p.name + ' ' + (p.town || 'New Zealand')));
    return {
      klook: 'https://www.klook.com/zh-TW/search/?query=' + q,
      kkday: 'https://www.kkday.com/zh-tw/product/productlist?keyword=' + q
    };
  }
  function dayLabel(p) {
    var d = dayByNum[p.day];
    return d ? 'D' + String(p.day).padStart(2, '0') + ' · ' + d.date : '';
  }
  function isMobile() { return window.matchMedia('(max-width: 780px)').matches; }

  /* ── 搜尋 ── */
  function haystack(p) {
    if (p._hay) return p._hay;
    var d = p.deep || {};
    p._hay = [p.name, p.zh, p.town, p.note, p.price, p.hours, p.addr, p.bk,
      (p.g && p.g.r ? p.g.r + '星 高評價' : ''),
              d.lead, (d.paras || []).join(' '), (d.tips || []).join(' '),
              (p.buy || []).map(function (b) {
                return [b.n, b.d, b.p].filter(Boolean).join(' ');
              }).join(' '),
              (CATS[p.cat] || {}).label,
              'D' + String(p.day).padStart(2, '0'),
              (dayByNum[p.day] || {}).date]
      .filter(Boolean).join(' ').toLowerCase();
    return p._hay;
  }
  function terms() {
    return state.q.toLowerCase().split(/\s+/).filter(Boolean);
  }
  /* 把命中的字詞包成 <mark>，text 會先被跳脫 */
  function hl(text) {
    // 內文允許 <b>：先整段跳脫，再把 <b> 放回來。
    // 直接不跳脫會有 XSS 風險，完全跳脫則會把 <b> 印成文字。
    var t = esc(text).replace(/&lt;(\/?)b&gt;/g, '<$1b>');
    var ts = terms();
    if (!ts.length) return t;
    ts.forEach(function (k) {
      if (k.length < 1) return;
      var re = new RegExp('(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      t = t.replace(re, '<mark>$1</mark>');
    });
    return t;
  }

  /* ── 篩選 ── */
  function pass(p) {
    var ts = terms();
    if (ts.length) {
      var hay = haystack(p);
      for (var i = 0; i < ts.length; i++) if (hay.indexOf(ts[i]) < 0) return false;
    }
    if (state.days.size && !state.days.has(p.day)) return false;
    if (state.flags.has('star') && p.flag !== 'star') return false;
    if (state.flags.has('book') && !p.book) return false;
    if (state.flags.has('free') && !/免費/.test(p.price || '')) return false;
    if (state.flags.has('hideclosed') && p.flag === 'closed') return false;
    return true;
  }

  /* ── 建立篩選列 ── */
  var bar = el('div', 'filters');

  var sw = el('div', 'searchwrap');
  sw.innerHTML =
    '<span class="s-ic" aria-hidden="true">🔍</span>' +
    '<input type="search" class="s-in" enterkeyhint="search" autocomplete="off" ' +
    'autocapitalize="off" spellcheck="false" placeholder="搜尋地點、城鎮、關鍵字…" ' +
    'aria-label="搜尋地點">' +
    '<button type="button" class="s-x" aria-label="清除搜尋" hidden>✕</button>';
  var input = sw.querySelector('.s-in');
  var clearBtn = sw.querySelector('.s-x');
  var deb = null;
  function applyQ(v) {
    state.q = v.trim();
    clearBtn.hidden = !state.q;
    sw.classList.toggle('has', !!state.q);
    render();
  }
  input.addEventListener('input', function () {
    clearTimeout(deb);
    var v = input.value;
    deb = setTimeout(function () { applyQ(v); }, 140);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = ''; applyQ(''); }
  });
  clearBtn.onclick = function () { input.value = ''; applyQ(''); input.focus(); };
  bar.appendChild(sw);

  var daysPresent = [];
  pool.forEach(function (p) { if (daysPresent.indexOf(p.day) < 0) daysPresent.push(p.day); });
  daysPresent.sort(function (a, b) { return a - b; });

  var gDay = el('div', 'grp');
  gDay.appendChild(el('span', 'lbl', '日期'));
  daysPresent.forEach(function (d) {
    var info = dayByNum[d] || {};
    var b = el('button', 'fchip day',
      '<b>' + esc(info.date || '') + '</b>' +
      '<span>D' + String(d).padStart(2, '0') + (info.wd ? ' ' + esc(info.wd) : '') + '</span>');
    b.type = 'button'; b.setAttribute('aria-pressed', 'false');
    b.title = (info.date || '') + '（' + (info.wd || '') + '）' + (info.title || '');
    b.onclick = function () {
      state.days.has(d) ? state.days.delete(d) : state.days.add(d);
      b.setAttribute('aria-pressed', state.days.has(d));
      render();
    };
    gDay.appendChild(b);
  });
  bar.appendChild(gDay);

  var gFlag = el('div', 'grp');
  gFlag.appendChild(el('span', 'lbl', '條件'));
  [['star', '★ 必去'], ['book', '要預約'], ['free', '免費'], ['hideclosed', '隱藏已歇業']]
    .forEach(function (f) {
      var b = el('button', 'fchip', f[1]);
      b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.onclick = function () {
        state.flags.has(f[0]) ? state.flags.delete(f[0]) : state.flags.add(f[0]);
        b.setAttribute('aria-pressed', state.flags.has(f[0]));
        render();
      };
      gFlag.appendChild(b);
    });
  bar.appendChild(gFlag);

  var count = el('span', 'fcount', '');
  bar.appendChild(count);

  /* 選了日期之後，在篩選列下方說明那天的行程長什麼樣，
     這樣「為什麼要按日期篩」才有著落。 */
  var dayline = el('div', 'dayline');
  dayline.hidden = true;

  /* 這一區只收某幾個分類時（例如行程頁的住宿區），選了日期常常只剩一兩張卡。
     不講清楚會讓人以為「那天只有這些地方」——所以把差額直接寫出來。 */
  var BLOCK_LABEL = PAGE_IDS.length ? '指定的幾個地點'
    : (PAGE_CATS.map(function (c) { return (CATS[c] || {}).label || c; })
        .filter(Boolean).join('、'));
  var RESTRICTED = !!(PAGE_IDS.length || PAGE_CATS.length);
  function dayTotal(d) {
    var n = 0;
    DB.places.forEach(function (p) { if (p.day === d) n++; });
    return n;
  }
  /* 那一晚睡哪裡：住宿卡的 nights 會涵蓋連住的每一天 */
  var bedOf = {};
  DB.places.forEach(function (p) {
    if (p.cat !== 'stay') return;
    (p.nights || [p.day]).forEach(function (d) { bedOf[d] = p; });
  });
  var NO_STAY = (DB.meta && DB.meta.no_stay_note) || {};

  function bedHtml(d) {
    var b = bedOf[d];
    if (b) {
      // 連住的第 2 晚之後，卡片是掛在入住那天的——不講會以為「這天沒住宿」
      var nights = b.nights || [b.day];
      var first = nights[0];
      var cont = d !== first
        ? '<span class="cont"> · 續住（卡片在 D' + String(first).padStart(2, '0') + '）</span>'
        : '';
      return '<span class="dl-bed" title="當晚住這裡">' + (d !== first ? '🛏 ' : '🛎 ') +
        esc(b.name) + (b.town ? ' · ' + esc(b.town) : '') + cont + '</span>';
    }
    return NO_STAY[d] ? '<span class="dl-bed none">🛏 ' + esc(NO_STAY[d]) + '</span>' : '';
  }

  function renderDayline() {
    var ds = Array.from(state.days).sort(function (a, b) { return a - b; });
    if (!ds.length) { dayline.hidden = true; dayline.innerHTML = ''; return; }
    dayline.hidden = false;
    dayline.innerHTML = ds.map(function (d) {
      var i = dayByNum[d] || {};
      var here = pool.filter(function (p) { return p.day === d; }).length;
      var all = dayTotal(d);
      var hint = '';
      if (RESTRICTED && all > here) {
        hint = '<span class="dl-note">這一區只列<b>' + esc(BLOCK_LABEL || '部分分類') +
          '</b>，所以這天只有 <b>' + here + '</b> 個；' +
          'D' + String(d).padStart(2, '0') + ' 這天全站共有 <b>' + all +
          '</b> 個地點，其餘在別的分頁與' +
          '<a href="index.html">總覽地圖</a>。</span>';
      }
      return '<div class="dl-row">' +
        '<span class="dl-d">D' + String(d).padStart(2, '0') + '</span>' +
        '<span class="dl-date">' + esc(i.date || '') +
        (i.wd ? '（' + esc(i.wd) + '）' : '') + '</span>' +
        '<span class="dl-t">' + esc(i.title || '') + '</span>' +
        (i.leg ? '<span class="dl-leg">' + esc(i.leg) + '</span>' : '') +
        bedHtml(d) +
        hint +
        '</div>';
    }).join('') +
      '<a class="dl-more" href="itinerary.html">看完整行程與路線圖 →</a>';
  }

  /* ── 手機：清單／地圖切換 ── */
  var seg = el('div', 'viewseg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', '顯示方式');
  var segList = el('button', 'on', '📋 清單');
  var segMap = el('button', '', '🗺 地圖');
  segList.type = segMap.type = 'button';
  segList.setAttribute('role', 'radio'); segMap.setAttribute('role', 'radio');
  segList.setAttribute('aria-checked', 'true');
  segMap.setAttribute('aria-checked', 'false');
  seg.appendChild(segList); seg.appendChild(segMap);
  function setView(v) {
    state.view = v;
    segList.className = v === 'list' ? 'on' : '';
    segMap.className = v === 'map' ? 'on' : '';
    segList.setAttribute('aria-checked', v === 'list');
    segMap.setAttribute('aria-checked', v === 'map');
    root.dataset.view = v;
    // 手機的地圖模式是「介於頂列與底部分頁列之間的全螢幕面板」，
    // 不靠捲動定位，所以不會有捲過頭、地圖上半被切掉的問題。
    var mapMode = (v === 'map' && isMobile());
    document.body.classList.toggle('mapmode', mapMode);
    if (v === 'map' && map) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { map.invalidateSize(); });
      });
      setTimeout(function () { map.invalidateSize(); }, 220);
    }
  }
  segList.onclick = function () { setView('list'); };
  segMap.onclick = function () { setView('map'); };

  /* ── 版面 ── */
  var mapWrap = el('div', 'mapbox');
  mapWrap.id = 'map';
  var grid = el('div', 'places');

  root.appendChild(seg);
  root.appendChild(mapWrap);
  // 樣板裡的日期說明框原本在 #app 外面（也就是地圖上方），離篩選列太遠，
  // 讀者不會把兩件事連起來。搬到篩選列正上方。
  var fhint = document.querySelector('.fhint');
  if (fhint) root.appendChild(fhint);
  root.appendChild(bar);
  root.appendChild(dayline);
  root.appendChild(grid);

  /* ── Leaflet ── */
  var map = null, markers = {}, layer = null;
  if (window.L) {
    map = L.map('map', { scrollWheelZoom: false, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on('click', function () { clearHot(); });
    layer = L.layerGroup().addTo(map);
  }

  function pinIcon(p) {
    var c = (CATS[p.cat] || {}).color || '#3E9DB8';
    if (p.flag === 'closed') c = '#8A94A0';
    var ring = p.flag === 'star' ? 'box-shadow:0 0 0 3px rgba(229,178,60,.55),0 2px 5px rgba(11,22,32,.4);' : '';
    return L.divIcon({
      className: '',
      html: '<span class="pin-hit"><span class="pin-ico" style="background:' + c + ';' +
            ring + '"></span></span>',
      iconSize: [40, 40], iconAnchor: [20, 34], popupAnchor: [0, -32]
    });
  }

  function popupHtml(p) {
    var h = '<div class="pop-h">' + esc(p.name) + '</div>';
    var sub = [dayLabel(p), p.town].filter(Boolean).join(' · ');
    if (sub) h += '<div class="pop-sub">' + esc(sub) + '</div>';
    if (p.price) h += '<p class="pop-meta"><b>' + esc(p.price) + '</b></p>';
    if (p.hours) h += '<p class="pop-meta">' + esc(p.hours) + '</p>';
    if (p.flag === 'closed') h += '<p class="pop-meta pop-warn">已永久歇業</p>';
    else if (p.flag === 'warn') h += '<p class="pop-meta pop-warn">有注意事項，見卡片</p>';
    if (p.geo_approx) h += '<p class="pop-meta" style="color:var(--ink-soft);font-size:.73rem">' +
      '此為概略位置（以「' + esc(p.geo_approx) + '」定位）· 導航請按下面的按鈕' + '</p>';
    h += '<div class="pop-btns"><a class="g" href="' + gmapUrl(p) + '" target="_blank" rel="noopener">在 Google Maps 開啟</a>';
    if (p.url) h += '<a class="o" href="' + esc(p.url) + '" target="_blank" rel="noopener">官網</a>';
    h += '</div>';
    return h;
  }

  function clearHot() {
    document.querySelectorAll('.pl.hot').forEach(function (n) { n.classList.remove('hot'); });
    Object.keys(markers).forEach(function (k) {
      var i = markers[k]._icon && markers[k]._icon.querySelector('.pin-ico');
      if (i) i.classList.remove('on');
    });
  }

  function focusPlace(id, fromMap) {
    clearHot();
    var card = document.getElementById('pl-' + id);
    var m = markers[id];
    if (m) {
      var i = m._icon && m._icon.querySelector('.pin-ico');
      if (i) i.classList.add('on');
    }
    if (card) {
      card.classList.add('hot');
      if (fromMap && !isMobile()) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (!fromMap && m && map) {
      var mob = isMobile();
      if (mob) setView('map');
      else revealMap();          // 桌機：把整張地圖捲進畫面
      setTimeout(function () {
        map.invalidateSize();
        map.setView(m.getLatLng(), Math.max(map.getZoom(), 12), { animate: !mob });
        m.openPopup();
      }, mob ? 160 : 0);
    }
  }

  /* 把地圖整張捲進可視範圍。
     頂列是 sticky 的，所以要扣掉它的高度，否則地圖上緣會被蓋住。 */
  function revealMap() {
    var box = root.querySelector('.mapbox');
    if (!box) return;
    var bar = document.querySelector('.topbar');
    var barH = (bar && getComputedStyle(bar).position === 'sticky')
      ? bar.getBoundingClientRect().height : 0;
    var r = box.getBoundingClientRect();
    var vh = window.innerHeight;
    var PAD = 12;

    // 已經完整看得到就不要亂動，避免畫面無故跳動
    if (r.top >= barH - 1 && r.bottom <= vh + 1) return;

    var docTop = r.top + window.scrollY;          // 絕對位置，不受之後的捲動影響
    var top;
    if (r.height + barH + PAD * 2 <= vh) {
      // 整張放得下：在頂列下方的空間裡置中
      top = docTop - barH - (vh - barH - r.height) / 2;
    } else {
      // 放不下：至少讓上緣貼齊頂列下方
      top = docTop - barH - PAD;
    }
    var max = document.documentElement.scrollHeight - vh;
    top = Math.min(Math.max(0, Math.round(top)), max);
    // 瀏覽器會因為按鈕取得焦點而自己捲一次，所以排到下一幀再捲，確保我們最後生效
    requestAnimationFrame(function () {
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  }

  /* 第一次看到清單時，讓最上面那顆展開鈕動一下，暗示它可以點。
     只做一次，之後記在 localStorage，不再打擾。 */
  var hinted = false;
  function hintFirst(grid) {
    if (hinted) return;
    try { if (localStorage.getItem('nz-deep-hint')) { hinted = true; return; } } catch (e) {}
    var b = grid.querySelector('.pl-more');
    if (!b) return;
    hinted = true;
    b.classList.add('hint');
    setTimeout(function () { b.classList.remove('hint'); }, 4200);
    try { localStorage.setItem('nz-deep-hint', '1'); } catch (e) {}
  }

  /* 評分。這是查證當下的快照，不是即時資料。
     來源不一定是 Google——Google 評分沒有免費且合乎條款的取得方式，
     實務上撈得到的多半是業者官網內嵌的 schema.org 評分或在地評論站。
     所以「來源平台」一定要顯示出來，不能一律掛成 Google。 */
  var RATE_SRC = { google: 'Google', rankers: 'Rankers', tripadvisor: 'Tripadvisor',
                   official: '官網', klook: 'Klook', viator: 'Viator' };
  function rateHtml(g) {
    var r = Number(g.r) || 0;
    var full = Math.floor(r), half = (r - full) >= 0.25 && (r - full) < 0.75;
    var stars = '';
    for (var i = 0; i < 5; i++) {
      stars += '<span class="st' +
        (i < full ? ' f' : (i === full && half ? ' h' : '')) + '">★</span>';
    }
    var srcName = RATE_SRC[g.src] || g.src || '';
    var tip = (srcName ? srcName + ' 評分' : '評分') +
      (g.asof ? '，查證於 ' + g.asof : '') + '（快照，非即時）' +
      (g.approx ? '。評論數為估算值' : '') + (g.note ? '。' + g.note : '');
    return '<div class="pl-rate" title="' + esc(tip) + '">' +
      '<b>' + r.toFixed(1) + '</b>' +
      '<span class="stars" aria-hidden="true">' + stars + '</span>' +
      (g.n ? '<span class="cnt">(' + (g.approx ? '約 ' : '') +
        Number(g.n).toLocaleString('en-US') + ')</span>' : '') +
      (srcName ? '<span class="src' + (g.src === 'google' ? ' g' : '') + '">' +
        esc(srcName) + '</span>' : '') +
      (g.asof ? '<span class="asof">' + esc(g.asof) + '查</span>' : '') +
      '<span class="sr-only">' + esc(tip) + ' ' + r.toFixed(1) + ' 分' +
      (g.n ? '，' + g.n + ' 則評論' : '') + '</span></div>';
  }

  /* ── 卡片 ── */
  function cardHtml(p) {
    var c = (CATS[p.cat] || {}).color || '#3E9DB8';
    var tags = '';
    if (p.day) tags += '<span class="pl-tag t-day">' + dayLabel(p) + '</span>';
    if (p.flag === 'star') tags += '<span class="pl-tag t-star">★ 必去</span>';
    if (p.flag === 'warn') tags += '<span class="pl-tag t-warn">⚠ 注意</span>';
    if (p.flag === 'closed') tags += '<span class="pl-tag t-closed">已歇業</span>';
    if (p.flag === 'unverified') tags += '<span class="pl-tag t-unv">未查證</span>';
    if (p.book) tags += '<span class="pl-tag t-book">要預約</span>';
    if (p.geo_approx) tags += '<span class="pl-tag t-unv" title="地圖上是概略位置，導航請用 Google Maps 按鈕">📍概略</span>';

    var h = p.img ? '<div class="pl-img"><img src="' + esc(p.img) + '" alt="' +
      esc(p.zh || p.name) + '" loading="lazy" decoding="async"></div>' : '';
    h += '<div class="pl-top"><span class="pl-dot" style="background:' + c + '"></span>' +
      '<h3>' + hl(p.name) + (p.zh ? '<small>' + hl(p.zh) + '</small>' : '') + '</h3></div>';
    if (tags) h += '<div class="pl-tags">' + tags + '</div>';
    if (p.g && p.g.r) h += rateHtml(p.g);
    if (p.price) h += '<div class="pl-price">' + esc(p.price) + '</div>';
    if (p.hours) h += '<div class="pl-hours">🕐 ' + esc(p.hours) + '</div>';
    if (p.note) h += '<p class="pl-note">' + hl(p.note) + '</p>';

    // facts：結構化的實用資訊（停車、早餐、走到超市…）。
    // 住宿卡尤其需要——把它們塞回 note 會變成一大坨字，掃不到重點。
    if (p.facts && p.facts.length) {
      h += '<dl class="pl-facts">';
      p.facts.forEach(function (f) {
        h += '<div><dt>' + esc(f.k) + '</dt><dd>' + hl(f.v) + '</dd></div>';
      });
      h += '</dl>';
    }
    // warn：會害你當天出事的那幾件，單獨拉出來標紅
    if (p.warn && p.warn.length) {
      h += '<ul class="pl-warn">';
      p.warn.forEach(function (w) { h += '<li>' + hl(w) + '</li>'; });
      h += '</ul>';
    }

    if (p.deep && p.deep.lead) {
      var did = 'deep-' + p.id;
      h += '<button type="button" class="pl-more" data-deep="' + did + '" aria-expanded="false" ' +
        'aria-controls="' + did + '">' +
        '<span class="dm-ic">💡</span><span class="dm-t">' + esc(p.deep.lead) + '</span>' +
        '<span class="dm-cta"><span class="dm-lb">展開</span>' +
        '<span class="dm-a" aria-hidden="true">▾</span></span></button>' +
        '<div class="pl-deep" id="' + did + '" hidden>';
      (p.deep.paras || []).forEach(function (t) { h += '<p>' + t + '</p>'; });
      if (p.deep.tips && p.deep.tips.length) {
        h += '<ul class="deep-tips">';
        p.deep.tips.forEach(function (t) { h += '<li>' + t + '</li>'; });
        h += '</ul>';
      }
      h += '</div>';
    }

    /* buy：可展開的推薦好物清單。購物卡專用。
       跟 deep 用同一套展開／收合行為（data-deep），但顏色換成湖藍，
       讓「這家店賣什麼」跟「知道了會不一樣」在視覺上分得開。 */
    if (p.buy && p.buy.length) {
      var bid = 'buy-' + p.id;
      h += '<button type="button" class="pl-more is-buy" data-deep="' + bid + '" ' +
        'aria-expanded="false" aria-controls="' + bid + '">' +
        '<span class="dm-ic">🛍</span>' +
        '<span class="dm-t">推薦好物清單<small>' + p.buy.length + ' 項</small></span>' +
        '<span class="dm-cta"><span class="dm-lb">展開</span>' +
        '<span class="dm-a" aria-hidden="true">▾</span></span></button>' +
        '<div class="pl-deep is-buy" id="' + bid + '" hidden><ul class="buylist">';
      p.buy.forEach(function (b) {
        h += '<li><div class="bh"><span class="bn">' + hl(b.n) + '</span>' +
          (b.p ? '<span class="bp">' + hl(b.p) + '</span>' : '') + '</div>' +
          (b.d ? '<p>' + hl(b.d) + '</p>' : '') + '</li>';
      });
      h += '</ul></div>';
    }
    h += '<div class="pl-btns">' +
      '<button type="button" class="b-loc" data-focus="' + p.id + '">🗺 在地圖上</button>' +
      '<a class="b-map" href="' + gmapUrl(p) + '" target="_blank" rel="noopener">📍 Google Maps</a>' +
      (p.url && !p.bookable ? '<a class="b-url" href="' + esc(p.url) +
        '" target="_blank" rel="noopener">官網</a>' : '') +
      '</div>';

    if (p.bookable && p.flag !== 'closed') {
      var b = bookUrls(p);
      h += '<div class="pl-book"><span class="bk-l">訂位／購票</span><div class="bk-row">' +
        (p.url ? '<a class="bk bk-off" href="' + esc(p.url) +
          '" target="_blank" rel="noopener">🏛 官網<em>直接訂最準</em></a>' : '') +
        '<a class="bk bk-3p" href="' + b.klook + '" target="_blank" rel="noopener">' +
          'Klook<em>搜尋</em></a>' +
        '<a class="bk bk-3p" href="' + b.kkday + '" target="_blank" rel="noopener">' +
          'KKday<em>搜尋</em></a>' +
        '</div></div>';
    }
    return h;
  }

  /* ── 渲染 ── */
  function render() {
    var list = pool.filter(pass);
    renderDayline();
    count.textContent = (state.q || state.days.size || state.flags.size)
      ? '找到 ' + list.length + ' / ' + pool.length + ' 個'
      : list.length + ' 個地點';

    grid.innerHTML = '';
    if (!list.length) {
      var e = el('div', 'empty',
        (state.q ? '找不到「<b>' + esc(state.q) + '</b>」相關的地點。<br>' : '沒有符合條件的地點。<br>') +
        '<button type="button" class="empty-reset">清除全部條件</button>');
      grid.appendChild(e);
      e.querySelector('.empty-reset').onclick = function () {
        state.q = ''; state.days.clear(); state.flags.clear();
        input.value = ''; clearBtn.hidden = true; sw.classList.remove('has');
        bar.querySelectorAll('.fchip').forEach(function (b) {
          b.setAttribute('aria-pressed', 'false');
        });
        render();
      };
    }
    list.forEach(function (p) {
      var card = el('article', 'pl' + (p.flag === 'closed' ? ' is-closed' : '') +
        (p.img ? ' has-img' : '') +
        (p.bookable && p.flag !== 'closed' ? ' has-book' : ''), cardHtml(p));
      card.id = 'pl-' + p.id;
      grid.appendChild(card);
    });
    grid.querySelectorAll('[data-focus]').forEach(function (b) {
      b.onclick = function () { focusPlace(b.dataset.focus, false); };
    });
    grid.querySelectorAll('[data-deep]').forEach(function (b) {
      b.onclick = function () {
        var box = document.getElementById(b.dataset.deep);
        if (!box) return;
        var open = box.hidden;
        box.hidden = !open;
        b.setAttribute('aria-expanded', open);
        b.classList.toggle('open', open);
        var lb = b.querySelector('.dm-lb');
        if (lb) lb.textContent = open ? '收合' : '展開';
        b.classList.remove('hint');          // 使用者已經知道能點了
      };
    });

    hintFirst(grid);

    if (!map) return;
    layer.clearLayers(); markers = {};
    var pts = [];
    list.forEach(function (p) {
      var m = L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name })
        .bindPopup(popupHtml(p), { closeButton: true, autoPanPadding: [24, 24] });
      m.on('click', function () { focusPlace(p.id, true); });
      m.addTo(layer);
      markers[p.id] = m;
      pts.push([p.lat, p.lng]);
    });
    if (pts.length) {
      // 南島佔多數時，預設只框住南島，免得整張圖被奧克蘭拉到看不清
      var south = pts.filter(function (c) { return c[0] < -40.5; });
      var use = (south.length && south.length >= pts.length * 0.7) ? south : pts;
      map.fitBounds(use, { padding: [34, 34], maxZoom: 11 });
    }
  }

  /* 讓頁面上「別的區塊」能跳到某張地點卡（例如行程頁的全程一覽，
     每一天標著當晚的住宿，點下去要捲到那張卡）。
     先清掉篩選條件，否則目標卡片可能正被日期／條件濾掉而不存在。 */
  window.nzGoToPlace = function (id) {
    var exists = pool.some(function (p) { return p.id === id; });
    if (!exists) return false;
    if (state.q || state.days.size || state.flags.size) {
      state.q = ''; state.days.clear(); state.flags.clear();
      if (input) { input.value = ''; }
      if (clearBtn) clearBtn.hidden = true;
      if (sw) sw.classList.remove('has');
      bar.querySelectorAll('.fchip').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      render();
    }
    if (isMobile() && state.view === 'map') setView('list');
    focusPlace(id, true);          // true＝捲到卡片，不是捲到地圖
    var card = document.getElementById('pl-' + id);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  };

  render();
  setView(isMobile() ? 'list' : 'both');
  window.addEventListener('resize', function () {
    if (!isMobile() && state.view !== 'both') setView('both');
    if (isMobile() && state.view === 'both') setView('list');
    if (!isMobile()) document.body.classList.remove('mapmode');
    if (map) map.invalidateSize();
  });
})();

/* ── 底部 tab：更多 ── */
(function () {
  var more = document.querySelector('[data-more]');
  var sheet = document.querySelector('[data-sheet]');
  if (!more || !sheet) return;
  function close() { sheet.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  more.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = sheet.hidden;
    sheet.hidden = !open;
    more.setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', function (e) { if (!sheet.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();

/* ── 捲動進度條 ── */
(function () {
  var bar = document.getElementById('prog');
  if (!bar) return;
  addEventListener('scroll', function () {
    var h = document.documentElement;
    bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
  }, { passive: true });
})();

/* ── 滾動揭示 ── */
(function () {
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: .08, rootMargin: '0px 0px -40px' });
  document.querySelectorAll('.rv').forEach(function (n) { io.observe(n); });
})();

/* ═══════════════════════════════════════════════════════════
   行程頁：路線方案 × 候選地點
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var host = document.getElementById('itin');
  var dataEl = document.getElementById('places-data');
  if (!host || !dataEl) return;

  var DB = JSON.parse(dataEl.textContent);
  var byId = {};
  DB.places.forEach(function (p) { byId[p.id] = p; });
  var dayByNum = {};
  DB.meta.days.forEach(function (d) { dayByNum[d.d] = d; });
  var CATS = DB.meta.cats;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function gmap(p) {
    var q = p.addr ? p.name + ' ' + p.addr : (p.q || p.name + ' New Zealand');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function dirUrl(pts) {
    if (pts.length < 2) return null;
    var o = encodeURIComponent(pts[0]), d = encodeURIComponent(pts[pts.length - 1]);
    var way = pts.slice(1, -1).map(encodeURIComponent).join('%7C');
    return 'https://www.google.com/maps/dir/?api=1&origin=' + o + '&destination=' + d +
      (way ? '&waypoints=' + way : '') + '&travelmode=driving';
  }

  DB.routes.forEach(function (r) {
    var day = dayByNum[r.day] || {};
    var sec = document.createElement('section');
    sec.className = 'daysec';
    sec.id = 'day' + r.day;

    var head = '<div class="dayhead">' +
      '<div class="daynum"><b>D' + String(r.day).padStart(2, '0') + '</b><span>' +
      esc(day.date || '') + ' · ' + esc(day.wd || '') + '</span></div>' +
      '<div><h3>' + esc(r.title) + '</h3>' +
      '<p class="dayleg">' + esc(day.title || '') + '　·　' + esc(day.leg || '') + '</p></div></div>';
    if (r.note) head += '<div class="note ' + (/⚠/.test(r.note) ? 'warn' : 'tip') +
      '" style="margin:0 0 16px"><p style="margin:0">' + r.note + '</p></div>';

    /* 方案列：先用一行白話說明「這裡可以點」，再把每張卡做成看得出來的單選項 */
    var nOpt = r.options.length;
    var opts = '<div class="rhint"><span class="rhint-ic" aria-hidden="true">☞</span>' +
      '<span class="rhint-t">這天有 <b>' + nOpt + ' 種</b>安排，點卡片換一種看</span>' +
      '<span class="rhint-s">下面的地圖和地點清單會跟著換</span></div>';
    opts += '<div class="routes" role="radiogroup" aria-label="D' + String(r.day).padStart(2, '0') +
      ' 的行程方案，共 ' + nOpt + ' 種">';
    r.options.forEach(function (o, i) {
      var on = i === 0;
      opts += '<button type="button" class="route" data-opt="' + o.id + '" data-day="' + r.day +
        '" role="radio" aria-checked="' + on + '" tabindex="' + (on ? '0' : '-1') + '">' +
        '<span class="rtop"><span class="rdot" aria-hidden="true"></span>' +
        '<span class="rl">' + esc(o.label) + '</span>' +
        '<span class="rstate" aria-hidden="true"><b>✓ 目前看這個</b>' +
        '<i>點這裡看</i></span></span>' +
        '<h4>' + esc(o.name) + '</h4>' +
        '<div class="rd">' + esc(o.meta || '') + (o.rec ? '　★ 建議' : '') + '</div>' +
        '<p>' + esc(o.desc) + '</p></button>';
    });
    opts += '</div>';

    sec.innerHTML = head + opts + '<div class="optout" id="out-' + r.day + '"></div>';
    host.appendChild(sec);
  });

  function chipsFor(ids, kind) {
    if (!ids || !ids.length) return '';
    var t = kind === 'main'
      ? '<div class="cand-h main">主推　<span>照這個方案走一定會經過</span></div>'
      : '<div class="cand-h alt">備案候選　<span>時間夠再加</span></div>';
    var h = t + '<div class="cands">';
    ids.forEach(function (id) {
      var p = byId[id];
      if (!p) return;
      var c = (CATS[p.cat] || {}).color || '#3E9DB8';
      var warn = p.flag === 'warn' ? '<span class="cand-warn">⚠</span>' :
        (p.flag === 'closed' ? '<span class="cand-warn">✕</span>' : '');
      h += '<a class="cand" href="' + gmap(p) + '" target="_blank" rel="noopener">' +
        '<span class="cand-dot" style="background:' + c + '"></span>' +
        '<span class="cand-n">' + esc(p.name) + warn +
        (p.zh ? '<em>' + esc(p.zh) + '</em>' : '') + '</span>' +
        (p.price ? '<span class="cand-p">' + esc(p.price) + '</span>' : '') +
        '</a>';
    });
    return h + '</div>';
  }

  function showOpt(day, optId) {
    var r = DB.routes.filter(function (x) { return x.day === day; })[0];
    var o = r.options.filter(function (x) { return x.id === optId; })[0];
    var out = document.getElementById('out-' + day);
    if (!o || !out) return;

    var pts = (o.main || []).map(function (id) {
      var p = byId[id]; return p ? (p.name + ', New Zealand') : null;
    }).filter(Boolean);
    var du = dirUrl(pts);

    out.innerHTML =
      '<div class="optbox">' +
      '<div class="optmapwrap"><div class="optmap" id="optmap-' + day + '"></div>' +
      '<div class="optcap" id="optcap-' + day + '"></div></div>' +
      chipsFor(o.main, 'main') +
      chipsFor(o.alt, 'alt') +
      (du ? '<a class="navbtn" href="' + du + '" target="_blank" rel="noopener">🚗 用 Google Maps 導航這條路線</a>' : '') +
      '</div>';
    if (window.nzDrawOption) window.nzDrawOption(day, o);
  }

  /* 選一張：更新 aria-checked、roving tabindex，再重畫下方內容 */
  function pick(b, focus) {
    var day = parseInt(b.getAttribute('data-day'), 10);
    host.querySelectorAll('.route[data-day="' + day + '"]').forEach(function (x) {
      var on = x === b;
      x.setAttribute('aria-checked', on);
      x.setAttribute('tabindex', on ? '0' : '-1');
    });
    if (focus) b.focus();
    showOpt(day, b.getAttribute('data-opt'));
  }

  host.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.route') : null;
    if (!b || b.getAttribute('aria-checked') === 'true') return;
    pick(b, false);
  });

  /* radiogroup 的鍵盤操作：左右上下切換、Home/End 跳頭尾 */
  host.addEventListener('keydown', function (e) {
    var b = e.target.closest ? e.target.closest('.route') : null;
    if (!b) return;
    var k = e.key, dir = 0;
    if (k === 'ArrowRight' || k === 'ArrowDown') dir = 1;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') dir = -1;
    else if (k !== 'Home' && k !== 'End') return;
    var list = [].slice.call(
      host.querySelectorAll('.route[data-day="' + b.getAttribute('data-day') + '"]'));
    var i = list.indexOf(b), n = list.length, t;
    if (k === 'Home') t = list[0];
    else if (k === 'End') t = list[n - 1];
    else t = list[(i + dir + n) % n];
    e.preventDefault();
    pick(t, true);
  });

  DB.routes.forEach(function (r) { showOpt(r.day, r.options[0].id); });
})();

/* ═══════════════════════════════════════════════════════════
   行程頁的路線地圖（Leaflet）
   幾何在建置時用 OSRM 算好、存成 encoded polyline，這裡解碼畫出
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var geoEl = document.getElementById('routes-geo');
  var dataEl = document.getElementById('places-data');
  if (!geoEl || !dataEl || !window.L) return;

  var GEO = JSON.parse(geoEl.textContent);
  var DB = JSON.parse(dataEl.textContent);
  var byId = {}; DB.places.forEach(function (p) { byId[p.id] = p; });
  var CATS = DB.meta.cats;

  /* Google encoded polyline 解碼（精度 5） */
  function decode(str) {
    var pts = [], i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      var b, sh = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      lat += (res & 1) ? ~(res >> 1) : (res >> 1);
      sh = 0; res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      lng += (res & 1) ? ~(res >> 1) : (res >> 1);
      pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
  }

  function baseMap(el) {
    var m = L.map(el, { scrollWheelZoom: false, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(m);
    return m;
  }

  function dot(p, small) {
    var c = (CATS[p.cat] || {}).color || '#3E9DB8';
    return L.divIcon({
      className: '',
      html: '<span class="pin-hit"><span class="pin-ico" style="background:' + c + ';' +
            (small ? 'width:14px;height:14px;border-width:2px;' : '') + '"></span></span>',
      iconSize: [40, 40], iconAnchor: [20, small ? 31 : 34], popupAnchor: [0, -28]
    });
  }
  function gmap(p) {
    var q = p.addr ? p.name + ' ' + p.addr : (p.q || p.name + ' New Zealand');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  /* ── 全程總覽圖 ── */
  var ovEl = document.getElementById('routemap');
  if (ovEl) {
    var m = baseMap(ovEl);
    var all = [];
    var palette = ['#1B7A93', '#1E5B4E', '#B4791F', '#A83A2B', '#5B4AA8'];
    GEO.legs.forEach(function (leg, i) {
      var pts = decode(leg.poly);
      all = all.concat(pts);
      L.polyline(pts, {
        color: palette[i % palette.length], weight: 4, opacity: .85, lineJoin: 'round'
      }).addTo(m).bindPopup(
        '<div class="pop-h">D' + String(leg.day).padStart(2, '0') + '</div>' +
        '<div class="pop-sub">' + leg.label + '</div>' +
        '<p class="pop-meta"><b>' + leg.km + ' km</b>　純開車約 ' +
        Math.floor(leg.min / 60) + ' 小時 ' + (leg.min % 60) + ' 分</p>');
    });
    // 過夜點
    [['lake-tekapo', 'D03'], ['mtcook-village', 'D04–05'], ['wanaka-tree', 'D06'],
     ['nzone-skydive', 'D07–09'], ['lake-te-anau', 'D10–11'], ['transport-world', 'D12'],
     ['dunedin-station', 'D13'], ['oamaru-victorian', 'D14'], ['chc-airport', 'D15']]
      .forEach(function (x) {
        var p = byId[x[0]]; if (!p) return;
        L.marker([p.lat, p.lng], { icon: dot(p) }).addTo(m).bindPopup(
          '<div class="pop-h">' + x[1] + ' 過夜</div><div class="pop-sub">' + p.town + '</div>');
      });
    if (all.length) m.fitBounds(all, { padding: [26, 26] });
  }

  /* ── 各方案的路線圖 ── */
  window.nzDrawOption = function (day, opt) {
    var box = document.getElementById('optmap-' + day);
    if (!box) return;
    var g = GEO.options[opt.id];
    var wrap = box.parentNode;

    if (!g) {                       // 沒有行車幾何（當地活動）
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    if (box._map) { box._map.remove(); box._map = null; }
    box.innerHTML = '';
    var m = baseMap(box);
    box._map = m;
    var pts = decode(g.poly);
    L.polyline(pts, { color: '#A83A2B', weight: 5, opacity: .9, lineJoin: 'round' }).addTo(m);
    (opt.main || []).concat(opt.alt || []).forEach(function (id) {
      var p = byId[id]; if (!p) return;
      var isMain = (opt.main || []).indexOf(id) >= 0;
      L.marker([p.lat, p.lng], { icon: dot(p, !isMain) }).addTo(m).bindPopup(
        '<div class="pop-h">' + p.name + '</div>' +
        '<div class="pop-sub">' + (isMain ? '主推' : '備案候選') + ' · ' + (p.town || '') + '</div>' +
        '<div class="pop-btns"><a class="g" href="' + gmap(p) +
        '" target="_blank" rel="noopener">在 Google Maps 開啟</a></div>');
    });
    m.fitBounds(pts, { padding: [22, 22] });
    var cap = document.getElementById('optcap-' + day);
    if (cap) cap.textContent = g.km + ' km · 純開車約 ' +
      Math.floor(g.min / 60) + ' 小時 ' + (g.min % 60) + ' 分（OSRM 依實際道路計算）';
    setTimeout(function () { m.invalidateSize(); }, 60);
  };

  // 這個模組在行程模組之後才載入，補畫一次初始選中的方案
  DB.routes.forEach(function (r) {
    var btn = document.querySelector('.route[data-day="' + r.day + '"][aria-checked="true"]');
    var id = btn ? btn.dataset.opt : r.options[0].id;
    var o = r.options.filter(function (x) { return x.id === id; })[0];
    if (o) window.nzDrawOption(r.day, o);
  });
})();

/* ═══════════════════════════════════════════════════════════
   紐幣 → 台幣：自動在頁面上所有 NZ$ 旁邊補上台幣估算
   匯率放在 places.json 的 meta.fx，改一處全站生效
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var RATE = 18.9, ASOF = '';
  var el = document.getElementById('places-data');
  if (el) {
    try {
      var fx = JSON.parse(el.textContent).meta.fx || {};
      if (fx.nzd_twd) RATE = fx.nzd_twd;
      if (fx.asof) ASOF = fx.asof;
    } catch (e) {}
  }

  /* 依金額級距取整，避免出現 NT$10,387 這種假精確 */
  function round(n) {
    if (n < 1000) return Math.round(n / 10) * 10;
    if (n < 20000) return Math.round(n / 100) * 100;
    if (n < 100000) return Math.round(n / 500) * 500;
    return Math.round(n / 1000) * 1000;
  }
  function fmt(n) { return round(n).toLocaleString('en-US'); }
  function num(s) { return parseFloat(String(s).replace(/,/g, '')); }

  // NZ$549 / NZD $795 / NZD 219 / $25 / NZ$40–50
  var RE = /(?:NZ\$|NZD\s*\$?\s*|(?<![A-Za-z])\$)(\d[\d,]*(?:\.\d+)?)(\s*[–—~-]\s*(\d[\d,]*(?:\.\d+)?))?/g;

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1 };

  function convert(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.indexOf('$') < 0) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        while (p && p !== root.parentNode) {
          if (p.nodeType === 1) {
            if (SKIP[p.tagName]) return NodeFilter.FILTER_REJECT;
            if (p.classList && p.classList.contains('twd')) return NodeFilter.FILTER_REJECT;
            if (p.dataset && p.dataset.twd) return NodeFilter.FILTER_REJECT;
          }
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var todo = [], n;
    while ((n = walker.nextNode())) todo.push(n);

    todo.forEach(function (node) {
      var text = node.nodeValue;
      RE.lastIndex = 0;
      if (!RE.test(text)) return;
      RE.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = RE.exec(text))) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index + m[0].length)));
        var lo = num(m[1]);
        var txt = isNaN(lo) ? '' :
          (m[3] ? '（約 NT$' + fmt(lo * RATE) + '–' + fmt(num(m[3]) * RATE) + '）'
                : '（約 NT$' + fmt(lo * RATE) + '）');
        if (txt) {
          var span = document.createElement('span');
          span.className = 'twd';
          span.textContent = txt;
          frag.appendChild(span);
        }
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) {
        if (node.parentNode.nodeType === 1) node.parentNode.dataset.twd = '1';
        node.parentNode.replaceChild(frag, node);
      }
    });
  }

  window.nzTWD = { convert: convert, rate: RATE, asof: ASOF };

  function runAll() { convert(document.body); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else { runAll(); }

  /* 卡片、方案、popup 是動態產生的，內容變動後要再掃一次 */
  var pending = null;
  var mo = new MutationObserver(function () {
    clearTimeout(pending);
    pending = setTimeout(runAll, 120);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* 頁尾補上訂位連結與匯率說明 */
  document.addEventListener('DOMContentLoaded', function () {
    var f = document.querySelector('footer .wrap');
    if (!f) return;
    if (document.querySelector('.pl-book')) {
      var b = document.createElement('p');
      b.style.cssText = 'margin:10px 0 0;font-size:.78rem;color:#5F7583';
      b.innerHTML = '卡片上的 <b>官網</b> 是實際查證過的官方網址，' +
        '<b>建議優先從官網訂</b>——價格通常一樣或更便宜，天候取消與改期也直接跟業者談。' +
        '<b>Klook／KKday 是「用關鍵字搜尋」的連結，不是特定商品頁</b>：' +
        '這兩個平台不一定有賣、賣的方案內容也可能與官網不同，請自行比對。';
      b.dataset.twd = '1';
      f.appendChild(b);
    }
    if (!ASOF) return;
    var p = document.createElement('p');
    p.style.cssText = 'margin:10px 0 0;font-size:.78rem;color:#5F7583';
    p.innerHTML = '台幣金額為自動換算的<b>粗估值</b>（1 NZD ≈ ' + RATE +
      ' TWD，查詢於 ' + ASOF + '），僅供感受量級；' +
      '<b>實際以刷卡當日匯率與銀行手續費為準</b>。';
    p.dataset.twd = '1';
    f.appendChild(p);
  });
})();

/* ═══════════════════════════════════════════════════════════
   文化頁：知識卡片（可篩選、可展開）
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var host = document.getElementById('culture');
  var el = document.getElementById('culture-data');
  if (!host || !el) return;
  var DB = JSON.parse(el.textContent);
  var CATS = DB.meta.cats || {};
  var cards = DB.cards || [];
  if (!cards.length) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var active = new Set();
  var bar = document.createElement('div');
  bar.className = 'filters';
  var grp = document.createElement('div');
  grp.className = 'grp';
  grp.innerHTML = '<span class="lbl">主題</span>';
  Object.keys(CATS).forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fchip'; b.setAttribute('aria-pressed', 'false');
    b.textContent = CATS[k].icon + ' ' + CATS[k].label;
    b.onclick = function () {
      active.has(k) ? active.delete(k) : active.add(k);
      b.setAttribute('aria-pressed', active.has(k));
      render();
    };
    grp.appendChild(b);
  });
  bar.appendChild(grp);
  var count = document.createElement('span');
  count.className = 'fcount';
  bar.appendChild(count);

  var grid = document.createElement('div');
  grid.className = 'cul-grid';
  host.appendChild(bar);
  host.appendChild(grid);

  function render() {
    var list = cards.filter(function (c) { return !active.size || active.has(c.cat); });
    count.textContent = list.length + ' / ' + cards.length + ' 則';
    grid.innerHTML = '';
    list.forEach(function (c) {
      var meta = CATS[c.cat] || { label: '', color: '#3E9DB8', icon: '' };
      var art = document.createElement('article');
      art.className = 'cul' + (c.img ? ' has-img' : '');
      var h = c.img
        ? '<div class="cul-img"><img src="images/' + esc(c.img) + '.jpg" alt="' +
          esc(c.title) + '" loading="lazy" decoding="async"></div>' : '';
      h += '<div class="cul-b">' +
        '<span class="cul-cat" style="background:' + meta.color + '1f;color:' + meta.color + '">' +
        meta.icon + ' ' + esc(meta.label) + '</span>' +
        '<h3>' + esc(c.title) + '</h3>' +
        '<p class="cul-lead">' + esc(c.lead) + '</p>' +
        '<div class="cul-body">';
      (c.paras || []).forEach(function (t) { h += '<p>' + t + '</p>'; });
      h += '</div>';
      if (c.where) h += '<div class="cul-where"><b>會在這裡遇到</b>' + esc(c.where) + '</div>';
      h += '</div>';
      art.innerHTML = h;
      grid.appendChild(art);
    });
    if (window.nzTWD) window.nzTWD.convert(grid);
  }
  render();
})();

/* ── 回到頂端（手機） ── */
(function () {
  if (!document.querySelector('.places, .cul-grid')) return;
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'totop'; b.setAttribute('aria-label', '回到頂端');
  b.innerHTML = '↑';
  b.onclick = function () {
    var soft = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: soft ? 'smooth' : 'auto' });
    // 原本這裡會 focus() 搜尋框，但手機會因此彈出鍵盤蓋掉半個螢幕，
    // 而且按鈕只說「回到頂端」，不該有這種副作用。桌機也一併拿掉。
  };
  document.body.appendChild(b);
  addEventListener('scroll', function () {
    b.classList.toggle('show', window.scrollY > 700);
  }, { passive: true });
})();

/* ══════════════════════════════════════════════════════════════
   會話頁：詞條清單 ＋ 語音朗讀
   語音用瀏覽器內建的 SpeechSynthesis，不需要任何 API 金鑰、
   不連外部服務，離線也能唸（聲音來自作業系統）。
   ══════════════════════════════════════════════════════════════ */
(function () {
  var root = document.getElementById('talk');
  var raw = document.getElementById('talk-data');
  if (!root || !raw) return;

  var DB = JSON.parse(raw.textContent);
  var SECS = DB.meta.secs || {};
  var LIST = DB.entries || [];
  // 會話卡片也可以嵌在別的分頁上（例如跳傘頁只放跳傘那幾組）。
  // 在容器寫 data-secs="skydive,book" 就只渲染那幾個 sec。
  var ONLY = (root.dataset.secs || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
  if (ONLY.length) {
    LIST = LIST.filter(function (e) { return ONLY.indexOf(e.sec) >= 0; });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  // 內文允許 <b>，其餘一律跳脫
  function rich(s) {
    return esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>');
  }

  /* ─────── 語音引擎 ─────── */
  var SS = window.speechSynthesis;
  var voices = [];
  var chosen = { mi: null, en: null };   // 使用者手動指定時記在這
  var slow = false;
  try {
    var saved = JSON.parse(localStorage.getItem('nz-voice') || '{}');
    if (saved.mi) chosen.mi = saved.mi;
    if (saved.en) chosen.en = saved.en;
    slow = !!saved.slow;
  } catch (e) {}
  function remember() {
    try {
      localStorage.setItem('nz-voice',
        JSON.stringify({ mi: chosen.mi, en: chosen.en, slow: slow }));
    } catch (e) {}
  }

  // 毛利語的五個母音跟印尼語幾乎一樣（同屬南島語系），
  // h 會發音、ng 是 /ŋ/，所以印尼語的聲音唸毛利語比英語聲音準得多。
  // 西班牙語／義大利語母音也對，但它們的 h 不發音，所以排在後面。
  var PREF = {
    mi: ['mi-NZ', 'mi', 'id-ID', 'id', 'ms-MY', 'fil-PH', 'tl-PH',
         'it-IT', 'es-ES', 'es-MX', 'pt-BR', 'en-NZ', 'en-AU', 'en-GB', 'en-US'],
    en: ['en-NZ', 'en-AU', 'en-GB', 'en-IE', 'en-US', 'en']
  };

  function norm(l) { return String(l || '').replace('_', '-'); }

  function pick(lang) {
    if (chosen[lang]) {
      var m = voices.filter(function (v) { return v.voiceURI === chosen[lang]; });
      if (m.length) return m[0];
    }
    var prefs = PREF[lang] || PREF.en;
    for (var i = 0; i < prefs.length; i++) {
      var want = prefs[i];
      // 先找完全相符，再找前綴相符
      var exact = voices.filter(function (v) { return norm(v.lang) === want; });
      if (exact.length) return best(exact);
      var pre = voices.filter(function (v) { return norm(v.lang).indexOf(want + '-') === 0; });
      if (pre.length) return best(pre);
    }
    // 全都沒有時，退而求其次：任何英語 → 任何拉丁字母語言 → 第一個
    var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
    if (en.length) return best(en);
    var latin = voices.filter(function (v) {
      return !/^(zh|ja|ko|th|ar|he|ru|uk|bg|el|hi|km|my|ta|te|fa|ur)/i.test(v.lang);
    });
    if (latin.length) return best(latin);
    return voices[0] || null;
  }
  // 同語言有多個聲音時，優先本機（不需連網）與非 novelty 的
  function best(vs) {
    var good = vs.filter(function (v) { return !/eloquence|novelty|whisper|bells|organ/i.test(v.name); });
    var pool = good.length ? good : vs;
    var local = pool.filter(function (v) { return v.localService; });
    return (local.length ? local : pool)[0];
  }

  function loadVoices() {
    if (!SS) return;
    var had = voices.length;
    voices = SS.getVoices() || [];
    renderVoiceBar();
    if (!had && voices.length && root.querySelector('#tk-list')) render();
  }
  if (SS) {
    loadVoices();
    if (typeof SS.onvoiceschanged !== 'undefined') SS.onvoiceschanged = loadVoices;
    // Safari 有時要等一下才吐出清單
    setTimeout(loadVoices, 400);
    setTimeout(loadVoices, 1600);
  }

  function canSpeak() {
    return !!(SS && window.SpeechSynthesisUtterance && voices.length);
  }

  // 兩位研究員給的 say 欄寫法不同：一份是毛利語原拼法，一份是英文近似拼法。
  // 而念毛利語的聲音可能是印尼語（母音純）也可能是英語（母音會飄），
  // 兩者需要餵不同的字串，所以在這裡按實際選到的聲音決定。
  var PUREVOWEL = /^(mi|id|ms|fil|tl|jv|su|haw|it|es|pt|ca|ro|eu|sw|fi|tr)/i;
  // 毛利語只用 a e i o u h k m n p r t w（含 ng wh），出現其他字母的就是英文
  function isMaoriWord(x) {
    return /[a-z]/.test(x) && !/[bcdfgjlqsvxyz]/.test(x);
  }
  function fromMaori(t) {
    // 「Aoraki/Mount Cook」只留毛利語那半；「Tāne / Wāhine」兩半都留
    var parts = String(t).split('/').map(function (x) {
      return x.toLowerCase()
        .replace(/[āăâà]/g, 'a').replace(/[ēĕêè]/g, 'e').replace(/[īĭîì]/g, 'i')
        .replace(/[ōŏôò]/g, 'o').replace(/[ūŭûù]/g, 'u')
        .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(isMaoriWord);
    if (!parts.length) parts = [String(t).toLowerCase()];
    return parts.join(' ')
      .replace(/[āăâà]/g, 'a').replace(/[ēĕêè]/g, 'e').replace(/[īĭîì]/g, 'i')
      .replace(/[ōŏôò]/g, 'o').replace(/[ūŭûù]/g, 'u')
      .replace(/[āăâà]/g, 'a').replace(/[ēĕêè]/g, 'e').replace(/[īĭîì]/g, 'i')
      .replace(/[ōŏôò]/g, 'o').replace(/[ūŭûù]/g, 'u')
      .replace(/wh/g, 'f')            // 毛利語的 wh 是 /f/
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function textFor(e, v) {
    var fallback = e.say || e.t;
    if ((e.lang || 'en') !== 'mi') return fallback;
    if (e.sec === 'rules') return fallback;               // 規則卡的 t 是中文標題
    if (!/[A-Za-z]/.test(String(e.t))) return fallback;
    var pure = v && PUREVOWEL.test(norm(v.lang));
    if (!pure) return fallback;                           // 英語聲音 → 用英文近似拼法
    var d = fromMaori(e.t);
    return d || fallback;
  }

  var playingBtn = null;
  function stopAll() {
    if (SS) { try { SS.cancel(); } catch (e) {} }
    if (playingBtn) {
      playingBtn.classList.remove('on');
      var plb = playingBtn.querySelector('.tk-lb');
      if (plb) plb.textContent = '聽';
      playingBtn = null;
    }
    if (window.nzStopBtn) window.nzStopBtn.disabled = true;
  }

  function say(entry, btn) {
    if (!SS || !window.SpeechSynthesisUtterance) return false;
    stopAll();
    var lang = (entry.lang || 'en');
    var v = pick(lang);
    var u = new SpeechSynthesisUtterance(textFor(entry, v));
    if (v) { u.voice = v; u.lang = v.lang; }
    else { u.lang = lang === 'mi' ? 'mi-NZ' : 'en-NZ'; }
    u.rate = slow ? 0.55 : (lang === 'mi' ? 0.82 : 0.9);
    u.pitch = 1;
    if (window.nzStopBtn) window.nzStopBtn.disabled = false;
    if (btn) {
      btn.classList.add('on'); playingBtn = btn;
      var lb = btn.querySelector('.tk-lb');
      if (lb) lb.textContent = '播放中';
      u.onend = u.onerror = function () {
        btn.classList.remove('on');
        if (lb) lb.textContent = '聽';
        if (playingBtn === btn) playingBtn = null;
        if (window.nzStopBtn) window.nzStopBtn.disabled = true;
      };
    }
    try { SS.speak(u); } catch (e) { return false; }
    if (voices.length < 2) setTimeout(loadVoices, 300);   // iOS 首次朗讀後才給清單
    return true;
  }

  /* ─────── 狀態與篩選 ─────── */
  var state = { sec: '', q: '' };
  var byId = {};
  LIST.forEach(function (e) { byId[e.id] = e; });

  function terms() {
    return state.q.toLowerCase().split(/\s+/).filter(Boolean);
  }
  function haystack(e) {
    if (e._hay) return e._hay;
    e._hay = [e.t, e.zh, e.roma, e.zhsound, e.when, e.note,
              (SECS[e.sec] || {}).label, (SECS[e.sec] || {}).group]
      .filter(Boolean).join(' ').toLowerCase();
    return e._hay;
  }
  function hl(s) {
    var t = rich(s), ts = terms();
    if (!ts.length) return t;
    ts.forEach(function (k) {
      var re = new RegExp('(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      t = t.replace(re, '<mark>$1</mark>');
    });
    return t;
  }
  function match(e) {
    if (state.sec && e.sec !== state.sec) return false;
    var ts = terms();
    if (!ts.length) return true;
    var h = haystack(e);
    return ts.every(function (k) { return h.indexOf(k) >= 0; });
  }

  /* ─────── 畫面 ─────── */
  function groupsOf() {
    var g = [], seen = {};
    LIST.forEach(function (e) {
      var s = SECS[e.sec]; if (!s) return;
      var name = s.group || '其他';
      if (!seen[name]) { seen[name] = { name: name, secs: [] }; g.push(seen[name]); }
      if (seen[name].secs.indexOf(e.sec) < 0) seen[name].secs.push(e.sec);
    });
    return g;
  }

  function renderVoiceBar() {
    var bar = root.querySelector('#voicebar');
    if (!bar) return;
    if (!SS || !voices.length) {
      bar.innerHTML = '<div class="vb-none">這台裝置沒有內建語音，所以卡片上沒有 🔊 鈕。' +
        '每一條下面都有<b>「聽發音」的連結</b>——毛利語連到 <b>Te Aka 辭典</b>（母語者真人錄音）、' +
        '英語連到 <b>Google 翻譯</b>，點進去按播放就好。' +
        '也可以直接看<b>音節切分</b>與<b>中文近似音</b>照著念。</div>';
      return;
    }
    var mi = pick('mi'), en = pick('en');
    var opt = function (sel) {
      return voices.map(function (v) {
        return '<option value="' + esc(v.voiceURI) + '"' +
          (sel && v.voiceURI === sel.voiceURI ? ' selected' : '') + '>' +
          esc(v.name) + '（' + esc(v.lang) + '）</option>';
      }).join('');
    };
    var miTag = mi ? (/^mi/i.test(mi.lang) ? '毛利語語音'
      : (/^(id|ms|fil|tl)/i.test(mi.lang) ? '用南島語系的聲音代打'
        : (/^(it|es|pt)/i.test(mi.lang) ? '用拉丁語系的聲音代打' : '只能用英語聲音代打'))) : '';
    bar.innerHTML =
      '<div class="vb-row"><span class="vb-k">🗿 毛利語用</span>' +
      '<select id="v-mi" aria-label="毛利語使用的語音">' + opt(mi) + '</select>' +
      (miTag ? '<span class="vb-tag">' + miTag + '</span>' : '') + '</div>' +
      '<div class="vb-row"><span class="vb-k">🇳🇿 英語用</span>' +
      '<select id="v-en" aria-label="英語使用的語音">' + opt(en) + '</select></div>' +
      '<div class="vb-row vb-ctl">' +
      '<label class="vb-slow"><input type="checkbox" id="v-slow"' + (slow ? ' checked' : '') +
      '> 慢速朗讀</label>' +
      '<button type="button" id="v-test">▶ 試聽 Kia ora</button></div>';
    bar.querySelector('#v-mi').onchange = function () { chosen.mi = this.value; remember(); renderVoiceBar(); };
    bar.querySelector('#v-en').onchange = function () { chosen.en = this.value; remember(); renderVoiceBar(); };
    bar.querySelector('#v-slow').onchange = function () { slow = this.checked; remember(); };
    bar.querySelector('#v-test').onclick = function () {
      say({ id: '_t', lang: 'mi', t: 'Kia ora', say: 'kia ora' }, null);
    };
  }

  // 毛利語沒有任何線上服務有合成語音（Google 翻譯 tl=mi 直接回 400），
  // 但 Te Aka 辭典有母語者的真人錄音，所以毛利語一律連 Te Aka。
  function extLink(e) {
    // 發音規則那一區的標題是說明不是單字，查辭典沒有意義
    if (e.sec === 'rules') return '';
    var mi = (e.lang || 'en') === 'mi';
    var raw = String(e.t).split('/')[0].replace(/\(.*?\)/g, '')
      .replace(/[?!.,;:\u3000-\u303f\uff00-\uffef]/g, ' ').trim();
    // 標題是中文的（例如發音規則），沒有東西可查，就不放連結
    if (!/[A-Za-z\u0100-\u017f]/.test(raw)) return '';

    if (mi) {
      var w = raw.split(/\s+/).filter(Boolean);
      var term = raw, label = '📖 到 Te Aka 聽母語者念';
      if (w.length > 3) {
        // Te Aka 是辭典，整句查多半沒結果；改查句子裡最長的那個實詞
        term = w.slice().sort(function (a, b) { return b.length - a.length; })[0];
        label = '📖 到 Te Aka 聽「' + term + '」的真人發音';
      }
      return '<a class="tk-ext" target="_blank" rel="noopener" ' +
        'href="https://maoridictionary.co.nz/search?keywords=' +
        encodeURIComponent(term) + '">' + esc(label) + '<span class="ex">↗</span></a>';
    }
    return '<a class="tk-ext" target="_blank" rel="noopener" ' +
      'href="https://translate.google.com/?sl=en&amp;tl=zh-TW&amp;op=translate&amp;text=' +
      encodeURIComponent(raw) + '">🌐 用 Google 翻譯聽<span class="ex">↗</span></a>';
  }

  function card(e) {
    var s = SECS[e.sec] || {};
    var h = '<article class="tk" data-id="' + esc(e.id) + '">' +
      (canSpeak()
        ? '<button type="button" class="tk-play" aria-label="朗讀 ' + esc(e.t) + '">' +
          '<span class="tk-ic" aria-hidden="true">🔊</span>' +
          '<span class="tk-lb">聽</span></button>'
        : '') +
      '<div class="tk-b">' +
      '<span class="tk-sec" style="color:' + esc(s.color || '#555') + '">' +
      esc(s.icon || '') + ' ' + esc(s.label || e.sec) + '</span>' +
      '<h3 class="tk-t">' + hl(e.t) + '</h3>' +
      '<p class="tk-zh">' + hl(e.zh) + '</p>' +
      '<div class="tk-say">' +
      (e.roma ? '<span class="tk-roma">' + hl(e.roma) + '</span>' : '') +
      (e.zhsound ? '<span class="tk-zs">' + hl(e.zhsound) + '</span>' : '') +
      '</div>' +
      (e.when ? '<p class="tk-when">' + hl(e.when) + '</p>' : '') +
      (e.note ? '<p class="tk-note">💡 ' + hl(e.note) + '</p>' : '') +
      extLink(e) +
      '</div></article>';
    return h;
  }

  function render() {
    var hits = LIST.filter(match);
    var body = root.querySelector('#tk-list');
    var cnt = root.querySelector('#tk-count');

    if (!hits.length) {
      body.innerHTML = '<div class="empty"><p>找不到符合的說法。</p>' +
        '<button type="button" class="btn" data-clear>清除全部條件</button></div>';
      body.querySelector('[data-clear]').onclick = clearAll;
    } else {
      // 依 group → sec 排序後分段顯示
      var order = [];
      groupsOf().forEach(function (g) { g.secs.forEach(function (s) { order.push(s); }); });
      hits.sort(function (a, b) { return order.indexOf(a.sec) - order.indexOf(b.sec); });
      var out = '', last = null;
      hits.forEach(function (e) {
        if (e.sec !== last) {
          if (last !== null) out += '</div>';
          var s = SECS[e.sec] || {};
          out += '<h3 class="tk-h" style="border-color:' + esc(s.color || '#ccc') + '">' +
            esc(s.icon || '') + ' ' + esc(s.label || e.sec) + '</h3><div class="tk-grid">';
          last = e.sec;
        }
        out += card(e);
      });
      if (last !== null) out += '</div>';
      body.innerHTML = out;
    }
    cnt.textContent = state.q || state.sec
      ? '找到 ' + hits.length + ' / ' + LIST.length + ' 條'
      : '共 ' + LIST.length + ' 條';

    Array.prototype.forEach.call(body.querySelectorAll('.tk'), function (el) {
      var pb = el.querySelector('.tk-play');
      if (!pb) return;
      pb.onclick = function () {
        var ent = byId[el.dataset.id];
        var ok = ent && say(ent, this);
        if (!ok) {
          this.classList.add('fail');
          var t = this;
          setTimeout(function () { t.classList.remove('fail'); }, 900);
        }
      };
    });
  }

  function clearAll() {
    state.sec = ''; state.q = '';
    var i = root.querySelector('#tk-q'); if (i) i.value = '';
    syncChips(); render();
  }
  function syncChips() {
    Array.prototype.forEach.call(root.querySelectorAll('.fchip[data-sec]'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.sec === state.sec ? 'true' : 'false');
    });
  }

  function boot() {
    var chips = '';
    groupsOf().forEach(function (g) {
      chips += '<div class="grp"><span class="lbl">' + esc(g.name) + '</span>';
      g.secs.forEach(function (sc) {
        var s = SECS[sc] || {};
        var n = LIST.filter(function (e) { return e.sec === sc; }).length;
        chips += '<button type="button" class="fchip" data-sec="' + esc(sc) +
          '" aria-pressed="false">' + esc(s.icon || '') + ' ' + esc(s.label || sc) +
          ' <b>' + n + '</b></button>';
      });
      chips += '</div>';
    });

    root.innerHTML =
      '<div class="voicebar" id="voicebar"></div>' +
      '<div class="searchwrap"><span class="s-ic" aria-hidden="true">🔍</span>' +
      '<input type="search" id="tk-q" class="s-in" placeholder="搜尋中文或英文，例如：謝謝、加油、雪鏈" ' +
      'autocomplete="off" aria-label="搜尋說法">' +
      '<button type="button" class="s-x" aria-label="清除搜尋" hidden>✕</button></div>' +
      '<div class="filters">' + chips + '</div>' +
      '<div class="tk-bar"><span id="tk-count"></span>' +
      '<button type="button" class="tk-stop">■ 停止朗讀</button></div>' +
      '<div id="tk-list"></div>';

    renderVoiceBar();

    var q = root.querySelector('#tk-q');
    var x = root.querySelector('.s-x');
    q.addEventListener('input', function () {
      state.q = this.value.trim();
      x.hidden = !this.value;
      render();
    });
    x.onclick = function () { q.value = ''; state.q = ''; x.hidden = true; q.focus(); render(); };

    Array.prototype.forEach.call(root.querySelectorAll('.fchip[data-sec]'), function (b) {
      b.onclick = function () {
        state.sec = (state.sec === b.dataset.sec) ? '' : b.dataset.sec;
        syncChips(); render();
      };
    });
    var stopBtn = root.querySelector('.tk-stop');
    stopBtn.onclick = stopAll;
    stopBtn.disabled = true;
    window.nzStopBtn = stopBtn;
    window.addEventListener('pagehide', stopAll);

    render();
  }

  boot();
})();

/* ══════════════════════════════════════════════════════════════
   橫向捲動的篩選列：讓「還有更多，可以往右滑」看得出來
   手機上 .filters .grp 是橫向捲動容器，而且捲軸被藏起來了，
   所以完全沒有線索。這裡補上三種提示：
     1. 邊緣漸層（還有內容的那一側才出現）
     2. 一顆可以按的箭頭（不只是提示，按了真的會捲）
     3. 第一次進頁面時輕輕晃一下，只做一次
   ══════════════════════════════════════════════════════════════ */
(function () {
  var grps = document.querySelectorAll('.filters .grp, .tw');
  if (!grps.length) return;

  function enhance(grp) {
    if (grp.parentNode.classList.contains('grpwrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'grpwrap';
    grp.parentNode.insertBefore(wrap, grp);
    wrap.appendChild(grp);

    var isTable = grp.classList.contains('tw');
    var label = isTable ? '表格內容'
      : ((grp.querySelector('.lbl') || {}).textContent || '');
    if (isTable) {
      // 鍵盤使用者要能捲動表格，螢幕閱讀器也要知道這是一個可捲動區域
      grp.setAttribute('role', 'region');
      grp.setAttribute('tabindex', '0');
      grp.setAttribute('aria-label', '可左右捲動的表格');
    }
    var mk = function (dir, sym, txt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gs-btn gs-' + dir;
      b.setAttribute('aria-label', txt);
      b.innerHTML = '<span aria-hidden="true">' + sym + '</span>';
      b.onclick = function () {
        grp.scrollBy({ left: (dir === 'r' ? 1 : -1) * grp.clientWidth * 0.7,
                       behavior: 'smooth' });
        setTimeout(sync, 60); setTimeout(sync, 420);
      };
      wrap.appendChild(b);
      return b;
    };
    mk('l', '‹', '看前面的' + label);
    mk('r', '›', '看後面的' + label);

    function sync() {
      var max = grp.scrollWidth - grp.clientWidth;
      // 門檻抓 40px：.grp 尾端本來就留了 34px 白，用 4px 會誤判成「後面還有東西」
      var LIM = isTable ? 8 : 40;
      wrap.classList.toggle('can-l', grp.scrollLeft > 4);
      wrap.classList.toggle('can-r', max > LIM && grp.scrollLeft < max - 4);
    }
    grp.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
    setTimeout(sync, 300);   // 字型載入後寬度會變

    return { grp: grp, sync: sync };
  }

  var made = [];
  Array.prototype.forEach.call(grps, function (g) {
    var r = enhance(g); if (r) made.push(r);
  });

  // 第一次進來時，最長的那一列輕輕晃一下——比任何靜態提示都直接
  try { if (localStorage.getItem('nz-scroll-hint')) return; } catch (e) {}
  var target = null, best = 0;
  made.forEach(function (m) {
    var over = m.grp.scrollWidth - m.grp.clientWidth;
    if (over > best) { best = over; target = m; }
  });
  if (!target || best < 30) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setTimeout(function () {
    target.grp.scrollTo({ left: 34, behavior: 'smooth' });
    setTimeout(function () {
      target.grp.scrollTo({ left: 0, behavior: 'smooth' });
    }, 480);
  }, 700);
  try { localStorage.setItem('nz-scroll-hint', '1'); } catch (e) {}
})();

/* ═══════════════════════════════════════════════════════════
   App 分頁：把 data/apps.json 渲染成卡片
   只在有 #apps 容器的頁面跑。圖示不抓 App Store 的原始 icon
   （那是有版權的），改用 CSS 畫的字母色塊。
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var dataEl = document.getElementById('apps-data');
  var root = document.getElementById('apps');
  if (!dataEl || !root) return;
  var DB = JSON.parse(dataEl.textContent);
  var CATS = DB.cats || {};
  var APPS = DB.apps || [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rich(s) {           // 內文只允許 <b>
    return esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>');
  }

  var state = { cat: '', must: false };

  /* 沒有 icon 圖檔，就用名字第一個字母 ＋ 一個穩定的色相。
     同一個 id 永遠得到同一個顏色（雜湊），不會每次 build 就換。 */
  function tint(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
  }
  function tileHtml(a) {
    var h = tint(a.id);
    var ch = (a.abbr || a.name || '?').trim().charAt(0).toUpperCase();
    return '<span class="ap-tile" aria-hidden="true" style="' +
      '--h:' + h + '">' + esc(ch) + '</span>';
  }

  function cardHtml(a) {
    var h = '<div class="ap-top">' + tileHtml(a) +
      '<div class="ap-name"><h3>' + esc(a.name) + '</h3>' +
      (a.zh ? '<p>' + esc(a.zh) + '</p>' : '') + '</div></div>';

    var tags = '';
    if (a.must) tags += '<span class="pl-tag t-star">★ 重點下載</span>';
    if (CATS[a.cat]) tags += '<span class="pl-tag t-day">' + esc(CATS[a.cat]) + '</span>';
    if (a.free === true) tags += '<span class="ap-tag free">免費</span>';
    else if (a.free === false) tags += '<span class="ap-tag paid">付費</span>';
    if (a.tw_store === 'no') tags += '<span class="pl-tag t-warn">⚠ 台灣商店裝不到</span>';
    else if (a.tw_store === 'unknown') tags += '<span class="pl-tag t-unv">台灣商店未確認</span>';
    if (tags) h += '<div class="pl-tags">' + tags + '</div>';

    if (a.what) h += '<p class="pl-note">' + rich(a.what) + '</p>';

    var facts = [];
    if (a.when) facts.push(['這趟', a.when]);
    if (a.offline) facts.push(['離線', a.offline]);
    if (a.iap) facts.push(['內購', a.iap]);
    if (a.dev) facts.push(['開發者', a.dev]);
    if (a.tw_store_note) facts.push(['台灣裝', a.tw_store_note]);
    if (facts.length) {
      h += '<dl class="pl-facts">';
      facts.forEach(function (f) {
        h += '<div><dt>' + esc(f[0]) + '</dt><dd>' + rich(f[1]) + '</dd></div>';
      });
      h += '</dl>';
    }
    if (a.gotchas && a.gotchas.length) {
      h += '<ul class="pl-warn">';
      a.gotchas.forEach(function (g) { h += '<li>' + rich(g) + '</li>'; });
      h += '</ul>';
    }

    h += '<div class="ap-btns">';
    if (a.ios_url) {
      h += '<a class="ap-dl" href="' + esc(a.ios_url) + '" target="_blank" rel="noopener">' +
        '<span class="ic" aria-hidden="true"></span>' +
        '<span class="tx">App Store 下載<em>點了直接開 App Store</em></span></a>';
    } else {
      h += '<span class="ap-dl is-off">查不到官方 App Store 連結' +
        '<em>請在 App Store 自己搜尋店名，別裝到山寨版</em></span>';
    }
    if (a.web) h += '<a class="ap-web" href="' + esc(a.web) +
      '" target="_blank" rel="noopener">官網</a>';
    h += '</div>';
    return h;
  }

  /* ── 篩選列 ── */
  var bar = document.createElement('div');
  bar.className = 'ap-bar';
  var chips = [['', '全部']];
  Object.keys(CATS).forEach(function (k) {
    if (APPS.some(function (a) { return a.cat === k; })) chips.push([k, CATS[k]]);
  });
  var barHtml = '<span class="ap-bl">看哪一類</span><div class="ap-chips" role="group">';
  chips.forEach(function (c) {
    barHtml += '<button type="button" class="fchip" data-cat="' + esc(c[0]) + '" ' +
      'aria-pressed="' + (c[0] === '' ? 'true' : 'false') + '">' + esc(c[1]) + '</button>';
  });
  barHtml += '</div><button type="button" class="fchip ap-must" data-must ' +
    'aria-pressed="false">★ 只看重點下載</button>';
  bar.innerHTML = barHtml;
  root.appendChild(bar);

  var count = document.createElement('p');
  count.className = 'ap-count';
  root.appendChild(count);

  var grid = document.createElement('div');
  grid.className = 'ap-grid';
  root.appendChild(grid);

  function render() {
    var list = APPS.filter(function (a) {
      if (state.cat && a.cat !== state.cat) return false;
      if (state.must && !a.must) return false;
      return true;
    });
    count.textContent = (state.cat || state.must)
      ? '顯示 ' + list.length + ' / ' + APPS.length + ' 支'
      : APPS.length + ' 支 App';
    grid.innerHTML = '';
    list.forEach(function (a) {
      var card = document.createElement('article');
      card.className = 'ap' + (a.must ? ' is-must' : '');
      card.id = 'app-' + a.id;
      card.innerHTML = cardHtml(a);
      grid.appendChild(card);
    });
    if (!list.length) grid.innerHTML = '<div class="empty">這個條件下沒有 App。</div>';
  }

  bar.querySelectorAll('[data-cat]').forEach(function (b) {
    b.onclick = function () {
      state.cat = b.dataset.cat;
      bar.querySelectorAll('[data-cat]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      render();
    };
  });
  var mb = bar.querySelector('[data-must]');
  mb.onclick = function () {
    state.must = !state.must;
    mb.setAttribute('aria-pressed', String(state.must));
    render();
  };
  render();
})();
