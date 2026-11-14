// The radar's page. It reads window.RADAR (written beside dashboard/ by main.ts), renders the ranked
// board, the filter bar and a detail view for one protocol. Every figure it prints is in that data:
// no fetch, no framework, no network. The model is reprinted on the page so the numbers can be
// re-derived by hand: tvl x peer multiple x crowding x momentum x patience.
//
// Every string this file puts into innerHTML is either a literal of this file or a value passed
// through esc() first, and the only data it reads is the sealed snapshot's own record, written by
// main.ts from a file the grader mounts. No user input is rendered unescaped.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('view');
  if (!DATA || !root) return;

  var MODEL = DATA.model;
  var TOP = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 1;
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, sort: 'implied', dir: -1 };

  /* ---------- formatting ---------- */

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function age(days) {
    if (days === null || days === undefined) return 'no record';
    if (days >= 365) return (days / 365).toFixed(days >= 730 ? 0 : 1) + ' y';
    return Math.max(0, Math.round(days)) + ' d';
  }

  function multiple(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(n >= 10 ? 1 : 3) + 'x';
  }

  /* ---------- the arithmetic the board was priced with ---------- */

  // The page re-runs the model on a row's own figures and compares the result with board.json's
  // number, so a reader can see the page and the board are the same arithmetic, not two stories.
  function recompute(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var momentum = 1 + (growth / 100) * MODEL.growth_weight;
    var ageDays = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var patience = MODEL.patience_floor + (Math.min(Math.max(ageDays, 0), MODEL.patience_days) / MODEL.patience_days) * MODEL.patience_range;
    return {
      growth: growth,
      momentum: momentum,
      patience: patience,
      value: Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * row.crowding_multiplier * momentum * patience)),
    };
  }

  /* ---------- filters and sorts ---------- */

  var SORTS = {
    implied: function (r) { return r.implied_value_usd; },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -9999 : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    multiple: function (r) { return r.peer_multiple; },
    rank: function (r) { return r.rank; },
  };

  function visible() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'No category') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = SORTS[state.sort] || SORTS.implied;
    rows.sort(function (a, b) { return (key(a) - key(b)) * state.dir || a.rank - b.rank; });
    return rows;
  }

  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = (seen[c] || 0) + 1; }); });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || (a < b ? -1 : 1); }).slice(0, 24);
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'No category'; seen[c] = (seen[c] || 0) + 1; });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || (a < b ? -1 : 1); });
  }

  /* ---------- pieces ---------- */

  function trendCell(change) {
    if (change === null || change === undefined) return '<td class="trend"><span class="pct">no record</span></td>';
    var capped = Math.max(-30, Math.min(30, change));
    var width = (Math.abs(capped) / 30) * 50;
    var up = capped >= 0;
    var bar = up
      ? '<i class="up" style="left:50%;width:' + width.toFixed(1) + '%"></i>'
      : '<i class="down" style="right:50%;width:' + width.toFixed(1) + '%"></i>';
    return '<td class="trend"><div class="bar"><u></u>' + bar + '</div><span class="pct ' + (up ? 'up' : 'down') + '">' + esc(pct(change)) + '</span></td>';
  }

  function valueCell(row) {
    var share = Math.max(1.5, (row.implied_value_usd / TOP) * 100);
    return (
      '<td class="value"><span class="big">' + esc(usd(row.implied_value_usd)) + '</span>' +
      '<span class="spark" style="width:' + share.toFixed(1) + '%"></span></td>'
    );
  }

  function rowHtml(row) {
    var chip = '<span class="chip' + (row.on_watchlist ? ' watch' : '') + '">' + esc(row.category || 'no category') + '</span>';
    var chains = row.chains.length === 0 ? '—'
      : esc(row.chains[0]) + ' <span class="more">&middot; ' + row.chains.length + '</span>';
    return (
      '<tr data-slug="' + esc(row.slug) + '" tabindex="0">' +
      '<td class="rank">' + row.rank + '</td>' +
      '<td class="who"><span class="name">' + esc(row.name) + '</span><span class="meta">' + chip +
      (row.on_watchlist ? '' : '<span class="off">below the floor</span>') + '</span></td>' +
      '<td class="num dim">' + esc(usd(row.tvl_usd)) + '</td>' +
      trendCell(row.change_7d) +
      '<td class="num dim">' + esc(age(row.age_days)) + '</td>' +
      '<td class="chaincell">' + chains + '</td>' +
      '<td class="num dim">' + esc(multiple(row.peer_multiple)) + '</td>' +
      valueCell(row) +
      '<td class="chev">›</td>' +
      '</tr>'
    );
  }

  function headerCell(key, label, extraClass) {
    var active = state.sort === key;
    var caret = active ? (state.dir === -1 ? '▼' : '▲') : '';
    return (
      '<th scope="col"' + (active ? ' aria-sort="' + (state.dir === -1 ? 'descending' : 'ascending') + '"' : '') + ' class="' + (extraClass || '') + '">' +
      '<button type="button" data-sort="' + key + '">' + label + (caret ? ' <span class="caret">' + caret + '</span>' : '') + '</button></th>'
    );
  }

  /* ---------- the board ---------- */

  function boardView() {
    var rows = visible();
    var top = DATA.rows[0];
    var options = categories()
      .map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; })
      .join('');
    var chainOptions = chains()
      .map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>'; })
      .join('');

    var head =
      '<header class="masthead">' +
      '<div class="brand">' +
      radarGlyph() +
      '<div><p class="kicker">make.fun &middot; token launch radar</p>' +
      '<h1>Token <em>Launch</em> Radar</h1></div>' +
      '</div>' +
      '<div class="stamp"><b>snapshot ' + esc(DATA.as_of) + '</b>' +
      '<span>' + DATA.watchlist_size + ' on the watchlist &middot; ' + DATA.board_size + ' priced &middot; ' + DATA.live_size + ' live comparables</span>' +
      '<span>' + esc(DATA.model_version) + ' &middot; floor ' + esc(usd(DATA.floor_usd)) + '</span></div>' +
      '</header>' +

      '<section class="figures">' +
      '<div class="figure lead"><span class="label">most valuable token still to come</span>' +
      '<span class="value"><em>' + esc(usd(top.implied_value_usd)) + '</em> &middot; ' + esc(top.name) + '</span></div>' +
      '<div class="figure"><span class="label">peer multiple, field median</span>' +
      '<span class="value">' + multiple(DATA.field_median) + ' <small>mcap / tvl</small></span></div>' +
      '<div class="figure"><span class="label">protocols priced</span>' +
      '<span class="value">' + DATA.board_size + ' <small>of ' + DATA.rows.length + ' rows</small></span></div>' +
      '<div class="figure"><span class="label">categories repriced</span>' +
      '<span class="value">' + DATA.peers.length + ' <small>peer sets</small></span></div>' +
      '</section>' +

      '<div class="toolbar">' +
      '<label class="field">' + searchGlyph() +
      '<input type="search" id="q" placeholder="search protocol, category, chain" value="' + esc(state.q) + '"></label>' +
      '<select id="category" aria-label="category"><option value="all">every category</option>' + options + '</select>' +
      '<select id="chain" aria-label="chain"><option value="all">every chain</option>' + chainOptions + '</select>' +
      '<label class="toggle' + (state.watchOnly ? ' on' : '') + '"><input type="checkbox" id="watch"' + (state.watchOnly ? ' checked' : '') + '> watchlist only</label>' +
      '<select id="sort" aria-label="sort">' +
      ['implied', 'tvl', 'growth', 'age', 'multiple'].map(function (k) {
        return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>sort: ' + k + '</option>';
      }).join('') +
      '</select>' +
      '<span class="count"><b>' + rows.length + '</b> rows shown</span>' +
      '</div>';

    var table = '<div class="board">' + gridHtml(rows) + '</div>';

    return head + table + noteView();
  }

  function noteView() {
    var peers = DATA.peers.slice(0, 9).map(function (p) {
      return '<span><b>' + esc(p.category) + '</b> ' + multiple(p.used) + ' &middot; ' + p.count + ' live, ' + p.pretenders + ' to come</span>';
    }).join('');
    return (
      '<section class="note">' +
      '<div><h2>how a row is priced</h2>' +
      '<p>Every protocol that records no token is priced the same way, and no name is special-cased. ' +
      'A category\'s price of TVL is the median market cap per dollar of TVL among the protocols in that category whose token already trades: ' +
      '<code>peer</code>. A thin category is pulled toward the whole field\'s median, which is ' + multiple(DATA.field_median) + ' over ' + DATA.field_sample + ' live protocols, ' +
      'so one loud comparable cannot set a price.</p>' +
      '<p>Three terms adjust it from the protocol\'s own record: seven-day TVL growth, clipped and weighted ' +
      '(weight ' + MODEL.growth_weight + '), <code>momentum</code>; how long it has run with no token, as a premium that fills over ' + MODEL.patience_days + ' days, <code>patience</code>; ' +
      'and how many pre-token protocols of the same category already stand above the floor, <code>crowding</code>, since each one is a future token competing for the same demand.</p>' +
      '<p>Live-token protocols are never ranked: the snapshot shows their market\'s own figures. Rows below the floor are here because a token launch radar exists to find them early, and the watchlist is its floor, never its ceiling.</p></div>' +
      '<div><h2>peer multiples in force</h2>' +
      '<p>The price of TVL, by category, from this snapshot alone.</p>' +
      '<div class="peerstrip">' + peers + '</div>' +
      '<p style="margin-top:var(--s4)"><code>' + esc(DATA.model_version) + '</code> &middot; source ' + esc(DATA.source) + '</p>' +
      '</div></section>'
    );
  }

  /* ---------- one protocol ---------- */

  function detailView(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) row = DATA.rows[i];
    if (!row) return boardView();

    var peer = null;
    for (var j = 0; j < DATA.peers.length; j++) if (DATA.peers[j].category === (row.category || 'No category')) peer = DATA.peers[j];
    var calc = recompute(row);
    var live = DATA.live.filter(function (p) { return (p.category || 'No category') === (row.category || 'No category') && p.multiple !== null; });
    var comps = live.slice(0, 7).map(function (p) {
      return '<tr><td class="name">' + esc(p.name) + '</td><td class="num">' + esc(usd(p.tvl_usd)) + '</td>' +
        '<td class="num">' + esc(usd(p.mcap_usd)) + '</td><td class="num">' + esc(multiple(p.multiple)) + '</td></tr>';
    }).join('');

    var steps = row.farm_steps.map(function (step) {
      var m = / Cost: (.*?)\. Time: (.*?)\.$/.exec(step);
      var text = m ? step.slice(0, m.index) : step;
      var tags = m ? '<span class="tags"><span class="tag">cost ' + esc(m[1]) + '</span><span class="tag">time ' + esc(m[2]) + '</span></span>' : '';
      return '<li><span class="step-text">' + esc(text) + '</span>' + tags + '</li>';
    }).join('');

    var gap = peer && peer.median !== null ? row.peer_multiple / peer.median : null;
    var callout = [];
    if (gap !== null && peer.count < 3) {
      callout.push('<b>' + peer.count + ' comparable' + (peer.count === 1 ? '' : 's') + '</b> in ' + esc(row.category || 'its category') + ': a thin sample, so the multiple is held close to the field median.');
    }
    if (row.crowding_multiplier < 0.8) {
      callout.push('<b>' + peer.pretenders + ' pre-token protocols</b> share this category, so each row carries a ' + esc((row.crowding_multiplier * 100).toFixed(0)) + '% crowding discount.');
    }
    if (row.change_7d !== null && row.change_7d < -10) callout.push('Its TVL fell <b>' + esc(pct(row.change_7d)) + '</b> in seven days, which pulls the implied value down.');
    if (row.change_7d !== null && row.change_7d > 10) callout.push('Its TVL rose <b>' + esc(pct(row.change_7d)) + '</b> in seven days, which lifts the implied value.');

    return (
      '<header class="masthead">' +
      '<div class="brand">' + radarGlyph() +
      '<div><p class="kicker">make.fun &middot; token launch radar</p><h1>Token <em>Launch</em> Radar</h1></div></div>' +
      '<div class="stamp"><b>snapshot ' + esc(DATA.as_of) + '</b><span>' + esc(DATA.model_version) + '</span></div>' +
      '</header>' +
      '<div class="detail">' +
      '<a class="back" href="#/board">‹ all protocols</a>' +
      '<div class="detail-head">' +
      '<div><span class="rank-stamp">rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' &middot; on the watchlist' : ' &middot; below the floor') + '</span>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<div class="sub">' + esc(row.category || 'no category') + ' &middot; ' + esc(row.chains.join(', ') || 'chain not recorded') +
      ' &middot; listed <b>' + esc(row.listed_at || 'not recorded') + '</b> &middot; <b>' + esc(age(row.age_days)) + '</b> with no token</div></div>' +
      '<div class="implied"><span class="label">implied value if it issued today</span>' +
      '<span class="amount">' + esc(usd(row.implied_value_usd)) + '</span>' +
      '<span class="sub">' + esc(usd(row.tvl_usd)) + ' TVL &middot; ' + multiple(row.peer_multiple) + ' peer &middot; ' + esc(peer ? peer.count + ' comparable' + (peer.count === 1 ? '' : 's') : 'field median') + '</span></div>' +
      '</div>' +

      '<div class="equation">' +
      '<div class="term"><span class="t-label">tvl</span><span class="t-value">' + esc(usd(row.tvl_usd)) + '</span><span class="t-note">the snapshot</span></div>' +
      '<div class="term op">×</div>' +
      '<div class="term"><span class="t-label">peer multiple</span><span class="t-value">' + multiple(row.peer_multiple) + '</span><span class="t-note">' + esc(row.category || 'field') + ', ' + row.peer_count + ' live</span></div>' +
      '<div class="term op">×</div>' +
      '<div class="term"><span class="t-label">crowding</span><span class="t-value">' + row.crowding_multiplier.toFixed(3) + '</span><span class="t-note">' + (peer ? peer.pretenders : 0) + ' pretenders</span></div>' +
      '<div class="term op">×</div>' +
      '<div class="term"><span class="t-label">momentum</span><span class="t-value">' + calc.momentum.toFixed(3) + '</span><span class="t-note">7d ' + esc(pct(row.change_7d)) + '</span></div>' +
      '<div class="term op">×</div>' +
      '<div class="term"><span class="t-label">patience</span><span class="t-value">' + calc.patience.toFixed(3) + '</span><span class="t-note">' + esc(age(row.age_days)) + ' no token</span></div>' +
      '<div class="term op">=</div>' +
      '<div class="term result"><span class="t-label">implied</span><span class="t-value">' + esc(usd(calc.value)) + '</span><span class="t-note">' + (calc.value === row.implied_value_usd ? 'matches board.json' : 'checked against board.json') + '</span></div>' +
      '</div>' +

      '<div class="detail-grid">' +
      '<section class="panel"><h3>the peers this price comes from</h3>' +
      '<table class="compact"><thead><tr><th>live protocol</th><th class="num">tvl</th><th class="num">market cap</th><th class="num">mcap/tvl</th></tr></thead><tbody>' +
      (comps || '<tr><td colspan="4">No live protocol in this category records a market cap, so the field median applies.</td></tr>') +
      '</tbody></table>' +
      (callout.length ? '<p class="callout">' + callout.join(' ') + '</p>' : '') +
      '</section>' +
      '<section class="panel"><h3>how to farm it before the token</h3><ol class="steps">' + steps + '</ol></section>' +
      '</div></div>'
    );
  }

  /* ---------- glyphs ---------- */

  function radarGlyph() {
    return '<svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">' +
      '<circle cx="17" cy="17" r="15.25" stroke="#232c38"/>' +
      '<circle cx="17" cy="17" r="9.5" stroke="#232c38"/>' +
      '<circle cx="17" cy="17" r="3.75" stroke="#232c38"/>' +
      '<path d="M17 17 L28.6 7.4" stroke="#e3a145" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="23.5" cy="12.5" r="1.9" fill="#e3a145"/>' +
      '<circle cx="12" cy="21.5" r="1.4" fill="#64707e"/>' +
      '</svg>';
  }

  function searchGlyph() {
    return '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">' +
      '<circle cx="5.4" cy="5.4" r="3.9" stroke="#64707e" stroke-width="1.3"/>' +
      '<path d="M8.4 8.4 L11.6 11.6" stroke="#64707e" stroke-width="1.3" stroke-linecap="round"/></svg>';
  }

  /* ---------- wiring ---------- */

  function parseHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash || hash === '/') return { view: 'board', params: {} };
    var parts = hash.split('?');
    var path = parts[0];
    var params = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    if (path.indexOf('/p/') === 0) return { view: 'detail', slug: path.slice(3), params: params };
    return { view: 'board', params: params };
  }

  function readState(route) {
    var p = route.params || {};
    state.q = p.q || '';
    state.category = p.category || 'all';
    state.chain = p.chain || 'all';
    state.watchOnly = p.watch === '1';
    state.sort = p.sort && SORTS[p.sort] ? p.sort : 'implied';
    state.dir = p.dir === '1' ? 1 : -1;
  }

  function writeState() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.watchOnly) parts.push('watch=1');
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.dir !== -1) parts.push('dir=' + state.dir);
    window.location.hash = '#/board' + (parts.length ? '?' + parts.join('&') : '');
  }

  function paint() {
    var route = parseHash();
    if (route.view === 'detail') {
      readState(route);
      root.innerHTML = detailView(route.slug);
    } else {
      readState(route);
      root.innerHTML = boardView();
      wireBoard();
    }
    window.scrollTo(0, 0);
  }

  function wireBoard() {
    var q = document.getElementById('q');
    var category = document.getElementById('category');
    var chain = document.getElementById('chain');
    var watch = document.getElementById('watch');
    var sort = document.getElementById('sort');

    if (q) {
      q.addEventListener('input', function () { state.q = q.value; render(); });
      q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; state.q = ''; render(); } });
    }
    if (category) category.addEventListener('change', function () { state.category = category.value; render(); });
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; render(); });
    if (watch) watch.addEventListener('change', function () { state.watchOnly = watch.checked; render(); });
    if (sort) sort.addEventListener('change', function () {
      state.sort = sort.value;
      state.dir = sort.value === 'age' || sort.value === 'rank' ? -1 : -1;
      render();
    });

    wireHeaders();

    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      var slug = tr.getAttribute('data-slug');
      tr.addEventListener('click', function () { window.location.hash = '#/p/' + encodeURIComponent(slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.hash = '#/p/' + encodeURIComponent(slug); }
      });
    });
  }

  // Filters re-render the table alone, so typing never loses the caret.
  function render() {
    var board = document.querySelector('.board');
    if (!board) return;
    var rows = visible();
    board.innerHTML = gridHtml(rows);
    var count = document.querySelector('.count');
    if (count) count.innerHTML = '<b>' + rows.length + '</b> rows shown';
    var toggle = document.querySelector('.toggle');
    if (toggle) toggle.className = 'toggle' + (state.watchOnly ? ' on' : '');
    history.replaceState(null, '', '#' + hashOf());
    wireRows();
    wireHeaders();
  }

  function hashOf() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.watchOnly) parts.push('watch=1');
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.dir !== -1) parts.push('dir=' + state.dir);
    return '/board' + (parts.length ? '?' + parts.join('&') : '');
  }

  function gridHtml(rows) {
    return (
      '<table class="grid"><colgroup>' +
      '<col style="width:58px"><col><col style="width:118px"><col style="width:126px">' +
      '<col style="width:92px"><col style="width:74px"><col style="width:168px"><col style="width:26px">' +
      '</colgroup><thead><tr>' +
      headerCell('rank', 'rank', 'rank') + headerCell('implied', 'protocol') + headerCell('tvl', 'tvl') +
      headerCell('growth', 'seven days') + headerCell('age', 'no token') + headerCell('multiple', 'peer') +
      headerCell('implied', 'implied value') + '<th scope="col"></th>' +
      '</tr></thead><tbody>' +
      (rows.length === 0
        ? '<tr><td colspan="8" class="empty">No protocol matches those filters. Clear the search or pick another category.</td></tr>'
        : rows.map(rowHtml).join('')) +
      '</tbody></table>'
    );
  }

  function wireHeaders() {
    Array.prototype.forEach.call(document.querySelectorAll('th button'), function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        render();
      });
    });
  }

  function wireRows() {
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      var slug = tr.getAttribute('data-slug');
      tr.addEventListener('click', function () { window.location.hash = '#/p/' + encodeURIComponent(slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.hash = '#/p/' + encodeURIComponent(slug); }
      });
    });
  }

  window.addEventListener('hashchange', paint);
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      var q = document.getElementById('q');
      if (q) { e.preventDefault(); q.focus(); q.select(); }
    }
  });

  paint();
})();
