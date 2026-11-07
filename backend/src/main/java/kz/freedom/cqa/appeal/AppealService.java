package kz.freedom.cqa.appeal;

import kz.freedom.cqa.checklist.ChecklistService;
import kz.freedom.cqa.checklist.Criterion;
import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.evaluation.ScoringService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Operator disagrees with one criterion -> appeal (OPEN).
 * OKK: REJECTED with a reason, or ACCEPTED with a new value -> final_* of the criterion and the total are recalculated.
 * The AI values (ai_*) are never overwritten. With addToExamples the case goes into ai_correction ("AI memory").
 */
@Service
public class AppealService {
    private final JdbcClient db;
    private final ChecklistService checklists;
    private final ScoringService scoring;

    public AppealService(JdbcClient db, ChecklistService checklists, ScoringService scoring) {
        this.db = db;
        this.checklists = checklists;
        this.scoring = scoring;
    }

    public record Answer(BigDecimal value, boolean isNa) {}

    public record ResultValue(BigDecimal value, boolean isNa, BigDecimal points, BigDecimal maxPoints) {}

    public record Appeal(String id, String conversationId, String criterionResultId, String criterionTitle, String operatorId,
                         String operatorName, String comment, Answer desired, String status, String createdAtLabel,
                         String reason, String reviewerName, ResultValue original, Answer corrected) {}

    public record CreateInput(String comment, Answer desired) {}

    public record DecisionInput(String status, String reason, Answer newValue, boolean addToExamples, String reviewerName) {}

    private static final String SELECT = """
            SELECT a.*, cr.ai_value, cr.ai_is_na, cr.ai_points, cr.max_points, cr.criterion_id, k.title AS criterion_title,
                   e.conversation_id, o.name AS operator_name, to_char(a.created_at,'DD.MM.YYYY HH24:MI') AS created_label
            FROM appeal a
            JOIN criterion_result cr ON cr.id = a.criterion_result_id
            JOIN criterion k ON k.id = cr.criterion_id
            JOIN evaluation e ON e.id = cr.evaluation_id
            LEFT JOIN operator o ON o.id = a.operator_id
            """;

    public List<Appeal> list(String status, String operatorId) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        Map<String, Object> p = new java.util.HashMap<>();
        if (status != null && !status.isBlank()) { where.append(" AND a.status = :st"); p.put("st", status.toUpperCase()); }
        if (operatorId != null && !operatorId.isBlank()) { where.append(" AND a.operator_id = :op"); p.put("op", Long.parseLong(operatorId)); }
        return db.sql(SELECT + where + " ORDER BY (a.status='OPEN') DESC, a.created_at DESC").params(p).query((rs, i) -> map(rs)).list();
    }

    public Appeal get(long id) {
        return db.sql(SELECT + " WHERE a.id=:id").param("id", id).query((rs, i) -> map(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("Апелляция"));
    }

    @Transactional
    public Appeal create(long criterionResultId, CreateInput in, String operatorId) {
        if (in.comment() == null || in.comment().isBlank()) throw ApiException.badRequest("Опишите, почему вы не согласны");
        Map<String, Object> cr = db.sql("""
                SELECT cr.criterion_id, e.is_latest, e.status, c.operator_id FROM criterion_result cr
                JOIN evaluation e ON e.id=cr.evaluation_id JOIN conversation c ON c.id=e.conversation_id WHERE cr.id=:id
                """).param("id", criterionResultId).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Результат критерия"));
        if (!Boolean.TRUE.equals(cr.get("is_latest")) || !"DONE".equals(cr.get("status")))
            throw ApiException.conflict("STALE_EVALUATION", "Оценка устарела: диалог переоценён");
        if (in.desired() != null) validateAnswer(checklists.criterion(((Number) cr.get("criterion_id")).longValue()), in.desired());
        Object op = operatorId != null && !operatorId.isBlank() ? Long.parseLong(operatorId) : cr.get("operator_id");
        try {
            long id = db.sql("""
                    INSERT INTO appeal(criterion_result_id, operator_id, comment, desired_value, desired_is_na)
                    VALUES (:cr, :op, :c, :dv, :dn) RETURNING id
                    """).param("cr", criterionResultId).param("op", op).param("c", in.comment().trim())
                    .param("dv", in.desired() == null ? null : in.desired().value())
                    .param("dn", in.desired() == null ? null : in.desired().isNa())
                    .query(Long.class).single();
            return get(id);
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("APPEAL_EXISTS", "По этому критерию уже есть открытая апелляция");
        }
    }

    @Transactional
    public Appeal decide(long appealId, DecisionInput in) {
        Map<String, Object> a = db.sql("""
                SELECT a.status, a.criterion_result_id, cr.criterion_id, cr.evaluation_id, cr.ai_value, cr.ai_is_na, c.language
                FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                JOIN evaluation e ON e.id=cr.evaluation_id JOIN conversation c ON c.id=e.conversation_id
                WHERE a.id=:id FOR UPDATE OF a
                """).param("id", appealId).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Апелляция"));
        if (!"OPEN".equals(a.get("status"))) throw ApiException.conflict("ALREADY_DECIDED", "Апелляция уже рассмотрена");
        if (in.reason() == null || in.reason().isBlank()) throw ApiException.badRequest("Укажите причину решения");
        String status = in.status() == null ? "" : in.status().toUpperCase();
        long crId = ((Number) a.get("criterion_result_id")).longValue();

        if ("REJECTED".equals(status)) {
            db.sql("UPDATE appeal SET status='REJECTED', decision_reason=:r, reviewer_name=:n, decided_at=now() WHERE id=:id")
                    .param("r", in.reason().trim()).param("n", in.reviewerName()).param("id", appealId).update();
            return get(appealId);
        }
        if (!"ACCEPTED".equals(status)) throw ApiException.badRequest("status: ACCEPTED или REJECTED");
        if (in.newValue() == null) throw ApiException.badRequest("Для принятия апелляции укажите новое значение");

        Criterion criterion = checklists.criterion(((Number) a.get("criterion_id")).longValue());
        validateAnswer(criterion, in.newValue());
        ScoringService.Answer ans = new ScoringService.Answer(in.newValue().isNa() ? null : in.newValue().value(), in.newValue().isNa());
        db.sql("UPDATE criterion_result SET final_value=:v, final_is_na=:na, final_points=:p WHERE id=:id")
                .param("v", ans.value()).param("na", ans.isNa()).param("p", scoring.points(criterion, ans)).param("id", crId).update();
        db.sql("""
                UPDATE appeal SET status='ACCEPTED', decision_reason=:r, reviewer_name=:n, new_value=:v, new_is_na=:na,
                  add_to_examples=:ex, decided_at=now() WHERE id=:id
                """).param("r", in.reason().trim()).param("n", in.reviewerName()).param("v", ans.value()).param("na", ans.isNa())
                .param("ex", in.addToExamples()).param("id", appealId).update();

        recalcEvaluation(((Number) a.get("evaluation_id")).longValue());

        if (in.addToExamples()) {
            db.sql("""
                    INSERT INTO ai_correction(appeal_id, criterion_code, criterion_fingerprint, criterion_title, language, snippet,
                      ai_value, correct_value, reason)
                    VALUES (:a, :code, :fp, :title, :lang, :snip, :aiv, :cv, :r)
                    """).param("a", appealId).param("code", criterion.code()).param("fp", criterion.fingerprint())
                    .param("title", criterion.title()).param("lang", a.get("language")).param("snip", snippet(crId))
                    .param("aiv", label(criterion, (BigDecimal) a.get("ai_value"), Boolean.TRUE.equals(a.get("ai_is_na"))))
                    .param("cv", label(criterion, ans.value(), ans.isNa())).param("r", in.reason().trim()).update();
        }
        return get(appealId);
    }

    /** Recalculates final_total / final_gross_error of an evaluation from final_* values. */
    private void recalcEvaluation(long evaluationId) {
        Map<String, Object> e = db.sql("SELECT checklist_version_id FROM evaluation WHERE id=:id").param("id", evaluationId).query().singleRow();
        List<Criterion> criteria = checklists.criteria(((Number) e.get("checklist_version_id")).longValue());
        Map<String, Criterion> byId = new java.util.HashMap<>();
        criteria.forEach(c -> byId.put(c.id(), c));
        List<ScoringService.Scored> scored = new ArrayList<>(db.sql(
                        "SELECT criterion_id, final_value, final_is_na FROM criterion_result WHERE evaluation_id=:id")
                .param("id", evaluationId)
                .query((rs, i) -> new ScoringService.Scored(byId.get(rs.getString(1)),
                        new ScoringService.Answer(rs.getBigDecimal(2), rs.getBoolean(3))))
                .list());
        ScoringService.Total t = scoring.total(scored);
        db.sql("UPDATE evaluation SET final_total=:t, final_gross_error=:g WHERE id=:id")
                .param("t", t.score()).param("g", t.grossError()).param("id", evaluationId).update();
    }

    private String snippet(long criterionResultId) {
        List<String> texts = db.sql("""
                SELECT m.speaker || ': ' || m.text FROM evidence ev
                JOIN criterion_result cr ON cr.id=ev.criterion_result_id JOIN evaluation e ON e.id=cr.evaluation_id
                JOIN message m ON m.conversation_id=e.conversation_id AND m.seq=ev.message_seq
                WHERE ev.criterion_result_id=:id ORDER BY ev.message_seq LIMIT 3
                """).param("id", criterionResultId).query(String.class).list();
        String s = String.join(" / ", texts);
        return s.length() > 600 ? s.substring(0, 600) + "…" : (s.isBlank() ? "(без цитаты)" : s);
    }

    private static String label(Criterion c, BigDecimal v, boolean na) {
        if (na) return "N/A";
        if (v == null) return "—";
        return c.steps().stream().filter(s -> s.value().compareTo(v) == 0).findFirst()
                .map(s -> s.value().stripTrailingZeros().toPlainString() + " (" + s.label() + ")")
                .orElse(v.stripTrailingZeros().toPlainString());
    }

    private static void validateAnswer(Criterion c, Answer a) {
        if (a.isNa()) {
            if (!c.allowNa()) throw ApiException.badRequest("Для критерия «" + c.title() + "» N/A запрещено");
            return;
        }
        if (a.value() == null || !c.allowsValue(a.value()))
            throw ApiException.badRequest("Недопустимое значение для «" + c.title() + "»");
    }

    private static Appeal map(ResultSet rs) throws SQLException {
        BigDecimal dv = rs.getBigDecimal("desired_value");
        Object dn = rs.getObject("desired_is_na");
        String st = rs.getString("status");
        return new Appeal(rs.getString("id"), rs.getString("conversation_id"), rs.getString("criterion_result_id"),
                rs.getString("criterion_title"), rs.getString("operator_id"), rs.getString("operator_name"), rs.getString("comment"),
                dn == null ? null : new Answer(dv, (Boolean) dn), st, rs.getString("created_label"),
                rs.getString("decision_reason"), rs.getString("reviewer_name"),
                new ResultValue(rs.getBigDecimal("ai_value"), rs.getBoolean("ai_is_na"), rs.getBigDecimal("ai_points"), rs.getBigDecimal("max_points")),
                "ACCEPTED".equals(st) ? new Answer(rs.getBigDecimal("new_value"), rs.getBoolean("new_is_na")) : null);
    }
}
