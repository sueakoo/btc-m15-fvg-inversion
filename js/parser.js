'use strict';

// ─────────────────────────────────────────────
// PARSER  —  raw candle text → structured objects
// ─────────────────────────────────────────────

/**
 * Converts a single raw string value to the appropriate JS type.
 * Handles: percentages, booleans, numbers, strings, null/N/A.
 */
function parseRawValue(rawValue) {
  if (!rawValue) return null;
  const val = rawValue.trim();
  if (!val || val === '#N/A' || val === 'N/A' || val === '-' || val === '—' || val === '−') return null;

  // Boolean
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;

  // Percentage — strip % and return the number as-is (e.g. "0.14%" → 0.14)
  if (val.endsWith('%')) {
    const n = parseFloat(val.slice(0, -1).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Plain number — strip spaces (thousands separator: "64 222,70" → "64222.70")
  // Number() requires the ENTIRE string to be valid,
  // unlike parseFloat() which stops mid-string (e.g. "15.06.2026" → 15.06).
  const n = Number(val.replace(/\s/g, '').replace(',', '.'));
  if (!isNaN(n)) return n;

  // String fallback
  return val;
}

/**
 * Parses one text block (multiple key:value lines) into a candle object.
 * Keys are lowercased and spaces→underscores.
 */
function parseCandleBlock(block) {
  const candle = {};
  for (const line of block.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.substring(0, idx).trim().toLowerCase().replace(/[\s]+/g, '_');
    const rawVal = line.substring(idx + 1).trim();
    if (key) candle[key] = parseRawValue(rawVal);
  }
  return candle;
}

/**
 * Приводит поля выгрузки X-RAY к конвенции приложения.
 * Вызывается сразу после разбора свечи — дальше по всему коду одна шкала.
 *
 * limb_pct — X-RAY считает (short − long)/сумма, то есть МИНУС = вынесло лонгов.
 *            У нас плюс = вынесло лонгов → инвертируем знак.
 * tilt_pct — в выгрузке лежит перекос «продавец относительно покупателя»
 *            (колонка Tilt%), что противоречит имени поля. Считаем сами:
 *            плюс = крупнее заходил покупатель.
 *            Берём сырые объёмы и число сделок, а НЕ avg_trade_* — последние
 *            округлены до 2 знаков и на мелких значениях схлопываются в ноль.
 * oe       — в выгрузку идёт модуль (колонка oe_modul), сторона теряется.
 *            Восстанавливаем со знаком: doi_pct / |Δ% цены|.
 */
function normalizeXrayFields(candle) {
  // ── limb_pct: плюс = ликвидировались лонги ────────────────
  if (typeof candle.limb_pct === 'number') {
    candle.limb_pct = -candle.limb_pct;
  }

  // ── tilt_pct: плюс = средний ордер покупки крупнее ────────
  let avgBuy = null, avgSell = null;
  if (typeof candle.buy_volume === 'number' && typeof candle.buy_trades === 'number' && candle.buy_trades > 0) {
    avgBuy = candle.buy_volume / candle.buy_trades;
  } else if (typeof candle.avg_trade_buy === 'number') {
    avgBuy = candle.avg_trade_buy;
  }
  if (typeof candle.sell_volume === 'number' && typeof candle.sell_trades === 'number' && candle.sell_trades > 0) {
    avgSell = candle.sell_volume / candle.sell_trades;
  } else if (typeof candle.avg_trade_sell === 'number') {
    avgSell = candle.avg_trade_sell;
  }
  candle.tilt_pct = (avgBuy != null && avgSell != null && avgSell > 0)
    ? +((avgBuy / avgSell - 1) * 100).toFixed(2)
    : null;

  // ── oe: знак сохраняется (плюс = OI набирался) ────────────
  if (typeof candle.doi_pct === 'number'
      && typeof candle.open === 'number' && candle.open !== 0
      && typeof candle.close === 'number') {
    const pricePct = Math.abs((candle.close - candle.open) / candle.open * 100);
    candle.oe = pricePct > 0 ? +(candle.doi_pct / pricePct).toFixed(3) : null;
  } else {
    candle.oe = null;
  }

  return candle;
}

/**
 * Splits raw text into per-candle blocks.
 * Each new block starts when a line beginning with "ts:" is encountered.
 */
function splitIntoBlocks(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n');
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (/^ts\s*:/i.test(line.trim())) {
      if (current.length > 0) blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

/**
 * Parses a full text input (M15 or H1) into an array of candle objects.
 */
function parseCandles(text) {
  if (!text) return [];
  // Strip leading/trailing quotes that some tools add around each block
  // Handles straight " and curly " " quotation marks
  const normalized = text
    .replace(/^["“”]\s*/gm, '')
    .replace(/\s*["“”]$/gm, '');
  return splitIntoBlocks(normalized)
    .map(parseCandleBlock)
    .map(normalizeXrayFields)
    .filter(c => c.ts !== null && c.ts !== undefined);
}

/**
 * Basic validation of M15 candle array.
 * Returns array of error strings (empty = OK).
 */
function validateM15(candles) {
  const errors = [];
  if (candles.length === 0) {
    errors.push('M15: свечи не найдены. Проверьте формат входных данных.');
    return errors;
  }
  const required = ['open', 'high', 'low', 'close'];
  candles.forEach((c, i) => {
    for (const f of required) {
      if (c[f] === null || c[f] === undefined) {
        errors.push(`M15 свеча ${i + 1} (${c.ts || '?'}): отсутствует поле "${f}"`);
      }
    }
  });
  return errors;
}

/**
 * Main entry point.
 * @param {string} m15Text  — raw text from M15 textarea
 * @param {string} h1Text   — raw text from H1 textarea
 * @returns {{ m15: object[], h1: object[], errors: string[] }}
 */
function parseInput(m15Text, h1Text) {
  const m15 = parseCandles(m15Text || '');
  const h1  = parseCandles(h1Text  || '');
  const errors = validateM15(m15);
  return { m15, h1, errors };
}
