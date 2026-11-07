package kz.freedom.cqa.evaluation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kz.freedom.cqa.checklist.ChecklistService;
import kz.freedom.cqa.checklist.Criterion;
import kz.freedom.cqa.config.CqaProperties;
import kz.freedom.cqa.llm.LlmClient;
import kz.freedom.cqa.llm.LlmRouter;
import kz.freedom.cqa.llm.PromptBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.*;

/**
 * Background part of an evaluation:
 * prompt -> LLM -> parse JSON -> validate (values, N/A rules, evidence seqs) -> retry once with the errors -> score in Java -> save.
 */
@Component
public class EvaluationRunner {
    private static final Logger log = LoggerFactory.getLogger(EvaluationRunner.class);

    private final JdbcClient db;
    private final ChecklistService checklists;
    private final LlmRouter router;
    private final PromptBuilder prompts;
    private final ScoringService scoring;
    private final ObjectMapper mapper;
    private final TransactionTemplate tx;
    private final CqaProperties props;

    public EvaluationRunner(JdbcClient db, ChecklistService checklists, LlmRouter router, PromptBuilder prompts,
                            ScoringService scoring, ObjectMapper mapper, TransactionTemplate tx, CqaProperties props) {
        this.db = db;
        this.checklists = checklists;
        this.router = router;
        this.prompts = prompts;
        this.scoring = scoring;
        this.mapper = mapper;
        this.tx = tx;
        this.props = props;
    }

    record Parsed(String code, BigDecimal value, boolean isNa, BigDecimal confidence, String explanation, List<Integer> seqs) {}

    @Async("llmExecutor")
    public void runAsync(long evaluationId) {
        try {
            run(evaluationId);
        } catch (Exception e) {
            log.warn("Evaluation {} failed: {}", evaluationId, e.toString());
            fail(evaluationId, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        } finally {
            BatchService.refreshBatchOf(db, evaluationId);
        }
    }

    void run(long evaluationId) {
        Map<String, Object> ev = db.sql("SELECT e.*, c.channel, c.language, c.operator_start_seq FROM evaluation e JOIN conversation c ON c.id=e.conversation_id WHERE e.id=:id")
                .param("id", evaluationId).query().singleRow();
        String conversationId = (String) ev.get("conversation_id");
        String language = (String) ev.get("language");
        String channel = (String) ev.get("channel");
        Integer opStart = (Integer) ev.get("operator_start_seq");
        List<Criterion> criteria = checklists.criteria(((Number) ev.get("checklist_version_id")).longValue());

        List<PromptBuilder.Line> lines = db.sql("SELECT seq, timestamp_raw, offset_sec, speaker, text FROM message WHERE conversation_id=:c ORDER BY seq")
                .param("c", conversationId)
                .query((rs, i) -> new PromptBuilder.Line(rs.getInt("seq"),
                        timeLabel(rs.getBigDecimal("offset_sec"), rs.getString("timestamp_raw")), rs.getString("speaker"), rs.getString("text")))
                .list();
        Set<Integer> seqs = new HashSet<>();
        lines.forEach(l -> seqs.add(l.seq()));

        List<PromptBuilder.Correction> corrections = corrections(criteria, language);
        String system = prompts.system();
        String user = prompts.user(channel, language, opStart, criteria, corrections, lines);

        LlmClient client = router.client((String) ev.get("provider"));
        String model = (String) ev.get("model");
        int maxAttempts = Math.max(1, props.evaluation().maxAttempts());
        int tokensIn = 0, tokensOut = 0;
        long started = System.currentTimeMillis();
        String raw = null;
        List<String> errors = List.of();
        Map<String, Parsed> parsed = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            String prompt = errors.isEmpty() ? user
                    : user + "\n\nТвой прошлый ответ отклонён валидатором. Исправь ошибки и верни полный JSON заново:\n- " + String.join("\n- ", errors);
            LlmClient.Reply reply = client.complete(new LlmClient.Request(model, system, prompt, new LlmClient.MockContext(criteria, lines)));
            raw = reply.text();
            tokensIn += reply.tokensIn() == null ? 0 : reply.tokensIn();
            tokensOut += reply.tokensOut() == null ? 0 : reply.tokensOut();
            List<String> errs = new ArrayList<>();
            parsed = parse(raw, criteria, seqs, errs);
            errors = errs;
            final int att = attempt;
            db.sql("UPDATE evaluation SET attempts=:a WHERE id=:id").param("a", att).param("id", evaluationId).update();
            if (errors.isEmpty()) break;
        }
        int latency = (int) (System.currentTimeMillis() - started);
        if (!errors.isEmpty()) {
            final String r = raw;
            final int ti = tokensIn, to = tokensOut;
            db.sql("UPDATE evaluation SET status='FAILED', error_text=:e, raw_response=:r, tokens_in=:ti, tokens_out=:to, latency_ms=:l, finished_at=now() WHERE id=:id")
                    .param("e", "Ответ AI не прошёл проверку: " + String.join("; ", errors)).param("r", r)
                    .param("ti", ti).param("to", to).param("l", latency).param("id", evaluationId).update();
            return;
        }
        save(evaluationId, criteria, parsed, lines, raw, tokensIn, tokensOut, latency, corrections.size());
    }

    private void save(long evaluationId, List<Criterion> criteria, Map<String, Parsed> parsed, List<PromptBuilder.Line> lines,
                      String raw, int tokensIn, int tokensOut, int latency, int correctionsUsed) {
        Map<Integer, String> textBySeq = new HashMap<>();
        lines.forEach(l -> textBySeq.put(l.seq(), l.text()));
        tx.executeWithoutResult(st -> {
            List<ScoringService.Scored> scored = new ArrayList<>();
            for (Criterion c : criteria) {
                Parsed p = parsed.get(c.code());
                ScoringService.Answer a = new ScoringService.Answer(p.isNa() ? null : p.value(), p.isNa());
                scored.add(new ScoringService.Scored(c, a));
                BigDecimal points = scoring.points(c, a);
                long crId = db.sql("""
                        INSERT INTO criterion_result(evaluation_id, criterion_id, ai_value, ai_is_na, ai_points,
                          final_value, final_is_na, final_points, max_points, explanation, confidence)
                        VALUES (:e, :c, :v, :na, :p, :v, :na, :p, :mx, :ex, :conf) RETURNING id
                        """)
                        .param("e", evaluationId).param("c", Long.parseLong(c.id())).param("v", a.value()).param("na", a.isNa())
                        .param("p", points).param("mx", scoring.maxPoints(c)).param("ex", p.explanation()).param("conf", p.confidence())
                        .query(Long.class).single();
                for (Integer seq : p.seqs()) {
                    String q = textBySeq.getOrDefault(seq, "");
                    db.sql("INSERT INTO evidence(criterion_result_id, message_seq, quote) VALUES (:cr, :s, :q)")
                            .param("cr", crId).param("s", seq).param("q", q.length() > 300 ? q.substring(0, 300) + "…" : q).update();
                }
            }
            ScoringService.Total t = scoring.total(scored);
            db.sql("""
                    UPDATE evaluation SET status='DONE', ai_total=:t, final_total=:t, ai_gross_error=:g, final_gross_error=:g,
                      raw_response=:r, tokens_in=:ti, tokens_out=:to, latency_ms=:l, corrections_used=:cu, finished_at=now(), error_text=null
                    WHERE id=:id
                    """)
                    .param("t", t.score()).param("g", t.grossError()).param("r", raw).param("ti", tokensIn).param("to", tokensOut)
                    .param("l", latency).param("cu", correctionsUsed).param("id", evaluationId).update();
        });
    }

    /** Validates the model answer against the checklist; every problem goes back to the model on retry. */
    Map<String, Parsed> parse(String raw, List<Criterion> criteria, Set<Integer> seqs, List<String> errors) {
        Map<String, Parsed> out = new HashMap<>();
        JsonNode root;
        try {
            int a = raw.indexOf('{'), b = raw.lastIndexOf('}');
            root = mapper.readTree(raw.substring(a, b + 1));
        } catch (Exception e) {
            errors.add("ответ не является JSON");
            return out;
        }
        Map<String, JsonNode> byCode = new HashMap<>();
        root.path("criteria").forEach(n -> byCode.put(n.path("code").asText(), n));
        for (Criterion c : criteria) {
            JsonNode n = byCode.get(c.code());
            if (n == null) { errors.add(c.code() + ": нет ответа"); continue; }
            boolean na = n.path("isNa").asBoolean(false);
            BigDecimal value = n.path("value").isNumber() ? n.path("value").decimalValue() : null;
            if (na && !c.allowNa()) errors.add(c.code() + ": N/A для этого критерия запрещено");
            if (!na && (value == null || !c.allowsValue(value)))
                errors.add(c.code() + ": значение " + n.path("value").asText() + " не из списка допустимых");
            String ex = n.path("explanation").asText("").trim();
            if (ex.isEmpty()) errors.add(c.code() + ": пустое обоснование");
            List<Integer> ev = new ArrayList<>();
            n.path("evidenceSeqs").forEach(x -> ev.add(x.asInt()));
            List<Integer> bad = ev.stream().filter(s -> !seqs.contains(s)).toList();
            if (!bad.isEmpty()) errors.add(c.code() + ": реплик " + bad + " нет в стенограмме");
            double conf = n.path("confidence").asDouble(0.5);
            out.put(c.code(), new Parsed(c.code(), value, na, BigDecimal.valueOf(Math.max(0, Math.min(1, conf))).setScale(2, java.math.RoundingMode.HALF_UP),
                    ex, ev.stream().filter(seqs::contains).distinct().toList()));
        }
        return out;
    }

    /** Up to N active corrections per criterion; same language first, then newest. Only for unchanged criteria (fingerprint). */
    private List<PromptBuilder.Correction> corrections(List<Criterion> criteria, String language) {
        int perCriterion = props.evaluation().correctionsPerCriterion();
        List<PromptBuilder.Correction> out = new ArrayList<>();
        for (Criterion c : criteria) {
            out.addAll(db.sql("""
                    SELECT criterion_code, language, snippet, ai_value, correct_value, reason FROM ai_correction
                    WHERE is_active AND criterion_fingerprint=:fp
                    ORDER BY (language = :lang) DESC, created_at DESC LIMIT :n
                    """).param("fp", c.fingerprint()).param("lang", language).param("n", perCriterion)
                    .query((rs, i) -> new PromptBuilder.Correction(rs.getString(1), rs.getString(2), rs.getString(3),
                            rs.getString(4), rs.getString(5), rs.getString(6))).list());
        }
        return out;
    }

    private void fail(long id, String message) {
        db.sql("UPDATE evaluation SET status='FAILED', error_text=:e, finished_at=now() WHERE id=:id AND status='PENDING'")
                .param("e", message.length() > 1000 ? message.substring(0, 1000) : message).param("id", id).update();
    }

    public static String timeLabel(BigDecimal offset, String raw) {
        if (offset == null) return raw;
        int s = offset.intValue();
        return s >= 3600 ? "%d:%02d:%02d".formatted(s / 3600, s / 60 % 60, s % 60) : "%02d:%02d".formatted(s / 60, s % 60);
    }
}
