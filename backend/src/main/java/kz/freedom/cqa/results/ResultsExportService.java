package kz.freedom.cqa.results;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.config.CqaProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Builds results.json in the organizers' format (CQA_Student_Guide_Appendix_Results, JSON 1.0):
 * one object per dialog of the group, 8 criteria by export_id, value true/false/null or scale step,
 * evidence_turns = message seq (1-based over the whole original transcript), score.final_score + critical_flag.
 * Dialogs that were not evaluated successfully are exported with status "error" (never hidden, never 0).
 */
@Service
public class ResultsExportService {
    private final JdbcClient db;
    private final CqaProperties props;
    private final ObjectMapper mapper;

    public ResultsExportService(JdbcClient db, CqaProperties props, ObjectMapper mapper) {
        this.db = db;
        this.props = props;
        this.mapper = mapper.copy().enable(SerializationFeature.INDENT_OUTPUT);
    }

    public record ExportReport(String path, boolean written, int count, int ok, int errors, List<String> warnings,
                               Map<String, Object> file) {}

    /**
     * @param set     "dev" or "prod" -> results/dev/results.json or results/prod/results.json
     * @param source  "ai" (what the system produced, default) or "final" (after OKK appeals)
     */
    public ExportReport export(String groupId, String set, String source, boolean write, boolean allowSimulated) {
        if (!Set.of("dev", "prod").contains(set)) throw ApiException.badRequest("set: dev или prod");
        boolean fin = "final".equalsIgnoreCase(source);
        String v = fin ? "final" : "ai";
        List<String> warnings = new ArrayList<>();

        List<Map<String, Object>> convs = db.sql("""
                SELECT c.id, e.id AS eval_id, e.status, e.error_text, e.provider, e.model, e.simulated,
                       e.%1$s_total AS total, e.%1$s_gross_error AS gross
                FROM conversation c LEFT JOIN evaluation e ON e.conversation_id=c.id AND e.is_latest
                WHERE c.group_id = :g ORDER BY c.id
                """.formatted(v)).param("g", groupId).query().listOfRows();
        if (convs.isEmpty()) throw ApiException.badRequest("Нет диалогов группы " + groupId + ": сначала POST /api/import?groupId=" + groupId);

        List<Map<String, Object>> results = new ArrayList<>();
        Set<String> models = new TreeSet<>();
        Set<String> providers = new TreeSet<>();
        int ok = 0, errors = 0;
        for (Map<String, Object> c : convs) {
            String id = (String) c.get("id");
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("conversation_id", id);
            if (!"DONE".equals(c.get("status"))) {
                r.put("status", "error");
                r.put("criteria", List.of());
                r.put("score", null);
                String reason = c.get("status") == null ? "Диалог не был оценён" :
                        "PENDING".equals(c.get("status")) ? "Оценка ещё выполняется" :
                                Objects.toString(c.get("error_text"), "Ошибка оценки");
                r.put("error", reason);
                results.add(r);
                errors++;
                continue;
            }
            if (Boolean.TRUE.equals(c.get("simulated"))) {
                if (!allowSimulated)
                    throw ApiException.conflict("SIMULATED_RESULTS", "Диалог " + id + " оценён демо-провайдером MOCK. Переоцените реальной моделью "
                            + "или передайте allowSimulated=true (только для проверки формата)");
                warnings.add(id + ": демо-оценка MOCK");
            }
            providers.add((String) c.get("provider"));
            models.add((String) c.get("model"));
            long evalId = ((Number) c.get("eval_id")).longValue();
            List<Map<String, Object>> criteria = db.sql("""
                    SELECT cr.id, k.export_id, k.answer_type, cr.%1$s_value AS val, cr.%1$s_is_na AS na, cr.explanation
                    FROM criterion_result cr JOIN criterion k ON k.id=cr.criterion_id
                    WHERE cr.evaluation_id=:e ORDER BY k.sort_order
                    """.formatted(v)).param("e", evalId).query().listOfRows().stream().map(x -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("criterion_id", x.get("export_id"));
                m.put("value", exportValue((String) x.get("answer_type"), (BigDecimal) x.get("val"), Boolean.TRUE.equals(x.get("na"))));
                m.put("rationale", x.get("explanation"));
                m.put("evidence_turns", db.sql("SELECT DISTINCT message_seq FROM evidence WHERE criterion_result_id=:id ORDER BY 1")
                        .param("id", ((Number) x.get("id")).longValue()).query(Integer.class).list());
                return m;
            }).toList();
            if (criteria.size() != 8) warnings.add(id + ": критериев " + criteria.size() + " (организаторы ждут 8)");
            r.put("status", "ok");
            r.put("criteria", criteria);
            Map<String, Object> score = new LinkedHashMap<>();
            score.put("final_score", c.get("total"));
            score.put("critical_flag", Boolean.TRUE.equals(c.get("gross")));
            r.put("score", score);
            results.add(r);
            ok++;
        }

        Map<String, Object> file = new LinkedHashMap<>();
        file.put("schema_version", "1.0");
        file.put("team_name", props.results() == null ? "" : props.results().teamName());
        boolean local = providers.isEmpty() || providers.equals(Set.of("MOCK"));
        file.put("model", Map.of("mode", local ? "local" : "external_api", "name", models.isEmpty() ? "" : String.join(", ", models)));
        file.put("results", results);
        if ("prod".equals(set) && results.size() != 10) warnings.add("В prod ожидается ровно 10 записей, сейчас " + results.size());

        String path = null;
        if (write) {
            try {
                Path p = Path.of(props.results().dir(), set, "results.json").toAbsolutePath().normalize();
                Files.createDirectories(p.getParent());
                Files.writeString(p, mapper.writeValueAsString(file), StandardCharsets.UTF_8);
                path = p.toString();
            } catch (Exception e) {
                throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "WRITE_FAILED",
                        "Не удалось записать results.json: " + e.getMessage());
            }
        }
        return new ExportReport(path, write, results.size(), ok, errors, warnings, file);
    }

    /** true/false for yes-no criteria, scale step as integer, null for N/A. */
    static Object exportValue(String answerType, BigDecimal value, boolean na) {
        if (na || value == null) return null;
        if ("SCALE".equals(answerType)) return value.stripTrailingZeros().scale() <= 0 ? value.intValue() : value;
        return value.signum() > 0;
    }
}
