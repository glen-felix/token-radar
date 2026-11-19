// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// five views of one sealed snapshot: the ranked pre-token board, the live tokens set aside,
// the products the launch screen sets aside, the fitted model's calibration, and a movers &
// risks view. The value model (radar-4: a peer-count-weighted blend of a shrunk category
// median and a fitted regression multiple, graded by a five-fold backtest) is stated on the
// page itself, in dashboard/METHOD.md and in lib/model.ts; the detail drawer prints every
// term of a row's price so it reproduces by hand. The farm plan shown in the drawer is the
// exact text main.ts wrote to board.json — data.js carries farm_steps, the page never
// re-derives them. No network: every byte rendered here ships in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', wl: false, tab: 'board', sort: 'implied', dir: -1, selected: null };
  var FLAG_LABEL = { 'young': 'young', 'single-chain': '1 chain', 'growth-spike': '7d spike', 'thin-comps': 'thin comps' };
  var FLAG_NOTE = {
    'young': 'first tracked under 180 days ago',
    'single-chain': 'its TVL sits on a single chain',
    'growth-spike': 'its TVL moved over 50% in seven days, either way',
    'thin-comps': 'fewer than five traded protocols of its category calibrate its price'
  };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return '\u00d7 ' + (Math.round(n * 10000) / 10000); }
  function fmtDex(n) { return (n > 0 ? '+' : '') + (Math.round(n * 10000) / 10000).toFixed(4) + ' dex'; }
  function tierPill(r) { return el('span', { class: 'pill tier-' + r.tier.toLowerCase(), text: r.tier }); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function matchesQ(r) {
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function rows() {
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      return matchesQ(r);
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function chips(r) {
    if (!r.risk_flags || r.risk_flags.length === 0) return null;
    return el('span', { class: 'chips' }, r.risk_flags.map(function (f) {
      return el('span', { class: 'chip', title: FLAG_NOTE[f] || f, text: FLAG_LABEL[f] || f });
    }));
  }
  function nameCell(r) {
    return el('td', null, el('div', { class: 'pname' },
      el('b', { text: r.name }),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }),
      el('span', { class: 'tierline' }, tierPill(r))
    ));
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'dot' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index, sealed' }),
        el('span', { text: 'Model ' + DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Protocols with no token yet, ranked by what a launch could be worth' }),
        el('p', null,
          'Every protocol in the snapshot that records no token is scored by one stated model whose prices are fitted from the snapshot itself: what the market already pays, per TVL dollar, for traded protocols of the same kind. The ',
          el('b', { text: DATA.watchlist_size + ' watchlist protocols' }),
          ' (at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL) are the floor; the radar adds ',
          el('b', { text: DATA.early_size + ' earlier finds' }),
          ' the list leaves out, screened so no wrapped, staked or bridged product of a trading token ranks as a launch — those products are shown, with the reason, in the Products view. Protocols whose token already trades are set aside in the Live view: their market cap is a fact, not a model. Rows are tiered by TVL — Prime at or above the snapshot\u2019s floor, Standard from $10M, Speculative below it — and each row\u2019s risk flags sit in their own column.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Protocols surfaced' }), el('b', { text: DATA.surfaced_size + ' of ' + DATA.snapshot_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Products set aside' }), el('b', { text: String(DATA.product_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Prime / Standard / Speculative' }), el('b', { text: DATA.tiers.prime + ' / ' + DATA.tiers.standard + ' / ' + DATA.tiers.speculative })),
        el('div', { class: 'stat' }, el('span', { text: 'Backtest median error' }), el('b', { text: DATA.calibration.backtest.median_ape_pct.toFixed(1) + '%' }))
      )
    );
  }

  function modelStrip() {
    return el('section', { class: 'model-strip' },
      el('h2', { text: 'The value model — fitted from the snapshot\u2019s own traded protocols' }),
      el('div', { class: 'formula', text: DATA.formula }),
      el('p', { text: 'No coefficient is picked by hand. The regression\u2019s five coefficients and every category effect are fitted from the snapshot\u2019s own ' + DATA.calibration.global_comps + ' traded comparables; the category component is their median mcap/TVL, shrunk toward the global median; and the two are blended geometrically, weighted by the peer count behind the median, so a thin category leans on the regression — priced off its own TVL through the market\u2019s fitted curve — instead of one flat number or one wild peer. Each factor term is capped at \u00b10.5 dex, so no single fitted factor moves a price by more than about 3.2\u00d7. The fit is graded in the open: the Model view publishes the size curve, the coefficient table, the whole calibration and a five-fold backtest against the comparables\u2019 actual market caps, with the previous model\u2019s backtest beside it.' })
    );
  }

  var TABS = [
    ['board', 'Pre-token board'],
    ['live', 'Live tokens'],
    ['products', 'Products'],
    ['model', 'Model'],
    ['movers', 'Movers & risks']
  ];
  function countText() {
    if (state.tab === 'board') return rows().length + ' of ' + DATA.board_size + ' rows';
    if (state.tab === 'live') return DATA.live.length + ' of ' + DATA.live_total + ' live-token protocols';
    if (state.tab === 'products') return DATA.products.filter(matchesQ).length + ' of ' + DATA.product_size + ' products';
    if (state.tab === 'model') return DATA.calibration.categories.length + ' categories calibrated';
    return DATA.rows.length + ' rows scanned';
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tierSel = el('select', { id: 'tier', 'aria-label': 'Filter by tier' },
      el('option', { value: 'all', text: 'All tiers' }),
      ['Prime', 'Standard', 'Speculative'].map(function (t) { return el('option', { value: t, text: t, selected: t === state.tier ? 'selected' : null }); })
    );
    tierSel.addEventListener('change', function () { state.tier = tierSel.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', 'aria-label': 'Watchlist only' });
    if (state.wl) wlBox.setAttribute('checked', 'checked');
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
    var tabs = el('div', { class: 'tabs' }, TABS.map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { state.tab = t[0]; writeHash(); render(); } });
    }));
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'tier', text: 'Tier' }), tierSel),
      el('label', { class: 'check' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), tabs),
      el('span', { class: 'count', text: countText() })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the category, chain and watchlist filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    max = max || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        nameCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, chips(r) || el('span', { class: 'sub', text: 'none' })),
        el('td', null, r.watchlist
          ? el('span', { class: 'pill', text: 'watchlist' })
          : el('span', { class: 'pill early', text: 'early find' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied launch value under model ' + DATA.model_version + '. Each row carries its TVL tier — Prime at or above the snapshot floor, Standard from $10M, Speculative below — and its risk flags in their own column: young, single-chain, a seven-day spike, or a price calibrated on thin comparables. Select any row for its full price breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d change'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Risk flags' }),
            el('th', { scope: 'col', text: 'Radar' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = DATA.live.filter(matchesQ);
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: r.symbol ? 'trades as ' + r.symbol : 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Set aside: these protocols already have a token, so the board shows the market\u2019s own capitalisation and never ranks them against pre-token protocols. The ' + DATA.live.length + ' largest by market cap of the ' + DATA.live_total + ' that already trade (exchanges aside); they are also the comparables the model\u2019s multiples are fitted from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d change' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function productsTable() {
    var list = DATA.products.filter(matchesQ);
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', null, el('span', { class: 'pill product', text: r.reason }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Set aside by the launch screen: these protocols record no token of their own, but each is a wrapped, staked, bridged or versioned product of a token that already trades, or an exchange\u2019s own product — so it is no launch candidate and is never ranked. Shown with its TVL and the exact reason, so the screen itself can be audited.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d change' }), el('th', { scope: 'col', text: 'Why it is not a launch' }))),
          tbody
        )
      )
    );
  }

  function modelView() {
    var cal = DATA.calibration;
    var b = cal.beta;
    var bt = cal.backtest;
    var coefBody = el('tbody');
    [
      ['Intercept', b.intercept, 'the fitted level, before the size term pulls it down'],
      ['log10(TVL)', b.log_tvl, 'each tenfold of TVL cuts the multiple by about half a dex \u2014 big protocols trade at a smaller multiple of their TVL'],
      ['7-day growth', b.growth, 'fitted on a falling week: protocols that had just run up held no premium on this snapshot'],
      ['Maturity', b.maturity, 'a fully mature protocol (four years) prices about a quarter dex under a new one, other things equal'],
      ['Chains', b.chains, 'each chain, up to 20, adds a little \u2014 presence across chains is worth something, not much']
    ].forEach(function (row) {
      coefBody.appendChild(el('tr', null,
        el('td', null, el('b', { text: row[0] })),
        el('td', { class: 'num', text: fmtDex(row[1]) }),
        el('td', { text: row[2] })
      ));
    });
    var foldBody = el('tbody');
    bt.folds.forEach(function (f) {
      foldBody.appendChild(el('tr', null,
        el('td', { class: 'num', text: String(f.fold) }),
        el('td', { class: 'num', text: String(f.comps) }),
        el('td', { class: 'num', text: f.median_ape_pct.toFixed(1) + '%' })
      ));
    });
    var tbody = el('tbody');
    cal.categories.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category || 'Uncategorised' })),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: c.median === null ? 'n/a' : String(c.median) }),
        el('td', { class: 'num', text: String(c.component) }),
        el('td', { class: 'num', text: c.fitted ? fmtDex(c.effect_dex) : 'not fitted' }),
        el('td', { class: 'num', text: c.weight.toFixed(2) }),
        el('td', null, c.fitted
          ? el('span', { class: 'pill', text: 'fitted from its peers' })
          : el('span', { class: 'pill early', text: 'thin \u2014 regression carries it' }))
      ));
    });
    return el('div', { class: 'stack' },
      el('div', { class: 'panel pad' },
        el('h2', { text: 'The fit \u2014 every coefficient from the snapshot\u2019s own market' }),
        el('p', { text: 'A comparable is a protocol in the snapshot that already records a token, with a positive market cap and TVL; there are ' + cal.global_comps + ' of them, and everything on this page is fitted from those alone. First the anchor: a log-log curve of market cap on TVL over the comparables, log10(mcap) = ' + cal.curve.intercept.toFixed(4) + ' + ' + cal.curve.slope.toFixed(4) + ' \u00d7 log10(TVL), R2 = ' + cal.curve.r2.toFixed(4) + ' \u2014 market cap rises with TVL at about half the rate. Then the ratio regression the board actually prices with: log10(mcap/TVL) on size, the seven-day change clamped to [\u221260%, +120%] and read as a fraction, maturity as min(age, 1460 days) / 1460, and chain count capped at 20.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'The fitted coefficients. A row\u2019s regression multiple is 10 raised to the intercept plus each coefficient times the row\u2019s own feature, plus its category effect; each of the growth, maturity and chain terms is then capped at \u00b10.5 dex.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Term' }), el('th', { scope: 'col', text: 'Coefficient' }), el('th', { scope: 'col', text: 'What it reads' }))),
            coefBody
          )
        ),
        el('p', { class: 'sub', text: 'Global median mcap/TVL over the comparables: ' + cal.global_median + '. An unrecorded age counts as the comparables\u2019 median age, ' + cal.median_age_days + ' days. Category effects are winsorised mean residuals, shrunk by n/(n+5) and clamped to \u00b10.5 dex, fitted only at three or more peers. A factor cap binds on ' + cal.capped_rows + ' of the ' + DATA.board_size + ' board rows; a capped row says so in its detail view.' })
      ),
      el('div', { class: 'panel pad' },
        el('h2', { text: 'The backtest \u2014 the model graded against the market' }),
        el('p', { text: 'Five folds, assigned by a hash of each comparable\u2019s slug. Each fold refits everything \u2014 curve, regression, effects, medians, age imputation \u2014 on the other four folds and predicts the held-out protocols\u2019 actual market caps. Median absolute error ' + bt.median_ape_pct.toFixed(1) + '%; ' + bt.within_2x + ' of ' + bt.comps + ' predictions (' + bt.within_2x_pct.toFixed(1) + '%) land within 2\u00d7 of the actual market cap. The same backtest on the previous model, radar-3\u2019s category median alone: ' + bt.previous_median_ape_pct.toFixed(1) + '% median error, ' + bt.previous_within_2x_pct.toFixed(1) + '% within 2\u00d7. Pricing a token from TVL alone is genuinely this noisy \u2014 the board is a ranking instrument, and that is why every component of every price is printed.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Fold' }), el('th', { scope: 'col', text: 'Held out' }), el('th', { scope: 'col', text: 'Median error' }))),
            foldBody
          )
        )
      ),
      el('div', { class: 'panel pad' },
        el('h2', { text: 'Calibration \u2014 every category\u2019s component, effect and blend weight' }),
        el('p', { class: 'sub', text: 'The component is the category\u2019s median mcap/TVL shrunk toward the global median, (n \u00d7 median + 3 \u00d7 ' + cal.global_median + ') / (n + 3). The weight is what the board\u2019s blend gives that component, n / (n + 4); the rest of the weight sits on the regression. Below three peers no effect is fitted and the weight is small by construction, so a thin category is priced mostly off its own rows\u2019 TVL through the fitted curve \u2014 never off one flat number, and never off one wild peer. The same tables, with the screen rules and worked examples, are written out in METHOD.md beside this page.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Traded peers' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Component' }), el('th', { scope: 'col', text: 'Effect' }), el('th', { scope: 'col', text: 'Weight' }), el('th', { scope: 'col', text: 'Basis' }))),
            tbody
          )
        )
      ),
      el('div', { class: 'panel pad' },
        el('h2', { text: 'How the board is built' }),
        el('p', { text: 'Coverage first: every one of the ' + DATA.watchlist_size + ' watchlist protocols is on the board. The launch screen then admits every other pre-token protocol that is not a product of a trading token \u2014 not a bridge, staking or exchange product category, not a versioned pool of another protocol, not a wrapped or staked product by name, not an exchange\u2019s own product. That admits ' + DATA.early_size + ' early finds and sets ' + DATA.product_size + ' products aside; the Products view lists every one of them with the reason. There is no honest row beyond the ' + DATA.board_size + ' on the board: every other pre-token protocol in the snapshot is one of those products \u2014 a wrapped bitcoin or a bridged stablecoin is no launch, however large its TVL. Rows are tiered by TVL (Prime at the snapshot\u2019s floor, Standard from $10M, Speculative below), carry risk flags read from their own record, and each has a seven-step farm plan generated from that record: its chains decide the bridge step and name it, its seven-day change decides the cadence step, its category\u2019s peer count decides the verification step, its TVL the capital, its age the hold and whether the plan starts with a test deposit.' })
      )
    );
  }

  function moverRows(list) {
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0', onclick: function () { state.tab = 'board'; openDetail(r.slug); } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') }), el('span', { class: 'tierline' }, tierPill(r)), chips(r))),
        el('td', { class: 'num ' + (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) })
      ));
    });
    return tbody;
  }
  function moversView() {
    var withChange = DATA.rows.filter(function (r) { return r.change_7d !== null; });
    var growers = withChange.slice().sort(function (a, b) { return b.change_7d - a.change_7d || b.implied_value_usd - a.implied_value_usd; }).slice(0, 10);
    var fallers = withChange.slice().sort(function (a, b) { return a.change_7d - b.change_7d || b.implied_value_usd - a.implied_value_usd; }).slice(0, 10);
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { rows: 0, total: 0, top: null };
      byCat[c].rows++;
      byCat[c].total += r.implied_value_usd;
      if (!byCat[c].top || r.implied_value_usd > byCat[c].top.implied_value_usd) byCat[c].top = r;
    });
    var catList = Object.keys(byCat).map(function (c) { return { category: c, rows: byCat[c].rows, total: byCat[c].total, top: byCat[c].top }; })
      .sort(function (a, b) { return b.total - a.total; });
    var catBody = el('tbody');
    catList.forEach(function (c) {
      catBody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.rows) }),
        el('td', { class: 'num', text: fmtUsd(c.total) }),
        el('td', { text: c.top.name + ' (' + fmtUsd(c.top.implied_value_usd) + ')' })
      ));
    });
    var flagged = DATA.rows.filter(function (r) { return r.risk_flags.length >= 2; })
      .sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).slice(0, 8);
    var flagBody = el('tbody');
    flagged.forEach(function (r) {
      flagBody.appendChild(el('tr', { tabindex: '0', onclick: function () { state.tab = 'board'; openDetail(r.slug); } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') }), el('span', { class: 'tierline' }, tierPill(r)), chips(r))),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) })
      ));
    });
    function miniTable(caption, head, body) {
      return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
        el('caption', { text: caption }),
        el('thead', null, el('tr', null, head.map(function (h) { return el('th', { scope: 'col', text: h }); }))),
        body
      )));
    }
    return el('div', { class: 'stack' },
      el('div', { class: 'cols' },
        miniTable('Fastest-growing board protocols, seven days', ['Rank', 'Protocol', '7d change', 'Implied'], moverRows(growers)),
        miniTable('Fastest-falling board protocols, seven days', ['Rank', 'Protocol', '7d change', 'Implied'], moverRows(fallers))
      ),
      miniTable('Implied launch value by category, whole board', ['Category', 'Rows', 'Total implied', 'Largest row'], catBody),
      miniTable('Largest rows carrying two or more risk flags', ['Rank', 'Protocol', 'Implied'], flagBody)
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Implied value is this radar\u2019s own model claim, computed only from the sealed snapshot of ' + DATA.as_of + '; its multiples are fitted from that snapshot\u2019s traded protocols, and it is not a price prediction and not a promise that any protocol issues a token.' }),
      el('p', { text: 'Farm plans are starting points written from each protocol\u2019s category, chains, TVL and age. Check the protocol\u2019s own pages before committing funds, and never pay a fee to claim a reward.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function splitStep(s) {
    var at = s.indexOf(' Cost: ');
    if (at < 0) return { action: s, meta: '' };
    return { action: s.slice(0, at), meta: s.slice(at + 1) };
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 watchlist' : ' \u00b7 early find') + ' \u00b7 ' + row.tier + ' tier' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' \u00b7 first tracked ' + (row.listed_at || 'on an unrecorded date') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var m = row.model;
    var cal = DATA.calibration;
    var w = m.blend_weight;
    var lt = Math.log10(Math.max(1, row.tvl_usd));
    var gClamped = Math.min(120, Math.max(-60, row.change_7d === null ? 0 : row.change_7d));
    var ageUsed = row.age_days === null ? cal.median_age_days : row.age_days;
    var matFrac = Math.min(ageUsed, 1460) / 1460;
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Blended multiple \u2014 weight ' + Math.round(w * 100) + '% component, ' + Math.round((1 - w) * 100) + '% regression' }), el('b', { class: 'num', text: fmtMult(m.multiple) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Category component (' + (row.category || 'Other') + ', ' + m.category_comps + ' traded peer' + (m.category_comps === 1 ? '' : 's') + ', shrunk median)' }), el('b', { class: 'num', text: fmtMult(m.category_multiple) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Regression multiple (anatomy below)' }), el('b', { class: 'num', text: fmtMult(m.regression_multiple) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Intercept' }), el('b', { class: 'num', text: fmtDex(cal.beta.intercept) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Size term (' + cal.beta.log_tvl.toFixed(4) + ' \u00d7 log10 TVL ' + lt.toFixed(4) + ')' }), el('b', { class: 'num', text: fmtDex(m.size_term_dex) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Growth term (' + cal.beta.growth.toFixed(4) + ' \u00d7 7d ' + (gClamped >= 0 ? '+' : '') + gClamped.toFixed(2) + '%, clamped)' }), el('b', { class: 'num', text: fmtDex(m.growth_term_dex) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Maturity term (' + cal.beta.maturity.toFixed(4) + ' \u00d7 ' + matFrac.toFixed(4) + (row.age_days === null ? ', age unrecorded \u2014 median used' : ', age ' + fmtAge(row.age_days)) + ')' }), el('b', { class: 'num', text: fmtDex(m.maturity_term_dex) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Chain term (' + (cal.beta.chains >= 0 ? '+' : '') + cal.beta.chains.toFixed(4) + ' \u00d7 ' + Math.min(row.chains ? row.chains.length : 0, 20) + ' chains)' }), el('b', { class: 'num', text: fmtDex(m.chain_term_dex) })),
        el('div', { class: 'subrow' }, el('span', { text: 'Category effect (' + (m.category_comps >= 3 ? 'fitted for ' + (row.category || 'Other') : 'not fitted under 3 traded peers') + ')' }), el('b', { class: 'num', text: fmtDex(m.category_effect_dex) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied launch value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      m.factor_capped ? el('p', { class: 'sub', text: 'One of this row\u2019s factor terms sits at the \u00b10.5 dex cap, so no single fitted factor moves its price further.' }) : null,
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ' prices every protocol with this same arithmetic, and every number above is printed so the price reproduces by hand: the regression multiple is 10 raised to the intercept plus the four terms plus the effect, the blended multiple is the peer-weighted geometric blend of the two components, and the implied value is TVL times the blend. It is an estimate of what a launch could be worth if the protocol\u2019s record stayed as the snapshot shows it, not a forecast.' })
    ));
    if (row.risk_flags && row.risk_flags.length > 0) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Risk flags on this row' }),
        el('ul', { class: 'flags' }, row.risk_flags.map(function (f) {
          return el('li', null, el('span', { class: 'chip', text: FLAG_LABEL[f] || f }), ' ', FLAG_NOTE[f] || '');
        }))
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var parts = splitStep(s);
        return el('li', null, el('b', { text: parts.action }), parts.meta ? el('span', { class: 'meta', text: parts.meta }) : null);
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function view() {
    if (state.tab === 'live') return liveTable();
    if (state.tab === 'products') return productsTable();
    if (state.tab === 'model') return modelView();
    if (state.tab === 'movers') return moversView();
    return boardTable();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(modelStrip());
    shell.appendChild(controls());
    shell.appendChild(view());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
