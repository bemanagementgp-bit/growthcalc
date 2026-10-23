/* ===== GrowthCalc – Compound Interest Calculator (vanilla JS, no deps) ===== */
(function () {
  'use strict';

  const C = window.APP_CONFIG || {};
  const LS_INPUTS = 'gc_inputs_v1';
  const LS_SCENARIOS = 'gc_scenarios_v1';
  const LS_VIEW = 'gc_table_view';
  const MAX_SCENARIOS = 3;
  const FREQ = { daily: 365, monthly: 12, quarterly: 4, annually: 1 };
  const FREQ_LABEL = { daily: 'daily', monthly: 'monthly', quarterly: 'quarterly', annually: 'annually' };
  const SCENARIO_COLORS = ['#f59e0b', '#a78bfa', '#f472b6'];
  const DEFAULTS = {
    initial: 10000, monthly: 500, timing: 'end', rate: 7, freq: 'monthly',
    years: 20, increase: 0, currency: 'USD', inflOn: false, inflation: 3
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    initial: $('initial'), monthly: $('monthly'), timing: $('timing'), rate: $('rate'), freq: $('freq'),
    years: $('years'), yearsRange: $('yearsRange'), increase: $('increase'), currency: $('currency'),
    inflToggle: $('inflToggle'), inflation: $('inflation'), inflationField: $('inflationField'),
    resFinal: $('resFinal'), resToday: $('resToday'), resSub: $('resSub'),
    statContrib: $('statContrib'), statInterest: $('statInterest'), statInterestPct: $('statInterestPct'),
    statInflation: $('statInflation'), statInflationWrap: $('statInflationWrap'),
    statRule72: $('statRule72'), statExact: $('statExact'),
    chart: $('chart'), chartWrap: $('chartWrap'), chartTip: $('chartTip'), chartLegend: $('chartLegend'),
    tableHead: $('tableHead'), tableBody: $('tableBody'), tableTitle: $('tableTitle'),
    viewYearly: $('viewYearly'), viewMonthly: $('viewMonthly'),
    btnCopy: $('btnCopy'), btnShare: $('btnShare'), btnReset: $('btnReset'),
    btnCsv: $('btnCsv'), btnPrint: $('btnPrint'),
    scenarioName: $('scenarioName'), btnSaveScenario: $('btnSaveScenario'),
    scenarioList: $('scenarioList'), compareWrap: $('compareWrap'), compareBody: $('compareBody'),
    goalTarget: $('goalTarget'), goalYears: $('goalYears'), btnGoal: $('btnGoal'), goalResult: $('goalResult'),
    reportMeta: $('reportMeta'), reportDate: $('reportDate'),
    partnersSection: $('partnersSection'), partnersGrid: $('partnersGrid'),
    proPrice: $('proPrice')
  };

  let state = Object.assign({}, DEFAULTS);
  let scenarios = loadScenarios();
  let tableView = localStorage.getItem(LS_VIEW) === 'monthly' ? 'monthly' : 'yearly';
  let lastResult = null;
  let lastScenarioResults = [];
  let chartGeom = null;

  /* ---------------- helpers ---------------- */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function num(el, lo, hi, fallback) {
    const v = parseFloat(String(el.value).replace(/,/g, ''));
    if (!isFinite(v)) return fallback;
    return clamp(v, lo, hi);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const fmtCache = {};
  function fmt(v, cur, decimals) {
    cur = cur || state.currency;
    const d = decimals == null ? 0 : decimals;
    const key = cur + ':' + d;
    if (!fmtCache[key]) {
      try {
        fmtCache[key] = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d });
      } catch (e) {
        fmtCache[key] = { format: (x) => cur + ' ' + x.toFixed(d) };
      }
    }
    return fmtCache[key].format(v);
  }
  function fmtCompact(v, cur) {
    cur = cur || state.currency;
    const key = cur + ':compact';
    if (!fmtCache[key]) {
      try {
        fmtCache[key] = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 });
      } catch (e) {
        fmtCache[key] = { format: (x) => Math.round(x).toString() };
      }
    }
    return fmtCache[key].format(v);
  }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function yrs(v) { return isFinite(v) && v > 0 ? v.toFixed(1) + ' yrs' : '—'; }

  /* ---------------- core math ----------------
     Periods per year n = 365 / 12 / 4 / 1. Contributions are always monthly, so we simulate
     month by month with the effective monthly rate  rm = (1 + r/n)^(n/12) - 1,
     which reproduces exactly A = P(1 + r/n)^(nt) for the lump sum part.                 */
  function simulate(inp) {
    const n = FREQ[inp.freq] || 12;
    const r = (inp.rate || 0) / 100;
    const rm = Math.pow(1 + r / n, n / 12) - 1;
    const years = clamp(Math.round(inp.years) || 1, 1, 50);
    const months = years * 12;
    const inc = (inp.increase || 0) / 100;
    let bal = inp.initial || 0;
    let cumContrib = bal, cumInterest = 0;
    const monthly = [], yearly = [];
    let yStart = bal, yContrib = 0, yInterest = 0;
    for (let m = 1; m <= months; m++) {
      const yIdx = Math.floor((m - 1) / 12);
      const contrib = (inp.monthly || 0) * Math.pow(1 + inc, yIdx);
      const start = bal;
      let interest;
      if (inp.timing === 'start') { bal += contrib; interest = bal * rm; bal += interest; }
      else { interest = bal * rm; bal += interest; bal += contrib; }
      cumContrib += contrib; cumInterest += interest;
      yContrib += contrib; yInterest += interest;
      monthly.push({ m, year: yIdx + 1, mo: ((m - 1) % 12) + 1, start, contrib, interest, end: bal });
      if (m % 12 === 0) {
        yearly.push({ year: yIdx + 1, start: yStart, contrib: yContrib, interest: yInterest, end: bal, principal: cumContrib, cumInterest });
        yStart = bal; yContrib = 0; yInterest = 0;
      }
    }
    const effAnnual = Math.pow(1 + r / n, n) - 1;
    return { final: bal, totalContrib: cumContrib, totalInterest: cumInterest, yearly, monthly, effAnnual, rm, n, years };
  }

  function solveGoal(target, years, base) {
    const f = (m) => simulate(Object.assign({}, base, { years, monthly: m })).final;
    if (f(0) >= target) return 0;
    let lo = 0, hi = Math.max(10, target / (years * 12));
    let guard = 0;
    while (f(hi) < target && guard++ < 60) hi *= 2;
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < target) lo = mid; else hi = mid;
    }
    return hi;
  }

  /* ---------------- state / persistence ---------------- */
  function readInputs() {
    return {
      initial: num(els.initial, 0, 1e12, 0),
      monthly: num(els.monthly, 0, 1e9, 0),
      timing: els.timing.value === 'start' ? 'start' : 'end',
      rate: num(els.rate, 0, 100, 0),
      freq: FREQ[els.freq.value] ? els.freq.value : 'monthly',
      years: clamp(parseInt(els.years.value, 10) || 1, 1, 50),
      increase: num(els.increase, 0, 50, 0),
      currency: els.currency.value || 'USD',
      inflOn: !!els.inflToggle.checked,
      inflation: num(els.inflation, 0, 50, 0)
    };
  }
  function writeInputs(s) {
    els.initial.value = s.initial; els.monthly.value = s.monthly; els.timing.value = s.timing;
    els.rate.value = s.rate; els.freq.value = s.freq; els.years.value = s.years; els.yearsRange.value = s.years;
    els.increase.value = s.increase; els.currency.value = s.currency;
    els.inflToggle.checked = !!s.inflOn; els.inflation.value = s.inflation;
    els.inflationField.classList.toggle('hidden', !s.inflOn);
  }
  function sanitize(obj) {
    const s = Object.assign({}, DEFAULTS, obj || {});
    s.initial = clamp(+s.initial || 0, 0, 1e12);
    s.monthly = clamp(+s.monthly || 0, 0, 1e9);
    s.timing = s.timing === 'start' ? 'start' : 'end';
    s.rate = clamp(+s.rate || 0, 0, 100);
    s.freq = FREQ[s.freq] ? s.freq : 'monthly';
    s.years = clamp(parseInt(s.years, 10) || 1, 1, 50);
    s.increase = clamp(+s.increase || 0, 0, 50);
    s.currency = /^[A-Z]{3}$/.test(String(s.currency)) ? s.currency : 'USD';
    s.inflOn = s.inflOn === true || s.inflOn === '1' || s.inflOn === 'true';
    s.inflation = clamp(+s.inflation || 0, 0, 50);
    return s;
  }
  function persist() { try { localStorage.setItem(LS_INPUTS, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function loadPersisted() {
    try { const raw = localStorage.getItem(LS_INPUTS); return raw ? sanitize(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  function loadScenarios() {
    try {
      const raw = localStorage.getItem(LS_SCENARIOS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, MAX_SCENARIOS).map((s) => ({ name: String(s.name || 'Scenario').slice(0, 40), inputs: sanitize(s.inputs) })) : [];
    } catch (e) { return []; }
  }
  function saveScenarios() { try { localStorage.setItem(LS_SCENARIOS, JSON.stringify(scenarios)); } catch (e) { /* ignore */ } }

  const PARAM_KEYS = { p: 'initial', m: 'monthly', t: 'timing', r: 'rate', f: 'freq', y: 'years', g: 'increase', c: 'currency', i: 'inflOn', ir: 'inflation' };
  function fromQuery() {
    const q = new URLSearchParams(location.search);
    if (!q.has('p') && !q.has('m') && !q.has('r') && !q.has('y')) return null;
    const o = {};
    Object.keys(PARAM_KEYS).forEach((k) => { if (q.has(k)) o[PARAM_KEYS[k]] = q.get(k); });
    return sanitize(Object.assign({}, DEFAULTS, o));
  }
  function buildShareUrl() {
    const q = new URLSearchParams();
    q.set('p', state.initial); q.set('m', state.monthly); q.set('t', state.timing); q.set('r', state.rate);
    q.set('f', state.freq); q.set('y', state.years); q.set('g', state.increase); q.set('c', state.currency);
    q.set('i', state.inflOn ? 1 : 0); q.set('ir', state.inflation);
    return location.origin + location.pathname + '?' + q.toString();
  }

  /* ---------------- rendering ---------------- */
  function update() {
    state = readInputs();
    els.inflationField.classList.toggle('hidden', !state.inflOn);
    persist();
    lastResult = simulate(state);
    lastScenarioResults = scenarios.map((s) => ({ name: s.name, inputs: s.inputs, res: simulate(s.inputs) }));
    renderResults(lastResult);
    renderChart(lastResult, lastScenarioResults);
    renderTable(lastResult);
    renderScenarios();
    renderGoal(false);
  }

  function renderResults(res) {
    const s = state;
    els.resFinal.textContent = fmt(res.final);
    const inflAdj = res.final / Math.pow(1 + s.inflation / 100, s.years);
    if (s.inflOn) {
      els.resToday.textContent = '≈ ' + fmt(inflAdj) + ' in today’s money (after ' + s.inflation + '% inflation)';
      els.resToday.classList.remove('hidden');
      els.statInflationWrap.classList.remove('hidden');
      els.statInflation.textContent = fmt(inflAdj);
    } else {
      els.resToday.classList.add('hidden');
      els.statInflationWrap.classList.add('hidden');
    }
    els.resSub.textContent = 'after ' + s.years + ' year' + (s.years === 1 ? '' : 's') + ' at ' + s.rate + '% compounded ' + FREQ_LABEL[s.freq];
    els.statContrib.textContent = fmt(res.totalContrib);
    els.statInterest.textContent = fmt(res.totalInterest);
    els.statInterestPct.textContent = res.final > 0 ? pct(res.totalInterest / res.final) : '0%';
    els.statRule72.textContent = s.rate > 0 ? yrs(72 / s.rate) : '—';
    els.statExact.textContent = res.effAnnual > 0 ? yrs(Math.LN2 / Math.log(1 + res.effAnnual)) : '—';
    // print header
    els.reportMeta.textContent = 'Initial ' + fmt(s.initial) + ' · ' + fmt(s.monthly) + '/month (' + s.timing + ' of month' +
      (s.increase ? ', +' + s.increase + '%/yr' : '') + ') · ' + s.rate + '% compounded ' + FREQ_LABEL[s.freq] + ' · ' + s.years + ' years' +
      (s.inflOn ? ' · inflation ' + s.inflation + '%' : '');
    els.reportDate.textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / mag;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  function renderChart(res, scen) {
    const W = 720, H = 320, padL = 70, padR = 16, padT = 18, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const totalYears = Math.max(res.years, ...scen.map((s) => s.res.years));
    let maxV = res.final;
    scen.forEach((s) => { maxV = Math.max(maxV, s.res.final); });
    const yMax = niceMax(maxV * 1.05);
    const slot = plotW / totalYears;
    const barW = Math.max(2, slot * (totalYears > 30 ? 0.72 : 0.62));
    const x = (yearIdx) => padL + yearIdx * slot + (slot - barW) / 2;   // yearIdx 0-based
    const xc = (yearIdx) => padL + yearIdx * slot + slot / 2;
    const y = (v) => padT + plotH - (v / yMax) * plotH;

    let svg = '';
    // grid + y labels
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = (yMax / ticks) * i;
      const yy = y(v);
      svg += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>';
      svg += '<text class="axis" x="' + (padL - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + esc(fmtCompact(v)) + '</text>';
    }
    // x labels
    const every = totalYears <= 12 ? 1 : totalYears <= 25 ? 2 : totalYears <= 40 ? 5 : 10;
    for (let i = 0; i < totalYears; i++) {
      const yr = i + 1;
      if (yr === 1 || yr % every === 0 || yr === totalYears) {
        svg += '<text class="axis" x="' + xc(i).toFixed(1) + '" y="' + (H - padB + 18) + '" text-anchor="middle">' + yr + '</text>';
      }
    }
    svg += '<text class="axis-title" x="' + (padL + plotW / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">Year</text>';
    // bars
    svg += '<g id="bars">';
    res.yearly.forEach((row, i) => {
      const yP = y(row.principal), yT = y(row.end);
      const hP = Math.max(0, padT + plotH - yP), hI = Math.max(0, yP - yT);
      svg += '<g class="bar" data-i="' + i + '">';
      svg += '<title>Year ' + row.year + ': ' + esc(fmt(row.end)) + ' (' + esc(fmt(row.principal)) + ' contributed, ' + esc(fmt(row.cumInterest)) + ' interest)</title>';
      svg += '<rect class="bar-p" x="' + x(i).toFixed(1) + '" y="' + yP.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hP.toFixed(1) + '"/>';
      svg += '<rect class="bar-i" x="' + x(i).toFixed(1) + '" y="' + yT.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hI.toFixed(1) + '"/>';
      svg += '</g>';
    });
    svg += '</g>';
    // scenario overlay lines
    scen.forEach((s, k) => {
      const pts = s.res.yearly.map((row, i) => xc(i).toFixed(1) + ',' + y(row.end).toFixed(1)).join(' ');
      svg += '<polyline class="scen-line" points="' + pts + '" stroke="' + SCENARIO_COLORS[k % SCENARIO_COLORS.length] + '"><title>' + esc(s.name) + '</title></polyline>';
    });
    // hover cursor line
    svg += '<line id="cursor" class="cursor hidden" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + plotH) + '"/>';
    svg += '<rect id="hoverZone" x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="transparent"/>';
    els.chart.innerHTML = svg;
    chartGeom = { W, H, padL, padT, plotW, plotH, slot, totalYears };

    // legend
    let legend = '<span class="lg"><i style="background:var(--accent2)"></i>Contributions</span><span class="lg"><i style="background:var(--accent)"></i>Interest</span>';
    scen.forEach((s, k) => {
      legend += '<span class="lg"><i class="line" style="background:' + SCENARIO_COLORS[k % SCENARIO_COLORS.length] + '"></i>' + esc(s.name) + '</span>';
    });
    els.chartLegend.innerHTML = legend;
  }

  function chartPointer(e) {
    if (!chartGeom || !lastResult) return;
    const rect = els.chart.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (chartGeom.W / rect.width);
    const idx = Math.floor((sx - chartGeom.padL) / chartGeom.slot);
    if (idx < 0 || idx >= chartGeom.totalYears) { hideTip(); return; }
    const row = lastResult.yearly[idx];
    let html = '<strong>Year ' + (idx + 1) + '</strong>';
    if (row) {
      html += '<div><span>Balance</span><b>' + esc(fmt(row.end)) + '</b></div>';
      html += '<div><span>Contributed</span><b>' + esc(fmt(row.principal)) + '</b></div>';
      html += '<div><span>Interest</span><b>' + esc(fmt(row.cumInterest)) + '</b></div>';
    }
    lastScenarioResults.forEach((s, k) => {
      const r = s.res.yearly[idx];
      if (r) html += '<div><span style="color:' + SCENARIO_COLORS[k % SCENARIO_COLORS.length] + '">' + esc(s.name) + '</span><b>' + esc(fmt(r.end, s.inputs.currency)) + '</b></div>';
    });
    els.chartTip.innerHTML = html;
    els.chartTip.classList.remove('hidden');
    const wrapRect = els.chartWrap.getBoundingClientRect();
    const tipW = els.chartTip.offsetWidth;
    let left = e.clientX - wrapRect.left + 14;
    if (left + tipW > wrapRect.width - 4) left = e.clientX - wrapRect.left - tipW - 14;
    els.chartTip.style.left = Math.max(0, left) + 'px';
    els.chartTip.style.top = Math.max(0, e.clientY - wrapRect.top - 10) + 'px';
    const cx = chartGeom.padL + idx * chartGeom.slot + chartGeom.slot / 2;
    const cursor = els.chart.querySelector('#cursor');
    if (cursor) { cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.classList.remove('hidden'); }
    els.chart.querySelectorAll('.bar').forEach((g) => g.classList.toggle('active', +g.dataset.i === idx));
  }
  function hideTip() {
    els.chartTip.classList.add('hidden');
    const cursor = els.chart.querySelector('#cursor');
    if (cursor) cursor.classList.add('hidden');
    els.chart.querySelectorAll('.bar.active').forEach((g) => g.classList.remove('active'));
  }

  function renderTable(res) {
    const s = state;
    let head = '', body = '';
    if (tableView === 'yearly') {
      els.tableTitle.textContent = 'Yearly breakdown';
      head = '<tr><th>Year</th><th class="num">Starting balance</th><th class="num">Contributions</th><th class="num">Interest</th><th class="num">Ending balance</th>' +
        (s.inflOn ? '<th class="num">In today’s money</th>' : '') + '</tr>';
      const rows = [];
      res.yearly.forEach((r) => {
        rows.push('<tr><td>' + r.year + '</td><td class="num">' + fmt(r.start) + '</td><td class="num">' + fmt(r.contrib) + '</td><td class="num">' + fmt(r.interest) + '</td><td class="num"><b>' + fmt(r.end) + '</b></td>' +
          (s.inflOn ? '<td class="num">' + fmt(r.end / Math.pow(1 + s.inflation / 100, r.year)) + '</td>' : '') + '</tr>');
      });
      body = rows.join('');
    } else {
      els.tableTitle.textContent = 'Monthly breakdown';
      head = '<tr><th>Period</th><th class="num">Starting balance</th><th class="num">Contribution</th><th class="num">Interest</th><th class="num">Ending balance</th></tr>';
      const rows = [];
      res.monthly.forEach((r) => {
        rows.push('<tr><td>Y' + r.year + ' · M' + String(r.mo).padStart(2, '0') + '</td><td class="num">' + fmt(r.start, null, 2) + '</td><td class="num">' + fmt(r.contrib, null, 2) + '</td><td class="num">' + fmt(r.interest, null, 2) + '</td><td class="num"><b>' + fmt(r.end, null, 2) + '</b></td></tr>');
      });
      body = rows.join('');
    }
    els.tableHead.innerHTML = head;
    els.tableBody.innerHTML = body;
    els.viewYearly.classList.toggle('active', tableView === 'yearly');
    els.viewMonthly.classList.toggle('active', tableView === 'monthly');
    els.viewYearly.setAttribute('aria-pressed', tableView === 'yearly');
    els.viewMonthly.setAttribute('aria-pressed', tableView === 'monthly');
  }

  function renderScenarios() {
    // chips
    if (!scenarios.length) {
      els.scenarioList.innerHTML = '<span class="hint">No saved scenarios yet. Save the current inputs to compare them against other plans.</span>';
    } else {
      els.scenarioList.innerHTML = scenarios.map((s, k) =>
        '<span class="chip" style="--c:' + SCENARIO_COLORS[k % SCENARIO_COLORS.length] + '"><i></i>' + esc(s.name) +
        ' <button type="button" class="chip-btn" data-load="' + k + '" title="Load this scenario" aria-label="Load ' + esc(s.name) + '">↺</button>' +
        '<button type="button" class="chip-btn" data-del="' + k + '" title="Remove" aria-label="Remove ' + esc(s.name) + '">✕</button></span>'
      ).join('');
    }
    // compare table
    if (!lastScenarioResults.length) { els.compareWrap.classList.add('hidden'); return; }
    els.compareWrap.classList.remove('hidden');
    const rows = [];
    const cur = lastResult;
    rows.push(rowHtml('Current', state, cur, null));
    lastScenarioResults.forEach((s, k) => rows.push(rowHtml(s.name, s.inputs, s.res, SCENARIO_COLORS[k % SCENARIO_COLORS.length])));
    els.compareBody.innerHTML = rows.join('');
    function rowHtml(name, inp, res, color) {
      const diff = cur && res !== cur ? res.final - cur.final : 0;
      const diffHtml = res === cur ? '<span class="hint">baseline</span>' : '<span class="' + (diff >= 0 ? 'pos' : 'neg') + '">' + (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff), inp.currency) + '</span>';
      return '<tr><td>' + (color ? '<i class="dot" style="background:' + color + '"></i>' : '<i class="dot dot-cur"></i>') + esc(name) + '</td>' +
        '<td class="num">' + fmt(inp.initial, inp.currency) + '</td><td class="num">' + fmt(inp.monthly, inp.currency) + '</td>' +
        '<td class="num">' + inp.rate + '%</td><td class="num">' + inp.years + '</td>' +
        '<td class="num">' + fmt(res.totalContrib, inp.currency) + '</td><td class="num">' + fmt(res.totalInterest, inp.currency) + '</td>' +
        '<td class="num"><b>' + fmt(res.final, inp.currency) + '</b></td><td class="num">' + diffHtml + '</td></tr>';
    }
  }

  function renderGoal(fromClick) {
    const pro = isPro();
    if (!pro) {
      if (!fromClick) els.goalResult.innerHTML = '<span class="hint">Unlock Pro to solve for the monthly contribution you need.</span>';
      return;
    }
    const target = num(els.goalTarget, 0, 1e13, 0);
    const years = clamp(parseInt(els.goalYears.value, 10) || state.years, 1, 50);
    if (!(target > 0)) { els.goalResult.innerHTML = '<span class="hint">Enter a target amount.</span>'; return; }
    const need = solveGoal(target, years, state);
    const check = simulate(Object.assign({}, state, { years, monthly: need }));
    if (need === 0) {
      els.goalResult.innerHTML = '<strong>No monthly contribution needed.</strong> Your initial ' + esc(fmt(state.initial)) + ' alone grows to ' + esc(fmt(check.final)) + ' in ' + years + ' years at ' + state.rate + '%.';
    } else {
      els.goalResult.innerHTML = 'To reach <b>' + esc(fmt(target)) + '</b> in <b>' + years + ' years</b> you need about <span class="goal-big">' + esc(fmt(need, null, 2)) + '</span> per month' +
        (state.increase ? ' (growing ' + state.increase + '% per year)' : '') + '. You would contribute ' + esc(fmt(check.totalContrib)) + ' in total and earn ' + esc(fmt(check.totalInterest)) + ' in interest.';
    }
    if (fromClick) track('goal_solve', { years });
  }

  function refreshProUI() {
    const pro = isPro();
    document.querySelectorAll('[data-pro-lock]').forEach((el) => el.classList.toggle('hidden', pro));
    document.querySelectorAll('.pro-only-note').forEach((el) => el.classList.toggle('hidden', pro));
    renderGoal(false);
  }

  /* ---------------- actions ---------------- */
  function copyText(text, okMsg) {
    const done = () => { toast(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed – select and copy manually'); }
    document.body.removeChild(ta);
  }

  function summaryText() {
    const s = state, r = lastResult;
    const lines = [
      (C.APP_NAME || 'GrowthCalc') + ' – Compound interest summary',
      'Initial investment: ' + fmt(s.initial),
      'Monthly contribution: ' + fmt(s.monthly) + ' (' + s.timing + ' of month' + (s.increase ? ', +' + s.increase + '%/yr' : '') + ')',
      'Rate: ' + s.rate + '% compounded ' + FREQ_LABEL[s.freq] + ' for ' + s.years + ' years',
      '',
      'Final balance: ' + fmt(r.final),
      'Total contributions: ' + fmt(r.totalContrib),
      'Total interest: ' + fmt(r.totalInterest) + ' (' + (r.final > 0 ? pct(r.totalInterest / r.final) : '0%') + ' of balance)'
    ];
    if (s.inflOn) lines.push('In today’s money (' + s.inflation + '% inflation): ' + fmt(r.final / Math.pow(1 + s.inflation / 100, s.years)));
    if (s.rate > 0) lines.push('Doubling time: ' + yrs(72 / s.rate) + ' (rule of 72), ' + yrs(Math.LN2 / Math.log(1 + r.effAnnual)) + ' exact');
    lines.push('', buildShareUrl());
    return lines.join('\n');
  }

  function csvText() {
    const r = lastResult, s = state;
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const n2 = (v) => v.toFixed(2);
    const out = [];
    out.push(['# ' + (C.APP_NAME || 'GrowthCalc') + ' export', 'currency ' + s.currency, s.rate + '% ' + FREQ_LABEL[s.freq], s.years + ' years'].map(q).join(','));
    if (tableView === 'yearly') {
      out.push(['Year', 'Starting balance', 'Contributions', 'Interest', 'Ending balance', 'Total contributed', 'Total interest'].concat(s.inflOn ? ['Inflation-adjusted'] : []).map(q).join(','));
      r.yearly.forEach((row) => {
        const line = [row.year, n2(row.start), n2(row.contrib), n2(row.interest), n2(row.end), n2(row.principal), n2(row.cumInterest)];
        if (s.inflOn) line.push(n2(row.end / Math.pow(1 + s.inflation / 100, row.year)));
        out.push(line.join(','));
      });
    } else {
      out.push(['Month', 'Year', 'Month of year', 'Starting balance', 'Contribution', 'Interest', 'Ending balance'].map(q).join(','));
      r.monthly.forEach((row) => out.push([row.m, row.year, row.mo, n2(row.start), n2(row.contrib), n2(row.interest), n2(row.end)].join(',')));
    }
    return out.join('\r\n');
  }
  function downloadCsv() {
    if (!isPro()) { openPro('csv'); return; }
    const blob = new Blob(['﻿' + csvText()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'growthcalc-' + tableView + '-' + state.years + 'y.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    track('download', { type: 'csv', view: tableView });
    toast('CSV downloaded');
  }
  function printReport() {
    if (!isPro()) { openPro('report'); return; }
    track('download', { type: 'print' });
    hideTip();
    window.print();
  }
  function saveScenario() {
    if (scenarios.length >= 1 && !isPro()) { openPro('scenarios'); return; }
    if (scenarios.length >= MAX_SCENARIOS) { toast('Maximum ' + MAX_SCENARIOS + ' scenarios – remove one first'); return; }
    let name = (els.scenarioName.value || '').trim().slice(0, 40);
    if (!name) name = fmt(state.monthly) + '/mo @ ' + state.rate + '% · ' + state.years + 'y';
    scenarios.push({ name, inputs: Object.assign({}, state) });
    saveScenarios();
    els.scenarioName.value = '';
    track('scenario_save', { count: scenarios.length });
    toast('Scenario saved');
    update();
  }
  function resetAll() {
    writeInputs(DEFAULTS);
    try { localStorage.removeItem(LS_INPUTS); } catch (e) { /* ignore */ }
    if (location.search) history.replaceState(null, '', location.pathname);
    update();
    toast('Inputs reset');
  }

  function renderPartners() {
    const links = C.AFFILIATE_LINKS || {};
    const items = Object.keys(links).map((k) => links[k]).filter((l) => l && typeof l === 'object' && l.url);
    if (!items.length || !els.partnersSection) return;
    els.partnersGrid.innerHTML = items.map((l) =>
      '<a class="partner card" href="' + esc(l.url) + '" target="_blank" rel="sponsored noopener" onclick="track(\'affiliate_click\',{partner:\'' + esc(l.name || '') + '\'})">' +
      '<strong>' + esc(l.name || 'Partner') + '</strong><span>Open an investment account and put compounding to work. Opens in a new tab.</span><span class="partner-cta">Visit →</span></a>'
    ).join('');
    els.partnersSection.classList.remove('hidden');
  }

  /* ---------------- wiring ---------------- */
  function bind() {
    const liveInputs = [els.initial, els.monthly, els.timing, els.rate, els.freq, els.increase, els.currency, els.inflation, els.inflToggle];
    liveInputs.forEach((el) => { el.addEventListener('input', update); el.addEventListener('change', update); });
    els.years.addEventListener('input', () => { const v = clamp(parseInt(els.years.value, 10) || 1, 1, 50); els.yearsRange.value = v; update(); });
    els.years.addEventListener('change', () => { els.years.value = clamp(parseInt(els.years.value, 10) || 1, 1, 50); els.yearsRange.value = els.years.value; update(); });
    els.yearsRange.addEventListener('input', () => { els.years.value = els.yearsRange.value; update(); });
    [els.initial, els.monthly, els.rate, els.increase, els.inflation].forEach((el) => {
      el.addEventListener('blur', () => { if (el.value === '' || !isFinite(parseFloat(el.value))) { el.value = el.min || 0; update(); } });
    });

    els.viewYearly.addEventListener('click', () => { tableView = 'yearly'; localStorage.setItem(LS_VIEW, tableView); renderTable(lastResult); });
    els.viewMonthly.addEventListener('click', () => { tableView = 'monthly'; localStorage.setItem(LS_VIEW, tableView); renderTable(lastResult); });

    els.btnCopy.addEventListener('click', () => { copyText(summaryText(), 'Summary copied'); track('copy', { type: 'summary' }); });
    els.btnShare.addEventListener('click', () => {
      const url = buildShareUrl();
      history.replaceState(null, '', url);
      copyText(url, 'Share link copied');
      track('share', {});
    });
    els.btnReset.addEventListener('click', resetAll);
    els.btnCsv.addEventListener('click', downloadCsv);
    els.btnPrint.addEventListener('click', printReport);
    els.btnSaveScenario.addEventListener('click', saveScenario);
    els.scenarioName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveScenario(); } });
    els.scenarioList.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.load != null) {
        const s = scenarios[+b.dataset.load];
        if (s) { writeInputs(s.inputs); update(); toast('Loaded "' + s.name + '"'); }
      } else if (b.dataset.del != null) {
        scenarios.splice(+b.dataset.del, 1); saveScenarios(); update(); toast('Scenario removed');
      }
    });

    els.btnGoal.addEventListener('click', () => { if (!isPro()) { openPro('goal'); return; } renderGoal(true); });
    [els.goalTarget, els.goalYears].forEach((el) => el.addEventListener('input', () => { if (isPro()) renderGoal(false); }));

    els.chart.addEventListener('pointermove', chartPointer);
    els.chart.addEventListener('pointerdown', chartPointer);
    els.chart.addEventListener('pointerleave', hideTip);

    document.addEventListener('pro:changed', () => { refreshProUI(); update(); });
    window.addEventListener('beforeprint', hideTip);
  }

  function init() {
    if (els.proPrice) els.proPrice.textContent = C.PRO_PRICE || '$9';
    document.querySelectorAll('[data-pro-price]').forEach((el) => { el.textContent = C.PRO_PRICE || '$9'; });
    document.querySelectorAll('[data-app-name]').forEach((el) => { el.textContent = C.APP_NAME || 'GrowthCalc'; });

    const fromUrl = fromQuery();
    const saved = loadPersisted();
    state = fromUrl || saved || Object.assign({}, DEFAULTS);
    writeInputs(state);
    els.goalYears.value = state.years;
    bind();
    refreshProUI();
    renderPartners();
    update();
    if (fromUrl) toast('Loaded inputs from link');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
