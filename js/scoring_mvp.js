'use strict';

// ─────────────────────────────────────────────
// SCORING EXT — расширенный анализ (MVP)
// ─────────────────────────────────────────────

function _mvpOiRange(netOi) {
  if (netOi == null) return null;
  if (netOi < 0.20) return 'lt02';
  if (netOi < 0.34) return '02_033';
  if (netOi < 0.60) return '034_059';
  if (netOi < 1.00) return '06_099';
  return 'gte1';
}

function _mvpOiType(oiCandles, grossOi) {
  if (!oiCandles || !oiCandles.length || (grossOi ?? 0) <= 0) return null;
  const pos = oiCandles.filter(c => (c.doi_pct ?? 0) > 0);
  if (!pos.length) return null;
  const avg = grossOi / pos.length;
  if (pos.length <= 3) return 'impulse13';
  if (pos.length <= 6) return avg >= 0.07 ? 'cluster46' : 'micro';
  return avg < 0.10 ? 'longMicro' : 'cluster46';
}

function _mvpDist(pivotIdx, invIdx) {
  const d = invIdx - pivotIdx;
  if (d <= 4)  return '1_4';
  if (d <= 25) return '5_25';
  return 'gt25';
}

function _mvpMixed(m) {
  const a = [m.m15, m.h1, m.h2, m.h4, m.d].filter(Boolean);
  return a.includes('long') && a.includes('short');
}

function _mvpAllTf(m, d) { return m.m15===d && m.h1===d && m.h2===d && m.h4===d && m.d===d; }
function _mvpHasSweep(s) { return s==='h4'||s==='d'||s==='w'; }
function _mvpHasImb(i)   { return i==='h4'||i==='d'||i==='w'; }
function _mvpHasOb(o)    { return o==='h4'||o==='dw'; }

// ── Золотой сетап ──────────────────────────────────────────────
function _mvpGolden(ctx) {
  const { score, hasStop, hasSweep, hasImb, hasReturn, direction, setupType, oiRange, oiType, imbalance, m } = ctx;
  const empty = { isGolden: false, type: '', comment: '' };
  if (hasStop || score < 16) return empty;
  const strongOi   = oiRange === '06_099' || oiRange === 'gte1';
  const strongType = oiType === 'impulse13' || oiType === 'cluster46' || oiType === 'longMicro'
                  || (oiType === 'micro' && oiRange === 'gte1');
  if (!strongOi || !strongType) return empty;

  if (setupType === 'counter') {
    const old = direction === 'short' ? 'long' : 'short';
    const sOld = m.h4 === old && m.d === old;
    if (hasSweep && hasReturn && sOld && (imbalance === 'w' || imbalance === 'd'))
      return { isGolden: true, type: 'Золотой контртренд №1 — разворот от W/D-фактора', comment: 'Связка снятия, теста W/D-имбаланса и возврата формирует максимально качественную разворотную структуру при сохранении MACD по старому движению.' };
    if (hasSweep && hasReturn && sOld && imbalance === 'h4')
      return { isGolden: true, type: 'Золотой контртренд №2 — H4-имбаланс + полная связка', comment: 'H4-имбаланс со снятием и возвратом при MACD по старому движению — эталонная контртрендовая структура.' };
  }
  if (setupType === 'trend') {
    if (hasSweep && hasReturn && (imbalance === 'w' || imbalance === 'd'))
      return { isGolden: true, type: 'Золотой тренд №1 — полный трендовый от W/D', comment: 'Инверсия в сторону тренда после снятия + W/D-имбаланс + возврат — эталонная точка продолжения.' };
    if (imbalance === 'w' || imbalance === 'd')
      return { isGolden: true, type: 'Золотой тренд №2 — продолжение от W/D-имбаланса', comment: 'Сильная старшая локация + выраженный OI = качественный переход от отката к тренду.' };
    if (imbalance === 'h4' && hasSweep && hasReturn)
      return { isGolden: true, type: 'Золотой тренд №3 — H4-имбаланс + полная связка', comment: 'H4-имбаланс + снятие + возврат + сильный OI — переход от коррекции к тренду.' };
  }
  return empty;
}

// ── Текстовый вывод ────────────────────────────────────────────
function _mvpSummaryText(ctx) {
  const { score, hasStop, stopReasons, redFlags, verdict,
          hasSweep, hasImb, hasOb, hasReturn, setupType,
          sweep, imbalance, ob, distance, oiRange, oiType, mixed, macdAgrees } = ctx;

  if (hasStop) return 'Сетап не допускается к работе: ' + stopReasons.join('; ') + '.';

  const S = [], L = [];

  if      (imbalance === 'w')  S.push('тест W-имбаланса — самый сильный старший фактор');
  else if (imbalance === 'd')  S.push('тест D-имбаланса — сильный старший фактор');
  else if (imbalance === 'h4') S.push('тест H4-имбаланса даёт структурную опору');
  if      (sweep === 'w')  S.push('снятие W-ликвидности');
  else if (sweep === 'd')  S.push('снятие дневной ликвидности');
  else if (sweep === 'h4') S.push('снятие H4-ликвидности');
  if      (ob === 'dw') S.push('тест OB D/W — сильная локация');
  else if (ob === 'h4') S.push('тест OB H4');
  if (hasSweep && hasImb && hasReturn) S.push('полная связка: снятие + тест имба + возврат');
  else if (hasSweep && hasImb)         S.push('комбо снятие + тест имбаланса');
  if (hasSweep && distance === '1_4')  S.push('быстрая реакция — 1–4 свечи после снятия');
  if      (oiRange === 'gte1')    S.push('OI ≥ 1% — сильный чистый набор');
  else if (oiRange === '06_099')  S.push('OI 0.6–0.99% — заметный набор');
  else if (oiRange === '034_059') S.push('OI 0.34–0.59% — умеренное подтверждение');
  if      (oiType === 'impulse13') S.push('импульсный OI за 1–3 свечи');
  else if (oiType === 'cluster46') S.push('кластер OI 4–6 свечей');
  else if (oiType === 'longMicro') S.push('длинный участок с микронаборами OI');
  if (macdAgrees === true) {
    S.push(setupType === 'trend'
      ? 'Н4/Д MACD совпадает с направлением — старший тренд подтверждает сделку'
      : 'старший тренд (Н4/Д) ещё в прежнюю сторону — контекст для контртренда подходящий');
  }

  if (!hasSweep && hasImb)           L.push('нет снятия — только тест имбаланса');
  if (hasSweep && !hasImb && !hasOb) L.push('есть снятие, но нет теста имбаланса или OB');
  if (hasSweep && distance === '5_25') L.push('дистанция 5–25 свечей — без усиления');
  if (hasSweep && distance === 'gt25') L.push('дистанция > 25 свечей от снятия');
  if (oiRange === '02_033')            L.push('OI в нижней рабочей зоне 0.2–0.33%');
  if (setupType === 'counter' && hasSweep && hasImb && !hasReturn) L.push('нет возврата при контртрендовой модели');
  if (mixed && !hasImb) L.push('смешанный MACD без теста имбаланса');
  redFlags.forEach(f => { if (!L.includes(f)) L.push(f); });

  const vv = verdict.split(' · ')[0];
  const lead = vv === 'СИЛЬНЫЙ СЕТАП'        ? `Сильный сетап: ${score} баллов.`
             : vv === 'РАБОЧИЙ СЕТАП'        ? `Рабочий сетап: ${score} баллов.`
             : vv === 'УСЛОВНО РАБОЧИЙ СЕТАП'? `Условно рабочий: ${score} баллов.`
             : vv === 'СЛАБЫЙ СЕТАП'         ? `Слабый сетап: ${score} баллов.`
             : `Не брать: ${score} баллов.`;

  const sText = S.length
    ? S[0].charAt(0).toUpperCase() + S[0].slice(1) + (S.length > 1 ? '; ' + S.slice(1).join('; ') : '') + '.'
    : 'Существенных усилений не набралось.';

  const lPfx = vv === 'СИЛЬНЫЙ СЕТАП'        ? 'Несмотря на сильный статус: '
             : vv === 'РАБОЧИЙ СЕТАП'        ? 'До сильного не дотягивает: '
             : vv === 'УСЛОВНО РАБОЧИЙ СЕТАП'? 'Сетап условный: '
             : vv === 'СЛАБЫЙ СЕТАП'         ? 'Плюсы не дотягивают: '
             : 'Брать не стоит: ';
  const lText = L.length ? lPfx + L.join('; ') + '.' : 'Критичных ограничений не выявлено.';

  return `${lead} ${sText} ${lText}`;
}

// ── Главная функция ─────────────────────────────────────────────
function computeMvpScore(data, det, mx) {
  const m    = data.macd || {};
  const stop = [], red = [], det2 = [];
  let sc = 0;

  const dir     = det.direction;
  const sType   = data.trend === dir ? 'trend' : 'counter';
  const netOi   = mx.net_oi   ?? 0;
  const grossOi = mx.gross_oi ?? 0;
  const oiRange = _mvpOiRange(netOi);
  const oiType  = _mvpOiType(mx.oiCandles, grossOi);
  const dist    = _mvpDist(det.pivot.idx, det.inversion.idx);
  const sweep   = data.sweep       || 'none';
  const imb     = data.imbalance   || 'none';
  const ob      = data.ob          || 'none';
  const ret     = data.returnLevel || 'no';

  const hSweep = _mvpHasSweep(sweep);
  const hImb   = _mvpHasImb(imb);
  const hOb    = _mvpHasOb(ob);
  const hRet   = ret === 'yes';
  const hAny   = hSweep || hImb || hOb;
  const mixed  = _mvpMixed(m);

  // ── Стоп-факторы ─────────────────────────────────────────────
  if (!hAny)   stop.push('Нет старшего фактора: ни снятия, ни теста имбаланса, ни теста OB');
  if (oiRange === 'lt02') stop.push('Чистый итог OI < 0.2%');
  if (!['m15','h1','h2','h4','d'].every(tf => m[tf]==='long'||m[tf]==='short'))
    stop.push('Не заполнены MACD по всем TF');

  // ── Блок 2 — Старший фактор ──────────────────────────────────
  if      (sweep==='h4') { sc+=2; det2.push('+2 снятие H4'); }
  else if (sweep==='d')  { sc+=4; det2.push('+4 снятие D');  }
  else if (sweep==='w')  { sc+=4; det2.push('+4 снятие W');  }
  if      (imb==='h4')   { sc+=3; det2.push('+3 тест имба H4'); }
  else if (imb==='d')    { sc+=5; det2.push('+5 тест имба D');  }
  else if (imb==='w')    { sc+=5; det2.push('+5 тест имба W');  }
  if      (ob==='h4')    { sc+=2; det2.push('+2 тест OB H4'); }
  else if (ob==='dw')    { sc+=4; det2.push('+4 тест OB D/W'); }
  if (hSweep && hImb)           { sc+=2; det2.push('+2 комбо: снятие + тест имба');   }
  if (hOb && (hSweep || hImb))  { sc+=2; det2.push('+2 комбо: тест OB + фактор');    }

  // ── Блок 3 — Возврат и дистанция ─────────────────────────────
  if (hSweep && hImb && hRet) { sc+=2; det2.push('+2 снятие + имба + возврат'); }
  if (hSweep && dist==='1_4') { sc+=2; det2.push('+2 дистанция 1–4 свечи');    }

  // ── Блок 4 — OI ──────────────────────────────────────────────
  if      (oiRange==='034_059') { sc+=1; det2.push('+1 OI 0.34–0.59%'); }
  else if (oiRange==='06_099')  { sc+=2; det2.push('+2 OI 0.6–0.99%');  }
  else if (oiRange==='gte1')    { sc+=2; det2.push('+2 OI ≥ 1%');       }
  if      (oiType==='impulse13') { sc+=2; det2.push('+2 импульсный 1–3 свечи');     }
  else if (oiType==='cluster46') { sc+=2; det2.push('+2 кластер 4–6 свечей');       }
  else if (oiType==='micro')     { sc+=2; det2.push('+2 микронаборы');              }
  else if (oiType==='longMicro') { sc+=3; det2.push('+3 длинный · микронаборы');    }

  // ── Красные флаги ─────────────────────────────────────────────
  if (oiRange==='02_033')                         red.push('OI в нижней рабочей зоне 0.2–0.33%');
  if (hSweep && dist==='gt25')                    red.push('Дистанция от снятия до инверсии > 25 свечей');
  if (hSweep && !hImb && !hOb)                   red.push('Есть снятие, но нет теста имбаланса или OB');
  if (sType==='counter' && hSweep && hImb && !hRet) red.push('Контртрендовый: нет возврата при снятии + тест имба');
  if (mixed && !hImb)                             red.push('Mixed MACD при отсутствии теста имбаланса');

  // не сводить обратно в sc: иначе один и тот же сетап снова начнёт скакать
  // между "рабочий" и "не брать" от чтения MACD (было 12→5 на реальном кейсе)
  const scFootprint = sc;

  // ── Блок 5 — MACD ─────────────────────────────────────────────
  let macdAgrees = null; // совпадает ли старший MACD-контекст с направлением сделки
  if (sType === 'counter') {
    const old  = dir==='short' ? 'long' : 'short';
    const aOld = _mvpAllTf(m, old);
    const sOld = m.h4===old && m.d===old;
    const jAg  = m.m15 && m.h1 && m.m15!==old && m.h1!==old;
    macdAgrees = sOld;
    if (sOld && hImb)                   { sc+=2; det2.push('+2 старшие MACD по старому + тест имба'); }
    if (aOld && hSweep && hImb && hRet) { sc+=3; det2.push('+3 все MACD по старому + полная связка'); }
    if (jAg && (hSweep || hImb))        { sc+=1; det2.push('+1 M15/H1 против старого + фактор');     }
    if (mixed && hImb)                  { sc+=1; det2.push('+1 mixed MACD + тест имба');              }
    if (mixed && !hImb)                 { sc-=2; det2.push('-2 mixed MACD без теста имба');           }
  }
  if (sType === 'trend') {
    const opp       = dir==='long' ? 'short' : 'long';
    const m15h1Ag   = m.m15===opp && m.h1===opp;
    const m15h1h2Ag = m.m15===opp && m.h1===opp && m.h2===opp;
    const h4dWith   = m.h4===dir  || m.d===dir;
    macdAgrees = h4dWith;
    if (m15h1Ag && (hSweep||hImb) && h4dWith)  { sc+=3; det2.push('+3 M15/H1 против + фактор + H4/D в сторону'); }
    if (m15h1h2Ag && hImb && h4dWith)           { sc+=3; det2.push('+3 M15/H1/H2 против + имба + H4/D');          }
    if (h4dWith)                                { sc+=1; det2.push('+1 H4 или D MACD в сторону сделки');           }
  }

  // Несовпадение MACD со старшим контекстом — полноценный красный флаг
  // (влияет на счётчик "2+ красных флага" и на пометку ОСТОРОЖНО), а не только текст.
  if (macdAgrees === false) {
    red.push(sType === 'trend'
      ? 'Н4/Д MACD против направления — старший тренд ещё не развернулся в твою сторону, риск отката выше'
      : 'Старший тренд на Н4/Д уже развернулся — контекст для контртренда больше не поддерживает, вероятен не откат, а продолжение');
  }

  // ── Вердикт ───────────────────────────────────────────────────
  const hasStop = stop.length > 0;
  let verdict = hasStop || scFootprint < 6 ? 'НЕ БРАТЬ'
    : sc >= 16 ? 'СИЛЬНЫЙ СЕТАП'
    : sc >= 12 ? 'РАБОЧИЙ СЕТАП'
    : sc >= 9  ? 'УСЛОВНО РАБОЧИЙ СЕТАП'
    : 'СЛАБЫЙ СЕТАП';
  if (!hasStop && red.length >= 2) verdict += ' · ОСТОРОЖНО';

  const golden  = _mvpGolden({ score:sc, hasStop, hasSweep:hSweep, hasImb:hImb, hasReturn:hRet, direction:dir, setupType:sType, oiRange, oiType, imbalance:imb, m });
  const summary = _mvpSummaryText({ score:sc, hasStop, stopReasons:stop, redFlags:red, verdict, hasSweep:hSweep, hasImb:hImb, hasOb:hOb, hasReturn:hRet, setupType:sType, sweep, imbalance:imb, ob, distance:dist, oiRange, oiType, mixed, macdAgrees });

  return { score:sc, hasStop, stopReasons:stop, redFlags:red, verdict, details:det2, summary, golden, setupType:sType, oiRange, oiType, distance:dist, netOi };
}

// ── Общий вывод ────────────────────────────────────────────────
function buildCombinedConclusion(sc1, sc2) {
  const v1  = sc1.verdict || '';
  const v2  = (sc2.verdict || '').split(' · ')[0];
  const s1ok = v1 !== 'Не брать' && !(sc1.stopFlags || []).length;
  const s2ok = !sc2.hasStop && v2 !== 'НЕ БРАТЬ';
  const parts = [];

  if (!s1ok && !s2ok) {
    parts.push('Оба анализа дают стоп. Сетап не рабочий ни по структуре, ни по контексту.');
  } else if (s1ok && s2ok) {
    const both = (v1==='Сильный сетап'||v1==='Рабочий сетап') && (v2==='СИЛЬНЫЙ СЕТАП'||v2==='РАБОЧИЙ СЕТАП');
    if (both) parts.push(`Структурный анализ: ${v1}. Контекстуальный: ${v2.toLowerCase()}. Оба подтверждают — совпадение усиливает вероятность отработки.`);
    else      parts.push(`Структурный: ${v1}. Контекстуальный: ${v2.toLowerCase()}. Совпадение частичное — ориентироваться на более слабый из двух.`);
  } else if (!s1ok) {
    parts.push(`Структурный анализ даёт стоп. Контекстуальный рабочий (${v2.toLowerCase()}), но структурный стоп приоритетнее.`);
  } else {
    parts.push(`Структурный анализ рабочий (${v1}), контекстуальный — стоп. Контекст не поддерживает — доверять стопу.`);
  }

  const reinf = [];
  if ((sc1.blocks?.block9?.score ?? 0) >= 13) reinf.push('H1 подтверждает направление');
  if (sc2.golden?.isGolden)                    reinf.push(`золотой сетап: ${sc2.golden.type}`);
  if ((sc1.blocks?.block1?.score ?? 0) >= 12 && sc2.score >= 12) reinf.push('высокий OI-ресурс по обоим анализам');
  if (reinf.length) parts.push('Усиления: ' + reinf.join('; ') + '.');

  const weak = [];
  if ((sc1.redFlags || []).length >= 2)          weak.push('2+ красных флага в структурном анализе');
  if ((sc2.redFlags || []).length >= 2)          weak.push('2+ красных флага в контекстуальном анализе');
  if (sc2.setupType === 'counter')               weak.push('контртрендовый сетап — 1:1 и выход в б/у при первой возможности');
  if ((sc1.blocks?.block4?.score ?? 10) <= 6 && s1ok) weak.push('слабая механика захвата инверсии');
  if (weak.length) parts.push('Ослабления: ' + weak.join('; ') + '.');

  return parts.join(' ');
}
