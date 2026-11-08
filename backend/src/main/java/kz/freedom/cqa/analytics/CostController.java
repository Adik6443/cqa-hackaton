package kz.freedom.cqa.analytics;

import kz.freedom.cqa.common.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * Cost of AI evaluations. Counts EVERY evaluation run (not only the latest one), because a cost test
 * evaluates the same dialogs several times with different models.
 *
 * cost = ((tokens_in - tokens_cached) * input + tokens_cached * cached + tokens_out * output) / 1e6,
 * prices per model from model_price (edited in "Модели AI"). Changing a price recalculates history.
 */
@RestController
@RequestMapping("/api")
public class CostController {
    private final JdbcClient db;

    public CostController(JdbcClient db) {
        this.db = db;
    }

    // ---------- prices ----------
    public record Price(String model, BigDecimal inputPerMtok, BigDecimal cachedPerMtok, BigDecimal outputPerMtok, boolean used) {}

    public record PriceInput(BigDecimal inputPerMtok, BigDecimal cachedPerMtok, BigDecimal outputPerMtok) {}

    /** All priced models + models that were used in evaluations but have no price yet (inputPerMtok = null). */
    @GetMapping("/llm/prices")
    public List<Price> prices() {
        return db.sql("""
                SELECT m.model, p.input_per_mtok, p.cached_per_mtok, p.output_per_mtok,
                       EXISTS (SELECT 1 FROM evaluation e WHERE e.model = m.model) AS used
                FROM (SELECT model FROM model_price UNION SELECT DISTINCT model FROM evaluation
                      UNION SELECT model FROM llm_route) m
                LEFT JOIN model_price p ON p.model = m.model
                WHERE m.model <> 'heuristic-v1'
                ORDER BY used DESC, m.model
                """).query((rs, i) -> new Price(rs.getString(1), rs.getBigDecimal(2), rs.getBigDecimal(3), rs.getBigDecimal(4), rs.getBoolean(5))).list();
    }

    @PutMapping("/llm/prices/{model}")
    public List<Price> savePrice(@PathVariable String model, @RequestBody PriceInput in) {
        if (in.inputPerMtok() == null || in.outputPerMtok() == null || in.inputPerMtok().signum() < 0 || in.outputPerMtok().signum() < 0)
            throw ApiException.badRequest("Укажите цену за 1 млн входных и выходных токенов (0 или больше)");
        db.sql("""
                INSERT INTO model_price(model, input_per_mtok, cached_per_mtok, output_per_mtok) VALUES (:m, :i, :c, :o)
                ON CONFLICT (model) DO UPDATE SET input_per_mtok=EXCLUDED.input_per_mtok, cached_per_mtok=EXCLUDED.cached_per_mtok,
                  output_per_mtok=EXCLUDED.output_per_mtok, updated_at=now()
                """).param("m", model).param("i", in.inputPerMtok()).param("c", in.cachedPerMtok()).param("o", in.outputPerMtok()).update();
        return prices();
    }

    // ---------- analytics ----------
    public record CostRow(String key, String label, int evaluations, int unpriced, BigDecimal avgTokensIn, BigDecimal avgTokensCached,
                          BigDecimal avgTokensOut, BigDecimal avgChars, BigDecimal tokensPer1kChars, BigDecimal avgAttempts,
                          BigDecimal avgLatencyMs, BigDecimal avgCostUsd, BigDecimal totalCostUsd, BigDecimal costPer1000Usd,
                          BigDecimal failedShare) {}

    public record CostReport(String by, CostRow total, List<CostRow> rows) {}

    /** Shared CTE: one row per evaluation with its dialog features and cost. */
    static final String EV = """
            WITH ev AS (
              SELECT x.id, x.provider, x.model, x.status, x.attempts, x.latency_ms, x.corrections_used,
                     coalesce(x.tokens_in,0) AS t_in, coalesce(x.tokens_cached,0) AS t_cached, coalesce(x.tokens_out,0) AS t_out,
                     c.language, c.channel, c.message_count, v.version_no,
                     (SELECT coalesce(sum(length(m.text)),0) FROM message m WHERE m.conversation_id=c.id) AS chars,
                     CASE WHEN p.model IS NULL THEN NULL ELSE
                       ((coalesce(x.tokens_in,0) - coalesce(x.tokens_cached,0)) * p.input_per_mtok
                        + coalesce(x.tokens_cached,0) * coalesce(p.cached_per_mtok, p.input_per_mtok)
                        + coalesce(x.tokens_out,0) * p.output_per_mtok) / 1000000.0 END AS cost
              FROM evaluation x
              JOIN conversation c ON c.id = x.conversation_id
              JOIN checklist_version v ON v.id = x.checklist_version_id
              LEFT JOIN model_price p ON p.model = x.model
              WHERE x.status IN ('DONE','FAILED') AND x.tokens_in IS NOT NULL AND (:mock OR NOT x.simulated)
                AND (:prov = '' OR x.provider = :prov) AND (:lang = '' OR c.language = :lang)
                AND (:since::date IS NULL OR x.created_at >= :since::date)
            )
            """;

    private static final Map<String, String[]> KEYS = new LinkedHashMap<>();
    static {
        // by -> {key SQL, label SQL}
        KEYS.put("language", new String[]{"language", "language"});
        KEYS.put("channel", new String[]{"channel", "CASE channel WHEN 'VOICE' THEN 'Звонок' ELSE 'Чат' END"});
        KEYS.put("model", new String[]{"provider || '/' || model", "provider || ' · ' || model"});
        KEYS.put("languageModel", new String[]{"language || '/' || model", "language || ' · ' || model"});
        KEYS.put("length", new String[]{
                "CASE WHEN chars < 1500 THEN 1 WHEN chars < 3000 THEN 2 WHEN chars < 6000 THEN 3 ELSE 4 END::text",
                "CASE WHEN chars < 1500 THEN 'до 1 500 символов' WHEN chars < 3000 THEN '1 500–3 000' WHEN chars < 6000 THEN '3 000–6 000' ELSE 'больше 6 000' END"});
        KEYS.put("messages", new String[]{
                "CASE WHEN message_count <= 10 THEN 1 WHEN message_count <= 20 THEN 2 WHEN message_count <= 40 THEN 3 ELSE 4 END::text",
                "CASE WHEN message_count <= 10 THEN 'до 10 реплик' WHEN message_count <= 20 THEN '11–20 реплик' WHEN message_count <= 40 THEN '21–40 реплик' ELSE 'больше 40 реплик' END"});
        KEYS.put("attempts", new String[]{"coalesce(attempts,1)::text", "coalesce(attempts,1) || ' попытк.'"});
        KEYS.put("corrections", new String[]{"(corrections_used > 0)::text",
                "CASE WHEN corrections_used > 0 THEN 'с примерами ошибок AI' ELSE 'без примеров' END"});
        KEYS.put("checklist", new String[]{"lpad(version_no::text, 4, '0')", "'чек-лист v' || version_no"});
    }

    private static final String AGG = """
            count(*) AS n, count(*) FILTER (WHERE cost IS NULL) AS unpriced,
            round(avg(t_in)) AS a_in, round(avg(t_cached)) AS a_cached, round(avg(t_out)) AS a_out, round(avg(chars)) AS a_chars,
            round(sum(t_in)::numeric * 1000 / nullif(sum(chars),0), 1) AS t_per_k,
            round(avg(coalesce(attempts,1)), 2) AS a_att, round(avg(latency_ms)) AS a_lat,
            round(avg(cost), 6) AS a_cost, round(sum(cost), 4) AS s_cost, round(avg(cost) * 1000, 2) AS k_cost,
            round(avg(CASE WHEN status='FAILED' THEN 1.0 ELSE 0 END), 3) AS f_share
            """;

    /**
     * GET /api/analytics/cost?by=language|channel|model|languageModel|length|messages|attempts|corrections|checklist
     *     &provider=OPENAI&language=KZ&since=2026-11-08&includeMock=false
     */
    @GetMapping("/analytics/cost")
    public CostReport cost(@RequestParam(defaultValue = "language") String by,
                           @RequestParam(required = false) String provider,
                           @RequestParam(required = false) String language,
                           @RequestParam(required = false) LocalDate since,
                           @RequestParam(defaultValue = "false") boolean includeMock) {
        String[] k = KEYS.get(by);
        if (k == null) throw ApiException.badRequest("by: " + String.join(" | ", KEYS.keySet()));
        Map<String, Object> p = new HashMap<>();
        p.put("mock", includeMock);
        p.put("prov", provider == null ? "" : provider);
        p.put("lang", language == null ? "" : language);
        p.put("since", since == null ? null : since.toString());

        List<CostRow> rows = db.sql(EV + "SELECT " + k[0] + " AS key, min(" + k[1] + ") AS label, " + AGG + " FROM ev GROUP BY 1 ORDER BY 1")
                .params(p).query((rs, i) -> row(rs, rs.getString("key"), rs.getString("label"))).list();
        CostRow total = db.sql(EV + "SELECT " + AGG + " FROM ev").params(p).query((rs, i) -> row(rs, "total", "Всего")).single();
        return new CostReport(by, total, rows);
    }

    private static CostRow row(java.sql.ResultSet rs, String key, String label) throws java.sql.SQLException {
        return new CostRow(key, label, rs.getInt("n"), rs.getInt("unpriced"), rs.getBigDecimal("a_in"), rs.getBigDecimal("a_cached"),
                rs.getBigDecimal("a_out"), rs.getBigDecimal("a_chars"), rs.getBigDecimal("t_per_k"), rs.getBigDecimal("a_att"),
                rs.getBigDecimal("a_lat"), rs.getBigDecimal("a_cost"), rs.getBigDecimal("s_cost"), rs.getBigDecimal("k_cost"),
                rs.getBigDecimal("f_share"));
    }
}
