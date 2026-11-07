# Freedom CQA — фронтенд

React + TypeScript + Vite. Работает только с настоящим бэкендом (моков больше нет).

## Запуск
1. Запустить бэкенд (`backend/`, порт 8080) и дождаться `Started CqaApplication`.
2. В этой папке:
   ```
   npm install
   npm run dev
   ```
3. Открыть http://127.0.0.1:5173

Все запросы `/api/...` Vite сам пересылает на `http://localhost:8080` (см. `vite.config.ts`), поэтому `.env` не нужен.
Бэкенд на другом адресе: `set CQA_BACKEND=http://адрес:8080` перед `npm run dev`.

## Структура
```
src/api.ts            все запросы к бэкенду и типы ответов
src/ui.tsx            общие элементы: бейджи баллов и статусов, загрузка, ошибки, пустые состояния
src/App.tsx           меню, переключатель роли, маршруты
src/styles.css        все стили; цвета в :root (--brand — фирменный зелёный)
src/pages/
  Dashboard.tsx       Обзор (ОКК)
  Conversations.tsx   список диалогов, фильтры, загрузка и оценка по кнопке
  ConversationCard.tsx карточка: балл, критерии с обоснованием, стенограмма, аудио, апелляция
  Appeals.tsx         апелляции и решение ОКК
  Checklist.tsx       чек-лист и редактор версий
  Models.tsx          выбор модели AI по языкам + памятка
  Operators.tsx       рейтинг (ОКК) / мой рейтинг (оператор)
  Corrections.tsx     база ошибок AI
  Results.tsx         сдача results.json: загрузить → оценить → сохранить
```
