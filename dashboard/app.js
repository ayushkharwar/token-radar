(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('view');
  if (!DATA || !root) return;

  var MODEL = DATA.model;
  var FIT = DATA.fit;
  var TOP = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 1;
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, sort: 'implied', dir: -1 };
  var BAND_LO = Infinity;
  var BAND_HI = 0;
  DATA.rows.forEach(function (r) {
    if (r.band_low < BAND_LO) BAND_LO = r.band_low;
    if (r.band_high > BAND_HI) BAND_HI = r.band_high;
  });
  var LOG_LO = Math.log10(BAND_LO > 0 ? BAND_LO : 1);
  var LOG_HI = Math.log10(BAND_HI > 0 ? BAND_HI : 2);
  var LOG_SPAN = LOG_HI > LOG_LO ? LOG_HI - LOG_LO : 1;



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

  function exactUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'no record';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function age(days) {
    if (days === null || days === undefined) return 'no record';
    if (days >= 365) return (days / 365).toFixed(days >= 730 ? 0 : 1) + ' y';
    return Math.max(0, Math.round(days)) + ' d';
  }

  function mult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(n >= 10 ? 1 : n >= 1 ? 2 : 3) + 'x';
  }

  function dex(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2);
  }

  function pow10(x) {
    return Math.pow(10, x);
  }


  function recompute(row) {
    var tvl = Math.max(1, row.tvl_usd);
    var size = pow10(FIT.a + FIT.b * Math.log10(tvl));
    var peer = row.peer_value_usd;
    var base = peer === null ? size : pow10((row.blend_weight_curve * Math.log10(size) + row.blend_weight_peer * Math.log10(peer)) / (row.blend_weight_curve + row.blend_weight_peer));
    var value = Math.max(1, Math.round(base * row.chain_multiplier * row.growth_multiplier * row.maturity_multiplier));
    return { size: size, base: base, value: value };
  }
  function pos(value) {
    if (!isFinite(value) || value <= 0) return 0;
    var at = (Math.log10(value) - LOG_LO) / LOG_SPAN;
    return Math.min(100, Math.max(0, at * 100));
  }
  function whisker(row) {
    var left = pos(row.band_low);
    var right = pos(row.band_high);
    var at = pos(row.implied_value_usd);
    var width = Math.max(1.2, right - left);
    return (
      '<span class="whisk"><i style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></i>' +
      '<u style="left:' + at.toFixed(1) + '%"></u></span>'
    );
  }



  function terms(row) {
    return row.chain_multiplier * row.momentum_multiplier * row.maturity_multiplier;
  }

  var SORTS = {
    implied: function (r) { return r.implied_value_usd; },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -9999 : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    terms: function (r) { return terms(r); },
    band: function (r) { return Math.log10(r.band_high / Math.max(1, r.band_low)); },
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
    return (
      '<td class="value"><span class="big">' + esc(usd(row.implied_value_usd)) + (row.estimators_agree === false ? ' <b class="disagree">!</b>' : '') + '</span>' + whisker(row) +
      '<span class="range">' + esc(usd(row.band_low)) + ' to ' + esc(usd(row.band_high)) + '</span></td>'
    );
  }

  function rowHtml(row) {
    var chip = '<span class="chip' + (row.on_watchlist ? ' watch' : '') + '">' + esc(row.category || 'no category') + '</span>';
    return (
      '<tr data-slug="' + esc(row.slug) + '" tabindex="0">' +
      '<td class="rank">' + row.rank + '</td>' +
      '<td class="who"><span class="name">' + esc(row.name) + '</span><span class="meta">' + chip +
      (row.on_watchlist ? '' : '<span class="off">beyond watchlist</span>') + '</span></td>' +
      '<td class="num dim">' + esc(usd(row.tvl_usd)) + '</td>' +
      trendCell(row.change_7d) +
      valueCell(row) +
      '<td class="num band-width">' + SORTS.band(row).toFixed(1) + '<small>dex</small></td>' +
      '<td class="agreement" title="Depth-weighted estimator agreement">' + (row.estimators_agree === null ? 'C' : row.estimators_agree ? '=' : '!') + '</td>' +
      '</tr>'
    );
  }

  function headerCell(key, label, extraClass) {
    var active = state.sort === key;
    var caret = active ? (state.dir === -1 ? '&#9660;' : '&#9650;') : '';
    return (
      '<th scope="col"' + (active ? ' aria-sort="' + (state.dir === -1 ? 'descending' : 'ascending') + '"' : '') + ' class="' + (extraClass || '') + '">' +
      '<button type="button" data-sort="' + key + '">' + label + (caret ? ' <span class="caret">' + caret + '</span>' : '') + '</button></th>'
    );
  }

  function masthead(compact) {
    return (
      '<header class="masthead">' +
      '<div class="brand">' +
      radarGlyph() +
      '<div><p class="kicker">make.fun &middot; token launch radar</p>' +
      '<h1>Token <em>Launch</em> Radar</h1></div>' +
      '</div>' +
      '<div class="stamp"><b>snapshot ' + esc(DATA.as_of) + '</b>' +
      (compact
        ? '<span>' + esc(DATA.model_version) + '</span>'
        : '<span>' + DATA.watchlist_size + ' on the watchlist &middot; ' + DATA.board_size + ' priced &middot; size curve over ' + DATA.fit.n + ' live protocols</span>' +
          '<span>' + esc(DATA.model_version) + ' &middot; floor ' + esc(usd(DATA.floor_usd)) + '</span>') +
      '</div>' +
      '</header>'
    );
  }



  function boardView() {
    var rows = visible();
    var options = categories()
      .map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; })
      .join('');
    var chainOptions = chains()
      .map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>'; })
      .join('');

    var head = masthead(false) +

      '<section class="method"><p>We price a possible token from a size curve and category peers, then adjust for chain reach, growth and tracking age.</p>' +
      '<div class="fit-strip"><b>size curve B ' + FIT.b.toFixed(3) + '</b><span>scatter ' + FIT.scatter.toFixed(2) + ' dex</span><span>r2 ' + FIT.r2.toFixed(2) + '</span><span>' + FIT.n + ' of ' + FIT.first.n + ' live tokens kept</span><span>' + DATA.board_size + ' candidates / ' + DATA.watchlist_size + ' watchlist</span></div></section>' +

      '<div class="toolbar">' +
      '<label class="field">' + searchGlyph() +
      '<input type="search" id="q" placeholder="search protocol, category, chain" value="' + esc(state.q) + '"></label>' +
      '<select id="category" aria-label="category"><option value="all">every category</option>' + options + '</select>' +
      '<select id="chain" aria-label="chain"><option value="all">every chain</option>' + chainOptions + '</select>' +
      '<label class="toggle' + (state.watchOnly ? ' on' : '') + '"><input type="checkbox" id="watch"' + (state.watchOnly ? ' checked' : '') + '> watchlist only</label>' +
      '<select id="sort" aria-label="sort">' +
      ['implied', 'tvl', 'growth', 'age', 'terms', 'band'].map(function (k) {
        return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>sort: ' + k + '</option>';
      }).join('') +
      '</select>' +
      '<span class="count"><b>' + rows.length + '</b> rows shown</span>' +
      '<a class="fitlink" href="#/fit">the two estimators &#8250;</a>' +
      '</div>' +

      '<div class="board-layout"><div class="board">' + gridHtml(rows) + '</div><aside class="board-aside">' + bandChart(rows) + claimsView() + '</aside></div>' +
      noteView();

    return head;
  }

  function bandChart(rows) {
    var top = rows.slice(0, 5);
    var lo = Math.floor(Math.min.apply(null, top.map(function (r) { return Math.log10(Math.max(1, r.band_low)); })));
    var hi = Math.ceil(Math.max.apply(null, top.map(function (r) { return Math.log10(r.band_high); })));
    if (!top.length) return '<h2>No rows to compare</h2>';
    function x(v) { return 30 + (Math.log10(Math.max(1, v)) - lo) / Math.max(1, hi - lo) * 250; }
    var svg = '<svg class="band-chart" viewBox="0 0 310 280" role="img" aria-label="Top five visible rows: implied values and one sigma bands on a shared log dollar scale">';
    for (var d = lo; d <= hi; d++) svg += '<line class="guide" x1="' + x(pow10(d)) + '" x2="' + x(pow10(d)) + '" y1="10" y2="249"/><text x="' + x(pow10(d)) + '" y="272" text-anchor="middle">' + usd(pow10(d)) + '</text>';
    top.forEach(function (r, i) {
      var y = 23 + i * 47;
      svg += '<text class="band-name" x="12" y="' + y + '">#' + r.rank + ' ' + esc(r.name) + '</text><text x="294" y="' + y + '" text-anchor="end">' + usd(r.implied_value_usd) + '</text>';
      svg += '<line class="interval" x1="' + x(r.band_low) + '" x2="' + x(r.band_high) + '" y1="' + (y+15) + '" y2="' + (y+15) + '"/>';
      [r.band_low, r.band_high].forEach(function (v) { svg += '<line class="cap" x1="' + x(v) + '" x2="' + x(v) + '" y1="' + (y+10) + '" y2="' + (y+20) + '"/>'; });
      svg += '<circle cx="' + x(r.implied_value_usd) + '" cy="' + (y+15) + '" r="3.5"/>';
    });
    return '<section class="band-summary"><h2>Five rows, visible uncertainty</h2><p>Top of this view. Dot: value. Line: one sigma.</p>' + svg + '</svg><p>Shared log dollar scale. Overlap limits rank confidence.</p><p>C/P marks: = agree; ! disagree; C curve only.</p></section>';
  }

  function claimsView() {
    return '<section class="claims"><h2>What this board claims</h2><ul>' +
      '<li>Prices a possible token from market TVL pricing.</li>' +
      '<li>Snapshot only; no name exceptions or outside data.</li>' +
      '<li>One sigma: market disagreement, not a wrong row.</li>' +
      '<li>Watchlist floor: ' + DATA.early_size + '/' + DATA.board_size + ' rows extend early coverage.</li>' +
      '<li>No launch prediction or investment advice.</li></ul></section>';
  }

  function noteView() {
    return '<section class="note"><div><h2>two estimates, one conditional value</h2>' +
      '<p>C = 10^(a + b log10 TVL). P = TVL times a category median market-cap/TVL multiple. The outer tenth of peer multiples is winsorised when n is at least five; the tail count rounds down. The median is shrunk toward the whole field median by n/(n+6), then clamped to 0.02 to 8.</p>' +
      '<p>wC = nC/(nC+12); wP = nP/(nP+6). Base = 10^((wC log10 C + wP log10 P)/(wC+wP)). No category comparable means curve only. Depth = min(1, peers/8). Implied = round(base times chain times momentum times maturity).</p>' +
      '<p>Chain = 1 + 0.03 min(chains-1,4). Momentum = 1 + 0.30 clamp(change_7d,-40,60)/100; missing growth is zero. Maturity = 0.75 + 0.25 min(age_days,1095)/1095; a missing date uses 240 days.</p></div>' +
      '<div><h2>uncertainty and scope</h2><p>Sigma = sqrt(sd squared + (0.5 depth log10(C/P)) squared). Curve-only rows use sd. The band is round(implied / 10^sigma) to round(implied times 10^sigma). It is a model spread, not a calibrated probability or a price target.</p>' +
      '<p>The snapshot records no token for these candidates. Value assumes a launch with the current record; it predicts neither a launch nor its date. The watchlist is a floor; independent candidates beyond it also rank.</p>' +
      '<p>Farm actions are category-based research plans. Verify supported assets, eligibility and official instructions before using capital; the snapshot contains no reward rules.</p><a href="#/fit">Inspect the two estimators and the fit &#8250;</a></div></section>';
  }



  var CHART = { w: 780, h: 326, l: 64, r: 22, t: 14, b: 40 };

  function chartDomain() {
    var xs = [];
    var ys = [];
    DATA.points.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    DATA.dropped.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    DATA.rows.slice(0, 25).forEach(function (r) {
      xs.push(Math.log10(Math.max(1, r.tvl_usd)));
      ys.push(Math.log10(r.implied_value_usd), Math.log10(r.band_low), Math.log10(r.band_high));
    });
    var x0 = Math.min.apply(null, xs);
    var x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys);
    var y1 = Math.max.apply(null, ys);
    var padX = Math.max(0.12, (x1 - x0) * 0.03);
    var padY = Math.max(0.12, (y1 - y0) * 0.03);
    return { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY };
  }

  function fitChart() {
    var d = chartDomain();
    var w = CHART.w;
    var h = CHART.h;
    var plotW = w - CHART.l - CHART.r;
    var plotH = h - CHART.t - CHART.b;

    function px(x) { return CHART.l + ((x - d.x0) / (d.x1 - d.x0)) * plotW; }
    function py(y) { return CHART.t + (1 - (y - d.y0) / (d.y1 - d.y0)) * plotH; }

    var parts = [];
    parts.push('<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="log market cap against log TVL, with the fitted size line and the top 25 protocols to come">');
    var kx;
    for (kx = Math.ceil(d.x0); kx <= d.x1; kx++) {
      parts.push('<line class="grid" x1="' + px(kx).toFixed(1) + '" y1="' + CHART.t + '" x2="' + px(kx).toFixed(1) + '" y2="' + (h - CHART.b) + '"/>');
      parts.push('<text class="tick" x="' + px(kx).toFixed(1) + '" y="' + (h - CHART.b + 15) + '" text-anchor="middle">' + esc(usd(pow10(kx))) + '</text>');
    }
    var ky;
    for (ky = Math.ceil(d.y0); ky <= d.y1; ky++) {
      parts.push('<line class="grid" x1="' + CHART.l + '" y1="' + py(ky).toFixed(1) + '" x2="' + (w - CHART.r) + '" y2="' + py(ky).toFixed(1) + '"/>');
      parts.push('<text class="tick" x="' + (CHART.l - 9) + '" y="' + (py(ky) + 3.5).toFixed(1) + '" text-anchor="end">' + esc(usd(pow10(ky))) + '</text>');
    }
    parts.push('<line class="axis" x1="' + CHART.l + '" y1="' + (h - CHART.b) + '" x2="' + (w - CHART.r) + '" y2="' + (h - CHART.b) + '"/>');
    parts.push('<line class="axis" x1="' + CHART.l + '" y1="' + CHART.t + '" x2="' + CHART.l + '" y2="' + (h - CHART.b) + '"/>');
    parts.push('<text class="axis-label" x="' + (CHART.l + plotW / 2) + '" y="' + (h - 10) + '" text-anchor="middle">TVL, log scale</text>');
    parts.push('<text class="axis-label" x="14" y="' + (CHART.t + plotH / 2) + '" text-anchor="middle" transform="rotate(-90 14 ' + (CHART.t + plotH / 2) + ')">market cap or implied value, log scale</text>');
    var lx0 = (d.y0 - FIT.a) / FIT.b;
    var lx1 = (d.y1 - FIT.a) / FIT.b;
    var sx0 = Math.max(d.x0, Math.min(lx0, lx1));
    var sx1 = Math.min(d.x1, Math.max(lx0, lx1));
    parts.push('<line class="fitline" x1="' + px(sx0).toFixed(1) + '" y1="' + py(FIT.a + FIT.b * sx0).toFixed(1) + '" x2="' + px(sx1).toFixed(1) + '" y2="' + py(FIT.a + FIT.b * sx1).toFixed(1) + '"/>');
    DATA.points.forEach(function (p) {
      parts.push('<circle class="dot" cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="2.3"><title>' + esc(p.name) + '</title></circle>');
    });
    DATA.dropped.forEach(function (p) {
      parts.push('<circle class="dot dropped" cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="2.6"><title>' + esc(p.name) + ', clipped</title></circle>');
    });
    var top = DATA.rows.slice(0, 25);
    var marks = [];
    top.forEach(function (r) {
      var cx = px(Math.log10(Math.max(1, r.tvl_usd)));
      var cy = py(Math.log10(r.implied_value_usd));
      marks.push({ row: r, cx: cx, cy: cy });
      parts.push(
        '<line class="band" x1="' + cx.toFixed(1) + '" y1="' + py(Math.log10(r.band_high)).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + py(Math.log10(r.band_low)).toFixed(1) + '"/>' +
        '<circle class="mark" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4"><title>' + esc(r.name) + ': ' + esc(exactUsd(r.implied_value_usd)) + '</title></circle>'
      );
    });
    var labelled = marks.slice(0, 5).slice().sort(function (a, b) { return a.cy - b.cy; });
    var floor = CHART.t + 8;
    labelled.forEach(function (m) {
      var at = Math.max(m.cy + 3, floor);
      floor = at + 11;
      var right = m.cx < w - 190;
      var text = '#' + m.row.rank + ' ' + (m.row.name.length > 20 ? m.row.name.slice(0, 19) + '.' : m.row.name);
      parts.push(
        '<line class="leader" x1="' + (m.cx + (right ? 4.6 : -4.6)).toFixed(1) + '" y1="' + m.cy.toFixed(1) + '" x2="' + (m.cx + (right ? 9 : -9)).toFixed(1) + '" y2="' + at.toFixed(1) + '"/>' +
        '<text class="marker-label" x="' + (m.cx + (right ? 12 : -12)).toFixed(1) + '" y="' + (at + 3).toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + esc(text) + '</text>'
      );
    });

    parts.push('</svg>');
    return parts.join('') + '<p class="legend"><span class="key dot"></span>' + DATA.points.length + ' live protocols, the fit\'s own points ' +
      '<span class="key mark"></span>top ' + top.length + ' to come, hollow, with a one sigma band ' +
      '<span class="key band"></span>' + FIT.clipped + ' clipped point' + (FIT.clipped === 1 ? '' : 's') + ' not fitted ' +
      '<span class="key line"></span>the line &middot; the first five are named</p>';
  }

  function fitView() {
    var slope = pow10(FIT.b);
    return masthead(true) +
      '<div class="detail">' +
      '<a class="back" href="#/board">&#8249; the board</a>' +
      '<div class="detail-head"><div>' +
      '<span class="rank-stamp">the fit &middot; ' + FIT.n + ' points kept of ' + FIT.first.n + '</span>' +
      '<h2>Two estimates, one visible disagreement</h2>' +
      '<div class="sub">Log market cap on log TVL, least squares over every protocol whose token trades, then the points beyond ' + MODEL.sigma_cut + ' sigma dropped and the line refit.</div>' +
      '</div><div class="implied"><span class="label">implied value of the top row</span>' +
      '<span class="amount">' + esc(usd(DATA.rows[0].implied_value_usd)) + '</span>' +
      '<span class="sub">' + esc(DATA.rows[0].name) + ' at ' + esc(usd(DATA.rows[0].tvl_usd)) + ' TVL</span></div></div>' +

      '<div class="fitgrid">' +
      '<figure class="chartbox">' + fitChart() + '</figure>' +
      '<section class="fitside">' +
      '<h3>the fit\'s own numbers</h3>' +
      '<table class="compact fits"><tbody>' +
      '<tr><td class="name">slope B</td><td class="num">' + FIT.b.toFixed(4) + '</td></tr>' +
      '<tr><td class="name">intercept A</td><td class="num">' + FIT.a.toFixed(4) + '</td></tr>' +
      '<tr><td class="name">scatter, one sigma</td><td class="num">' + FIT.scatter.toFixed(4) + ' dex</td></tr>' +
      '<tr><td class="name">R&sup2;</td><td class="num">' + FIT.r2.toFixed(4) + '</td></tr>' +
      '<tr><td class="name">points kept</td><td class="num">' + FIT.n + '</td></tr>' +
      '<tr><td class="name">points clipped</td><td class="num">' + FIT.clipped + '</td></tr>' +
      '<tr><td class="name">field median / sample</td><td class="num">' + FIT.field_median.toFixed(4) + 'x / ' + FIT.field_sample + '</td></tr>' +
      '<tr><td class="name">wC = nC/(nC+12)</td><td class="num">' + (FIT.n / (FIT.n + 12)).toFixed(4) + '</td></tr>' +
      '<tr><td class="name">wP = nP/(nP+6)</td><td class="num">0 if no peer</td></tr>' +
      '<tr class="before"><td class="name">before clipping</td><td class="num">' + FIT.first.a.toFixed(4) + ' + ' + FIT.first.b.toFixed(4) + 'x, &sigma; ' + FIT.first.scatter.toFixed(4) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="slopesay">A protocol ten times larger is worth ' + slope.toFixed(2) + ' times as much on the fitted curve. Each extra dex of TVL adds ' + FIT.b.toFixed(3) + ' dex of fitted market cap.</p>' +
      '<p class="bandsay">Each band combines curve scatter and half the depth-weighted log gap between C and P. Depth = min(1, peers/8). Greater disagreement widens the band. Curve-only rows use sd alone; the spread is not a calibrated probability.</p>' +
      '</section>' +
      '</div>' +

      '<section class="fitwhy">' +
      '<h3>why use two estimators</h3>' +
      '<p>The curve measures the field\'s size relationship; the peer estimator measures category pricing without using that line. Combining them reduces dependence on either assumption and makes their disagreement visible.</p>' +
      '<p>The raw depth weights are normalised to sum to one in log space. The detail shows C/P percentage shares for each row; a missing category sample gives the curve 100 per cent. The field median uses all eligible live points, including regression outliers.</p>' +
      '</section>' +
      '</div>';
  }



  function detailView(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) row = DATA.rows[i];
    if (!row) return boardView();


    var calc = recompute(row);
    var live = DATA.live.filter(function (p) { return (p.category || 'No category') === (row.category || 'No category') && p.multiple !== null; });
    var comps = live.slice(0, 7).map(function (p) {
      return '<tr><td class="name">' + esc(p.name) + '</td><td class="num">' + esc(usd(p.tvl_usd)) + '</td>' +
        '<td class="num">' + esc(usd(p.mcap_usd)) + '</td><td class="num">' + esc(dex(p.residual_dex)) + '</td></tr>';
    }).join('');

    var steps = row.farm_steps.map(function (step) {
      var m = / Cost: (.*?)\. Time: (.*?)\.$/.exec(step);
      var text = m ? step.slice(0, m.index) : step;
      var tags = m ? '<span class="tags"><span class="tag">cost ' + esc(m[1]) + '</span><span class="tag">time ' + esc(m[2]) + '</span></span>' : '';
      return '<li><span class="step-text">' + esc(text) + '</span>' + tags + '</li>';
    }).join('');

    var callout = [];
    if (row.sample.comparables === 0) {
      callout.push('<b>No live comparable</b> in ' + esc(row.category || 'its category') + ', so the base uses the curve alone before the three adjustments.');
    } else if (row.sample.comparables < 3) {
      callout.push('<b>' + row.sample.comparables + ' live comparable' + (row.sample.comparables === 1 ? '' : 's') + '</b> in ' + esc(row.category || 'its category') + ': a thin sample, so its multiple leans toward the field median.');
    }
    if (row.change_7d !== null && row.change_7d < -10) callout.push('Its TVL fell <b>' + esc(pct(row.change_7d)) + '</b> in seven days, which pulls the implied value down.');
    if (row.change_7d !== null && row.change_7d > 10) callout.push('Its TVL rose <b>' + esc(pct(row.change_7d)) + '</b> in seven days, which lifts the implied value.');
    var bandRatio = row.implied_value_usd > 0 ? row.band_high / row.band_low : 1;
    callout.push('One sigma either side is a band <b>' + bandRatio.toFixed(1) + ' high-to-low ratio</b>: read two rows whose bands overlap as too close to separate.');

    return masthead(true) +
      '<div class="detail">' +
      '<a class="back" href="#/board">&#8249; all protocols</a>' +
      '<div class="detail-head">' +
      '<div><span class="rank-stamp">rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' &middot; on the watchlist' : ' &middot; beyond watchlist') + '</span>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<div class="sub">' + esc(row.category || 'no category') + ' &middot; ' + '<span title="' + esc(row.chains.join(', ')) + '">' + esc(row.chains.slice(0, 3).join(', ') || 'chain not recorded') + (row.chains.length > 3 ? ' +' + (row.chains.length - 3) + ' more' : '') + '</span>' +
      ' &middot; tracking starts <b>' + esc(row.listed_at || 'not recorded') + '</b> &middot; <b>' + esc(age(row.age_days)) + '</b> tracking age</div></div>' +
      '<div class="implied"><span class="label">implied value if it issued today</span>' +
      '<span class="amount">' + esc(usd(row.implied_value_usd)) + '</span>' +
      '<span class="sub">' + esc(usd(row.band_low)) + ' to ' + esc(usd(row.band_high)) + ' at one sigma</span></div>' +
      '</div>' +

      '<div class="bandbar"><span class="track"><i style="left:' + pos(row.band_low).toFixed(1) + '%;width:' + Math.max(1, pos(row.band_high) - pos(row.band_low)).toFixed(1) + '%"></i>' +
      '<u style="left:' + pos(row.implied_value_usd).toFixed(1) + '%"></u></span>' +
      '<span class="ends"><span>' + esc(exactUsd(row.band_low)) + '</span><span class="mid">' + esc(exactUsd(row.implied_value_usd)) + ' implied</span><span>' + esc(exactUsd(row.band_high)) + '</span></span></div>' +

      '<div class="estimator-pair"><div><span class="label">C: size curve</span><b>' + esc(usd(row.curve_value_usd)) + '</b><span>depth weight ' + row.blend_weight_curve.toFixed(4) + '; blend share ' + (100 * row.blend_weight_curve / (row.blend_weight_curve + row.blend_weight_peer)).toFixed(0) + '%</span></div>' +
      '<div><span class="label">P: peer multiple</span><b>' + esc(usd(row.peer_value_usd)) + '</b><span>' + row.sample.comparables + ' comparables; weight ' + row.blend_weight_peer.toFixed(4) + '; multiple ' + row.category_multiplier.toFixed(4) + 'x; blend share ' + (100 * row.blend_weight_peer / (row.blend_weight_curve + row.blend_weight_peer)).toFixed(0) + '%</span></div></div>' +
      '<p class="verdict">' + (row.estimators_agree === null ? 'No category comparable: the curve alone sets the base.' : row.estimators_agree ? 'The depth-weighted estimator gap is within ' + MODEL.agree_dex + ' dex.' : 'The depth-weighted estimator gap exceeds ' + MODEL.agree_dex + ' dex; it widens the band.') + '</p>' +
      '<div class="equation">' +
      '<div class="term"><span class="t-label">five-factor equation</span><span class="t-value">C^alpha &times; P^(1-alpha) &times; chain &times; momentum &times; maturity</span><span class="t-note">alpha = wC / (wC+wP); no peer means alpha = 1 and P term = 1</span></div>' +
      '<div class="term"><span class="t-label">numeric product, rounded to dollars</span><span class="t-value">' + esc(usd(calc.base)) + ' &times; ' + row.chain_multiplier.toFixed(2) + ' &times; ' + row.growth_multiplier.toFixed(5) + ' &times; ' + row.maturity_multiplier.toFixed(5) + ' = ' + esc(usd(row.implied_value_usd)) + '</span><span class="t-note">base = depth-weighted geometric blend; ' + (calc.value === row.implied_value_usd ? 'matches board.json' : 'arithmetic mismatch') + '</span></div>' +
      '<div class="term"><span class="t-label">sigma and band</span><span class="t-value">' + row.sigma_dex.toFixed(4) + ' dex; ' + esc(usd(row.band_low)) + ' to ' + esc(usd(row.band_high)) + '</span><span class="t-note">depth = min(1, peers/8); sigma = sqrt(sd^2 + (0.5 depth log10(C/P))^2); curve only: sd</span></div></div>' +

      '<div class="detail-grid">' +
      '<section class="panel"><h3>live protocols in this category, and where they sit</h3>' +
      '<table class="compact"><thead><tr><th>live protocol</th><th class="num">tvl</th><th class="num">market cap</th><th class="num">vs the line, dex</th></tr></thead><tbody>' +
      (comps || '<tr><td colspan="4">No live protocol in this category records a market cap, in this display; the recorded sample above determines the peer estimate.</td></tr>') +
      '</tbody></table>' +
      (callout.length ? '<p class="callout">' + callout.join(' ') + '</p>' : '') +
      '</section>' +
      '<section class="panel"><h3>how to farm it before the token</h3><p class="farm-budget">To farm this for 90 days: about ' + exactUsd(row.farm_capital_usd) + ' of capital and ' + exactUsd(row.farm_gas_90_day_usd) + ' of gas.</p><p class="budget-note">Capital stays at risk. Gas includes 13 weekly actions and an exit reserve. Total budget: ' + exactUsd(row['90_day_cost_usd']) + '.</p><ol class="steps">' + steps + '</ol></section>' +
      '</div>' +
      '<p class="footlink"><a href="#/fit">the size curve this row was priced on &#8250;</a></p>' +
      '</div>';
  }



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
    if (path === '/fit') return { view: 'fit', params: params };
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
      '<col style="width:5%"><col style="width:29%"><col style="width:11%"><col style="width:13%">' +
      '<col style="width:27%"><col style="width:10%"><col style="width:5%">' +
      '</colgroup><thead><tr>' +
      headerCell('rank', 'rank', 'rank') + '<th scope="col">protocol / category</th>' + headerCell('tvl', 'TVL') +
      headerCell('growth', 'seven days') + headerCell('implied', 'implied value / band') + headerCell('band', 'band') + '<th scope="col">C/P</th>' +
      '</tr></thead><tbody>' +
      (rows.length === 0
        ? '<tr><td colspan="7" class="empty">No protocol matches those filters. Clear the search or pick another category.</td></tr>'
        : rows.map(rowHtml).join('')) +
      '</tbody></table><p class="agreement-legend"><b class="disagree">!</b> disagree &nbsp; = agree &nbsp; C curve only. Depth-weighted gap threshold: ' + MODEL.agree_dex + ' dex. Band column: full width in dex.</p>'
    );
  }



  function paint() {
    var route = parseHash();
    document.body.classList.toggle('view-detail', route.view !== 'board');
    readState(route);
    if (route.view === 'detail') root.innerHTML = detailView(route.slug);
    else if (route.view === 'fit') root.innerHTML = fitView();
    else { root.innerHTML = boardView(); wireBoard(); }
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
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; state.dir = -1; render(); });

    wireHeaders();
    wireRows();
  }
  function render() {
    var board = document.querySelector('.board');
    if (!board) return;
    var rows = visible();
    board.innerHTML = gridHtml(rows);
    document.querySelector('.board-aside').innerHTML = bandChart(rows) + claimsView();
    var sort = document.getElementById('sort');
    if (sort) sort.value = state.sort;
    var count = document.querySelector('.count');
    if (count) count.innerHTML = '<b>' + rows.length + '</b> rows shown';
    var toggle = document.querySelector('.toggle');
    if (toggle) toggle.className = 'toggle' + (state.watchOnly ? ' on' : '');
    history.replaceState(null, '', '#' + hashOf());
    wireRows();
    wireHeaders();
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
