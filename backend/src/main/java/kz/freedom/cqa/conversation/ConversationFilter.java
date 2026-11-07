package kz.freedom.cqa.conversation;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Filters shared by: conversation list, "evaluate by filter" batch and analytics.
 * Bound from query params (?language=KZ&scoreBucket=0-49...) or from JSON body of a batch.
 *
 * scoreBucket:    0-49 | 50-69 | 70-84 | 85-100           (final score, after appeals)
 * durationBucket: lt3  | 3-10  | 10-20 | gt20  (minutes of the operator part of the dialog)
 */
public record ConversationFilter(
        String search,
        String status,          // NOT_EVALUATED | PENDING | DONE | FAILED
        String channel,         // CHAT | VOICE
        String language,        // RU | KZ | EN
        LocalDate from,         // conversation_date >= from
        LocalDate to,           // conversation_date <= to
        Double minScore,
        Double maxScore,
        String scoreBucket,
        Integer minDurationSec,
        Integer maxDurationSec,
        String durationBucket,
        String operatorId,
        Boolean grossError,
        Boolean hasOpenAppeal,
        String groupId,
        String role,            // OPERATOR -> only own conversations (demo scope, not security)
        String model) {         // provider/model of the latest evaluation, e.g. OPENAI or gpt-4.1

    /** Operator part duration; for dialogs without operator - whole dialog. */
    public static final String DURATION_SQL = "coalesce(c.operator_duration_sec, c.duration_sec, 0)";

    public static final List<String[]> SCORE_BUCKETS = List.of(
            new String[]{"0-49", "0", "50"}, new String[]{"50-69", "50", "70"},
            new String[]{"70-84", "70", "85"}, new String[]{"85-100", "85", "100.01"});

    public static final List<String[]> DURATION_BUCKETS = List.of(
            new String[]{"lt3", "до 3 мин", "0", "180"}, new String[]{"3-10", "3–10 мин", "180", "600"},
            new String[]{"10-20", "10–20 мин", "600", "1200"}, new String[]{"gt20", "больше 20 мин", "1200", "1000000"});

    public static ConversationFilter empty() {
        return new ConversationFilter(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    /** SQL alias convention: c = conversation, e = latest evaluation (LEFT JOIN). */
    public Where toWhere() {
        List<String> w = new ArrayList<>();
        Map<String, Object> p = new HashMap<>();
        if (notBlank(search)) {
            w.add("(c.id ILIKE :q OR EXISTS (SELECT 1 FROM message m WHERE m.conversation_id=c.id AND m.text ILIKE :q))");
            p.put("q", "%" + search.trim() + "%");
        }
        if (notBlank(status)) {
            w.add("coalesce(e.status,'NOT_EVALUATED') = :status");
            p.put("status", status.toUpperCase());
        }
        if (notBlank(channel)) { w.add("c.channel = :channel"); p.put("channel", channel.toUpperCase()); }
        if (notBlank(language)) { w.add("c.language = :language"); p.put("language", language.toUpperCase()); }
        if (notBlank(groupId)) { w.add("c.group_id = :groupId"); p.put("groupId", groupId); }
        if (from != null) { w.add("c.conversation_date >= :from"); p.put("from", from); }
        if (to != null) { w.add("c.conversation_date <= :to"); p.put("to", to); }
        if (minScore != null) { w.add("e.final_total >= :minScore"); p.put("minScore", minScore); }
        if (maxScore != null) { w.add("e.final_total <= :maxScore"); p.put("maxScore", maxScore); }
        if (notBlank(scoreBucket)) {
            String[] b = SCORE_BUCKETS.stream().filter(x -> x[0].equals(scoreBucket)).findFirst()
                    .orElseThrow(() -> kz.freedom.cqa.common.ApiException.badRequest("scoreBucket: 0-49, 50-69, 70-84, 85-100"));
            w.add("e.final_total >= :sbFrom AND e.final_total < :sbTo");
            p.put("sbFrom", Double.parseDouble(b[1]));
            p.put("sbTo", Double.parseDouble(b[2]));
        }
        if (minDurationSec != null) { w.add(DURATION_SQL + " >= :minDur"); p.put("minDur", minDurationSec); }
        if (maxDurationSec != null) { w.add(DURATION_SQL + " < :maxDur"); p.put("maxDur", maxDurationSec); }
        if (notBlank(durationBucket)) {
            String[] b = DURATION_BUCKETS.stream().filter(x -> x[0].equals(durationBucket)).findFirst()
                    .orElseThrow(() -> kz.freedom.cqa.common.ApiException.badRequest("durationBucket: lt3, 3-10, 10-20, gt20"));
            w.add(DURATION_SQL + " >= :dbFrom AND " + DURATION_SQL + " < :dbTo");
            p.put("dbFrom", Integer.parseInt(b[2]));
            p.put("dbTo", Integer.parseInt(b[3]));
        }
        if (notBlank(operatorId)) { w.add("c.operator_id = :operatorId"); p.put("operatorId", Long.parseLong(operatorId)); }
        if (grossError != null) { w.add("coalesce(e.final_gross_error,false) = :gross"); p.put("gross", grossError); }
        if (hasOpenAppeal != null) {
            w.add((hasOpenAppeal ? "" : "NOT ") + "EXISTS (SELECT 1 FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id WHERE cr.evaluation_id=e.id AND a.status='OPEN')");
        }
        if (notBlank(model)) { w.add("(e.provider = :model OR e.model = :model)"); p.put("model", model); }
        return new Where(w.isEmpty() ? "TRUE" : String.join(" AND ", w), p);
    }

    public record Where(String sql, Map<String, Object> params) {}

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
