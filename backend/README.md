# CQA backend (Spring Boot + PostgreSQL)

Java 21+, Spring Boot 3.5, PostgreSQL (схема создаётся сама через Flyway), без JPA: SQL через `JdbcClient`.
Формы JSON совпадают с `frontend/src/shared/api/types.ts` (ID строками, `value/isNa/points/maxPoints`).

## Запуск

1. Создать БД в pgAdmin: `cqa`.
2. `cp .env.example .env` и заполнить (`DB_PASSWORD`, `ORGANIZER_URL`, ключи нужных AI).
3. `mvn spring-boot:run` → `http://localhost:8080/api/...`. Таблицы и чек-лист v1 создадутся при старте.
4. Фронт: `VITE_USE_MOCKS=false`, `VITE_API_BASE_URL=http://localhost:8080/api`.

Без ключей всё работает на провайдере `MOCK` (демо-оценки, `simulated=true`), чтобы фронт можно было подключать сразу.

## Безопасность — что НЕ коммитить

| Что | Почему |
|---|---|
| `backend/.env` | пароль БД, ключи Anthropic / OpenAI / Gemini, `ORGANIZER_URL` |
| `ORGANIZER_URL` в любом виде | содержит `sig=...` — это ключ доступа к API организаторов |
| любые выгрузки JSON организаторов (`dev.json`, `data/`) | внутри `audio_url` с `sig=` и подписанные ссылки CRM |
| `target/`, `.idea/` | сборка и IDE |

Всё это уже в `backend/.gitignore`. Коммитить можно: `.env.example` (без значений), `application.yml` (там только `${ПЕРЕМЕННЫЕ}`).
Ссылки на аудио отдаются фронту только по запросу `/audio` и не пишутся в код/фикстуры. Если ключ всё-таки попал в git — считать его скомпрометированным и попросить новый.

## Структура

```
config/      CqaProperties (настройки), WebConfig (CORS, пул потоков для LLM)
importer/    загрузка группы DEV/TEST от организаторов, offset_sec, дата, оператор по имени
checklist/   версии чек-листа = «конфигурация»
llm/         LlmClient + Anthropic / OpenAI / Gemini / MOCK, PromptBuilder, выбор модели по языку
evaluation/  оценка (async), валидация ответа AI + повтор, ScoringService (баллы считает Java), batch
conversation/ список с фильтрами и карточка диалога
appeal/      апелляции, решение ОКК, база ошибок AI
analytics/   дашборд, разрезы (язык/канал/длительность/день/модель/оператор), рейтинг и бонусы
audio/       свежая ссылка на mp3 из страницы-плеера
db/migration V1 схема, V2 чек-лист v1 + маршруты моделей
```

## API

Все пути от `/api`. Ошибки: `{code, message}`; 400 — валидация, 404 — нет объекта, 409 — конфликт, 503 — нет ключа/URL.
Фильтр диалогов (одинаковый для списка, batch и аналитики), все параметры необязательны:
`search, status, channel=CHAT|VOICE, language=RU|KZ|EN, from, to (YYYY-MM-DD), minScore, maxScore,
scoreBucket=0-49|50-69|70-84|85-100, minDurationSec, maxDurationSec, durationBucket=lt3|3-10|10-20|gt20,
operatorId, grossError, hasOpenAppeal, groupId, model`.

### Импорт и операторы
- `POST /import?groupId=DEV&date=2026-11-06` — тянет группу у организаторов. Повторный импорт не дублирует (`skipped`). `date` — день для чатов (у чатов нет даты), по умолчанию сегодня; у звонков дата берётся из времени звонка. → `{imported, skipped, groupId, importRunId, businessDate}`
- `GET /imports` — история загрузок (когда пришла группа, сколько новых).
- `GET /operators` — `[{id, name, fictional, source}]`. `source`: TRANSCRIPT (имя из текста), DEMO, UNKNOWN.

### Диалоги
- `GET /conversations?<фильтр>&page=0&size=50` → `{items, total, page, size}`; в элементе также `durationSec/durationLabel`, `aiScore`, `provider/model`.
- `GET /conversations/{id}` → поля списка + `operatorStartSeq`, `messages[{seq, role, text, timestampRaw, offsetSec, timeLabel}]`, `evaluation` (последняя): `originalScore` (AI), `finalScore` (после апелляций), `sections`, `results[{id, criterion, original, final, explanation, confidence, evidence[{messageSeq, offsetSec, quote}], decision, openAppealId}]`, `correctionsUsed`, `simulated`.
- `GET /conversations/{id}/audio` → `{streamUrl, expiresAt, audioPageUrl}`. У чатов все null.

### Оценка
- `POST /conversations/{id}/evaluate?provider=&model=` → 202 `{evaluationId}`. Без параметров модель берётся по языку. 409 если есть открытая апелляция или уже идёт оценка.
- `POST /evaluations/batch/preview` — тело как у batch, отвечает сколько диалогов будет оценено (LLM не вызывается).
- `POST /evaluations/batch` — `{conversationIds:[...]}` **или** `{filter:{language:"KZ", from:"2026-11-06", to:"2026-11-06", durationBucket:"gt20"}, provider?, model?, onlyNotEvaluated?}` → `{id, status, done, total, failed, errors}`.
- `GET /evaluations/batch/{id}` — прогресс, опрашивать раз в 2 сек.

### Чек-листы (конфигурация)
- `GET /checklists/versions` (с критериями), `GET /checklists/active`
- `POST /checklists/versions` `{name, criteria:[...]}` — новая неактивная версия; сумма весов = 100.
- `POST /checklists/versions/{id}/activate` — новые оценки идут по ней, старые остаются на своей версии.

### Модели AI
- `GET /llm/providers` → `[{provider, available, defaultModel}]` (`available=false` — нет ключа).
- `GET /llm/routes`, `PUT /llm/routes/{RU|KZ|EN|DEFAULT}` `{provider, model}` — какая модель оценивает какой язык.
- `GET /llm/memo`, `PUT /llm/memo` `{text}` — памятка для ОКК на этом экране.

### Апелляции и «обучение»
- `POST /criterion-results/{id}/appeals?operatorId=` `{comment, desired:{value,isNa}|null}` → 201; 409 если уже открыта.
- `GET /appeals?status=OPEN` (ОКК), `GET /appeals?role=OPERATOR&operatorId=3` (свои), `GET /appeals/{id}`
- `POST /appeals/{id}/decision` `{status:"ACCEPTED"|"REJECTED", reason, newValue, addToExamples, reviewerName?}` — при принятии пересчитывается критерий и итог (`ai_*` не меняется); при `addToExamples` случай уходит в базу ошибок AI.
- `GET /ai-corrections`, `PATCH /ai-corrections/{id}` `{active}` — до 3 примеров на критерий подставляются в промпт (сначала того же языка).

### Аналитика и рейтинг
- `GET /analytics/summary?<фильтр>` — средний балл, оценено/всего, грубые ошибки, открытые апелляции, % принятых апелляций, распределение по 0–49/50–69/70–84/85–100, слабые критерии.
- `GET /analytics/breakdown?by=duration|language|channel|date|operator|model|group&<фильтр>` → `[{key, label, total, evaluated, avgScore, grossErrors, grossErrorRate, lowShare(<70), avgDurationSec}]`.
- `GET /analytics/criteria?<фильтр>` — по каждому критерию: сколько раз «Нет», N/A, средний % от максимума.
- `GET /operators/leaderboard?from=&to=`, `GET /operators/{id}/rating` — средний итог за 30 дней, минимум `RATING_MIN_DIALOGS` диалогов, уровни Платина/Золото/Серебро/Базовый, бонус, бейджи, тренд по дням.

## Проверено

Юнит-тесты подсчёта баллов; прогон на временной PostgreSQL с DEV-данными: импорт 65 (повтор → 65 skipped), batch на MOCK 65/65, апелляция 100 → 90, база ошибок AI, переоценка с примером, аналитика, аудио-ссылка, 409/400/503.

## Не сделано / следующий шаг
- Реальные провайдеры не проверены вызовом: нужен ключ. Сравнить модели на 3 диалогах каждого языка.
- Сравнение двух моделей на одном диалоге одним запросом (сейчас: переоценить с `provider=` и смотреть `breakdown?by=model`).
- Прокси аудио через бэкенд (если плеер в браузере не пускает прямую ссылку).
- Учёт стоимости токенов в деньгах; история старых оценок в API.
