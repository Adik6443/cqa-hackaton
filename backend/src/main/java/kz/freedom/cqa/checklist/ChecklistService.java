package kz.freedom.cqa.checklist;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kz.freedom.cqa.common.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/**
 * "Configuration" = checklist versions in the DB. The LLM prompt is built from these rows,
 * so OKK can change/replace a criterion in the UI without touching code.
 * A saved version is immutable; old evaluations keep pointing at the version they used.
 */
@Service
public class ChecklistService {
    private static final List<Criterion.Step> YES_NO = List.of(
            new Criterion.Step(BigDecimal.ONE, "Да"), new Criterion.Step(BigDecimal.ZERO, "Нет"));

    private final JdbcClient db;
    private final ObjectMapper mapper;

    public ChecklistService(JdbcClient db, ObjectMapper mapper) {
        this.db = db;
        this.mapper = mapper;
    }

    public record Checklist(String id, int version, String name, boolean active, String createdAtLabel, List<Criterion> criteria) {}

    public record SaveInput(String name, List<Criterion> criteria) {}

    public List<Checklist> versions() {
        return db.sql("SELECT id, version_no, name, is_active, to_char(created_at,'YYYY-MM-DD HH24:MI') AS c FROM checklist_version ORDER BY version_no DESC")
                .query((rs, i) -> new Checklist(rs.getString("id"), rs.getInt("version_no"), rs.getString("name"),
                        rs.getBoolean("is_active"), rs.getString("c"), criteria(rs.getLong("id"))))
                .list();
    }

    public Checklist active() {
        return versions().stream().filter(Checklist::active).findFirst()
                .orElseThrow(() -> ApiException.conflict("NO_ACTIVE_CHECKLIST", "Нет активного чек-листа"));
    }

    public long activeVersionId() {
        return Long.parseLong(active().id());
    }

    public List<Criterion> criteria(long versionId) {
        return db.sql("SELECT * FROM criterion WHERE checklist_version_id = :v ORDER BY sort_order")
                .param("v", versionId)
                .query((rs, i) -> new Criterion(rs.getString("id"), rs.getString("code"), rs.getString("title"),
                        rs.getString("section"), rs.getString("instruction"), rs.getString("answer_type"),
                        rs.getBigDecimal("weight"), rs.getBoolean("allow_na"), rs.getString("na_condition"),
                        parseSteps(rs.getString("steps")), rs.getInt("sort_order"), rs.getString("fingerprint")))
                .list();
    }

    public Criterion criterion(long id) {
        long v = db.sql("SELECT checklist_version_id FROM criterion WHERE id=:id").param("id", id).query(Long.class).single();
        return criteria(v).stream().filter(c -> c.id().equals(String.valueOf(id))).findFirst().orElseThrow();
    }

    @Transactional
    public Checklist save(SaveInput in) {
        validate(in);
        int next = db.sql("SELECT coalesce(max(version_no),0)+1 FROM checklist_version").query(Integer.class).single();
        String name = in.name() == null || in.name().isBlank() ? "Чек-лист v" + next : in.name();
        long vid = db.sql("INSERT INTO checklist_version(name, version_no, is_active) VALUES (:n,:v,false) RETURNING id")
                .param("n", name).param("v", next).query(Long.class).single();
        int order = 1;
        for (Criterion c : in.criteria()) {
            String code = c.code() == null || c.code().isBlank() ? "C%02d".formatted(order) : c.code().trim();
            String type = c.answerType().toUpperCase();
            List<Criterion.Step> steps = "SCALE".equals(type) ? c.steps() : (c.steps() == null || c.steps().isEmpty() ? YES_NO : c.steps());
            db.sql("""
                    INSERT INTO criterion(checklist_version_id, code, section, sort_order, title, instruction, answer_type,
                      weight, allow_na, na_condition, steps, fingerprint)
                    VALUES (:v,:code,:sec,:ord,:title,:ins,:type,:w,:na,:nac,CAST(:steps AS jsonb),:fp)
                    """)
                    .param("v", vid).param("code", code).param("sec", nz(c.section())).param("ord", order++)
                    .param("title", c.title()).param("ins", c.instruction()).param("type", type)
                    .param("w", "FLAG".equals(type) ? BigDecimal.ZERO : c.weight())
                    .param("na", c.allowNa()).param("nac", nz(c.naCondition()))
                    .param("steps", toJson(steps)).param("fp", fingerprint(code, c.instruction()))
                    .update();
        }
        return versions().stream().filter(x -> x.id().equals(String.valueOf(vid))).findFirst().orElseThrow();
    }

    @Transactional
    public void activate(long id) {
        int exists = db.sql("SELECT count(*) FROM checklist_version WHERE id=:id").param("id", id).query(Integer.class).single();
        if (exists == 0) throw ApiException.notFound("Чек-лист");
        db.sql("UPDATE checklist_version SET is_active=false WHERE is_active").update();
        db.sql("UPDATE checklist_version SET is_active=true WHERE id=:id").param("id", id).update();
    }

    private void validate(SaveInput in) {
        if (in.criteria() == null || in.criteria().isEmpty()) throw ApiException.badRequest("Нужен хотя бы один критерий");
        Set<String> codes = new HashSet<>();
        BigDecimal sum = BigDecimal.ZERO;
        for (Criterion c : in.criteria()) {
            if (c.title() == null || c.title().isBlank()) throw ApiException.badRequest("У критерия нет названия");
            if (c.instruction() == null || c.instruction().isBlank())
                throw ApiException.badRequest("У критерия «" + c.title() + "» нет инструкции для AI");
            String type = c.answerType() == null ? "" : c.answerType().toUpperCase();
            if (!Set.of("BOOLEAN", "SCALE", "FLAG").contains(type)) throw ApiException.badRequest("Неизвестный тип ответа: " + c.answerType());
            if ("SCALE".equals(type) && (c.steps() == null || c.steps().size() < 2))
                throw ApiException.badRequest("У шкалы «" + c.title() + "» должно быть минимум 2 ступени");
            if (!"FLAG".equals(type)) {
                if (c.weight() == null || c.weight().signum() <= 0) throw ApiException.badRequest("Вес «" + c.title() + "» должен быть > 0");
                sum = sum.add(c.weight());
            }
            if (c.code() != null && !c.code().isBlank() && !codes.add(c.code().trim()))
                throw ApiException.badRequest("Код критерия повторяется: " + c.code());
        }
        if (sum.compareTo(BigDecimal.valueOf(100)) != 0)
            throw ApiException.badRequest("Сумма весов должна быть 100, сейчас " + sum.stripTrailingZeros().toPlainString());
    }

    public static String fingerprint(String code, String instruction) {
        try {
            byte[] h = MessageDigest.getInstance("MD5").digest((code + "|" + instruction).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private List<Criterion.Step> parseSteps(String json) {
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return YES_NO;
        }
    }

    private String toJson(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
