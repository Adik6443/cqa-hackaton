package kz.freedom.cqa.conversation;

import kz.freedom.cqa.checklist.ChecklistService;
import kz.freedom.cqa.checklist.Criterion;
import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.evaluation.EvaluationRunner;
import kz.freedom.cqa.evaluation.ScoringService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/** Read side for the conversation list and the conversation card. Shapes follow frontend/src/shared/api/types.ts. */
@Service
public class ConversationService {
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final JdbcClient db;
    private final ChecklistService checklists;
    private final ScoringService scoring;

    public ConversationService(JdbcClient db, ChecklistService checklists, ScoringService scoring) {
        this.db = db;
        this.checklists = checklists;
        this.scoring = scoring;
    }

    // ---------- DTOs ----------
    public record Summary(String id, String groupId, String operatorId, String operatorName, boolean fictionalAssignment,
                          String channel, String language, String dateRaw, String dateLabel, String status,
                          BigDecimal finalScore, BigDecimal aiScore, boolean grossError, int openAppeals, boolean reviewed,
                          String error, BigDecimal durationSec, String durationLabel, String provider, String model) {}

    public record Page<T>(List<T> items, long total, int page, int size) {}

    public record Message(int seq, String role, String text, String timestampRaw, BigDecimal offsetSec, String timeLabel) {}

    public record Answer(BigDecimal value, boolean isNa) {}

    public record ResultValue(BigDecimal value, boolean isNa, BigDecimal points, BigDecimal maxPoints) {}

    public record Evidence(int messageSeq, BigDecimal offsetSec, String quote) {}

    public record Decision(String status, String reason, Answer value) {}

    // "final" is a Java keyword, so the component is "fin" and is renamed in JSON
    public record CriterionResult(String id, Criterion criterion, ResultValue original,
                                  @com.fasterxml.jackson.annotation.JsonProperty("final") ResultValue fin, BigDecimal confidence,
                                  String explanation, List<Evidence> evidence, Decision decision, String openAppealId) {}

    public record Section(String title, BigDecimal originalScore, BigDecimal finalScore) {}

    public record Evaluation(String id, String status, String checklistId, int checklistVersion, BigDecimal originalScore,
                             BigDecimal finalScore, String scoreNote, boolean grossError, boolean simulated, int correctionsUsed,
                             String provider, String model, Integer tokensIn, Integer tokensOut, String error,
                             List<Section> sections, List<CriterionResult> results) {}

    public record Conversation(@com.fasterxml.jackson.annotation.JsonUnwrapped Summary summary, Integer operatorStartSeq, String audioPageUrl, List<Message> messages, Evaluation evaluation) {}

    // ---------- list ----------
    private static final String BASE = """
            FROM conversation c
            LEFT JOIN operator o ON o.id = c.operator_id
            LEFT JOIN evaluation e ON e.conversation_id = c.id AND e.is_latest
            """;
    private static final String COLUMNS = """
            SELECT c.*, o.name AS operator_name, coalesce(o.fictional, true) AS fictional,
                   e.status AS e_status, e.final_total, e.ai_total, e.final_gross_error, e.error_text, e.provider, e.model,
                   (SELECT count(*) FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                     WHERE cr.evaluation_id=e.id AND a.status='OPEN') AS open_appeals,
                   EXISTS (SELECT 1 FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                     WHERE cr.evaluation_id=e.id AND a.status<>'OPEN') AS reviewed
            """;

    public Page<Summary> list(ConversationFilter f, int page, int size) {
        int s = Math.min(Math.max(size, 1), 500);
        int p = Math.max(page, 0);
        ConversationFilter.Where w = f.toWhere();
        long total = db.sql("SELECT count(*) " + BASE + " WHERE " + w.sql()).params(w.params()).query(Long.class).single();
        List<Summary> items = db.sql(COLUMNS + BASE + " WHERE " + w.sql() + " ORDER BY c.conversation_date DESC, c.id LIMIT :lim OFFSET :off")
                .params(w.params()).param("lim", s).param("off", p * s)
                .query((rs, i) -> summary(rs)).list();
        return new Page<>(items, total, p, s);
    }

    private Summary summary(ResultSet rs) throws SQLException {
        String channel = rs.getString("channel");
        java.sql.Timestamp started = rs.getTimestamp("started_at");
        String dateLabel = rs.getDate("conversation_date").toLocalDate().format(DAY)
                + (started != null ? " " + new java.text.SimpleDateFormat("HH:mm").format(started) : "");
        BigDecimal dur = rs.getBigDecimal("operator_duration_sec");
        if (dur == null) dur = rs.getBigDecimal("duration_sec");
        String status = rs.getString("e_status");
        return new Summary(rs.getString("id"), rs.getString("group_id"), str(rs.getObject("operator_id")),
                rs.getString("operator_name"), rs.getBoolean("fictional"), channel, rs.getString("language"),
                rs.getDate("conversation_date").toString(), dateLabel, status == null ? "NOT_EVALUATED" : status,
                rs.getBigDecimal("final_total"), rs.getBigDecimal("ai_total"), rs.getBoolean("final_gross_error"),
                rs.getInt("open_appeals"), rs.getBoolean("reviewed"), rs.getString("error_text"),
                dur, dur == null ? null : EvaluationRunner.timeLabel(dur, ""), rs.getString("provider"), rs.getString("model"));
    }

    // ---------- detail ----------
    public Conversation get(String id) {
        List<Summary> found = db.sql(COLUMNS + BASE + " WHERE c.id = :id").param("id", id).query((rs, i) -> summary(rs)).list();
        if (found.isEmpty()) throw ApiException.notFound("Диалог " + id);
        Map<String, Object> c = db.sql("SELECT operator_start_seq, audio_page_url FROM conversation WHERE id=:id").param("id", id).query().singleRow();
        List<Message> messages = db.sql("SELECT seq, speaker, text, timestamp_raw, offset_sec FROM message WHERE conversation_id=:id ORDER BY seq")
                .param("id", id)
                .query((rs, i) -> new Message(rs.getInt("seq"), rs.getString("speaker"), rs.getString("text"), rs.getString("timestamp_raw"),
                        rs.getBigDecimal("offset_sec"), EvaluationRunner.timeLabel(rs.getBigDecimal("offset_sec"), rs.getString("timestamp_raw"))))
                .list();
        Long evalId = db.sql("SELECT id FROM evaluation WHERE conversation_id=:id AND is_latest").param("id", id).query(Long.class).optional().orElse(null);
        return new Conversation(found.get(0), (Integer) c.get("operator_start_seq"), (String) c.get("audio_page_url"),
                messages, evalId == null ? null : evaluation(evalId, messages));
    }

    public Evaluation evaluation(long evalId, List<Message> messages) {
        Map<String, Object> e = db.sql("SELECT e.*, v.version_no FROM evaluation e JOIN checklist_version v ON v.id=e.checklist_version_id WHERE e.id=:id")
                .param("id", evalId).query().singleRow();
        Map<String, Criterion> criteria = checklists.criteria(((Number) e.get("checklist_version_id")).longValue()).stream()
                .collect(Collectors.toMap(Criterion::id, x -> x, (a, b) -> a, LinkedHashMap::new));
        Map<Integer, BigDecimal> offsets = new HashMap<>();
        messages.forEach(m -> offsets.put(m.seq(), m.offsetSec()));

        List<CriterionResult> results = db.sql("SELECT * FROM criterion_result WHERE evaluation_id=:id").param("id", evalId)
                .query((rs, i) -> {
                    long crId = rs.getLong("id");
                    Criterion cr = criteria.get(rs.getString("criterion_id"));
                    List<Evidence> ev = db.sql("SELECT message_seq, quote FROM evidence WHERE criterion_result_id=:id ORDER BY message_seq")
                            .param("id", crId).query((r2, j) -> new Evidence(r2.getInt(1), offsets.get(r2.getInt(1)), r2.getString(2))).list();
                    Decision decision = db.sql("""
                            SELECT status, decision_reason, new_value, new_is_na FROM appeal
                            WHERE criterion_result_id=:id AND status<>'OPEN' ORDER BY decided_at DESC LIMIT 1
                            """).param("id", crId).query((r2, j) -> new Decision(r2.getString(1), r2.getString(2),
                            "ACCEPTED".equals(r2.getString(1)) ? new Answer(r2.getBigDecimal(3), r2.getBoolean(4)) : null)).optional().orElse(null);
                    String openId = db.sql("SELECT id::text FROM appeal WHERE criterion_result_id=:id AND status='OPEN'").param("id", crId)
                            .query(String.class).optional().orElse(null);
                    return new CriterionResult(String.valueOf(crId), cr,
                            new ResultValue(rs.getBigDecimal("ai_value"), rs.getBoolean("ai_is_na"), rs.getBigDecimal("ai_points"), rs.getBigDecimal("max_points")),
                            new ResultValue(rs.getBigDecimal("final_value"), rs.getBoolean("final_is_na"), rs.getBigDecimal("final_points"), rs.getBigDecimal("max_points")),
                            rs.getBigDecimal("confidence"), rs.getString("explanation"), ev, decision, openId);
                }).list();
        results = results.stream().sorted(Comparator.comparingInt(r -> r.criterion().sortOrder())).toList();

        // section totals by the same scoring rules
        Map<String, List<CriterionResult>> bySection = new LinkedHashMap<>();
        results.forEach(r -> bySection.computeIfAbsent(r.criterion().section(), k -> new ArrayList<>()).add(r));
        List<Section> sections = new ArrayList<>();
        bySection.forEach((title, list) -> {
            if (list.stream().allMatch(r -> r.criterion().isFlag())) return;
            sections.add(new Section(title,
                    scoring.total(list.stream().map(r -> new ScoringService.Scored(r.criterion(), new ScoringService.Answer(r.original().value(), r.original().isNa()))).toList()).score(),
                    scoring.total(list.stream().map(r -> new ScoringService.Scored(r.criterion(), new ScoringService.Answer(r.fin().value(), r.fin().isNa()))).toList()).score()));
        });

        String status = (String) e.get("status");
        BigDecimal fin = (BigDecimal) e.get("final_total");
        String note = "DONE".equals(status) && fin == null ? "Итог не рассчитывается: нет применимых критериев с весом" : null;
        return new Evaluation(String.valueOf(evalId), status, str(e.get("checklist_version_id")), ((Number) e.get("version_no")).intValue(),
                (BigDecimal) e.get("ai_total"), fin, note, Boolean.TRUE.equals(e.get("final_gross_error")), Boolean.TRUE.equals(e.get("simulated")),
                ((Number) e.get("corrections_used")).intValue(), (String) e.get("provider"), (String) e.get("model"),
                (Integer) e.get("tokens_in"), (Integer) e.get("tokens_out"), (String) e.get("error_text"), sections, results);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
