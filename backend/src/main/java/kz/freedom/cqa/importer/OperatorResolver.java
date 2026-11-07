package kz.freedom.cqa.importer;

import kz.freedom.cqa.config.CqaProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Organizers' data has no operator field. Two modes (cqa.operators-mode):
 *  NAME - take the name the operator introduces himself with ("меня зовут Алина", "Мен Нұрланмын", "I'm Maya").
 *         Calls have "[Имя скрыто]" -> "Оператор не определён".
 *  POOL - spread conversations over 5 fictional demo operators (stable by conversation id).
 * In production the operator comes from the CRM record (agent login / systemuser id), not from text.
 */
@Component
public class OperatorResolver {
    public static final String UNKNOWN = "Оператор не определён";
    private static final List<String> POOL = List.of("Демо: Айгерим", "Демо: Данияр", "Демо: Ольга", "Демо: Тимур", "Демо: Жанна");

    private static final Pattern[] PATTERNS = {
            Pattern.compile("(?iu)меня зовут\\s+(\\p{Lu}\\p{Ll}+)"),
            Pattern.compile("(?u)(?:^|[\\s.,!])[Яя]\\s+(\\p{Lu}\\p{Ll}+)"),
            Pattern.compile("(?iu)менің атым\\s+(\\p{Lu}\\p{Ll}+)"),
            Pattern.compile("(?u)(?:^|[\\s.,!])[Мм]ен\\s+(\\p{Lu}\\p{Ll}+)"),
            Pattern.compile("(?u)(?:I'm|I am|[Mm]y name is)\\s+(\\p{Lu}\\p{Ll}+)")
    };
    // Kazakh "Мен Нұрланмын" = "I am Nurlan": drop the personal suffix
    private static final Pattern KZ_SUFFIX = Pattern.compile("(?u)^(\\p{L}{3,}?)(мын|мін|пын|пін|бын|бін)$");

    private final JdbcClient db;
    private final CqaProperties props;

    public OperatorResolver(JdbcClient db, CqaProperties props) {
        this.db = db;
        this.props = props;
    }

    public record Resolved(long operatorId, String nameRaw) {}

    public Resolved resolve(String conversationId, List<String> firstOperatorMessages) {
        if ("POOL".equalsIgnoreCase(props.operatorsMode())) {
            String name = POOL.get(Math.floorMod(conversationId.hashCode(), POOL.size()));
            return new Resolved(getOrCreate(name, "DEMO", true), null);
        }
        String name = extractName(firstOperatorMessages);
        if (name == null) return new Resolved(getOrCreate(UNKNOWN, "UNKNOWN", false), null);
        return new Resolved(getOrCreate(name, "TRANSCRIPT", false), name);
    }

    static String extractName(List<String> texts) {
        for (String t : texts) {
            if (t == null || t.contains("[Имя скрыто]")) continue;
            for (Pattern p : PATTERNS) {
                Matcher m = p.matcher(t);
                if (m.find()) return normalize(m.group(1));
            }
        }
        return null;
    }

    static String normalize(String name) {
        Matcher m = KZ_SUFFIX.matcher(name);
        return m.matches() ? m.group(1) : name;
    }

    private long getOrCreate(String name, String source, boolean fictional) {
        db.sql("INSERT INTO operator(name, source, fictional) VALUES (:n, :s, :f) ON CONFLICT (name) DO NOTHING")
                .param("n", name).param("s", source).param("f", fictional).update();
        return db.sql("SELECT id FROM operator WHERE name = :n").param("n", name).query(Long.class).single();
    }
}
