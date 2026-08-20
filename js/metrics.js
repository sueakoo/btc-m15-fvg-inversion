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
  for (let _ci = 0; _ci < oiCandles.length; _ci++) {
    const d = oiCandles[_ci].doi_pct ?? 0;
    if (d > 0)        gross_oi  += d;
    else if (_ci > 0) unload_oi += d;  // отрицательный doi_pct пивота не считаем (чужие позиции, не наш сетап)
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
  // share_fvg: OI на свечах где close внутри зоны FVG (lower_fvg ≤ close ≤ upper_fvg)
  let fvgOiSum = 0;
  for (const c of oiCandles) {
    const d = c.doi_pct ?? 0;
    if (d > 0 && c.close != null && c.close >= lower_fvg && c.close <= upper_fvg) fvgOiSum += d;
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

  // ── Очистка пивотного часа от снятия ─────────────────────
  // Pivot на инверсии — это всегда снятие ликвидности, а снятие всегда даёт
  // ликвидации. Часовая свеча, внутри которой лежит Pivot, захватывает их
  // целиком, и отличить ликвидации сетапа от ликвидаций снятия становится
  // невозможно. Поэтому вклад пивотного часа в окно считается отдельно.
  //
  // Час строго равен сумме своих M15-свечей (проверено на данных), отсюда
  // два пути получить его вклад:
  //   A. прямое сложение M15-свечей часа, попавших в окно — ОСНОВНОЙ:
  //      не зависит от округления H1 и от полноты вставки слева;
  //   B. вычитание: час минус M15-свечи до начала окна — ЗАПАСНОЙ:
  //      наследует ошибку округления H1, поэтому только когда A недоступен,
  //      и только при доказанной полноте свечей до окна.
  // Доступны оба — считаем оба и сверяем: расхождение больше 2% значит,
  // что данные не сходятся между собой, и об этом надо сказать.
  const _HOUR = 3_600_000, _M15 = 900_000;
  const pivotTs = _parseTs(m15[det.pivot.idx]?.ts);

  // Свеча считается пригодной, только если есть обе стороны ликвидаций и объём.
  // Пустая сторона — это НЕ ноль: сверка с H1 показала, что за пропуском
  // скрываются реальные суммы.
  function _liqOf(c) {
    if (typeof c.liq_long !== 'number' || typeof c.liq_short !== 'number'
        || typeof c.volume !== 'number') return null;
    return { long: c.liq_long, short: Math.abs(c.liq_short), vol: c.volume };
  }
  function _sumLiq(list) {
    let L = 0, S = 0, V = 0;
    for (const c of list) {
      const q = _liqOf(c);
      if (!q) return null;
      L += q.long; S += q.short; V += q.vol;
    }
    return { long: L, short: S, vol: V };
  }

  let h1_liq_clean    = true;
  let h1_liq_method   = null;   // 'direct' | 'subtract' | null
  let h1_liq_mismatch = false;
  let pivotHourAdj    = null;   // вклад пивотного часа в окно

  const pivotHourCandle = (pivotTs && h1Window.length)
    ? h1Window.find(c => {
        const t = _parseTs(c.ts);
        return t && t.getTime() <= pivotTs.getTime() && pivotTs.getTime() < t.getTime() + _HOUR;
      }) || null
    : null;

  if (pivotHourCandle) {
    const t0     = _parseTs(pivotHourCandle.ts).getTime();
    const pivMs  = pivotTs.getTime();
    const inHour = m15.filter(c => {
      const x = _parseTs(c.ts);
      return x && x.getTime() >= t0 && x.getTime() < t0 + _HOUR;
    });
    const before = inHour.filter(c => _parseTs(c.ts).getTime() <= pivMs);
    const inside = inHour.filter(c => _parseTs(c.ts).getTime() >  pivMs);

    // A — прямое сложение
    const direct = inside.length ? _sumLiq(inside) : null;

    // B — вычитание, только при полном наборе свечей до окна
    let sub = null;
    const expectedBefore = Math.round((pivMs - t0) / _M15) + 1;
    if (before.length === expectedBefore) {
      const b = _sumLiq(before);
      const h = _liqOf(pivotHourCandle);
      if (b && h) sub = { long: h.long - b.long, short: h.short - b.short, vol: h.vol - b.vol };
    }

    if (direct && sub) {
      const base = (_liqOf(pivotHourCandle)?.long ?? 0) + (_liqOf(pivotHourCandle)?.short ?? 0);
      const diff = Math.abs((direct.long + direct.short) - (sub.long + sub.short));
      if (base > 0 && diff > base * 0.02) h1_liq_mismatch = true;
      pivotHourAdj = direct; h1_liq_method = 'direct';
    } else if (direct) {
      pivotHourAdj = direct; h1_liq_method = 'direct';
    } else if (sub) {
      pivotHourAdj = sub;    h1_liq_method = 'subtract';
    } else {
      h1_liq_clean = false;
    }
  }

  let h1DoiSum = 0, h1LiqLong = 0, h1LiqShortAbs = 0, h1Volume = 0;
  for (const c of h1Window) {
    // Ось OI не чистим: doi_pct — процент, а не сумма, строго разложить нельзя.
    h1DoiSum += c.doi_pct ?? 0;
    if (c === pivotHourCandle) continue;   // пивотный час учитывается отдельно
    h1LiqLong     += c.liq_long  ?? 0;
    h1LiqShortAbs += Math.abs(c.liq_short ?? 0);
    h1Volume      += c.volume    ?? 0;
  }
  if (pivotHourAdj) {
    h1LiqLong     += Math.max(pivotHourAdj.long,  0);
    h1LiqShortAbs += Math.max(pivotHourAdj.short, 0);
    h1Volume      += Math.max(pivotHourAdj.vol,   0);
  }

  const h1TotalLiq  = h1LiqLong + h1LiqShortAbs;
  const h1_liqshare = (h1_liq_clean && h1Volume   > 0) ? h1TotalLiq / h1Volume * 100 : null;
  const h1_limb     = (h1_liq_clean && h1TotalLiq > 0) ? (h1LiqLong - h1LiqShortAbs) / h1TotalLiq * 100 : null;

  // ── Ликвидации на свече инверсии — основная ось блока 9 ──
  // Свеча инверсии = момент пересечения зоны. Определена структурно, без единого
  // порога и без привязки к расстояниям. Ликвидации снятия в неё попасть не могут
  // физически: снятие произошло на Pivot, а инверсия — это выход за границу FVG.
  //
  // Пропуск в данных закрывается сверкой с часом: час строго равен сумме своих
  // M15-свечей. Если известны все остальные свечи часа — недостающее вычисляется
  // точно. Если неизвестны несколько — знаем только верхнюю границу.
  // Пропуск это НЕ ноль: на реальных данных в 6 часах из 17 за прочерками
  // прятались суммы до 195 тысяч.
  const _num = v => typeof v === 'number' && isFinite(v);

  // Ликвидации по любой свече: прямое значение либо восстановление через час.
  // Час строго равен сумме своих M15-свечей, поэтому при известных остальных
  // свечах часа недостающее вычисляется точно. Если неизвестных несколько —
  // возвращается только верхняя граница: весь нераспределённый остаток часа.
  function _resolveLiqFor(cand) {
    let L = _num(cand.liq_long)  ? cand.liq_long            : null;
    let S = _num(cand.liq_short) ? Math.abs(cand.liq_short) : null;
    let method = (L != null && S != null) ? 'direct' : null;
    let bL = null, bS = null;

    const ts = _parseTs(cand.ts);
    if ((L == null || S == null) && ts) {
      const t0 = Math.floor(ts.getTime() / 3_600_000) * 3_600_000;
      const hourC = h1.find(c => {
        const x = _parseTs(c.ts);
        return x && x.getTime() === t0;
      });
      if (hourC) {
        const others = m15.filter(c => {
          const x = _parseTs(c.ts);
          return x && c !== cand && x.getTime() >= t0 && x.getTime() < t0 + 3_600_000;
        });
        const resolve = (side, hourVal) => {
          // Час пуст по этой стороне — значит за весь час ликвидаций не было.
          const hourTotal = _num(hourVal) ? Math.abs(hourVal) : 0;
          if (hourTotal === 0) return { value: 0, bound: null };
          let sum = 0, allKnown = true;
          for (const c of others) {
            if (_num(c[side])) sum += Math.abs(c[side]);
            else allKnown = false;
          }
          const resid = Math.max(hourTotal - sum, 0);
          return allKnown ? { value: resid, bound: null } : { value: null, bound: resid };
        };
        if (L == null) {
          const r = resolve('liq_long', hourC.liq_long);
          if (r.value != null) { L = r.value; method = 'recovered'; } else bL = r.bound;
        }
        if (S == null) {
          const r = resolve('liq_short', hourC.liq_short);
          if (r.value != null) { S = r.value; method = method || 'recovered'; } else bS = r.bound;
        }
      }
    }
    return { long: L, short: S, method, boundLong: bL, boundShort: bS };
  }

  // ── Свеча инверсии — ликвидации (блок 8, справочно) ──────
  const _invLiq = _resolveLiqFor(invCandle);
  const inv_liq_long   = _invLiq.long;
  const inv_liq_short  = _invLiq.short;
  const inv_liq_method = _invLiq.method;

  const _invVol   = _num(invCandle.volume) ? invCandle.volume : null;
  const inv_liq_known = inv_liq_long != null && inv_liq_short != null && _invVol > 0;
  const _invTotal = inv_liq_known ? inv_liq_long + inv_liq_short : null;

  const inv_liqshare_pct = inv_liq_known ? _invTotal / _invVol * 100 : null;
  const inv_limb_pct     = (inv_liq_known && _invTotal > 0)
    ? (inv_liq_long - inv_liq_short) / _invTotal * 100 : null;

  const inv_liq_max_pct = (!inv_liq_known && _invVol > 0)
    ? ((inv_liq_long ?? _invLiq.boundLong ?? 0) + (inv_liq_short ?? _invLiq.boundShort ?? 0)) / _invVol * 100
    : null;

  // ─────────────────────────────────────────────────────────
  // ОКНО ИНВЕРСИИ — основа блоков 4 и 9
  // От первой свечи, коснувшейся зоны FVG, до свечи инверсии включительно,
  // подряд. Свеча инверсии входит в окно, а не добавляется к нему.
  // ─────────────────────────────────────────────────────────
  const invWinCandles = [];
  for (let i = det.firstOverlapIdx; i <= det.inversion.idx; i++) invWinCandles.push(m15[i]);

  // Ось 1 — изменение открытого интереса за окно
  let invWinDoi = 0;
  for (const c of invWinCandles) invWinDoi += c.doi_pct ?? 0;
  const OI_BAND = 0.10;   // граница класса, см. BLOCK4_REDESIGN.md
  const inv_window_class = invWinDoi >  OI_BAND ? 'set'
                         : invWinDoi < -OI_BAND ? 'unload'
                         :                        'rotate';

  // Ось 2 — агрессия за окно. Считается из сырых объёмов:
  // проценты отдельных свечей складывать нельзя, у них разные знаменатели.
  let _bv = 0, _sv = 0, _cvdCnt = 0;
  for (const c of invWinCandles) {
    if (_num(c.buy_volume) && _num(c.sell_volume)) {
      _bv += c.buy_volume; _sv += Math.abs(c.sell_volume); _cvdCnt++;
    }
  }
  const inv_window_cvd = (_cvdCnt > 0 && (_bv + _sv) > 0)
    ? (_bv - _sv) / (_bv + _sv) * 100 : null;

  // Ось 3 — ликвидации за окно, в сторонах относительно направления сделки
  let _wLong = 0, _wShort = 0, _wVol = 0, _wBoundL = 0, _wBoundS = 0;
  let inv_window_liq_known = true;
  for (const c of invWinCandles) {
    const q = _resolveLiqFor(c);
    if (q.long  != null) _wLong  += q.long;  else { inv_window_liq_known = false; _wBoundL += q.boundLong  ?? 0; }
    if (q.short != null) _wShort += q.short; else { inv_window_liq_known = false; _wBoundS += q.boundShort ?? 0; }
    _wVol += _num(c.volume) ? c.volume : 0;
  }
  // own — сторона сделки, opp — противоположная. Относительные, не «лонги/шорты»:
  // иначе на шортах знак поправки перевернётся.
  const inv_window_liq_own = _dir === 'long' ? _wLong  : _wShort;
  const inv_window_liq_opp = _dir === 'long' ? _wShort : _wLong;
  const _wTot = inv_window_liq_own + inv_window_liq_opp;

  const inv_window_liqshare_pct = (inv_window_liq_known && _wVol > 0)
    ? _wTot / _wVol * 100 : null;
  const inv_window_liq_max_pct  = (!inv_window_liq_known && _wVol > 0)
    ? (_wTot + _wBoundL + _wBoundS) / _wVol * 100 : null;

  // Сторона: перевес больше 20 п.п. — это 60 на 40 и круче
  let inv_window_liq_side = null;
  if (inv_window_liq_known && _wTot > 0) {
    const _limb = (inv_window_liq_own - inv_window_liq_opp) / _wTot * 100;
    inv_window_liq_side = _limb > 20 ? 'own' : _limb < -20 ? 'opp' : 'balanced';
  }

  const _m15CvdSum  = oiCandles.reduce((s, c) => s + (c.cvd_pct ?? 0), 0);
  const m15_cvd_sign = _m15CvdSum > 0 ? 1 : _m15CvdSum < 0 ? -1 : 0;

  // ── Арбитражный магнит: среднее implied_price по M15-окну + H1-коррекция ─
  let _m15IpSum = 0, _m15IpCnt = 0;
  for (const c of oiCandles) {
    const ip = c.implied_price ?? null;
    if (ip != null) { _m15IpSum += ip; _m15IpCnt++; }
  }
  const m15_ip_avg = _m15IpCnt > 0 ? _m15IpSum / _m15IpCnt : null;

  let _h1IpSum = 0, _h1IpCnt = 0;
  for (const c of h1Window) {
    const ip = c.implied_price ?? null;
    if (ip != null) { _h1IpSum += ip; _h1IpCnt++; }
  }
  const h1_ip_avg = _h1IpCnt > 0 ? _h1IpSum / _h1IpCnt : null;

  // Коррекция H1:
  // Определяем зону каждого значения относительно ключевых уровней.
  // Если M15 и H1 в одной зоне → H1 подтверждает, коррекция не нужна.
  // Если в разных зонах → крупные деньги тянут в другую сторону,
  //   берём середину: m15 + (h1 - m15) * 0.5.
  // Нет H1 → только M15.
  function _ipZoneFor(price) {
    if (price == null) return null;
    if (_dir === 'long') {
      if (price > det.inversion.close) return 'above_inv';
      if (price >= lower_fvg)          return 'fvg_area';
      if (price > det.pivot.value)     return 'below_fvg';
      return 'below_pivot';
    } else {
      if (price < det.inversion.close) return 'above_inv';
      if (price <= upper_fvg)          return 'fvg_area';
      if (price < det.pivot.value)     return 'below_fvg';
      return 'below_pivot';
    }
  }
  let ip_magnet = null;
  if (m15_ip_avg != null && h1_ip_avg != null) {
    const zM15 = _ipZoneFor(m15_ip_avg);
    const zH1  = _ipZoneFor(h1_ip_avg);
    ip_magnet = (zM15 === zH1)
      ? m15_ip_avg                                            // в одной зоне — без коррекции
      : m15_ip_avg + (h1_ip_avg - m15_ip_avg) * 0.5;        // в разных — берём середину
  } else {
    ip_magnet = m15_ip_avg ?? h1_ip_avg ?? null;
  }

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

    // ── Арбитражный магнит ──────────────────
    m15_ip_avg:  _r(m15_ip_avg, 0),
    h1_ip_avg:   _r(h1_ip_avg,  0),
    ip_magnet:   _r(ip_magnet,  0),

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
    // Сырые суммы ликвидаций по H1-окну (уже очищенные от пивотного часа).
    // При неудавшейся очистке — null, а не ноль: «посчитать не смогли»
    // не должно выглядеть как «ликвидаций не было».
    h1_liq_long:     h1_liq_clean ? Math.round(h1LiqLong)     : null,
    h1_liq_short:    h1_liq_clean ? Math.round(h1LiqShortAbs) : null,
    // Состояние очистки пивотного часа
    h1_liq_clean,       // удалось ли очистить окно от снятия
    h1_liq_method,      // 'direct' | 'subtract' | null
    h1_liq_mismatch,    // два пути дали расхождение больше 2%

    // ── Ликвидации на свече инверсии — основная ось блока 9 ──
    inv_liq_long:     inv_liq_long  != null ? Math.round(inv_liq_long)  : null,
    inv_liq_short:    inv_liq_short != null ? Math.round(inv_liq_short) : null,
    inv_liqshare_pct: _r(inv_liqshare_pct, 4),
    inv_limb_pct:     _r(inv_limb_pct,     1),
    inv_liq_known,                              // известны ли обе стороны
    inv_liq_method,                             // 'direct' | 'recovered' | null
    inv_liq_max_pct:  _r(inv_liq_max_pct,  4),  // верхняя граница, если неизвестно

    // ── Окно инверсии (блоки 4 и 9) ─────────
    inv_window_size:         invWinCandles.length,
    inv_window_doi:          _r(invWinDoi, 4),
    inv_window_class,
    inv_window_cvd:          _r(inv_window_cvd, 2),
    inv_window_cvd_candles:  _cvdCnt,
    inv_window_liq_own:      inv_window_liq_known ? Math.round(inv_window_liq_own) : null,
    inv_window_liq_opp:      inv_window_liq_known ? Math.round(inv_window_liq_opp) : null,
    inv_window_liqshare_pct: _r(inv_window_liqshare_pct, 4),
    inv_window_liq_max_pct:  _r(inv_window_liq_max_pct,  4),
    inv_window_liq_known,
    inv_window_liq_side,
    invWinCandles,

    m15_cvd_sign,

    // ── Сырые окна (для блоков 4, 5) ────────
    oiCandles,
    fvgCandles,
  };
}
