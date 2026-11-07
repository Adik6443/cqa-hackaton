# CQA backend (Spring Boot + PostgreSQL)

Java 21+, Spring Boot 3.5, PostgreSQL (схема создаётся сама через Flyway), без JPA: SQL через `JdbcClient`.
Формы JSON совпадают с `frontend/src/shared/api/types.ts` (ID строками, `value/isNa/points/maxPoints`).

## Запуск у себя (IntelliJ IDEA + pgAdmin 4)

1. **БД.** pgAdmin → Servers → PostgreSQL → Databases → правый клик → Create → Database → имя `cqa`. Больше ничего создавать не надо.
2. **Пароль и ключи.** Скопируй `src/main/resources/application-local.properties.example` в `application-local.properties` (та же папка) и впиши пароль postgres, ключ AI и название команды. Этот файл в `.gitignore` и в GitHub не попадёт. Всё остальное лежит в обычном `application.properties`.
3. **Старт.** Открой папку `backend` в IDEA как Maven-проект и запусти `CqaApplication` (или `mvn spring-boot:run`). При старте Flyway сам создаст таблицы и чек-лист v1. В логе будет `Started CqaApplication`.
4. **Проверка в pgAdmin.** `cqa` → Schemas → public → Tables (нажми Refresh). Там появятся таблицы и `flyway_schema_history`.
5. **Фронт.** В `frontend/.env`: `VITE_USE_MOCKS=false`, `VITE_API_BASE_URL=http://localhost:8080/api`.

Без ключа AI всё работает на провайдере `MOCK` (демо-оценки, `simulated=true`), но для results.json такие оценки не годятся: выгрузка их не пропустит.

## Куда пишутся данные и как их смотреть в pgAdmin

Всё хранится в твоей локальной БД `cqa`, каждый запрос из Postman/фронта пишет туда строки. Query Tool:

```sql
SELECT * FROM import_run ORDER BY id DESC;                    -- каждая загрузка от организаторов
SELECT id, channel, language, conversation_date, operator_start_seq FROM conversation ORDER BY id;
SELECT seq, speaker, text FROM message WHERE conversation_id='p1-ru-001' ORDER BY seq;
SELECT conversation_id, status, provider, model, ai_total, final_total, final_gross_error, error_text
  FROM evaluation WHERE is_latest ORDER BY conversation_id;    -- итог по каждому диалогу
SELECT k.code, cr.ai_value, cr.ai_is_na, cr.final_value, cr.explanation
  FROM criterion_result cr JOIN criterion k ON k.id=cr.criterion_id
  JOIN evaluation e ON e.id=cr.evaluation_id WHERE e.conversation_id='p1-ru-001' AND e.is_latest ORDER BY k.sort_order;
SELECT * FROM appeal ORDER BY id DESC;                         -- апелляции и решения ОКК
SELECT * FROM ai_correction;                                   -- база ошибок AI
SELECT * FROM llm_route;                                       -- какая модель на какой язык
```

Начать с нуля: удалить базу `cqa`, создать заново и перезапустить бэкенд.

## Проверка через Postman

Бэкенд должен быть запущен. Тело запросов: Body → raw → JSON.

1. `POST http://localhost:8080/api/import?groupId=DEV` → `imported: 65` (повторно — `skipped: 65`).
2. `POST http://localhost:8080/api/evaluations/batch`, тело `{"filter":{"groupId":"DEV"}}` → запомнить `id`.
3. `GET  http://localhost:8080/api/evaluations/batch/1` → ждать `"status":"DONE"`.
4. `GET  http://localhost:8080/api/conversations/p1-ru-001` → в `evaluation.results[0].id` номер результата критерия (например 1).
5. `POST http://localhost:8080/api/criterion-results/1/appeals`, тело `{"comment":"Не согласен","desired":null}` → 201.
   В pgAdmin: `SELECT * FROM appeal;` — появилась строка со статусом OPEN.
6. `POST http://localhost:8080/api/appeals/1/decision`, тело
   `{"status":"ACCEPTED","reason":"Проверено","newValue":{"value":0,"isNa":false},"addToExamples":true}` →
   `SELECT final_total FROM evaluation WHERE conversation_id='p1-ru-001' AND is_latest;` — балл пересчитан,
   `SELECT * FROM ai_correction;` — пример ошибки AI.

## Сдача results.json (DEV и контрольный набор)

Формат по `CQA_Student_Guide_Appendix_Results.pdf`. Файл пишется в `../results/<dev|prod>/results.json`, то есть в корень репозитория рядом с `backend/`.

```
1. POST /api/import?groupId=DEV                      (для контроля — groupId, который дадут организаторы)
2. POST /api/evaluations/batch   {"filter":{"groupId":"DEV"}}
3. GET  /api/evaluations/batch/{id}                  (ждать status=DONE)
4. POST /api/results/export?groupId=DEV&set=dev      (для контроля: groupId=<…>&set=prod)
5. git add results && git commit && git push
```

- Не оценённые или упавшие диалоги попадают в файл со `status:"error"` и причиной, как требует PDF.
- `source=ai` (по умолчанию) — ответ системы; `source=final` — после апелляций.
- Если есть MOCK-оценки, ответ будет 409 (`allowSimulated=true` — только для проверки формата).
- `write=false` — посмотреть JSON, не записывая файл.
- В ответе есть `warnings`: например, если в prod не 10 записей.

## Безопасность — что НЕ коммитить

| Что | Почему |
|---|---|
| `src/main/resources/application-local.properties` | пароль БД и ключи Anthropic / OpenAI / Gemini |
| выгрузки JSON организаторов (`dev.json`, `data/`) | внутри подписанные ссылки на записи звонков |
| `target/`, `.idea/` | сборка и IDE |

Всё это уже в `.gitignore`. Ссылку организаторов в `application.properties` коммитить можно: организаторы разрешили в чате.

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
results/     results.json для организаторов, часовой автозапуск (выключен)
db/migration V1 схема, V2 чек-лист v1 + маршруты моделей, V3 коды criterion_id + уточнённые правила
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

### Результаты для организаторов
- `POST /results/export?groupId=DEV&set=dev|prod&source=ai|final&write=true&allowSimulated=false` → `{path, count, ok, errors, warnings, file}`.

### Аналитика и рейтинг
- `GET /analytics/summary?<фильтр>` — средний балл, оценено/всего, грубые ошибки, открытые апелляции, % принятых апелляций, распределение по 0–49/50–69/70–84/85–100, слабые критерии.
- `GET /analytics/breakdown?by=duration|language|channel|date|operator|model|group&<фильтр>` → `[{key, label, total, evaluated, avgScore, grossErrors, grossErrorRate, lowShare(<70), avgDurationSec}]`.
- `GET /analytics/criteria?<фильтр>` — по каждому критерию: сколько раз «Нет», N/A, средний % от максимума.
- `GET /operators/leaderboard?from=&to=`, `GET /operators/{id}/rating` — средний итог за 30 дней, минимум `RATING_MIN_DIALOGS` диалогов, уровни Платина/Золото/Серебро/Базовый, бонус, бейджи, тренд по дням.

## Проверено

Юнит-тесты подсчёта баллов. Прогон на временной PostgreSQL: импорт 65 диалогов с настоящего API организаторов (повтор → 65 skipped), batch на MOCK 65/65, апелляция 100 → 90, база ошибок AI, переоценка с примером, аналитика, аудио-ссылка, results.json в формате 1.0, коды 400/409/503.

## Не сделано / следующий шаг
- Реальные провайдеры не проверены вызовом: нужен ключ. Сравнить модели на 3 диалогах каждого языка.
- Прокси аудио через бэкенд (если плеер в браузере не пускает прямую ссылку).
- Стоимость в деньгах; история старых оценок в API.
