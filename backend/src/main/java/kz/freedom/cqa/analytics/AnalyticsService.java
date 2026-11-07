package kz.freedom.cqa.analytics;

import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.config.CqaProperties;
import kz.freedom.cqa.conversation.ConversationFilter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * All numbers for dashboards are calculated here (frontend only formats them).
 * Every method accepts the same ConversationFilter as the conversation list, so OKK can look at
 * "KZ chats for yesterday", "calls longer than 20 minutes", etc.
 */
@Service
public class AnalyticsService {
    private static final String BASE = """
            FROM conversation c
            LEFT JOIN operator o ON o.id = c.operator_id
            LEFT JOIN evaluation e ON e.conversation_id = c.id AND e.is_latest
            """;

    private final JdbcClient db;
    private final CqaProperties props;

    public AnalyticsService(JdbcClient db, CqaProperties props) {
        this.db = db;
        this.props = props;
    }

    public record Bucket(String label, long count) {}

    public record WeakCriterion(String title, String label) {}

    public record Summary(BigDecimal averageScore, long evaluated, long total, long grossErrors, long openAppeals,
                          BigDecimal acceptedAppealRate, List<Bucket> distribution, List<WeakCriterion> weakCriteria, boolean simulated) {}

    public Summary summary(ConversationFilter f) {
        ConversationFilter.Where w = f.toWhere();
        Map<String, Object> r = db.sql("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE e.status='DONE') AS evaluated,
                       round(avg(e.final_total) FILTER (WHERE e.status='DONE'), 2) AS avg,
                       count(*) FILTER (WHERE e.final_gross_error) AS gross,
                       bool_or(e.simulated) FILTER (WHERE e.status='DONE') AS simulated
                """ + BASE + " WHERE " + w.sql()).params(w.params()).query().singleRow();
        Map<String, Object> ap = db.sql("""
                SELECT count(*) FILTER (WHERE a.status='OPEN') AS open,
                       count(*) FILTER (WHERE a.status='ACCEPTED') AS accepted,
                       count(*) FILTER (WHERE a.status<>'OPEN') AS decided
                FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                JOIN evaluation e ON e.id=cr.evaluation_id AND e.is_latest
                JOIN conversation c ON c.id=e.conversation_id LEFT JOIN operator o ON o.id=c.operator_id
                WHERE """ + " " + w.sql()).params(w.params()).query().singleRow();
        long decided = num(ap.get("decided"));
        BigDecimal rate = decided == 0 ? null
                : BigDecimal.valueOf(num(ap.get("accepted")) * 100.0 / decided).setScale(2, RoundingMode.HALF_UP);

        List<Bucket> distribution = new ArrayList<>();
        for (String[] b : ConversationFilter.SCORE_BUCKETS) {
            long n = db.sql("SELECT count(*) " + BASE + " WHERE " + w.sql() + " AND e.final_total >= :bf AND e.final_total < :bt")
                    .params(w.params()).param("bf", Double.parseDouble(b[1])).param("bt", Double.parseDouble(b[2])).query(Long.class).single();
            distribution.add(new Bucket(b[0].replace("-", "–"), n));
        }
        List<WeakCriterion> weak = criteria(f).stream()
                .filter(c -> c.avgPercent() != null && !c.flag())
                .sorted(Comparator.comparing(CriterionStat::avgPercent)).limit(3)
                .map(c -> new WeakCriterion(c.title(), "в среднем " + c.avgPercent().stripTrailingZeros().toPlainString() + "% от максимума"))
                .toList();
        return new Summary((BigDecimal) r.get("avg"), num(r.get("evaluated")), num(r.get("total")), num(r.get("gross")),
                num(ap.get("open")), rate, distribution, weak, Boolean.TRUE.equals(r.get("simulated")));
    }

    public record Group(String key, String label, long total, long evaluated, BigDecimal avgScore, long grossErrors,
                        BigDecimal grossErrorRate, BigDecimal lowShare, BigDecimal avgDurationSec) {}

    /**
     * by = language | channel | duration | date | operator | model | group
     * lowShare = % of evaluated dialogs with score below 70.
     */
    public List<Group> breakdown(String by, ConversationFilter f) {
        String key;
        String order;
        switch (by == null ? "" : by) {
            case "language" -> { key = "c.language"; order = "1"; }
            case "channel" -> { key = "c.channel"; order = "1"; }
            case "date" -> { key = "c.conversation_date::text"; order = "1"; }
            case "operator" -> { key = "coalesce(o.name, '—')"; order = "avg_score DESC NULLS LAST"; }
            case "model" -> { key = "coalesce(e.provider || ' / ' || e.model, 'не оценено')"; order = "1"; }
            case "group" -> { key = "c.group_id"; order = "1"; }
            case "duration" -> {
                StringBuilder sb = new StringBuilder("CASE");
                for (String[] b : ConversationFilter.DURATION_BUCKETS)
                    sb.append(" WHEN ").append(ConversationFilter.DURATION_SQL).append(" < ").append(b[3]).append(" THEN '").append(b[0]).append("'");
                key = sb.append(" END").toString();
                order = "min(" + ConversationFilter.DURATION_SQL + ")";
            }
            default -> throw ApiException.badRequest("by: language, channel, duration, date, operator, model, group");
        }
        ConversationFilter.Where w = f.toWhere();
        return db.sql("SELECT " + key + " AS k, count(*) AS total, count(*) FILTER (WHERE e.status='DONE') AS evaluated,"
                        + " round(avg(e.final_total) FILTER (WHERE e.status='DONE'), 2) AS avg_score,"
                        + " count(*) FILTER (WHERE e.final_gross_error) AS gross,"
                        + " count(*) FILTER (WHERE e.status='DONE' AND e.final_total < 70) AS low,"
                        + " round(avg(" + ConversationFilter.DURATION_SQL + "), 1) AS avg_dur "
                        + BASE + " WHERE " + w.sql() + " GROUP BY 1 ORDER BY " + order)
                .params(w.params())
                .query((rs, i) -> {
                    long ev = rs.getLong("evaluated");
                    String k = rs.getString("k");
                    return new Group(k, label(by, k), rs.getLong("total"), ev, rs.getBigDecimal("avg_score"), rs.getLong("gross"),
                            pct(rs.getLong("gross"), ev), pct(rs.getLong("low"), ev), rs.getBigDecimal("avg_dur"));
                }).list();
    }

    public record CriterionStat(String code, String title, boolean flag, long evaluated, long naCount, long failCount, BigDecimal avgPercent) {}

    /** Per criterion: how often it fails / is N/A, average % of max points (latest evaluations, final values). */
    public List<CriterionStat> criteria(ConversationFilter f) {
        ConversationFilter.Where w = f.toWhere();
        return db.sql("""
                SELECT k.code, k.title, (k.answer_type='FLAG') AS flag, count(*) AS n,
                       count(*) FILTER (WHERE cr.final_is_na) AS na,
                       count(*) FILTER (WHERE NOT cr.final_is_na AND ((k.answer_type='FLAG' AND cr.final_value > 0) OR (k.answer_type<>'FLAG' AND cr.final_value = 0))) AS fail,
                       round(avg(cr.final_points * 100.0 / nullif(cr.max_points, 0)) FILTER (WHERE NOT cr.final_is_na AND k.answer_type<>'FLAG'), 1) AS pct
                FROM criterion_result cr JOIN criterion k ON k.id = cr.criterion_id
                JOIN evaluation e ON e.id = cr.evaluation_id AND e.is_latest AND e.status='DONE'
                JOIN conversation c ON c.id = e.conversation_id LEFT JOIN operator o ON o.id = c.operator_id
                WHERE """ + " " + w.sql() + " GROUP BY k.code, k.title, k.answer_type ORDER BY k.code")
                .params(w.params())
                .query((rs, i) -> new CriterionStat(rs.getString("code"), rs.getString("title"), rs.getBoolean("flag"), rs.getLong("n"),
                        rs.getLong("na"), rs.getLong("fail"), rs.getBigDecimal("pct"))).list();
    }

    // ---------- operator rating / loyalty ----------

    public record TrendPoint(String label, BigDecimal score) {}

    public record Rating(String operatorId, String name, Integer rank, BigDecimal score, long conversations, long grossErrors,
                         String level, String bonusLabel, BigDecimal pointsToNext, boolean eligible, List<String> badges,
                         List<TrendPoint> trend, List<String> weakCriteria, String period) {}

    /**
     * Rating = average final score over the period (default: last N days up to the newest dialog), at least min-dialogs dialogs.
     * Dialogs with an open appeal are excluded until decided. Any gross error in the period = no bonus.
     * Levels: Платина >= 95 (+15%), Золото 85-94.99 (+10%), Серебро 70-84.99 (+5%), Базовый < 70 (обучение).
     */
    public List<Rating> leaderboard(LocalDate from, LocalDate to, String onlyOperatorId) {
        LocalDate end = to != null ? to : db.sql("SELECT max(conversation_date) FROM conversation").query(LocalDate.class).optional().orElse(LocalDate.now());
        if (end == null) end = LocalDate.now();
        LocalDate start = from != null ? from : end.minusDays(props.rating().periodDays() - 1L);
        int min = props.rating().minDialogs();
        String period = start + " — " + end;
        final LocalDate s = start, en = end;

        String counted = """
                FROM conversation c JOIN evaluation e ON e.conversation_id=c.id AND e.is_latest AND e.status='DONE'
                WHERE c.conversation_date BETWEEN :s AND :e AND c.operator_id = :op
                  AND NOT EXISTS (SELECT 1 FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                                  WHERE cr.evaluation_id=e.id AND a.status='OPEN')
                """;
        List<Map<String, Object>> ops = db.sql("SELECT id, name FROM operator ORDER BY name").query().listOfRows();
        List<Rating> rows = new ArrayList<>();
        for (Map<String, Object> op : ops) {
            long opId = num(op.get("id"));
            if (onlyOperatorId != null && !onlyOperatorId.isBlank() && opId != Long.parseLong(onlyOperatorId)) continue;
            Map<String, Object> a = db.sql("SELECT count(*) AS n, round(avg(e.final_total),2) AS avg, count(*) FILTER (WHERE e.final_gross_error) AS gross, "
                            + "bool_and(e.final_total >= 85) AS stable " + counted)
                    .param("s", s).param("e", en).param("op", opId).query().singleRow();
            long n = num(a.get("n"));
            if (n == 0 && onlyOperatorId == null) continue;
            BigDecimal score = (BigDecimal) a.get("avg");
            long gross = num(a.get("gross"));
            boolean eligible = n >= min && score != null;
            String level = level(score);
            String bonus = !eligible ? "Нужно минимум " + min + " оценённых диалогов"
                    : gross > 0 ? "Без бонуса: грубая ошибка в периоде"
                    : switch (level) { case "Платина" -> "+15%"; case "Золото" -> "+10%"; case "Серебро" -> "+5%"; default -> "Обучение"; };
            List<String> badges = new ArrayList<>();
            if (eligible && gross == 0) badges.add("Без грубых ошибок");
            if (eligible && Boolean.TRUE.equals(a.get("stable"))) badges.add("Стабильно 85+");
            List<TrendPoint> trend = db.sql("SELECT c.conversation_date::text AS d, round(avg(e.final_total),2) AS v " + counted + " GROUP BY 1 ORDER BY 1")
                    .param("s", s).param("e", en).param("op", opId)
                    .query((rs, i) -> new TrendPoint(rs.getString("d"), rs.getBigDecimal("v"))).list();
            List<String> weakCriteria = db.sql("""
                    SELECT k.title FROM criterion_result cr JOIN criterion k ON k.id=cr.criterion_id
                    JOIN evaluation e ON e.id=cr.evaluation_id AND e.is_latest AND e.status='DONE'
                    JOIN conversation c ON c.id=e.conversation_id
                    WHERE c.operator_id=:op AND c.conversation_date BETWEEN :s AND :e AND k.answer_type<>'FLAG' AND NOT cr.final_is_na
                    GROUP BY k.title HAVING avg(cr.final_points * 100.0 / nullif(cr.max_points,0)) < 80
                    ORDER BY avg(cr.final_points * 100.0 / nullif(cr.max_points,0)) LIMIT 2
                    """).param("op", opId).param("s", s).param("e", en).query(String.class).list();
            rows.add(new Rating(String.valueOf(opId), (String) op.get("name"), null, score, n, gross, level, bonus,
                    pointsToNext(score), eligible, badges, trend, weakCriteria, period));
        }
        // rank only eligible operators, by score
        List<Rating> eligibleSorted = rows.stream().filter(Rating::eligible)
                .sorted(Comparator.comparing(Rating::score, Comparator.reverseOrder())).toList();
        List<Rating> out = new ArrayList<>();
        int rank = 1;
        for (Rating r : eligibleSorted) out.add(withRank(r, rank++));
        rows.stream().filter(r -> !r.eligible()).sorted(Comparator.comparing(Rating::name)).forEach(out::add);
        return out;
    }

    private static Rating withRank(Rating r, int rank) {
        return new Rating(r.operatorId(), r.name(), rank, r.score(), r.conversations(), r.grossErrors(), r.level(), r.bonusLabel(),
                r.pointsToNext(), r.eligible(), r.badges(), r.trend(), r.weakCriteria(), r.period());
    }

    static String level(BigDecimal s) {
        if (s == null) return "—";
        double v = s.doubleValue();
        return v >= 95 ? "Платина" : v >= 85 ? "Золото" : v >= 70 ? "Серебро" : "Базовый";
    }

    static BigDecimal pointsToNext(BigDecimal s) {
        if (s == null) return null;
        double v = s.doubleValue();
        double next = v < 70 ? 70 : v < 85 ? 85 : v < 95 ? 95 : -1;
        return next < 0 ? null : BigDecimal.valueOf(next - v).setScale(2, RoundingMode.HALF_UP);
    }

    private static String label(String by, String key) {
        if (key == null) return "—";
        if ("duration".equals(by))
            return ConversationFilter.DURATION_BUCKETS.stream().filter(b -> b[0].equals(key)).map(b -> b[1]).findFirst().orElse(key);
        if ("channel".equals(by)) return "VOICE".equals(key) ? "Звонки" : "Чаты";
        return key;
    }

    private static BigDecimal pct(long part, long whole) {
        return whole == 0 ? null : BigDecimal.valueOf(part * 100.0 / whole).setScale(2, RoundingMode.HALF_UP);
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }
}
