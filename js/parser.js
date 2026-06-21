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
  if (!val || val === '#N/A' || val === 'N/A' || val === '-' || val === '—') return null;

  // Boolean
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;

  // Percentage — strip % and return the number as-is (e.g. "0.14%" → 0.14)
  if (val.endsWith('%')) {
    const n = parseFloat(val.slice(0, -1).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Plain number — Number() requires the ENTIRE string to be valid,
  // unlike parseFloat() which stops mid-string (e.g. "15.06.2026" → 15.06).
  const n = Number(val.replace(',', '.'));
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
  return splitIntoBlocks(text)
    .map(parseCandleBlock)
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
