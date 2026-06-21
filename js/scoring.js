'use strict';

// ─────────────────────────────────────────────
// SCORING — 8 аналитических блоков → итоговый балл + вердикт
// ─────────────────────────────────────────────

// ── Вспомогательные ─────────────────────────────────────────

// Качество объёмного участия для Block 1
function _volQuality(mx) {
  const fvg = mx.fvg_volume_share   ?? 0;
  const fin = mx.final_volume_share ?? 0;
  if (fvg >= 0.40 || fin >= 0.35) return 'strong';
  if (fvg >= 0.20 || fin >= 0.20) return 'normal';
  return 'weak';
}

// CVD совпадает с направлением инверсии?
function _cvdWithDir(cvdSign, direction) {
  if (direction === 'long')  return cvdSign === 'positive';
  if (direction === 'short') return cvdSign === 'negative';
  return false;
}

// limb "против инверсии"?
// Лонг: limb > 0 = больше лонг-ликвидаций = чужие лонги выбиты = «против» = чужие стопы
// Шорт: limb < 0 = больше шорт-ликвидаций
function _limbAgainst(limbPct, direction) {
  if (direction === 'long')  return (limbPct ?? 0) > 0;
  if (direction === 'short') return (limbPct ?? 0) < 0;
  return false;
}

// ── Блок 1 — Energy (14 pts) ─────────────────────────────────
function _scoreBlock1(mx, det) {
  const net   = mx.net_oi   ?? 0;
  const gross = mx.gross_oi ?? 0;
  const { imb_range_pct } = det.fvg;
  const vq = _volQuality(mx);

  if (gross === 0) return { score: 0, label: 'Нет нового OI, нет объёмного участия' };

  if (net >= 0.40) {
    if (vq === 'strong') return { score: 14, label: 'Сильный OI + выраженное объёмное участие в FVG/финальной свече' };
    if (vq === 'normal') return { score: 13, label: 'Сильный OI + нормальная объёмная структура' };
    return                      { score: 10, label: 'Сильный OI, объём без усиления' };
  }
  if (net >= 0.20) {
    if (vq === 'strong') return { score: 12, label: 'Умеренный OI + выраженное объёмное участие' };
    if (vq === 'normal') return { score: 11, label: 'Умеренный OI + нормальная объёмная структура' };
    if (imb_range_pct > 0.40)   return { score: 5, label: 'Умеренный OI, объём без усиления, FVG большой' };
    return                              { score: 8, label: 'Умеренный OI, объём слабее — FVG малый/средний' };
  }
  // net < 0.20%
  if (gross >= 0.40) return { score: 7, label: 'Слабый чистый OI, gross высокий — частичное участие' };
  if (gross >= 0.20) {
    if (vq !== 'weak') return { score: 6, label: 'Слабый OI, ресурс есть, признаки участия' };
    return                    { score: 4, label: 'Слабый OI, ресурс ограничен, объём без участия' };
  }
  // gross < 0.20%
  if (imb_range_pct < 0.15) return { score: 3, label: 'Минимальный ресурс, FVG малый' };
  if (imb_range_pct <= 0.40) return { score: 2, label: 'Минимальный ресурс, FVG средний' };
  return                            { score: 1, label: 'Минимальный ресурс, FVG большой' };
}

// ── Блок 2 — OI Placement (11 pts) ───────────────────────────
function _scoreBlock2(mx) {
  const gross = mx.gross_oi ?? 0;
  if (gross === 0) return { score: 0, label: 'Нет нового OI' };

  const combined = (mx.share_below ?? 0) + (mx.share_fvg ?? 0);
  const fvg      = mx.share_fvg ?? 0;

  let score;
  if      (combined >= 0.80) score = fvg >= 0.40 ? 11 : 10;
  else if (combined >= 0.60) score = fvg >= 0.30 ?  9 :  8;
  else if (combined >= 0.40) score = fvg >= 0.20 ?  6 :  5;
  else if (combined >= 0.20) score = fvg >= 0.10 ?  4 :  3;
  else                        score = fvg >= 0.05 ?  2 :  1;

  if (gross < 0.20)             score = Math.min(score, 4);
  if (mx.oi_window_count <= 3)  score = Math.min(score, 8);

  return { score, label: `Зона: ${(combined * 100).toFixed(0)}%, в FVG: ${(fvg * 100).toFixed(0)}%` };
}

// ── Блок 3 — OI Retention (13 pts) ───────────────────────────
function _scoreBlock3(mx) {
  const gross = mx.gross_oi       ?? 0;
  const net   = mx.net_oi         ?? 0;
  const ret   = mx.retention_ratio ?? 0;
  const fvgVol= mx.fvg_volume_share ?? 0;

  if (gross === 0) return { score: 0, label: 'Нет нового OI', transfer: false };

  // Передача риска
  if (net < 0.20 && gross >= 0.40 && fvgVol >= 0.35) {
    return { score: 9, label: 'Передача риска: высокая активность при слабом чистом OI', transfer: true };
  }

  let score;
  if (net >= 0.40) {
         if (ret >= 0.70) score = 13;
    else if (ret >= 0.40) score = 11;
    else if (ret >= 0.15) score =  9;
    else                  score =  7;
  } else if (net >= 0.20) {
         if (ret >= 0.70) score = 11;
    else if (ret >= 0.40) score =  9;
    else if (ret >= 0.15) score =  7;
    else                  score =  5;
  } else if (net >= 0.10) {
         if (ret >= 0.70) score =  7;
    else if (ret >= 0.40) score =  5;
    else if (ret >= 0.15) score =  3;
    else                  score =  2;
  } else {
         if (ret >= 0.70) score =  4;
    else if (ret >= 0.40) score =  3;
    else if (ret >= 0.15) score =  2;
    else                  score =  1;
  }

  return { score, label: `net_oi: ${net}%, retention: ${(ret * 100).toFixed(0)}%`, transfer: false };
}

// ── Блок 4 — Механика захвата (16 pts) ───────────────────────
function _scoreBlock4(mx, det) {
  const { direction } = det;
  const { inv } = mx;

  const bodyPct   = inv.body_pct   ?? 0;
  const clvPct    = inv.clv_pct    ?? 0;
  const cvdPct    = inv.cvd_pct    ?? 0;
  const cvdSign   = inv.cvd_sign   ?? null;
  const cvdSmall  = inv.cvd_small  ?? true;
  const doiPct    = inv.doi_pct    ?? 0;

  const oiGrowing  = doiPct > 0;
  const strongBody = bodyPct >= 50 && Math.abs(clvPct) >= 60;
  const cvdWithDir = _cvdWithDir(cvdSign, direction);
  const cvdAgainst = direction === 'long' ? cvdSign === 'negative' : cvdSign === 'positive';
  const cvdStrong  = !cvdSmall && Math.abs(cvdPct) >= 0.30;
  const cvdNeutral = cvdSmall || Math.abs(cvdPct) < 0.10;

  // Лимитное поглощение: CVD против или нейтрал + OI растёт
  if ((cvdAgainst || cvdNeutral) && oiGrowing && !cvdWithDir) {
    const score = cvdAgainst && cvdStrong && strongBody ? 16
                : cvdAgainst && cvdStrong               ? 15
                : strongBody                            ? 14
                :                                         13;
    return { score, label: 'Лимитное поглощение', scenario: 'absorption' };
  }

  // Рыночная инициатива: CVD в сторону + OI растёт
  if (cvdWithDir && oiGrowing) {
    const score = strongBody && cvdStrong ? 13
                : strongBody              ? 12
                :                           11;
    return { score, label: 'Рыночная инициатива', scenario: 'initiative' };
  }

  // Инверсия через сопротивление: тело слабое, CVD сильный в сторону
  if (bodyPct < 35 && cvdStrong && cvdWithDir) {
    const score = oiGrowing ? 11 : 9;
    return { score, label: 'Инверсия через сопротивление', scenario: 'resistance' };
  }

  // Возможный хедж: OI растёт, тело крошечное, CVD смешанный
  if (oiGrowing && bodyPct < 20) {
    return { score: 2, label: 'Возможный хедж', scenario: 'hedge' };
  }

  // Пустое движение
  if (Math.abs(cvdPct) < 0.10 && !oiGrowing) {
    return { score: 2, label: 'Пустое движение', scenario: 'empty' };
  }

  // Движение без позиции
  const score = cvdStrong ? 6 : oiGrowing ? 5 : 4;
  return { score, label: 'Движение без позиции', scenario: 'no_position' };
}

// ── Блок 5 — Re-Auction (13 pts) ─────────────────────────────
function _scoreBlock5(mx, det) {
  const { fvg_volume_share, fvgCandles } = mx;
  const { singleCandleInversion, direction } = det;
  const candleCount = fvgCandles.length;

  // Инверсия одной свечой
  if (singleCandleInversion || candleCount === 0) {
    const c   = fvgCandles[0] ?? mx.inv;
    const doi = c?.doi_pct    ?? 0;
    const cvdOk = _cvdWithDir(c?.cvd_sign ?? null, direction);
    const score = doi > 0 && cvdOk ? 7 : doi > 0 ? 5 : 3;
    return { score, label: 'Инверсия однослайновая — объёмное распределение нерелевантно' };
  }

  const volThreshold = candleCount >= 3 ? 0.50 : 0.70;
  const volStrong    = (fvg_volume_share ?? 0) >= volThreshold;

  // CVD в окне FVG
  let pos = 0, neg = 0;
  for (const c of fvgCandles) {
    if (_cvdWithDir(c.cvd_sign, direction)) pos++;
    else if (c.cvd_sign != null)            neg++;
  }
  const cvdMode = pos > neg ? 'confirmed' : neg > pos ? 'against' : 'neutral';

  if (candleCount === 1) {
    const score = volStrong && cvdMode === 'confirmed' ? 7
                : volStrong                            ? 5
                : cvdMode === 'confirmed'              ? 4
                :                                        3;
    return { score: Math.min(score, 7), label: `1 свеча в FVG, объём: ${volStrong ? 'высокий' : 'низкий'}, CVD: ${cvdMode}` };
  }

  if (candleCount === 2) {
    const eff = cvdMode === 'neutral' ? 'neutral' : cvdMode;
    let score;
    if      (volStrong && eff === 'confirmed') score = 9;
    else if (volStrong && eff === 'neutral')   score = 7;
    else if (volStrong && eff === 'against')   score = 5;
    else if (!volStrong && eff === 'confirmed')score = 6;
    else if (!volStrong && eff === 'against')  score = 3;
    else                                       score = 5;
    return { score: Math.min(score, 9), label: `2 свечи в FVG, объём: ${volStrong ? 'высокий' : 'низкий'}, CVD: ${eff}` };
  }

  // ≥ 3 свечей
  let score;
  if      (volStrong && cvdMode === 'confirmed') score = 12;
  else if (volStrong && cvdMode === 'neutral')   score = 10;
  else if (volStrong && cvdMode === 'against')   score =  8;
  else if (!volStrong && cvdMode === 'confirmed')score =  7;
  else if (!volStrong && cvdMode === 'neutral')  score =  5;
  else                                           score =  3;

  return { score, label: `${candleCount} свечи в FVG, объём: ${volStrong ? 'высокий' : 'низкий'}, CVD: ${cvdMode}` };
}

// ── Блок 6 — Geometry (8 pts) ────────────────────────────────
function _scoreBlock6(mx, det) {
  const { oiCandles } = mx;
  const { direction } = det;

  if (!oiCandles || oiCandles.length === 0) return { score: 4, label: 'Нет данных по геометрии', flag: null };

  let tailSum = 0, bodySum = 0, n = 0;
  for (const c of oiCandles) {
    // directional tail risk: для лонга = upper_tail (цена дошла, но не удержалась)
    const tail = direction === 'long' ? (c.upper_tail_pct ?? 0) : (c.lower_tail_pct ?? 0);
    tailSum += tail;
    bodySum += c.body_pct ?? 0;
    n++;
  }
  const avgTail = n > 0 ? tailSum / n : 0;
  const avgBody = n > 0 ? bodySum / n : 0;

  const label = `Ср. тело: ${avgBody.toFixed(0)}%, ср. хвост риска: ${avgTail.toFixed(0)}%`;

  if (avgTail > 50) {
    return { score: 2, label: 'Кульминационный хвост: повышен риск глубокого теста', flag: 'high_tail_risk' };
  }

  let score;
  if      (avgBody >= 55 && avgTail <= 15) score = 8;
  else if (avgBody >= 45 && avgTail <= 20) score = 7;
  else if (avgBody >= 35 && avgTail <= 25) score = 6;
  else if (avgBody >= 25 && avgTail <= 30) score = 5;
  else if (avgBody >= 20)                  score = 4;
  else if (avgTail <= 40)                  score = 3;
  else                                     score = 2;

  return { score, label, flag: null };
}

// ── Блок 8 — Skew (7 pts) ────────────────────────────────────
function _scoreBlock8(det) {
  const { skew_depth, direction, pivot, inversion, fvg } = det;
  const stopFlags = [];

  if (skew_depth != null && skew_depth > 1.20) {
    stopFlags.push('skew_depth > 1.20');
  }
  const ip = inversion.implied_price;
  if (ip != null) {
    if (direction === 'long'  && ip < pivot.value) stopFlags.push('implied_price < pivot_low');
    if (direction === 'short' && ip > pivot.value) stopFlags.push('implied_price > pivot_high');
  }
  if (stopFlags.length > 0) {
    return { score: 0, label: 'Аномальный Skew — СТОП', stopFlags };
  }

  const sd = skew_depth ?? 0;
  let score;
  if      (sd <= 0.00) score = 7;
  else if (sd <= 0.15) score = 6;
  else if (sd <= 0.33) score = 5;
  else if (sd <= 0.50) score = 4;
  else if (sd <= 0.75) score = 3;
  else if (sd <= 1.00) score = 2;
  else if (sd <= 1.20) score = 1;
  else                 score = 0;

  return { score, label: `skew_depth: ${sd.toFixed(3)}`, stopFlags: [] };
}

// ── Блок 9 — H1 Snapshot (18 pts) ────────────────────────────
function _scoreBlock9(mx, direction) {
  const { h1_candle_count, h1_doi_pct, h1_liqshare_pct, h1_limb_pct, h1_cvd_sign } = mx;

  if (!h1_candle_count) {
    return { score: 7, label: 'H1 данные не найдены — нейтральная оценка', stopFlag: false };
  }

  const liq = h1_liqshare_pct ?? 0;
  const doi = h1_doi_pct      ?? 0;

  let score, label, stopFlag = false;

  if (liq < 2) {
    if      (doi >= 0.20) { score = 18; label = 'Чистый рост: новый OI без стопов'; }
    else if (doi >= 0)    { score = 13; label = 'Слабый рост: OI почти не появился'; }
    else                  { score =  5; label = 'OI уходит, H1 не поддерживает'; }
  } else if (liq < 5) {
    if (doi >= 0.20) {
      if (_limbAgainst(h1_limb_pct, direction)) { score = 14; label = 'Чужие стопы помогли + OI вошёл'; }
      else                                       { score = 11; label = 'Встряска + OI удержался'; }
    } else { score = 7; label = 'H1 нейтрален, подтверждения нет'; }
  } else if (liq < 10) {
    if (doi >= 0.20) {
      if (_limbAgainst(h1_limb_pct, direction)) { score = 13; label = 'Выбитые стопы + новый OI'; }
      else                                       { score = 11; label = 'Паника в зоне + OI удержался'; }
    } else if (doi >= 0) { score =  7; label = 'Ликвидации без роста OI'; }
    else                  { score =  4; label = 'Ликвидации + OI снижается'; }
  } else {
    if      (doi >= 0.20) { score = 14; label = 'Сильные ликвидации + OI набирается'; }
    else if (doi >= 0)    { score =  2; label = 'Высокая доля стопов, OI не растёт'; }
    else                  { score =  0; label = 'Вынос стопов без живого интереса — СТОП'; stopFlag = true; }
  }

  // CVD уточнение ±2 при пограничных значениях
  if (h1_cvd_sign !== 0 && score > 0 && score < 18) {
    const borderDoi  = doi >= 0.17 && doi < 0.25;
    const borderLiq  = (liq >= 1.5 && liq < 2.5) || (liq >= 4.5 && liq < 5.5) || (liq >= 9.5 && liq < 10.5);
    if (borderDoi || borderLiq) {
      const cvdBonus = _cvdWithDir(h1_cvd_sign === 1 ? 'positive' : 'negative', direction) ? 2 : -2;
      score = Math.max(0, Math.min(18, score + cvdBonus));
    }
  }

  return { score, label, stopFlag };
}

// ── Стоп-флаги ────────────────────────────────────────────────
function _stopFlags(b, mx, det) {
  const flags = [];

  // #1: Пустая инверсия
  if ((mx.gross_oi ?? 0) < 0.05 && (mx.fvg_volume_share ?? 0) < 0.20 && (mx.h1_doi_pct ?? 0) < 0.10) {
    flags.push('Пустая инверсия: нет OI, нет объёма, H1 не подтверждает');
  }

  // #2: Слабый OI без передачи риска
  if ((mx.retention_ratio ?? 1) < 0.15 && (mx.fvg_volume_share ?? 0) < 0.25 && mx.gross_oi > 0) {
    flags.push('Слабый OI без передачи риска');
  }

  // #3: Пустое FVG + слабый ресурс
  if ((mx.fvg_volume_share ?? 0) < 0.15 && (mx.gross_oi ?? 0) < 0.20) {
    flags.push('Пустое FVG + слабый общий ресурс');
  }

  // #4: Аномальный Skew (из Block 8)
  for (const f of (b.block8.stopFlags ?? [])) {
    flags.push(`Аномальный Skew: ${f}`);
  }

  // #5: H1 вынос стопов
  if (b.block9.stopFlag) {
    flags.push('H1: вынос стопов без живого интереса');
  }

  // #6: Все основные блоки провалены (≥ 3 из 4 ниже 30% макс)
  const mainFail = [
    b.block1.score <= 4,   // ≤ 4/14 ≈ 30%
    b.block3.score <= 4,   // ≤ 4/13
    b.block4.score <= 5,   // ≤ 5/16
    b.block9.score <= 5,   // ≤ 5/18
  ].filter(Boolean).length;
  if (mainFail >= 3) flags.push('Все основные блоки провалены');

  // #7: Системная пустота
  if (b.block1.score <= 4 && b.block3.score <= 4 && b.block5.score <= 3 && b.block9.score <= 3) {
    flags.push('Системная пустота');
  }

  return flags;
}

// ── Красные флаги (не стоп, но в отчёт) ─────────────────────
function _redFlags(b) {
  const flags = [];
  if (b.block1.score <= 4 && b.block3.score <= 4) {
    flags.push('Пустой OI-ресурс: Energy ≤ 4 и Retention ≤ 4');
  }
  if (b.block6.flag === 'high_tail_risk') {
    flags.push('Кульминационный хвост: повышен риск глубокого теста');
  }
  return flags;
}

// ── Ожидаемый тест ───────────────────────────────────────────
function _expectedTest(b, det) {
  const { upper_fvg, lower_fvg } = det.fvg;
  const pivotVal = det.pivot.value;
  const fvgSize  = upper_fvg - lower_fvg;
  const midFVG   = (upper_fvg + lower_fvg) / 2;

  const geo   = b.block6.score;
  const ret   = b.block3.score;
  const h1    = b.block9.score;
  const total = b.total;

  let level, lo, hi, comment;

  if (total >= 76 && geo >= 6 && h1 >= 13) {
    level   = 'Мелкий';
    lo      = Math.round(midFVG);
    hi      = Math.round(upper_fvg);
    comment = 'Ожидается поверхностный тест верхней части FVG';
  } else if (total >= 60 || (geo >= 5 && ret >= 9)) {
    level   = 'Средний';
    lo      = Math.round(lower_fvg);
    hi      = Math.round(midFVG);
    comment = 'Ожидается тест середины FVG';
  } else if (total >= 45) {
    level   = 'Глубокий';
    lo      = Math.round(lower_fvg - fvgSize * 0.5);
    hi      = Math.round(lower_fvg);
    comment = 'Ожидается тест нижней границы и ниже FVG';
  } else {
    level   = 'К Pivot';
    lo      = Math.round(pivotVal);
    hi      = Math.round(lower_fvg);
    comment = 'Риск глубокого ретеста к уровню Pivot';
  }

  return { level, range: `${lo} – ${hi}`, comment };
}

// ── Вердикт ──────────────────────────────────────────────────
function _verdict(total, stopFlags) {
  if (stopFlags.length > 0 || total < 30) return 'Не брать';
  if (total >= 76)  return 'Сильный сетап';
  if (total >= 60)  return 'Рабочий сетап';
  if (total >= 45)  return 'Стандартная инверсия';
  if (total >= 30)  return 'Ослабленная инверсия';
  return 'Не брать';
}

// ─────────────────────────────────────────────
// Главная функция блока скоринга.
// @param {object[]} m15
// @param {object[]} h1
// @param {object}   det  — результат detect()
// @param {object}   mx   — результат computeMetrics()
// @returns {object}
// ─────────────────────────────────────────────
function computeScore(m15, h1, det, mx) {
  const block1 = _scoreBlock1(mx, det);
  const block2 = _scoreBlock2(mx);
  const block3 = _scoreBlock3(mx);
  const block4 = _scoreBlock4(mx, det);
  const block5 = _scoreBlock5(mx, det);
  const block6 = _scoreBlock6(mx, det);
  const block8 = _scoreBlock8(det);
  const block9 = _scoreBlock9(mx, det.direction);

  const total = block1.score + block2.score + block3.score + block4.score
              + block5.score + block6.score + block8.score + block9.score;

  const blocks = { block1, block2, block3, block4, block5, block6, block8, block9, total };

  const stopFlags  = _stopFlags(blocks, mx, det);
  const redFlags   = _redFlags(blocks);
  const verdict    = _verdict(total, stopFlags);
  const expectedTest = _expectedTest(blocks, det);

  return { blocks, total, stopFlags, redFlags, verdict, expectedTest };
}
