'use strict';

// ─────────────────────────────────────────────
// SMS LOG — сбор тестового материала по формации СМС
// ─────────────────────────────────────────────

const STORAGE_KEY = 'sms_test_setups';

const DIR_LABEL   = { long: 'LONG', short: 'SHORT' };
const RESULT_LABEL = { take: 'тейк', stop: 'стоп' };
const TAG_TYPES = ['sweep', 'imbalance', 'ob'];

function _getAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function _saveAll(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function _showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.style.display = 'block';
  document.getElementById('okBox').style.display = 'none';
}

function _showOk(msg) {
  const box = document.getElementById('okBox');
  box.textContent = msg;
  box.style.display = 'block';
  document.getElementById('errorBox').style.display = 'none';
  setTimeout(() => { box.style.display = 'none'; }, 2500);
}

function _clearMessages() {
  document.getElementById('errorBox').style.display = 'none';
  document.getElementById('okBox').style.display = 'none';
}

// ── Переключение полей по результату ──────────────────────────
function onResultChange() {
  const v = document.getElementById('result').value;
  document.getElementById('takeFields').style.display = v === 'take' ? 'block' : 'none';
  document.getElementById('stopFields').style.display = v === 'stop' ? 'block' : 'none';
}
document.getElementById('result').addEventListener('change', onResultChange);

// ── Сбор и валидация формы ─────────────────────────────────────
function _val(id) { return document.getElementById(id).value.trim(); }

// Собирает отмеченные типы (снятие/имба/ОВ) с их ТФ для Хай-1 или Лой-1.
// Можно отметить несколько сразу — например снятие на H4 и тест имбы на Д одновременно.
// noneId — id чекбокса "без старшего контекста", если он отмечен, требование
// хотя бы одного пункта снимается и тэги сохраняются пустыми.
function _collectTags(prefix, label, noneId) {
  if (noneId && document.getElementById(noneId).checked) {
    return { tags: [], none: true };
  }
  const tags = [];
  for (const type of TAG_TYPES) {
    const chk = document.getElementById(`${prefix}_${type}_chk`);
    if (chk && chk.checked) {
      const tf = document.getElementById(`${prefix}_${type}_tf`).value;
      if (!tf) return { error: `Укажи ТФ для отмеченного пункта у ${label}.` };
      tags.push({ type, tf });
    }
  }
  if (!tags.length) return { error: `Отметь хотя бы один пункт для ${label}.` };
  return { tags, none: false };
}

// Хай-1 "без старшего контекста" — отменяет и блокирует остальные пункты Хай-1.
function onH1NoneChange() {
  const none = document.getElementById('h1_none_chk').checked;
  for (const type of TAG_TYPES) {
    const chk = document.getElementById(`h1_${type}_chk`);
    const tf  = document.getElementById(`h1_${type}_tf`);
    if (none) { chk.checked = false; tf.value = ''; }
    chk.disabled = none;
    tf.disabled  = none;
  }
}

function _collectSetup() {
  const candlesText = document.getElementById('candles').value;
  const candles = parseCandles(candlesText);
  if (!candles.length) {
    return { error: 'Свечи не распознаны — проверь формат вставленного блока.' };
  }

  const direction   = _val('direction');
  const trend       = _val('trend');
  const breakType   = _val('breakType');
  const result      = _val('result');

  if (!direction) return { error: 'Укажи направление сетапа.' };
  if (!trend)     return { error: 'Укажи тренд.' };

  const h1Res = _collectTags('h1', 'Хай-1', 'h1_none_chk');
  if (h1Res.error) return { error: h1Res.error };
  const l1Res = _collectTags('l1', 'Лой-1');
  if (l1Res.error) return { error: l1Res.error };

  if (!breakType) return { error: 'Укажи тип слома.' };
  if (!result)    return { error: 'Укажи результат (тейк/стоп).' };

  const setup = {
    saved_at:  new Date().toISOString(),
    direction, trend,
    h1_tags: h1Res.tags,
    h1_no_context: h1Res.none || false,
    l1_tags: l1Res.tags,
    break_type: breakType,
    result,
    rr: null, retrace: null, retrace_price: null,
    invalidation_type: null,
    comment: _val('comment') || null,
    candles,
    raw_text: candlesText,
  };

  if (result === 'take') {
    const rrRaw = _val('rr');
    const retrace = _val('retrace');
    if (!rrRaw)   return { error: 'Укажи Р:Р для тейка.' };
    if (!retrace) return { error: 'Укажи откат для тейка.' };
    const rr = parseFloat(rrRaw.replace(',', '.'));
    if (isNaN(rr)) return { error: 'Р:Р должно быть числом.' };
    setup.rr = rr;
    setup.retrace = retrace;

    if (retrace === 'none') {
      setup.retrace_price = null;
    } else {
      const retracePriceRaw = _val('retracePrice');
      if (!retracePriceRaw) return { error: 'Укажи цену отката.' };
      const retracePrice = parseFloat(retracePriceRaw.replace(',', '.'));
      if (isNaN(retracePrice)) return { error: 'Цена отката должна быть числом.' };
      setup.retrace_price = retracePrice;
    }
  } else {
    const invType = _val('invalidationType');
    if (!invType) return { error: 'Укажи тип инвалидации для стопа.' };
    setup.invalidation_type = invType;
  }

  return { setup };
}

// ── Сохранение ──────────────────────────────────────────────────
function saveSetup() {
  _clearMessages();
  const { setup, error } = _collectSetup();
  if (error) { _showError(error); return; }

  const all = _getAll();
  all.push(setup);
  _saveAll(all);

  _clearForm();
  renderList();
  _showOk(`Сохранено. Всего в базе: ${all.length}.`);
}

function _clearForm() {
  document.getElementById('candles').value = '';
  ['direction','trend','breakType','result',
   'rr','retrace','retracePrice','invalidationType'].forEach(id => {
    document.getElementById(id).value = '';
  });
  for (const prefix of ['h1', 'l1']) {
    for (const type of TAG_TYPES) {
      document.getElementById(`${prefix}_${type}_chk`).checked = false;
      document.getElementById(`${prefix}_${type}_tf`).value = '';
    }
  }
  document.getElementById('h1_none_chk').checked = false;
  onH1NoneChange();
  document.getElementById('comment').value = '';
  onResultChange();
}

// ── Удаление / скачивание одного сетапа ─────────────────────────
function deleteOne(index) {
  const all = _getAll();
  if (index < 0 || index >= all.length) return;
  if (!confirm('Удалить этот сетап?')) return;
  all.splice(index, 1);
  _saveAll(all);
  renderList();
  _showOk(`Удалено. Осталось: ${all.length}.`);
}

function exportOne(index) {
  const all = _getAll();
  const s = all[index];
  if (!s) return;
  const date = s.saved_at ? s.saved_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `sms_setup_${date}_${s.direction || 'unknown'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Список сохранённых ──────────────────────────────────────────
function renderList() {
  const all = _getAll();
  document.getElementById('countLabel').textContent = String(all.length);
  const listEl = document.getElementById('setupList');

  if (!all.length) {
    listEl.innerHTML = '<div class="empty-hint">Пока ничего не сохранено.</div>';
    return;
  }

  const rows = all.map((s, i) => ({ s, i })).reverse();
  listEl.innerHTML = rows.map(({ s, i }) => {
    const date = s.saved_at ? s.saved_at.slice(0, 16).replace('T', ' ') : '?';
    const dirClass = s.direction === 'long' ? 'dir-long' : 'dir-short';
    const resClass = s.result === 'take' ? 'res-take' : 'res-stop';
    const resText = RESULT_LABEL[s.result] || s.result;
    const extra = s.result === 'take' ? ` · РР ${s.rr}` : ` · ${s.invalidation_type === 'structure' ? 'структура' : 'вершина'}`;
    return `<div class="setup-item">
      <div class="info">
        <span>${date} · <span class="${dirClass}">${DIR_LABEL[s.direction] || s.direction}</span></span>
        <span class="${resClass}">${resText}${extra}</span>
      </div>
      <div class="item-actions">
        <button class="mini-btn" onclick="exportOne(${i})" title="Скачать">⭳</button>
        <button class="mini-btn mini-btn-del" onclick="deleteOne(${i})" title="Удалить">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Экспорт ──────────────────────────────────────────────────────
function exportAll() {
  const all = _getAll();
  if (!all.length) { _showError('Нет сохранённых сетапов.'); return; }
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `sms_setups_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Init ───────────────────────────────────────────────────────
renderList();
