'use strict';

// ─────────────────────────────────────────────
// SCORING — 8 аналитических блоков → итоговый балл + вердикт
// ─────────────────────────────────────────────

// ── Вспомогательные ─────────────────────────────────────────

function _volQuality(mx) {
  const fvg = mx.fvg_volume_share   ?? 0;
  const fin = mx.final_volume_share ?? 0;
  if (fvg >= 0.40 || fin >= 0.35) return 'strong';
  if (fvg >= 0.20 || fin >= 0.20) return 'normal';
  return 'weak';
}

function _cvdWithDir(cvdSign, direction) {
  const isPos = cvdSign === 1 || cvdSign === 'positive';
  const isNeg = cvdSign === -1 || cvdSign === 'negative';
  if (direction === 'long')  return isPos;
  if (direction === 'short') return isNeg;
  return false;
}

function _limbAgainst(limbPct, direction) {
  if (direction === 'long')  return (limbPct ?? 0) > 0;
  if (direction === 'short') return (limbPct ?? 0) < 0;
  return false;
}

// ── Комментарии к блокам ─────────────────────────────────────

function _b1Comment(score) {
  if (score === 14) return 'Ресурс набирался агрессивно — большая часть объёма прошла внутри имбаланса. Концентрация покупок в зоне.';
  if (score === 13) return 'OI набирался уверенно при нормальной объёмной структуре. Стандартный сценарий накопления.';
  if (score === 12) return 'Умеренный OI с сильным объёмным участием в имбалансе. Ресурс концентрирован.';
  if (score === 11) return 'Умеренный OI, объём без отклонений. Позиция набиралась ровно, без акцентов.';
  if (score === 10) return 'Сильный чистый OI, но объём в имбалансе не усиливал — позиция набиралась раньше.';
  if (score >= 8)   return 'Умеренный OI при слабом участии в имбалансе. Ресурс есть, но набирался осторожно.';
  if (score === 7)  return 'Чистый OI слабый, но валовый ресурс был — часть позиций пережила снятия.';
  if (score >= 5)   return 'Ресурс ограничен, объём частично подтверждал. Накопление неуверенное.';
  if (score >= 1)   return 'Ресурс минимальный, объём не подтверждал интерес. Движение без наполнения.';
  return 'Инверсия на пустом рынке — новой позиции нет.';
}

function _b2Comment(score) {
  if (score === 11) return 'Почти весь OI набран ниже имбаланса и внутри него — позиция хорошо защищена снизу.';
  if (score === 10) return 'Большая часть OI ниже имбаланса и внутри него, доля непосредственно в FVG чуть ниже оптимальной.';
  if (score === 9)  return 'Размещение хорошее — основной ресурс ниже имбаланса и внутри него.';
  if (score === 8)  return 'OI преимущественно в нужных ценовых уровнях, небольшой дефицит внутри FVG.';
  if (score >= 6)   return 'Смешанное размещение — часть OI на хорошей цене, часть у верхней границы.';
  if (score >= 4)   return 'OI расположен преимущественно внутри FVG или выше — подушки снизу мало.';
  if (score >= 2)   return 'Слабое размещение — большая часть позиции взята у максимума или близко к инверсии.';
  return 'OI практически нет или размещён на максимуме. Позиции нечем защищать.';
}

function _b3Comment(score, scenario) {
  if (scenario === 'none') return 'Нет нового OI. Нечего анализировать.';
  if (scenario === 'no_exit') {
    if (score >= 13) return 'Все набранные позиции дошли до инверсии. Ресурс максимально сохранён.';
    if (score >= 11) return 'Набор прошёл без разгрузки. Ресурс полный.';
    return 'Снятий не было, но объём OI невелик.';
  }
  if (scenario === 'early_exit') {
    if (score >= 9) return 'Часть OI снята до зоны, значимый ресурс дошёл до инверсии.';
    if (score >= 7) return 'Снятия до FVG разгрузили позицию — ресурс на момент инверсии снижен.';
    return 'Основные снятия прошли до зоны. На инверсии ресурса практически нет.';
  }
  if (scenario === 'pre_fvg') {
    if (score >= 11) return 'Снятия в зоне — позиции вышли при входе в FVG. Остаток держится.';
    if (score >= 9)  return 'Часть OI ушла внутри FVG, ресурс в целом сохранён.';
    if (score >= 6)  return 'Заметные снятия в зоне снизили ресурс. Защиты мало.';
    return 'Большая часть OI снята в зоне FVG. Уровень без защиты.';
  }
  if (scenario === 'fvg_fvg') {
    if (score >= 13) return 'Бой в зоне выигран набором — позиция закреплена внутри имбаланса.';
    if (score >= 11) return 'Активность в зоне с преимуществом набора. Ресурс сохранён.';
    if (score >= 6)  return 'Борьба в зоне без явного перевеса — ресурс ограничен.';
    return 'Набор и снятие в зоне почти равны. Ресурса для защиты практически нет.';
  }
  return '';
}

function _b5Comment(volStrong, cvdMode) {
  if (volStrong && cvdMode === 'confirmed') return 'Зона принята хорошо — объём в имбалансе высокий, CVD подтверждает направление.';
  if (volStrong && cvdMode === 'against')   return 'Объём был, но покупатели встретили сопротивление. Зона принята с усилием.';
  if (volStrong && cvdMode === 'neutral')   return 'Объём прошёл, CVD нейтрален. Явного перекоса нет — рынок принял зону без акцента.';
  if (cvdMode === 'confirmed')              return 'Объём слабый, CVD подтверждает. Аукцион формальный — сопротивления почти не было.';
  return 'Зона пройдена быстро и без объёма. Настоящего аукциона не было.';
}

function _b6Comment(score, flag) {
  if (flag === 'high_tail_risk') return 'Кульминационные хвосты — цена выбрасывалась но не удерживалась. Повышенный риск глубокого теста.';
  if (score >= 7) return 'Движение чистое — уверенные тела, минимальные хвосты. Сопротивления не было.';
  if (score >= 5) return 'Умеренная геометрия — хвосты есть, но тела держались. Небольшое встречное давление.';
  return 'Заметные хвосты при слабых телах — движение шло с трудом, встречало сопротивление.';
}

function _b8Comment(score, ipZone) {
  if (ipZone === 'critical') return 'implied_price ниже Pivot — позиция не поддерживает инверсию.';
  if (ipZone === 'outside')  return 'implied_price ниже зоны FVG — OI тянет к нижней границе и ниже. Риск глубокого теста.';
  if (ipZone === 'weak')     return 'implied_price в нижней части FVG — тест ожидается вглубь зоны.';
  if (ipZone === 'strong') {
    if (score === 7) return 'implied_price на уровне инверсии или выше — OI поддерживает зону снизу.';
    if (score === 6) return 'implied_price в верхней части FVG, близко к инверсии. Поддержка сильная.';
    if (score === 5) return 'implied_price в верхней части FVG. Тест верхней части зоны вероятен.';
    return 'implied_price в верхней части FVG. Тест середины зоны возможен.';
  }
  if (score >= 5) return 'OI поддерживает зону.';
  if (score >= 3) return 'Умеренное расхождение — тест вглубь зоны вероятен.';
  return 'Большое расхождение по skew.';
}

// ── Блок 1 — Energy (14 pts) ─────────────────────────────────
function _scoreBlock1(mx, det) {
  const net   = mx.net_oi   ?? 0;
  const gross = mx.gross_oi ?? 0;
  const { imb_range_pct } = det.fvg;
  const vq = _volQuality(mx);

  if (gross === 0) {
    return { score: 0, label: 'Нет нового OI, нет объёмного участия', comment: _b1Comment(0) };
  }

  if (net >= 0.40) {
    if (vq === 'strong') return { score: 14, label: 'Сильный OI + выраженное объёмное участие в FVG/финальной свече', comment: _b1Comment(14) };
    if (vq === 'normal') return { score: 13, label: 'Сильный OI + нормальная объёмная структура',                     comment: _b1Comment(13) };
    return                      { score: 10, label: 'Сильный OI, объём без усиления',                                  comment: _b1Comment(10) };
  }
  if (net >= 0.20) {
    if (vq === 'strong') return { score: 12, label: 'Умеренный OI + выраженное объёмное участие',           comment: _b1Comment(12) };
    if (vq === 'normal') return { score: 11, label: 'Умеренный OI + нормальная объёмная структура',         comment: _b1Comment(11) };
    if (imb_range_pct > 0.40)   return { score: 5, label: 'Умеренный OI, объём без усиления, FVG большой', comment: _b1Comment(5)  };
    return                              { score: 8, label: 'Умеренный OI, объём слабее — FVG малый/средний',comment: _b1Comment(8)  };
  }
  if (gross >= 0.40) return { score: 7, label: 'Слабый чистый OI, gross высокий — частичное участие', comment: _b1Comment(7) };
  if (gross >= 0.20) {
    if (vq !== 'weak') return { score: 6, label: 'Слабый OI, ресурс есть, признаки участия',          comment: _b1Comment(6) };
    return                    { score: 4, label: 'Слабый OI, ресурс ограничен, объём без участия',     comment: _b1Comment(4) };
  }
  if (imb_range_pct < 0.15) return { score: 3, label: 'Минимальный ресурс, FVG малый',    comment: _b1Comment(3) };
  if (imb_range_pct <= 0.40) return { score: 2, label: 'Минимальный ресурс, FVG средний', comment: _b1Comment(2) };
  return                            { score: 1, label: 'Минимальный ресурс, FVG большой',  comment: _b1Comment(1) };
}

// ── Блок 2 — OI Placement (11 pts) ───────────────────────────
function _scoreBlock2(mx) {
  const gross = mx.gross_oi ?? 0;
  if (gross === 0) return { score: 0, label: 'Нет нового OI', comment: _b2Comment(0) };

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

  return {
    score,
    label:   `Зона: ${(combined * 100).toFixed(0)}%, в FVG: ${(fvg * 100).toFixed(0)}%`,
    comment: _b2Comment(score),
  };
}

// ── Блок 3 — OI Retention (13 pts) ───────────────────────────
function _scoreBlock3(mx) {
  const gross   = mx.gross_oi      ?? 0;
  const net     = mx.net_oi        ?? 0;
  const shareFvg= mx.share_fvg     ?? 0;
  const exitPre = mx.exit_pre_fvg  ?? 0;
  const exitFvg = mx.exit_in_fvg   ?? 0;

  if (gross === 0) return { score: 0, label: 'Нет нового OI', comment: _b3Comment(0, 'none'), scenario: 'none' };

  const hasExits         = (exitPre + exitFvg) > 0.03;
  const buildInFvg       = shareFvg >= 0.50;
  const exitInFvgDominant = exitFvg >= exitPre;

  let scenario;
  if (!hasExits)                           scenario = 'no_exit';
  else if (buildInFvg && exitInFvgDominant) scenario = 'fvg_fvg';
  else if (!buildInFvg && exitInFvgDominant) scenario = 'pre_fvg';
  else                                     scenario = 'early_exit';

  let score;
  if (scenario === 'no_exit') {
         if (net >= 0.40) score = 13;
    else if (net >= 0.20) score = 11;
    else if (net >= 0.10) score =  7;
    else                  score =  4;
  } else if (scenario === 'fvg_fvg') {
         if (net >= 0.40) score = 13;
    else if (net >= 0.20) score = 11;
    else if (net >= 0.10) score =  6;
    else if (net >= 0.03) score =  3;
    else                  score =  1;
  } else if (scenario === 'pre_fvg') {
         if (net >= 0.40) score = 11;
    else if (net >= 0.20) score =  9;
    else if (net >= 0.10) score =  6;
    else                  score =  3;
  } else { // early_exit
         if (net >= 0.40) score =  9;
    else if (net >= 0.20) score =  7;
    else if (net >= 0.10) score =  4;
    else                  score =  2;
  }

  const scenarioLabel = {
    no_exit:    'снятий нет — ресурс полный',
    fvg_fvg:   'набор и снятие в зоне FVG',
    pre_fvg:   'набор до зоны, снятие в FVG',
    early_exit: 'набор до зоны, снятие до FVG',
  }[scenario];

  return {
    score,
    label:    `net_oi: ${net}% · ${scenarioLabel}`,
    comment:  _b3Comment(score, scenario),
    scenario,
  };
}

// ── Блок 4 — Механика захвата (16 pts) ───────────────────────
function _scoreBlock4(mx, det) {
  const { direction } = det;
  const { inv } = mx;

  const bodyPct   = inv.body_pct   ?? 0;
  const clvPct    = inv.clv_pct    ?? 0;
  const cvdPct    = inv.cvd_pct    ?? 0;
  const cvdSign   = inv.cvd_sign   ?? null;
  const cvdSmall  = inv.cvd_small  ?? false;
  const doiPct    = inv.doi_pct    ?? 0;
  const oiGrowing = doiPct > 0;

  if (cvdSign == null) {
    const score = oiGrowing ? 5 : 3;
    return {
      score,
      label:    'CVD данные отсутствуют — оценка по OI',
      comment:  'CVD данные отсутствуют — механика захвата определяется только по OI.',
      scenario: 'no_cvd',
    };
  }

  const strongBody = bodyPct >= 50 && Math.abs(clvPct) >= 60;
  const cvdWithDir = _cvdWithDir(cvdSign, direction);
  const cvdAgainst = direction === 'long'
    ? (cvdSign === -1 || cvdSign === 'negative')
    : (cvdSign ===  1 || cvdSign === 'positive');
  const cvdStrong  = !cvdSmall && Math.abs(cvdPct) >= 0.30;
  const cvdNeutral = cvdSmall || Math.abs(cvdPct) < 0.10;

  // Инверсия через сопротивление: сильный CVD в сторону + слабое тело
  // Проверяем ДО "Рыночной инициативы" — иначе та перехватывает все cvdWithDir+oiGrowing
  if (bodyPct < 35 && cvdStrong && cvdWithDir) {
    const score = oiGrowing ? 11 : 9;
    return {
      score,
      label:    'Инверсия через сопротивление',
      comment:  'Продавцы стояли стеной, но цена продавила — CVD высокий, тело слабое. Сопротивление поглощено.',
      scenario: 'resistance',
    };
  }

  // Рыночная инициатива: CVD в сторону + OI растёт (тело нормальное)
  if (cvdWithDir && oiGrowing) {
    const score = strongBody && cvdStrong ? 13
                : strongBody              ? 12
                :                           11;
    return {
      score,
      label:    'Рыночная инициатива',
      comment:  'Покупатели шли открыто — CVD и цена в одну сторону, OI рос. Прямое направленное давление.',
      scenario: 'initiative',
    };
  }

  // Возможный хедж: OI растёт, тело крошечное, CVD нейтральный (НЕ против)
  // Проверяем ДО поглощения — иначе cvdNeutral+oiGrowing уходит туда
  if (oiGrowing && bodyPct < 20 && cvdNeutral && !cvdAgainst) {
    return {
      score:    2,
      label:    'Возможный хедж',
      comment:  'OI рос, но цена почти стояла, CVD смешанный. Возможно хеджирование, а не направленная позиция.',
      scenario: 'hedge',
    };
  }

  // Лимитное поглощение: CVD против или нейтрал + OI растёт
  if ((cvdAgainst || cvdNeutral) && oiGrowing) {
    const score = cvdAgainst && cvdStrong && strongBody ? 16
                : cvdAgainst && cvdStrong               ? 15
                : strongBody                            ? 14
                :                                         13;
    return {
      score,
      label:    'Лимитное поглощение',
      comment:  'Лимитный покупатель поглощал продажи — CVD давил, но цена шла вверх. Крупный участник скрытно набирал позицию.',
      scenario: 'absorption',
    };
  }

  // Пустое движение: нет CVD, нет OI
  if (Math.abs(cvdPct) < 0.10 && !oiGrowing) {
    return {
      score:    2,
      label:    'Пустое движение',
      comment:  'Имбаланс пройден без объёмного и позиционного участия. Ни CVD, ни OI не подтвердили.',
      scenario: 'empty',
    };
  }

  // Движение без позиции (fallback)
  const score = cvdStrong ? 6 : oiGrowing ? 5 : 4;
  return {
    score,
    label:    'Движение без позиции',
    comment:  'Цена прошла имбаланс при слабом CVD и без прироста позиций. Движение есть, структуры нет.',
    scenario: 'no_position',
  };
}

// ── Блок 5 — Re-Auction (13 pts) ─────────────────────────────
function _scoreBlock5(mx, det) {
  const { fvg_volume_share, fvgCandles } = mx;
  const { singleCandleInversion, direction } = det;
  const candleCount = fvgCandles.length;

  if (singleCandleInversion || candleCount === 0) {
    const c   = fvgCandles[0] ?? mx.inv;
    const doi = c?.doi_pct    ?? 0;
    const cvdOk = _cvdWithDir(c?.cvd_sign ?? null, direction);
    const score = doi > 0 && cvdOk ? 7 : doi > 0 ? 5 : 3;
    return {
      score,
      label:   'Инверсия однослайновая — объёмное распределение нерелевантно',
      comment: 'Зона пройдена одной свечой — оценить распределение внутри невозможно.',
    };
  }

  const volThreshold = candleCount >= 3 ? 0.50 : 0.70;
  const volStrong    = (fvg_volume_share ?? 0) >= volThreshold;

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
    return {
      score:   Math.min(score, 7),
      label:   `1 свеча в FVG, объём: ${volStrong ? 'высокий' : 'низкий'}, CVD: ${cvdMode}`,
      comment: _b5Comment(volStrong, cvdMode),
    };
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
    return {
      score:   Math.min(score, 9),
      label:   `2 свечи в FVG, объём: ${volStrong ? 'высокий' : 'низкий'}, CVD: ${eff}`,
      comment: _b5Comment(volStrong, eff),
    };
  }

  // ≥ 3 свечей
  let score;
  if      (volStrong && cvdMode === 'confirmed') score = 12;
  else if (volStrong && cvdMode === 'neutral')   score = 10;
  else if (volStrong && cvdMode === 'against')   score =  8;
  else if (!volStrong && cvdMode === 'confirmed')score =  7;
  else if (!volStrong && cvdMode === 'neutral')  score =  5;
  else                                           score =  3;

  return {
    score,
    label:   `${candleCount} свечи в FVG, объём: ${volStrong ? 'высокий' : 'низкий'}, CVD: ${cvdMode}`,
    comment: _b5Comment(volStrong, cvdMode),
  };
}

// ── Блок 6 — Geometry (8 pts) ────────────────────────────────
function _scoreBlock6(mx, det) {
  const { oiCandles } = mx;
  const { direction } = det;

  if (!oiCandles || oiCandles.length === 0) {
    return { score: 4, label: 'Нет данных по геометрии', comment: _b6Comment(4, null), flag: null };
  }

  let tailSum = 0, bodySum = 0, n = 0;
  for (const c of oiCandles) {
    const tail = direction === 'long' ? (c.upper_tail_pct ?? 0) : (c.lower_tail_pct ?? 0);
    tailSum += tail;
    bodySum += c.body_pct ?? 0;
    n++;
  }
  const avgTail = n > 0 ? tailSum / n : 0;
  const avgBody = n > 0 ? bodySum / n : 0;

  const label = `Ср. тело: ${avgBody.toFixed(0)}%, ср. хвост риска: ${avgTail.toFixed(0)}%`;

  if (avgTail > 50) {
    return {
      score:   2,
      label:   'Кульминационный хвост: повышен риск глубокого теста',
      comment: _b6Comment(2, 'high_tail_risk'),
      flag:    'high_tail_risk',
    };
  }

  let score;
  if      (avgBody >= 55 && avgTail <= 15) score = 8;
  else if (avgBody >= 45 && avgTail <= 20) score = 7;
  else if (avgBody >= 35 && avgTail <= 25) score = 6;
  else if (avgBody >= 25 && avgTail <= 30) score = 5;
  else if (avgBody >= 20)                  score = 4;
  else if (avgTail <= 40)                  score = 3;
  else                                     score = 2;

  return { score, label, comment: _b6Comment(score, null), flag: null };
}

// ── Блок 8 — Skew (7 pts) ────────────────────────────────────
function _scoreBlock8(det, mx) {
  const { skew_depth, direction, pivot, inversion } = det;
  const ipZone    = mx?.ip_zone ?? null;
  const stopFlags = [];

  const ip = inversion.implied_price;
  if (ip != null) {
    if (direction === 'long'  && ip < pivot.value) stopFlags.push('implied_price < pivot_low');
    if (direction === 'short' && ip > pivot.value) stopFlags.push('implied_price > pivot_high');
  }
  if (stopFlags.length > 0) {
    return { score: 0, label: 'Аномальный Skew — СТОП', comment: _b8Comment(0, 'critical'), stopFlags };
  }

  if (skew_depth == null) {
    return { score: 4, label: 'implied_price отсутствует — нейтральная оценка', comment: _b8Comment(4, null), stopFlags: [] };
  }
  const sd = skew_depth;
  let score;
  if      (sd <= 0.00) score = 7;
  else if (sd <= 0.15) score = 6;
  else if (sd <= 0.33) score = 5;
  else if (sd <= 0.50) score = 4;
  else if (sd <= 0.75) score = 3;
  else if (sd <= 1.00) score = 2;
  else if (sd <= 1.20) score = 1;
  else                 score = 0;

  const zoneLabel = { strong: 'верхняя FVG', weak: 'нижняя FVG', outside: 'ниже FVG', critical: 'ниже Pivot' }[ipZone] || '';
  const label = `skew_depth: ${sd.toFixed(3)}${zoneLabel ? ` · ${zoneLabel}` : ''}`;
  return { score, label, comment: _b8Comment(score, ipZone), stopFlags: [] };
}

// ── Блок 9 — H1 Snapshot (18 pts) ────────────────────────────
function _scoreBlock9(mx, direction) {
  const { h1_candle_count, h1_doi_pct, h1_liqshare_pct, h1_limb_pct, h1_cvd_sign } = mx;

  if (!h1_candle_count) {
    return {
      score:    7,
      label:    'H1 данные не найдены — нейтральная оценка',
      comment:  'H1 нейтрален — ни значимых ликвидаций, ни уверенного OI. Подтверждения нет.',
      stopFlag: false,
    };
  }

  const liq = h1_liqshare_pct ?? 0;
  const doi = h1_doi_pct      ?? 0;

  let score, label, comment, stopFlag = false;

  if (liq < 2) {
    if (doi >= 0.20) {
      score = 18; label = 'Чистый рост: новый OI без стопов';
      comment = 'H1 чистый — новый OI без ликвидаций. Старший таймфрейм полностью подтверждает.';
    } else if (doi >= 0) {
      score = 13; label = 'Слабый рост: OI почти не появился';
      comment = 'Слабый прирост OI без ликвидаций. H1 нейтрален — прямого подтверждения нет.';
    } else {
      score = 5; label = 'OI уходит, H1 не поддерживает';
      comment = 'OI на H1 снижался — старший таймфрейм не поддерживает инверсию.';
    }
  } else if (liq < 5) {
    if (doi >= 0.20) {
      if (_limbAgainst(h1_limb_pct, direction)) {
        score = 14; label = 'Чужие стопы помогли + OI вошёл';
        comment = 'Ликвидации прошли против инверсии, после чего OI вырос. H1 поддерживает.';
      } else {
        score = 11; label = 'Встряска + OI удержался';
        comment = 'Ликвидации были, но OI удержался. Встряска поглощена.';
      }
    } else {
      score = 7; label = 'H1 нейтрален, подтверждения нет';
      comment = 'H1 нейтрален — ни значимых ликвидаций, ни уверенного OI. Подтверждения нет.';
    }
  } else if (liq < 10) {
    if (doi >= 0.20) {
      if (_limbAgainst(h1_limb_pct, direction)) {
        score = 13; label = 'Выбитые стопы + новый OI';
        comment = 'Ликвидации прошли против инверсии, после чего OI вырос. H1 поддерживает.';
      } else {
        score = 11; label = 'Паника в зоне + OI удержался';
        comment = 'Ликвидации были, но OI удержался. Встряска поглощена.';
      }
    } else if (doi >= 0) {
      score = 7; label = 'Ликвидации без роста OI';
      comment = 'H1 нейтрален — ни значимых ликвидаций, ни уверенного OI. Подтверждения нет.';
    } else {
      score = 4; label = 'Ликвидации + OI снижается';
      comment = 'Ликвидации без нового OI. Рынок чистился, позиция не набиралась.';
    }
  } else {
    if (doi >= 0.20) {
      score = 14; label = 'Сильные ликвидации + OI набирается';
      comment = 'Ликвидации прошли против инверсии, после чего OI вырос. H1 поддерживает.';
    } else if (doi >= 0) {
      score = 2; label = 'Высокая доля стопов, OI не растёт';
      comment = 'Высокие ликвидации без нового OI. Давление есть, живого интереса нет.';
    } else {
      score = 0; label = 'Вынос стопов без живого интереса — СТОП'; stopFlag = true;
      comment = 'Ликвидации против инверсии без нового OI. H1 прямо противоречит.';
    }
  }

  // CVD уточнение ±2 при пограничных значениях
  if (h1_cvd_sign !== 0 && score > 0 && score < 18) {
    const borderDoi = doi >= 0.17 && doi < 0.25;
    const borderLiq = (liq >= 1.5 && liq < 2.5) || (liq >= 4.5 && liq < 5.5) || (liq >= 9.5 && liq < 10.5);
    if (borderDoi || borderLiq) {
      const cvdBonus = _cvdWithDir(h1_cvd_sign, direction) ? 2 : -2;
      score = Math.max(0, Math.min(18, score + cvdBonus));
      comment += cvdBonus > 0
        ? ' H1 CVD подтверждает — скорректировано вверх.'
        : ' H1 CVD против — скорректировано вниз.';
    }
  }

  return { score, label, comment, stopFlag };
}

// ── Стоп-флаги ────────────────────────────────────────────────
function _stopFlags(b, mx, det) {
  const flags = [];

  if ((mx.gross_oi ?? 0) < 0.05 && (mx.fvg_volume_share ?? 0) < 0.20 && (mx.h1_doi_pct ?? 0) < 0.10) {
    flags.push('Пустая инверсия: нет OI, нет объёма, H1 не подтверждает');
  }
  if (b.block3.score <= 2 && (mx.fvg_volume_share ?? 0) < 0.25 && (mx.gross_oi ?? 0) > 0) {
    flags.push('Слабый OI без передачи риска');
  }
  if ((mx.fvg_volume_share ?? 0) < 0.15 && (mx.gross_oi ?? 0) >= 0.05 && (mx.gross_oi ?? 0) < 0.20) {
    flags.push('Пустое FVG + слабый общий ресурс');
  }
  for (const f of (b.block8.stopFlags ?? [])) {
    flags.push(`Аномальный Skew: ${f}`);
  }
  if (b.block9.stopFlag) {
    flags.push('H1: вынос стопов без живого интереса');
  }
  const mainFail = [
    b.block1.score <= 4,
    b.block3.score <= 4,
    b.block4.score <= 5,
    b.block9.score <= 5,
  ].filter(Boolean).length;
  if (mainFail >= 3) flags.push('Все основные блоки провалены');

  if (b.block1.score <= 4 && b.block3.score <= 4 && b.block5.score <= 3 && b.block9.score <= 3) {
    flags.push('Системная пустота');
  }

  return flags;
}

// ── Красные флаги ─────────────────────────────────────────────
function _redFlags(b, mx) {
  const flags = [];
  if (b.block1.score <= 4 && b.block3.score <= 4) {
    flags.push('Пустой OI-ресурс: Energy ≤ 4 и OI Retention ≤ 4');
  }
  if (b.block6.flag === 'high_tail_risk') {
    flags.push('Кульминационный хвост: повышен риск глубокого теста');
  }
  if ((mx?.ip_zone) === 'outside') {
    const isWeak = b.block1.score <= 5 || b.block9.score <= 7 || b.total < 45;
    if (isWeak) {
      flags.push('implied_price ниже зоны FVG при слабом сетапе — риск провала уровня');
    } else {
      flags.push('⚠ implied_price ниже зоны FVG — тест может уйти глубже середины');
    }
  }
  if ((mx?.ip_zone) === 'strong' && b.block8.score === 0) {
    flags.push('⚠ Высокий skew: implied_price значительно ниже цены инверсии — тест середины зоны вероятен');
  }
  return flags;
}

// ── Ожидаемый тест ───────────────────────────────────────────
function _expectedTest(b, det, mx) {
  const { upper_fvg, lower_fvg } = det.fvg;
  const pivotVal = det.pivot.value;
  const fvgSize  = upper_fvg - lower_fvg;
  const midFVG   = (upper_fvg + lower_fvg) / 2;
  const ipZone   = mx?.ip_zone ?? null;

  const geo   = b.block6.score;
  const ret   = b.block3.score;
  const h1    = b.block9.score;
  const total = b.total;

  let level, lo, hi, comment;

  // ip_zone overrides — приоритет над score-логикой
  if (ipZone === 'critical') {
    level   = 'Риск провала';
    lo      = Math.round(pivotVal - fvgSize);
    hi      = Math.round(pivotVal);
    comment = 'implied_price ниже Pivot — провал зоны вероятен';
  } else if (ipZone === 'outside') {
    level   = 'Глубокий';
    lo      = Math.round(lower_fvg - fvgSize * 0.5);
    hi      = Math.round(lower_fvg);
    comment = 'implied_price ниже FVG — тест к нижней границе и ниже';
  } else if (ipZone === 'weak') {
    level   = 'Глубокий';
    lo      = Math.round(lower_fvg);
    hi      = Math.round(midFVG);
    comment = 'implied_price в нижней части FVG — тест ожидается вглубь зоны';
  } else if (total >= 76 && geo >= 6 && h1 >= 13) {
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
  } else if (total >= 30) {
    level   = 'К Pivot';
    lo      = Math.round(pivotVal);
    hi      = Math.round(lower_fvg);
    comment = 'Риск глубокого ретеста к уровню Pivot';
  } else {
    level   = 'Риск провала';
    lo      = Math.round(pivotVal - fvgSize);
    hi      = Math.round(pivotVal);
    comment = 'Ресурса нет — ожидается провал ниже Pivot';
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

// ── Итоговое заключение ──────────────────────────────────────

const _MECH_INTRO = {
  absorption: {
    strong:   'Крупный участник поглощал рыночные продажи незаметно — CVD давил, цена шла вверх.',
    working:  'Признаки поглощения — CVD противоречил движению, OI накапливался. Скрытая работа крупного участника.',
    standard: 'Частичное поглощение — CVD давил, но OI набирался нестабильно.',
    weak:     'Намёки на поглощение без уверенного набора позиции.',
  },
  initiative: {
    strong:   'Покупатели шли открыто — прямое давление без скрытого поглощения.',
    working:  'Направленное давление покупателей, CVD и OI в одну сторону.',
    standard: 'Рыночная инициатива присутствует, но ресурс под ней ограничен.',
    weak:     'CVD и OI в одну сторону, но накопление слабое.',
  },
  resistance: {
    strong:   'Продавцы сопротивлялись — CVD был высоким, но цена продавила. Сопротивление поглощено с ресурсом.',
    working:  'Зона прошла через сопротивление продавцов — CVD давил против, но инверсия состоялась.',
    standard: 'Инверсия через сопротивление — движение было, ресурс под ним умеренный.',
    weak:     'Цена прошла зону вопреки давлению, OI слабый.',
  },
  no_position: {
    strong:   'Цена прошла имбаланс без явной структуры.',
    working:  'Цена прошла имбаланс без явной структуры.',
    standard: 'Инверсия прошла технически, без явного драйвера.',
    weak:     'Инверсия прошла технически, без явного драйвера.',
  },
  empty: {
    strong:   'Имбаланс пройден без объёмного и позиционного участия.',
    working:  'Имбаланс пройден без объёмного и позиционного участия.',
    standard: 'Инверсия прошла технически, без явного драйвера. OI не подтвердил.',
    weak:     'Инверсия прошла технически, без явного драйвера. OI не подтвердил.',
  },
  hedge: {
    strong:   'OI рос при почти стоячей цене — возможно хеджирование, а не направленная позиция.',
    working:  'OI рос при почти стоячей цене — возможно хеджирование, а не направленная позиция.',
    standard: 'OI рос при почти стоячей цене — возможно хеджирование, а не направленная позиция.',
    weak:     'OI рос при почти стоячей цене — возможно хеджирование, а не направленная позиция.',
  },
  no_cvd: {
    strong:   'CVD данные недоступны — оценка только по OI.',
    working:  'CVD данные недоступны — оценка только по OI.',
    standard: 'CVD данные недоступны — оценка только по OI.',
    weak:     'CVD данные недоступны — оценка только по OI.',
  },
};

const _PROB = {
  'Сильный сетап':        'Вероятность отработки высокая.',
  'Рабочий сетап':        'Вероятность отработки выше среднего.',
  'Стандартная инверсия': 'Вероятность отработки умеренная.',
  'Ослабленная инверсия': 'Вероятность отработки низкая.',
};

function _buildConclusion(b, det, mx, sc) {
  if (sc.verdict === 'Не брать') {
    if (sc.stopFlags.length > 0 && sc.total >= 60) {
      return `Сетап технически сильный (${sc.total}/100), вход заблокирован стоп-флагом: ${sc.stopFlags.join('; ')}.`;
    }
    return 'Инверсия без ресурса — OI слабый, разгрузка прошла, объём не подтвердил зону. Движение есть, но позиции под ним нет. Не брать.';
  }

  const tierMap = {
    'Сильный сетап':        'strong',
    'Рабочий сетап':        'working',
    'Стандартная инверсия': 'standard',
    'Ослабленная инверсия': 'weak',
  };
  const tier     = tierMap[sc.verdict] || 'standard';
  const scenario = b.block4.scenario   || 'no_position';

  // Часть 1 — механика
  const intro = (_MECH_INTRO[scenario] || _MECH_INTRO.no_position)[tier];

  // Часть 2 — что подтверждает + вероятность
  const oiPart  = b.block1.score >= 10 ? 'OI набран полностью'
                : b.block1.score >=  7 ? 'OI набран умеренно'
                : 'OI слабый';
  const retPart = b.block3.score >= 11 ? 'ресурс OI сохранён'
                : b.block3.score >=  7 ? 'ресурс частично снят'
                : 'ресурс OI разгружен';
  const zoneParts = [];
  if (b.block2.score >= 9) zoneParts.push('зона принята с объёмом');
  if (b.block5.score >= 8) zoneParts.push('аукцион подтверждён');
  const confirmStr = [oiPart, retPart, ...zoneParts].join(', ') + '.';

  let h1Str;
  if      (b.block9.score >= 13) h1Str = 'H1 подтверждает без оговорок.';
  else if (b.block9.score >= 11) h1Str = 'H1 поддерживает.';
  else if (b.block9.score >=  8) h1Str = 'H1 нейтрален — подтверждения старшего таймфрейма нет.';
  else                           h1Str = 'H1 не подтверждает.';

  const prob = _PROB[sc.verdict] || '';

  // Часть 3 — риски по приборам
  const risks = [];
  const _ipz = mx?.ip_zone ?? null;
  if (_ipz === 'outside')       risks.push('implied_price ниже зоны FVG — тест к нижней границе');
  else if (_ipz === 'weak')     risks.push('implied_price в нижней части FVG — тест вглубь зоны');
  else if (_ipz === 'strong' && b.block8.score === 0) risks.push('Высокий skew при хорошей позиции — тест середины зоны возможен');
  else if (_ipz == null && b.block8.score <= 3)       risks.push('skew высокий — implied_price далеко от инверсии, тест вглубь зоны вероятен');
  if (b.block5.score <= 4)                              risks.push('зона не принята — возможен повторный проход');
  if (b.block3.score <= 5)                              risks.push('позиция слабо удержана — защиты мало');
  if (b.block6.flag === 'high_tail_risk')               risks.push('кульминационные хвосты — риск выноса');
  if (b.block9.score <= 7)                              risks.push('старший таймфрейм не подтверждает');
  if (['no_position', 'empty'].includes(scenario))      risks.push('механика захвата не работает');

  const riskStr = risks.length === 0
    ? 'По приборам слабых мест нет.'
    : 'Риски по приборам: ' + risks.join('; ') + '.';

  const et = sc.expectedTest;
  const testStr = `При касании ${et.range} — ${et.comment.charAt(0).toLowerCase() + et.comment.slice(1)}.`;

  return `${intro} ${confirmStr} ${h1Str} ${prob} ${riskStr} ${testStr}`.trim();
}

// ─────────────────────────────────────────────
// Главная функция скоринга
// ─────────────────────────────────────────────
function computeScore(m15, h1, det, mx) {
  const block1 = _scoreBlock1(mx, det);
  const block2 = _scoreBlock2(mx);
  const block3 = _scoreBlock3(mx);
  const block4 = _scoreBlock4(mx, det);
  const block5 = _scoreBlock5(mx, det);
  const block6 = _scoreBlock6(mx, det);
  const block8 = _scoreBlock8(det, mx);
  const block9 = _scoreBlock9(mx, det.direction);

  const total = block1.score + block2.score + block3.score + block4.score
              + block5.score + block6.score + block8.score + block9.score;

  const blocks = { block1, block2, block3, block4, block5, block6, block8, block9, total };

  const stopFlags    = _stopFlags(blocks, mx, det);
  const redFlags     = _redFlags(blocks, mx);
  const verdict      = _verdict(total, stopFlags);
  const expectedTest = _expectedTest(blocks, det, mx);

  const sc         = { blocks, total, stopFlags, redFlags, verdict, expectedTest };
  const conclusion = _buildConclusion(blocks, det, mx, sc);

  return { blocks, total, stopFlags, redFlags, verdict, expectedTest, conclusion };
}
