# BTC M15 FVG Inversion Algorithm — Project Context

## Что это за проект

Веб-приложение (standalone HTML + JS, без бэкенда) для анализа торговой формации "инверсия FVG" на таймфрейме M15 фьючерсов BTCUSDT Perpetual (Binance).

**Цель:** пользователь находит инверсию на графике, вставляет данные свечей в приложение, получает детерминированный отчёт о качестве инверсии — без субъективности.

**НЕ является:** торговым советником, сигнальным ботом, авто-трейдером.

## GitHub репозиторий

`https://github.com/sueakoo/btc-m15-fvg-inversion` (приватный)
Владелец: sueakoo
Локальная папка: `/Users/motkazver/btc-m15-fvg-inversion/`

## Платформа

- Standalone web app: один HTML файл + один JS файл + один CSS файл
- Работает в браузере (Safari, Chrome) на Mac, iPad, iPhone
- Деплой: GitHub Pages
- Никаких серверов, никакой установки
- Будущее: интеграция Claude API для AI-комментариев

## Ключевые концепции

### Что такое инверсия FVG
- FVG (Fair Value Gap / Имбаланс) = трёхсвечная формация n-1, n, n+1
  - Медвежий FVG: low(n-1) > high(n+1). upper_fvg = low(n-1), lower_fvg = high(n+1)
  - Бычий FVG: high(n-1) < low(n+1). upper_fvg = low(n+1), lower_fvg = high(n-1)
- Инверсия лонг: свеча закрывается телом выше upper_fvg медвежьего FVG (close > upper_fvg)
- Инверсия шорт: свеча закрывается телом ниже lower_fvg бычьего FVG (close < lower_fvg)
- Если close вышел за границу хотя бы на 1 пункт = факт инверсии
- Хвост за границей НЕ считается инверсией

### Ключевые окна анализа
- **Pivot** = разворотная свеча (экстремум перед движением к FVG)
- **OI_window** = свечи после Pivot → свеча инверсии включительно (Pivot НЕ входит)
- **FVG_overlap_window** = только свечи фактического перекрытия FVG
- **H1_window** = H1 свечи, покрывающие тот же период (следующая M15 после Pivot → инверсия)

### H1 данные
- H1 используется для ликвидаций и верификации (M15 ликвидации ненадёжны, часто #N/A)
- Берутся все H1 свечи, чей период пересекается с M15 окном
- Незакрытая H1 берётся как snapshot (данные на текущий момент)
- Количество H1 свечей: переменное, обычно 1-4

### Edge case: single_candle_inversion
- Если FVG перекрыта одной свечой (она же свеча инверсии): Re-Auction анализирует эту свечу
- Флаг `single_candle_inversion = true` выводится в отчёте

## Формат входных данных

Пользователь вставляет текстовые блоки вида:
```
ts: 15.06.2026 17:15
exchange: Binance
symbol: BTCUSDT Perp
tf: 15m
open: 75635.60
high: 75680.10
...
doi_pct: 0.14%
implied_price: 75653.00
avg_trade_buy: 0.03
avg_trade_sell: 0.06
```

Несколько свечей подряд. M15 и H1 вставляются раздельно в разные поля.
Парсер разбивает по `ts:`, определяет TF по полю `tf:`.

### Единицы данных
- `buy_volume` / `sell_volume` = BTC (базовый актив)
- `volume` = USDT (quote volume)
- `oi_open` / `oi_close` = BTC/контракты (не USD)
- `liq_long` / `liq_short` = USDT (ликвидации)
- `doi_pct` = изменение OI в % (ΔOI / OI_prev × 100)
- `implied_price` = OI-взвешенная имплицитная цена (куда тянет позиционирование)
- `cvd_pct` = кумулятивная дельта в % от объёма
- `liqshare_pct` = доля ликвидаций от объёма (в %)
- `limb_pct` = дисбаланс ликвидаций (какая сторона преобладает)

## Архитектура алгоритма — 9 блоков + 100 баллов

### Блоки и веса:
| # | Блок | Баллы |
|---|------|-------|
| 0 | Detection (технический, без баллов) | — |
| 1 | Energy / Энергоёмкость | 15 |
| 2 | OI Placement / Размещение OI | 15 |
| 3 | OI Retention / Сохранение OI | 15 |
| 4 | Capture Mechanics / Механика захвата | 15 |
| 5 | Re-Auction / Повторный аукцион | 10 |
| 6 | Geometry / Геометрия | 8 |
| 7 | Aggression / CVD Structure | 5 |
| 8 | Skew | 7 |
| 9 | H1 Snapshot | 10 |
| **Итого** | | **100** |

### Вердикты по итоговому баллу (предварительные, уточнить при разработке):
- 80–100: Сильный сетап
- 60–79: Рабочий сетап
- 40–59: Условно рабочий
- 20–39: Слабый сетап
- 0–19 или стоп-флаг: Не брать

### Стоп-флаги (6 штук) — любой = "НЕ БРАТЬ":
1. Пустая инверсия (нет OI + нет объёма + H1 не подтверждает)
2. Слабый OI без передачи риска (retention < 0.15, нет объёмной структуры)
3. Пустое FVG + слабый общий ресурс
4. Аномальный Skew против инверсии (skew_depth > 1.0)
5. H1 грязный сквиз (liqshare >= 10% + OI падает + CVD не подтверждает)
6. Все основные блоки одновременно провалены

### Ожидаемый тест:
Строится на основе Skew depth + корректировки от Re-Auction + Geometry + H1.
Уровни: Мелкий / Средний / Глубокий / К Pivot / Риск провала

## Что НЕ входит в текущую версию

- Логика MVP (H4/D sweep, imbalance test, MACD, return) — следующий этап после тестирования этого алгоритма
- ML / AI автоматический анализ — следующий этап
- Сохранение истории сетапов — следующий этап

## Ключевые метрики которые считает алгоритм

```
gross_oi = сумма doi_pct > 0 внутри OI_window
unload_oi = сумма doi_pct < 0 внутри OI_window
net_oi = gross_oi + unload_oi
retention_ratio = net_oi / gross_oi

OI_CoG = центр тяжести положительного doi_pct по порядку свечей
share_A = доля OI в первых свечах после Pivot
share_B = доля OI внутри FVG
share_C = доля OI на финальной свече инверсии

fvg_volume_share = volume_FVG_overlap / post_pivot_volume
final_volume_share = volume_inversion_candle / post_pivot_volume

imb_range_pct = (upper_fvg - lower_fvg) / mid_fvg × 100
skew_depth = (close_inversion - implied_price) / (upper_fvg - lower_fvg)  [для лонга]
           = (implied_price - close_inversion) / (upper_fvg - lower_fvg)  [для шорта]
```

## Статус разработки

- [x] Концепция и алгоритм изучены и задокументированы
- [x] GitHub репо создано
- [ ] Парсер входных данных
- [ ] Detection блок
- [ ] 9 аналитических блоков
- [ ] Scoring engine
- [ ] UI (форма ввода + отчёт)
- [ ] Деплой на GitHub Pages

## Документы-источники

- **M15 FVG Inversion Algorithm — MASTER** (Google Doc ID: `1xJTtKnxeoQFcE4esU_r-_RDjgyN3rCBG2sAijioUupg`) — главный документ алгоритма
- **btc-m15-scoring** (github.com/sueakoo/btc-m15-scoring) — MVP версия (GAS + Sheets), другая более простая логика
- **Метрики таблица** (Google Sheets ID: `1EMOWiPbK7R093J6vr6LS9ViqwCxjRmoqJb_Ln7TPfPo`) — справочник по метрикам и формулам

## Пользователь

- Не технический (0 в разработке) — объяснять просто
- Торгует BTC perpetual futures
- Работает с X-RAY данными (кастомный инструмент, выдаёт все поля включая doi_pct, implied_price и т.д.)
- Использует Mac, iPad, iPhone
- Хочет приватность и простоту использования
