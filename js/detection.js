'use strict';

// ─────────────────────────────────────────────
// DETECTION — FVG, Pivot, инверсия, окна анализа
// ─────────────────────────────────────────────

// Находит все FVG в массиве свечей.
function _findAllFVGs(candles) {
  const list = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const a = candles[i - 1], b = candles[i], c = candles[i + 1];
    if (a.low == null || a.high == null || c.high == null || c.low == null) continue;
    if (a.low > c.high) {
      list.push({ type: 'bearish', idxNm1: i - 1, idxN: i, idxNp1: i + 1, upper: a.low, lower: c.high });
    } else if (a.high < c.low) {
      list.push({ type: 'bullish', idxNm1: i - 1, idxN: i, idxNp1: i + 1, upper: c.low, lower: a.high });
    }
  }
  return list;
}

// Сливает идущие подряд FVG одного направления в одну зону.
// Условия слияния (любое из двух):
//   1. Ценовые зоны перекрываются.
//   2. Тройки свечей перекрываются по индексам (FVG образованы в рамках одного движения).
// Если ни одно условие не выполнено — стоп, берём накопленный результат.
function _mergeConsecutiveFVGs(rawFVGs) {
  if (!rawFVGs.length) return null;
  const first = rawFVGs[0];
  let upper_fvg = first.upper;
  let lower_fvg = first.lower;
  let idxNp1    = first.idxNp1;
  let count     = 1;

  for (let i = 1; i < rawFVGs.length; i++) {
    const next = rawFVGs[i];
    if (next.type !== first.type) break; // другое направление = другое движение
    const zonesOverlap  = lower_fvg <= next.upper && upper_fvg >= next.lower;
    const sharesCandles = next.idxNm1 < idxNp1; // тройки разделяют общие свечи
    if (!zonesOverlap && !sharesCandles) break;
    upper_fvg = Math.max(upper_fvg, next.upper);
    lower_fvg = Math.min(lower_fvg, next.lower);
    idxNp1    = next.idxNp1;
    count++;
  }

  return {
    type:       first.type,
    direction:  first.type === 'bearish' ? 'long' : 'short',
    idxNm1:     first.idxNm1,
    idxN:       first.idxN,
    idxNp1,              // индекс последнего n+1 (среди всех слитых)
    upper_fvg,
    lower_fvg,
    mergedCount: count   // >1 = было слияние
  };
}

// Возвращает true если диапазон свечи пересекает зону FVG.
function _overlaps(candle, lower, upper) {
  return candle.high != null && candle.low != null
      && candle.high >= lower && candle.low <= upper;
}

// ─────────────────────────────────────────────
// Главная функция блока 0.
// Принимает массив M15 свечей из parseInput().
// Возвращает объект детекции или { ok: false, errors: [...] }.
// ─────────────────────────────────────────────
function detect(candles) {
  if (!candles || candles.length < 3) {
    return { ok: false, errors: ['Недостаточно свечей для анализа (минимум 3).'] };
  }

  // ── 1. FVG ────────────────────────────────────────────────
  const fvg = _mergeConsecutiveFVGs(_findAllFVGs(candles));
  if (!fvg) {
    return { ok: false, errors: ['FVG не найден в переданных свечах.'] };
  }

  const { type, direction, idxNm1, idxN, idxNp1, upper_fvg, lower_fvg, mergedCount } = fvg;
  const imb_range_pct = +((upper_fvg - lower_fvg) / ((upper_fvg + lower_fvg) / 2) * 100).toFixed(3);

  // ── 2. Первое перекрытие FVG (поиск начиная с idxNp1+1) ──
  let firstOverlapIdx = -1;
  for (let i = idxNp1 + 1; i < candles.length; i++) {
    if (_overlaps(candles[i], lower_fvg, upper_fvg)) { firstOverlapIdx = i; break; }
  }

  if (firstOverlapIdx === -1) {
    return {
      ok: false,
      errors: ['Цена не вернулась в зону FVG — инверсия не найдена.'],
      fvg: { type, direction, upper_fvg, lower_fvg, imb_range_pct, mergedCount }
    };
  }

  // ── 3. Инверсия ───────────────────────────────────────────
  // Первая свеча начиная с firstOverlapIdx, у которой close пересёк границу FVG.
  let invIdx = -1;
  for (let i = firstOverlapIdx; i < candles.length; i++) {
    const c = candles[i];
    if (c.close == null) continue;
    if (direction === 'long'  && c.close > upper_fvg) { invIdx = i; break; }
    if (direction === 'short' && c.close < lower_fvg) { invIdx = i; break; }
  }

  if (invIdx === -1) {
    return {
      ok: false,
      errors: ['Инверсия не подтверждена: цена вошла в FVG, но close не пересёк границу.'],
      fvg: { type, direction, upper_fvg, lower_fvg, imb_range_pct, mergedCount }
    };
  }

  // ── 4. Pivot ──────────────────────────────────────────────
  // Шорт: наивысший high выше зоны FVG (high > upper_fvg), до инверсии.
  // Лонг: наинизший low ниже зоны FVG (low < lower_fvg), до инверсии.
  // При равных значениях берём более позднюю свечу (>= / <=).
  let pivotIdx = -1;
  if (direction === 'long') {
    let minLow = Infinity;
    for (let i = 0; i < invIdx; i++) {
      const c = candles[i];
      if (c.low != null && c.low < lower_fvg && c.low <= minLow) { minLow = c.low; pivotIdx = i; }
    }
  } else {
    let maxHigh = -Infinity;
    for (let i = 0; i < invIdx; i++) {
      const c = candles[i];
      if (c.high != null && c.high > upper_fvg && c.high >= maxHigh) { maxHigh = c.high; pivotIdx = i; }
    }
  }

  if (pivotIdx === -1) {
    return { ok: false, errors: ['Pivot не определён: нет свечей выше/ниже зоны FVG.'] };
  }

  const pivotCandle = candles[pivotIdx];
  const pivotValue  = direction === 'long' ? pivotCandle.low : pivotCandle.high;

  const invCandle = candles[invIdx];

  // ── 5. Окна анализа ───────────────────────────────────────
  // OI window: pivot+1 → инверсия включительно
  const oiWindowIdx = [];
  for (let i = pivotIdx; i <= invIdx; i++) oiWindowIdx.push(i);

  // FVG overlap window: после последнего n+1 → инверсия, только перекрывающие зону
  const fvgOverlapIdx = [];
  for (let i = idxNp1 + 1; i <= invIdx; i++) {
    if (_overlaps(candles[i], lower_fvg, upper_fvg)) fvgOverlapIdx.push(i);
  }

  // Edge case: инверсия одной свечой
  const singleCandleInversion = (firstOverlapIdx === invIdx);

  // ── 6. Skew depth ─────────────────────────────────────────
  let skew_depth = null;
  if (invCandle.implied_price != null) {
    const fvgSize = upper_fvg - lower_fvg;
    skew_depth = direction === 'long'
      ? +((invCandle.close - invCandle.implied_price) / fvgSize).toFixed(3)
      : +((invCandle.implied_price - invCandle.close) / fvgSize).toFixed(3);
  }

  return {
    ok:        true,
    errors:    [],
    direction,
    fvg: {
      type, idxNm1, idxN, idxNp1,
      upper_fvg, lower_fvg,
      imb_range_pct,
      mergedCount
    },
    pivot: {
      idx:   pivotIdx,
      ts:    pivotCandle.ts,
      value: pivotValue        // low для лонга, high для шорта
    },
    firstOverlapIdx,
    singleCandleInversion,
    inversion: {
      idx:           invIdx,
      ts:            invCandle.ts,
      close:         invCandle.close,
      implied_price: invCandle.implied_price ?? null
    },
    skew_depth,
    oiWindowIdx,    // массив индексов свечей для метрик OI
    fvgOverlapIdx   // массив индексов свечей в зоне FVG (для fvg_volume_share)
  };
}
