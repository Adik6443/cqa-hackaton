# Freedom CQA — контроль качества диалогов

Прототип Conversation Quality Analytics для Freedom Broker (хакатон, команда **QUARK**). AI оценивает чаты и звонки операторов по настраиваемому чек-листу, отдел качества смотрит обоснования и реплики-доказательства, разбирает апелляции операторов и сохраняет итоговый результат.

```
backend/    Spring Boot 3.5 + PostgreSQL (Flyway), оценка через LLM, подсчёт баллов в Java
frontend/   React + TypeScript + Vite; та же сборка упаковывается как веб-ресурс Dynamics 365
results/    results.json для организаторов: dev/ и prod/
```

## Требования

- **Java 21** и Maven (или IntelliJ IDEA)
- **Node.js 20+**
- **PostgreSQL** 15+ (pgAdmin 4 — по желанию)

## Запуск

### 1. База данных
Создайте пустую базу `cqa` (pgAdmin → Databases → Create → Database). Таблицы, чек-лист v1 и настройки создаст сам бэкенд при первом старте.

### 2. Бэкенд
1. Скопируйте `backend/src/main/resources/application-local.properties.example` в `application-local.properties` (та же папка). Файл в `.gitignore`, в GitHub не попадёт.
2. Впишите в него пароль PostgreSQL и ключи AI (см. ниже).
3. Запустите `CqaApplication` в IDEA (откройте папку `backend` как Maven-проект) или из папки `backend`:
   ```
   mvn spring-boot:run
   ```
4. В логе должно появиться `Started CqaApplication`. API: http://localhost:8080/api

Все остальные настройки — в `backend/src/main/resources/application.properties` (единственный файл настроек).

### 3. Фронтенд
```
cd frontend
npm install
npm run dev
```
Откройте http://127.0.0.1:5173. Запросы `/api` Vite сам пересылает на `localhost:8080`, файл `.env` не нужен.

Проверочные SQL-запросы для pgAdmin — `backend/sql/check_queries.sql`.

## Ключи API и выбор модели

Ключи — только в `application-local.properties`:
```properties
cqa.llm.openai-key=sk-...
cqa.llm.anthropic-key=sk-ant-...
cqa.llm.gemini-key=...
```
Провайдер с пустым ключом выключен. После изменения ключей перезапустите бэкенд.

По умолчанию все языки оцениваются провайдером **MOCK** (демо без AI, `simulated=true`). Переключить на настоящую модель:
- в интерфейсе: **Модели AI** → для RU / KZ / EN / «Остальные» выбрать провайдера и версию модели → «Сохранить»;
- или через API: `PUT /api/llm/routes/RU` с телом `{"provider":"OPENAI","model":"gpt-4.1"}`.

Для разовой оценки другой моделью (например, для сравнения) выберите модель в строке над таблицей диалогов («Модель: …»).

## Как получить results.json

Формат 1.0 из приложения к гайду: одна запись на диалог, 8 критериев (`contact … critical`), `evidence_turns` с 1 по исходному транскрипту, ошибки со `status: "error"`.

**Через интерфейс:** страница **«Сдача результатов»** — три шага по порядку: загрузить → оценить → сохранить.

**Через API** (Postman или PowerShell `Invoke-RestMethod -Method Post`):
1. Загрузка набора:
   `POST http://localhost:8080/api/import?groupId=DEV` (для контрольного набора — код, который дадут организаторы).
2. Оценка всего набора:
   `POST http://localhost:8080/api/evaluations/batch` с телом `{"filter":{"groupId":"DEV"},"onlyNotEvaluated":true}`.
   Прогресс: `GET /api/evaluations/batch/{id}` — ждать `status: DONE`.
3. Выгрузка:
   - DEV: `POST http://localhost:8080/api/results/export?groupId=DEV&set=dev&source=ai&write=true`
   - контрольный: `POST http://localhost:8080/api/results/export?groupId=<код>&set=prod&source=ai&write=true`

   `source=ai` — ответы модели как есть (так организаторы сравнивают системы); `source=final` — с учётом решений по апелляциям.
   Файл пишется в `results/dev/results.json` или `results/prod/results.json` (настройка `cqa.results.dir=../results` — путь от рабочей папки бэкенда, то есть от `backend/`). Демо-оценки MOCK по умолчанию не выгружаются.
4. Отправка до стоп-кода:
   ```
   git add results
   git commit -m "results"
   git push
   ```
   Локального сохранения или коммита без push недостаточно.

## Модели и стоимость

В `results.json` пишется `model.mode = "external_api"` и названия фактически использованных моделей. Подключены три провайдера, модель по умолчанию у каждого задаётся в `application.properties`:

| Провайдер | Модель по умолчанию | Настройка |
|---|---|---|
| OpenAI | `gpt-4.1` | `cqa.llm.openai-model` |
| Anthropic | `claude-sonnet-5-5` | `cqa.llm.anthropic-model` |
| Google | `gemini-3.8-flash` | `cqa.llm.gemini-model` |

Одна оценка диалога = один запрос к модели (повтор только если ответ не прошёл проверку формата). Неизменная часть запроса (инструкция и чек-лист) стоит в начале, поэтому кэшируется провайдером: OpenAI — автоматически, Claude — через `cache_control`.

**Как считается стоимость.** Бэкенд сохраняет у каждой оценки токены от провайдера (`tokens_in`, `tokens_cached`, `tokens_out` в таблице `evaluation`). Цены за 1 млн токенов вносятся на странице **«Стоимость AI»** (таблица `model_price`, миграция `V4__history_cost.sql`). Стоимость = `(вход − кэш) × цена входа + кэш × цена кэша + выход × цена выхода` (`CostController`). Цен в коде нет, поэтому сумма появляется после их ввода с официальных страниц цен провайдеров.

**Фактическая стоимость:** по счёту OpenAI 52 оценки DEV стоили $0.44, то есть **≈ $0.0085 за оценку** (≈ $8.5 за 1 000 диалогов).

## Dynamics 365

`cd frontend && npm run pack:d365` → `frontend/d365/FreedomCQA_1_0_0_0.zip` — решение Dataverse с веб-ресурсами `fcqa_/cqa/*`. Установка и параметры встраивания на форму — в `frontend/README.md`.

## Подробнее
- `backend/README.md` — API, Postman, проверка в pgAdmin, безопасность
- `frontend/README.md` — структура интерфейса, сборка для Dynamics 365
