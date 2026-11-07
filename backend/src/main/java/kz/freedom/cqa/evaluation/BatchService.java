package kz.freedom.cqa.evaluation;

import com.fasterxml.jackson.databind.ObjectMapper;
import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.conversation.ConversationFilter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * "Evaluate everything for a day / language / duration in one click".
 * Takes explicit ids OR a filter, skips dialogs that are pending or have open appeals,
 * then starts each evaluation (they run in parallel on the llmExecutor pool).
 */
@Service
public class BatchService {
    private final JdbcClient db;
    private final EvaluationService evaluations;
    private final ObjectMapper mapper;

    public BatchService(JdbcClient db, EvaluationService evaluations, ObjectMapper mapper) {
        this.db = db;
        this.evaluations = evaluations;
        this.mapper = mapper;
    }

    public record BatchInput(List<String> conversationIds, ConversationFilter filter, String provider, String model,
                             Boolean onlyNotEvaluated) {}

    public record Batch(String id, String status, int done, int total, int failed, String provider, String model,
                        List<Map<String, String>> errors) {}

    public record Preview(int count, List<String> conversationIds, List<String> skipped) {}

    /** What would be evaluated, without calling the LLM (shown before the OKK presses "Run"). */
    public Preview preview(BatchInput in) {
        List<String> ids = resolveIds(in);
        List<String> skipped = new ArrayList<>();
        List<String> ok = new ArrayList<>();
        for (String id : ids) {
            if (blocked(id)) skipped.add(id); else ok.add(id);
        }
        return new Preview(ok.size(), ok, skipped);
    }

    public Batch start(BatchInput in) {
        Preview p = preview(in);
        if (p.count() == 0) throw ApiException.badRequest("Нет диалогов для оценки по этому фильтру");
        String filterJson;
        try {
            filterJson = mapper.writeValueAsString(in);
        } catch (Exception e) {
            filterJson = null;
        }
        long batchId = db.sql("INSERT INTO eval_batch(total, provider, model, filter_json) VALUES (:t,:p,:m,:f) RETURNING id")
                .param("t", p.count()).param("p", blankToNull(in.provider())).param("m", blankToNull(in.model())).param("f", filterJson)
                .query(Long.class).single();
        int started = 0;
        for (String id : p.conversationIds()) {
            try {
                evaluations.evaluate(id, batchId, in.provider(), in.model());
                started++;
            } catch (ApiException e) {
                // e.g. became pending in the meantime: count it as failed in this batch
                db.sql("UPDATE eval_batch SET total = total - 1 WHERE id=:id").param("id", batchId).update();
            }
        }
        if (started == 0) db.sql("UPDATE eval_batch SET status='FAILED', finished_at=now() WHERE id=:id").param("id", batchId).update();
        return get(batchId);
    }

    public Batch get(long id) {
        var row = db.sql("SELECT id::text AS id, status, total, provider, model FROM eval_batch WHERE id=:id").param("id", id)
                .query().listOfRows();
        if (row.isEmpty()) throw ApiException.notFound("Пакет");
        Map<String, Object> r = row.get(0);
        int done = count(id, "DONE"), failed = count(id, "FAILED");
        List<Map<String, String>> errors = db.sql("SELECT conversation_id, coalesce(error_text,'') FROM evaluation WHERE batch_id=:id AND status='FAILED'")
                .param("id", id).query((rs, i) -> Map.of("conversationId", rs.getString(1), "message", rs.getString(2))).list();
        return new Batch((String) r.get("id"), (String) r.get("status"), done + failed, ((Number) r.get("total")).intValue(), failed,
                (String) r.get("provider"), (String) r.get("model"), errors);
    }

    /** Called after every finished evaluation: closes the batch when all its items are finished. */
    static void refreshBatchOf(JdbcClient db, long evaluationId) {
        db.sql("""
                UPDATE eval_batch b SET status = CASE WHEN x.done = 0 THEN 'FAILED' ELSE 'DONE' END, finished_at = now()
                FROM (SELECT batch_id, count(*) FILTER (WHERE status='DONE') AS done, count(*) FILTER (WHERE status<>'PENDING') AS finished
                      FROM evaluation WHERE batch_id = (SELECT batch_id FROM evaluation WHERE id=:e) GROUP BY batch_id) x
                WHERE b.id = x.batch_id AND b.status='PENDING' AND x.finished >= b.total
                """).param("e", evaluationId).update();
    }

    private int count(long batchId, String status) {
        return db.sql("SELECT count(*) FROM evaluation WHERE batch_id=:b AND status=:s").param("b", batchId).param("s", status)
                .query(Integer.class).single();
    }

    private List<String> resolveIds(BatchInput in) {
        if (in.conversationIds() != null && !in.conversationIds().isEmpty()) return in.conversationIds().stream().distinct().toList();
        ConversationFilter f = in.filter() == null ? ConversationFilter.empty() : in.filter();
        ConversationFilter.Where w = f.toWhere();
        String extra = Boolean.TRUE.equals(in.onlyNotEvaluated()) ? " AND (e.id IS NULL OR e.status='FAILED')" : "";
        return db.sql("SELECT c.id FROM conversation c LEFT JOIN evaluation e ON e.conversation_id=c.id AND e.is_latest WHERE "
                        + w.sql() + extra + " ORDER BY c.conversation_date, c.id LIMIT 10000")
                .params(w.params()).query(String.class).list();
    }

    private boolean blocked(String conversationId) {
        return db.sql("""
                SELECT count(*) FROM evaluation e
                WHERE e.conversation_id=:id AND e.is_latest AND (e.status='PENDING' OR EXISTS (
                  SELECT 1 FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                  WHERE cr.evaluation_id=e.id AND a.status='OPEN'))
                """).param("id", conversationId).query(Integer.class).single() > 0;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
