'use strict';

// ─────────────────────────────────────────────
// METRICS — все вычисленные метрики из candle-данных + detection
// ─────────────────────────────────────────────

// "DD.MM.YYYY HH:MM" → Date
function _parseTs(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const parts = ts.trim().split(' ');
  if (parts.length < 2) return null;
  const [d, m, y] = parts[0].split('.');
  const [h, min]  = parts[1].split(':');
  if (!d || !m || !y || !h || !min) return null;
  return new Date(+y, +m - 1, +d, +h, +min, 0, 0);
}

function _r(n, dec = 4) {
  return n != null && isFinite(n) ? +n.toFixed(dec) : null;
}

// ─────────────────────────────────────────────
// Главная функция.
// @param {object[]} m15   — массив M15 свечей из parseInput
// @param {object[]} h1    — массив H1 свечей из parseInput
// @param {object}   det   — результат detect()
// @returns {object} метрики
// ─────────────────────────────────────────────
function computeMetrics(m15, h1, det) {
  const { lower_fvg, upper_fvg } = det.fvg;
  const _dir       = det.direction;
  const oiCandles  = det.oiWindowIdx.map(i => m15[i]);
  const fvgCandles = det.fvgOverlapIdx.map(i => m15[i]);
  const invCandle  = m15[det.inversion.idx];

  // ── OI метрики (Block 1, 3) ──────────────────────────────
  let gross_oi = 0, unload_oi = 0;
  for (const c of oiCandles) {
    const d = c.doi_pct ?? 0;
    if (d > 0) gross_oi  += d;
    else        unload_oi += d;
  }
  const net_oi          = gross_oi + unload_oi;
  const retention_ratio = gross_oi > 0 ? net_oi / gross_oi : null;

  // ── Тайминг снятий OI (Block 3 redesign) ─────────────────
  let exitPreFvgSum = 0;
  for (const c of oiCandles) {
    const d = c.doi_pct ?? 0;
    const preFvg = _dir === 'long' ? (c.high != null && c.high < lower_fvg)
                                   : (c.low  != null && c.low  > upper_fvg);
    if (d < 0 && preFvg) exitPreFvgSum += d;
  }
  let exitInFvgSum = 0;
  for (const c of fvgCandles) {
    const d = c.doi_pct ?? 0;
    if (d < 0) exitInFvgSum += d;
  }
  const exit_pre_fvg = Math.abs(exitPreFvgSum);
  const exit_in_fvg  = Math.abs(exitInFvgSum);

  // ── OI Placement (Block 2) ───────────────────────────────
  // share_below: позитивный OI на свечах ПО НУЖНУЮ СТОРОНУ от FVG
  // LONG: свеча целиком ниже FVG (high < lower_fvg)
  // SHORT: свеча целиком выше FVG (low > upper_fvg)
  let belowSum = 0;
  for (const c of oiCandles) {
    const d = c.doi_pct ?? 0;
    const beyondFvg = _dir === 'long' ? (c.close != null && c.close < lower_fvg)
                                      : (c.close != null && c.close > upper_fvg);
    if (d > 0 && beyondFvg) belowSum += d;
  }
  // share_fvg: позитивный OI на свечах перекрытия FVG
  let fvgOiSum = 0;
  for (const c of fvgCandles) {
    const d = c.doi_pct ?? 0;
    if (d > 0) fvgOiSum += d;
  }
  // share_inv: доля OI на свече инверсии
  const inv_doi = invCandle.doi_pct ?? 0;

  const share_below = gross_oi > 0 ? belowSum              / gross_oi : null;
  const share_fvg   = gross_oi > 0 ? fvgOiSum              / gross_oi : null;
  const share_inv   = gross_oi > 0 ? Math.max(inv_doi, 0)  / gross_oi : null;

  // ── Volume метрики (Block 1, 3) ──────────────────────────
  let post_pivot_volume = 0;
  for (const c of oiCandles) post_pivot_volume += c.volume ?? 0;

  let fvg_vol = 0;
  for (const c of fvgCandles) fvg_vol += c.volume ?? 0;

  const fvg_volume_share    = post_pivot_volume > 0 ? fvg_vol            / post_pivot_volume : null;
  const final_volume_share  = post_pivot_volume > 0 && invCandle.volume != null
    ? invCandle.volume / post_pivot_volume : null;

  // ── H1 агрегаты (Block 9) ────────────────────────────────
  // H1 окно: H1-свечи, чей период пересекается с [pivot+1 .. инверсия]
  const pivotNextCandle = m15[det.pivot.idx + 1];
  const tsStart = _parseTs(pivotNextCandle?.ts);
  const tsEnd   = _parseTs(invCandle.ts);

  const h1Window = (tsStart && tsEnd) ? h1.filter(c => {
    const t = _parseTs(c.ts);
    if (!t) return false;
    // H1 свеча [t, t+1h) пересекается с [tsStart, tsEnd]
    return t <= tsEnd && new Date(t.getTime() + 3_600_000) > tsStart;
  }) : [];

  let h1DoiSum = 0, h1LiqLong = 0, h1LiqShortAbs = 0, h1Volume = 0, h1CvdSum = 0;
  for (const c of h1Window) {
    h1DoiSum      += c.doi_pct   ?? 0;
    h1LiqLong     += c.liq_long  ?? 0;
    h1LiqShortAbs += Math.abs(c.liq_short ?? 0);
    h1Volume      += c.volume    ?? 0;
    h1CvdSum      += c.cvd_pct   ?? 0;
  }
  const h1TotalLiq    = h1LiqLong + h1LiqShortAbs;
  const h1_liqshare   = h1Volume > 0    ? h1TotalLiq / h1Volume * 100         : null;
  const h1_limb       = h1TotalLiq > 0  ? (h1LiqLong - h1LiqShortAbs) / h1TotalLiq * 100 : null;
  const h1_cvd_sign   = h1CvdSum > 0 ? 1 : h1CvdSum < 0 ? -1 : 0;

  // ── Позиция implied_price относительно FVG (Block 8, флаги, UI) ─
  const _ip      = invCandle.implied_price ?? null;
  const _midFvg  = (lower_fvg + upper_fvg) / 2;
  const _pivot   = det.pivot.value;
  let ip_zone = null;
  if (_ip != null) {
    if (_dir === 'long') {
      if (_ip < _pivot)     ip_zone = 'critical';
      else if (_ip < lower_fvg) ip_zone = 'outside';
      else if (_ip < _midFvg)   ip_zone = 'weak';
      else                      ip_zone = 'strong';
    } else {
      if (_ip > _pivot)     ip_zone = 'critical';
      else if (_ip > upper_fvg) ip_zone = 'outside';
      else if (_ip > _midFvg)   ip_zone = 'weak';
      else                      ip_zone = 'strong';
    }
  }

  return {
    // ── OI ──────────────────────────────────
    gross_oi:          _r(gross_oi,        4),
    unload_oi:         _r(unload_oi,       4),
    net_oi:            _r(net_oi,          4),
    retention_ratio:   _r(retention_ratio, 3),
    exit_pre_fvg:      _r(exit_pre_fvg,   4),
    exit_in_fvg:       _r(exit_in_fvg,    4),

    // ── OI Placement ────────────────────────
    share_below:       _r(share_below, 3),
    share_fvg:         _r(share_fvg,   3),
    share_inv:         _r(share_inv,   3),

    // ── Volume ──────────────────────────────
    post_pivot_volume:   Math.round(post_pivot_volume),
    fvg_volume_share:    _r(fvg_volume_share,   3),
    final_volume_share:  _r(final_volume_share,  3),

    // ── Позиция implied_price ────────────────
    ip_zone,

    // ── Дополнительно для скоринга ──────────
    oi_window_count:   oiCandles.length,  // для Block 2 cap (≤3 → max 8)

    // ── Свеча инверсии (Block 4, 5, 6, 8) ──
    inv: {
      doi_pct:         invCandle.doi_pct        ?? null,
      body_pct:        invCandle.body_pct       ?? null,
      clv_pct:         invCandle.clv_pct        ?? null,
      cvd_pct:         invCandle.cvd_pct        ?? null,
      cvd_sign:        invCandle.cvd_sign       ?? null,
      cvd_small:       invCandle.cvd_small      ?? null,
      upper_tail_pct:  invCandle.upper_tail_pct ?? null,
      lower_tail_pct:  invCandle.lower_tail_pct ?? null,
      liqshare_pct:    invCandle.liqshare_pct   ?? null,
      limb_pct:        invCandle.limb_pct       ?? null,
      avg_trade_buy:   invCandle.avg_trade_buy  ?? null,
      avg_trade_sell:  invCandle.avg_trade_sell ?? null,
      volume:          invCandle.volume         ?? null,
    },

    // ── H1 (Block 9) ────────────────────────
    h1_candle_count: h1Window.length,
    h1_doi_pct:      _r(h1DoiSum,   3),
    h1_liqshare_pct: _r(h1_liqshare, 3),
    h1_limb_pct:     _r(h1_limb,    1),
    h1_cvd_sign,

    // ── Сырые окна (для блоков 4, 5) ────────
    oiCandles,
    fvgCandles,
  };
}
