-- =====================================================================
-- Freedom CQA: queries for pgAdmin (Query Tool), database "cqa".
-- Read-only: nothing here changes data. Run one query at a time:
-- select it with the mouse and press F5 (or Execute).
-- Replace 'p1-ru-001' with the dialog id you want to look at.
-- =====================================================================


-- ---------- 1. Overview: how many rows in each table ----------
SELECT 'conversation' AS table_name, count(*) FROM conversation
UNION ALL SELECT 'message',          count(*) FROM message
UNION ALL SELECT 'operator',         count(*) FROM operator
UNION ALL SELECT 'evaluation',       count(*) FROM evaluation
UNION ALL SELECT 'criterion_result', count(*) FROM criterion_result
UNION ALL SELECT 'evidence',         count(*) FROM evidence
UNION ALL SELECT 'appeal',           count(*) FROM appeal
UNION ALL SELECT 'ai_correction',    count(*) FROM ai_correction
UNION ALL SELECT 'checklist_version', count(*) FROM checklist_version;


-- ---------- 2. Import: did the "Загрузить диалоги" button work ----------
-- Each click = one row. status DONE, imported = new, skipped = already in the DB.
SELECT id, group_id, business_date, status, total, imported, skipped, error_text, started_at
FROM import_run ORDER BY id DESC LIMIT 10;

-- Dialogs by set, channel and language (DEV should be 60 chats + 5 calls; 35 RU / 15 KZ / 15 EN)
SELECT group_id, channel, language, count(*)
FROM conversation GROUP BY group_id, channel, language ORDER BY 1, 2, 3;

-- One dialog with its messages (seq = message number used as evidence)
SELECT seq, speaker, timestamp_raw, offset_sec, left(text, 120) AS text
FROM message WHERE conversation_id = 'p1-ru-001' ORDER BY seq;


-- ---------- 3. Evaluation: are there results ----------
-- Status of the latest evaluation of each dialog
SELECT c.id, c.channel, c.language,
       coalesce(e.status, 'NOT_EVALUATED') AS status,
       e.provider, e.model, e.simulated,      -- simulated = true -> MOCK, not a real AI
       e.ai_total, e.final_total, e.final_gross_error, e.error_text
FROM conversation c
LEFT JOIN evaluation e ON e.conversation_id = c.id AND e.is_latest
ORDER BY c.id;

-- Batches started with "Оценить по фильтрам"
SELECT id, status, total, provider, model, filter_json, created_at, finished_at
FROM eval_batch ORDER BY id DESC LIMIT 10;

-- Criteria of one dialog: AI answer, final answer, points, explanation
SELECT cr.id AS criterion_result_id, k.code, k.export_id, k.title,
       cr.ai_value, cr.ai_is_na, cr.final_value, cr.final_is_na,
       cr.final_points, cr.max_points, cr.confidence, cr.explanation
FROM evaluation e
JOIN criterion_result cr ON cr.evaluation_id = e.id
JOIN criterion k ON k.id = cr.criterion_id
WHERE e.conversation_id = 'p1-ru-001' AND e.is_latest
ORDER BY k.sort_order;

-- Evidence (which messages the AI referred to) for one dialog
SELECT k.code, ev.message_seq, m.speaker, left(m.text, 100) AS message_text
FROM evaluation e
JOIN criterion_result cr ON cr.evaluation_id = e.id
JOIN criterion k ON k.id = cr.criterion_id
JOIN evidence ev ON ev.criterion_result_id = cr.id
LEFT JOIN message m ON m.conversation_id = e.conversation_id AND m.seq = ev.message_seq
WHERE e.conversation_id = 'p1-ru-001' AND e.is_latest
ORDER BY k.sort_order, ev.message_seq;

-- Cost / speed of the AI: tokens and time per evaluation
SELECT provider, model, count(*) AS evaluations,
       round(avg(tokens_in)) AS avg_tokens_in, round(avg(tokens_out)) AS avg_tokens_out,
       round(avg(latency_ms)) AS avg_ms, sum(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
FROM evaluation GROUP BY provider, model;


-- ---------- 4. Appeals: was the appeal saved, what was decided ----------
SELECT a.id, a.status, e.conversation_id, k.code, k.title,
       o.name AS operator, a.comment,
       a.desired_value, a.desired_is_na,           -- what the operator thinks is right
       a.reviewer_name, a.decision_reason,
       a.new_value, a.new_is_na,                   -- value set by quality control
       a.add_to_examples,                          -- true = "это ошибка AI" -> went to ai_correction
       a.created_at, a.decided_at
FROM appeal a
JOIN criterion_result cr ON cr.id = a.criterion_result_id
JOIN evaluation e ON e.id = cr.evaluation_id
JOIN criterion k ON k.id = cr.criterion_id
LEFT JOIN operator o ON o.id = a.operator_id
ORDER BY a.id DESC;

-- Score before and after appeals (ai_total = AI, final_total = after decisions)
SELECT conversation_id, ai_total, final_total, ai_gross_error, final_gross_error
FROM evaluation WHERE is_latest AND ai_total IS DISTINCT FROM final_total;


-- ---------- 5. "AI memory": corrections used in the next prompts ----------
-- Up to 3 active corrections per criterion are added to the prompt (same language first).
SELECT id, appeal_id, criterion_code, language, ai_value, correct_value, reason,
       left(snippet, 150) AS snippet, is_active, created_at
FROM ai_correction ORDER BY id DESC;

-- How many corrections each new evaluation actually used
SELECT conversation_id, corrections_used, created_at
FROM evaluation WHERE corrections_used > 0 ORDER BY created_at DESC;


-- ---------- 6. Checklist versions ----------
SELECT id, version_no, name, is_active, created_at FROM checklist_version ORDER BY version_no;

-- Criteria of the active version (weights should sum to 100, FLAG has weight 0)
SELECT k.sort_order, k.code, k.export_id, k.section, k.title, k.answer_type, k.weight, k.allow_na, k.steps
FROM criterion k JOIN checklist_version v ON v.id = k.checklist_version_id
WHERE v.is_active ORDER BY k.sort_order;

-- Which checklist version each dialog was evaluated with
SELECT v.version_no, count(*) FROM evaluation e
JOIN checklist_version v ON v.id = e.checklist_version_id
WHERE e.is_latest GROUP BY v.version_no;


-- ---------- 7. Models and operators ----------
SELECT * FROM llm_route ORDER BY language;

SELECT o.id, o.name, o.source, count(c.id) AS dialogs
FROM operator o LEFT JOIN conversation c ON c.operator_id = o.id
GROUP BY o.id ORDER BY dialogs DESC;
