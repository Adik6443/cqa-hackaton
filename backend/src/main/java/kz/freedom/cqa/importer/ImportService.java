package kz.freedom.cqa.importer;

import com.fasterxml.jackson.databind.JsonNode;
import kz.freedom.cqa.config.CqaProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Loads one group (DEV / TEST ...) from the organizers into our DB.
 * Idempotent: a conversation id that already exists is skipped, so its date and evaluations stay as they were.
 */
@Service
public class ImportService {
    private static final Pattern CLOCK = Pattern.compile("^(?:(\\d+):)?(\\d{1,2}):(\\d{2})(?:\\.\\d+)?$");

    private final OrganizerClient organizer;
    private final OperatorResolver operators;
    private final JdbcClient db;
    private final TransactionTemplate tx;
    private final CqaProperties props;

    public ImportService(OrganizerClient organizer, OperatorResolver operators, JdbcClient db,
                         TransactionTemplate tx, CqaProperties props) {
        this.organizer = organizer;
        this.operators = operators;
        this.db = db;
        this.tx = tx;
        this.props = props;
    }

    public record ImportResult(int imported, int skipped, String groupId, String importRunId, String businessDate) {}

    /**
     * @param businessDate date for chats (chat timestamps are only mm:ss). null = today in cqa.timezone.
     */
    public ImportResult importGroup(String groupId, LocalDate businessDate) {
        LocalDate day = businessDate != null ? businessDate : LocalDate.now(props.zone());
        long runId = db.sql("INSERT INTO import_run(group_id, business_date) VALUES (:g, :d) RETURNING id")
                .param("g", groupId).param("d", day).query(Long.class).single();
        try {
            JsonNode records = organizer.fetchRecords(groupId);
            int imported = 0, skipped = 0;
            for (JsonNode r : records) {
                Boolean ok = tx.execute(s -> importOne(r, groupId, runId, day));
                if (Boolean.TRUE.equals(ok)) imported++; else skipped++;
            }
            db.sql("UPDATE import_run SET status='DONE', finished_at=now(), total=:t, imported=:i, skipped=:s WHERE id=:id")
                    .param("t", records.size()).param("i", imported).param("s", skipped).param("id", runId).update();
            return new ImportResult(imported, skipped, groupId, String.valueOf(runId), day.toString());
        } catch (RuntimeException e) {
            db.sql("UPDATE import_run SET status='FAILED', finished_at=now(), error_text=:e WHERE id=:id")
                    .param("e", e.getMessage()).param("id", runId).update();
            throw e;
        }
    }

    private boolean importOne(JsonNode r, String groupId, long runId, LocalDate day) {
        String id = r.path("conversation_id").asText(null);
        if (id == null || id.isBlank()) return false;
        Integer exists = db.sql("SELECT count(*) FROM conversation WHERE id = :id").param("id", id).query(Integer.class).single();
        if (exists > 0) return false;

        String channelRaw = r.path("channel").asText("");
        String channel = channelRaw.toLowerCase().contains("voice") || channelRaw.toLowerCase().contains("call") ? "VOICE" : "CHAT";
        String language = r.path("language").asText("RU").toUpperCase();
        String audio = r.path("audio_url").isTextual() ? r.path("audio_url").asText() : null;

        List<Msg> msgs = new ArrayList<>();
        int seq = 1;
        for (JsonNode m : r.path("transcript")) {
            msgs.add(new Msg(seq++, m.path("timestamp").asText(""), normalizeSpeaker(m.path("speaker").asText()), m.path("text").asText("")));
        }
        computeOffsets(msgs);

        OffsetDateTime startedAt = msgs.isEmpty() ? null : parseIso(msgs.get(0).raw);
        LocalDate convDate = startedAt != null ? startedAt.atZoneSameInstant(props.zone()).toLocalDate() : day;
        String dateSource = startedAt != null ? "TRANSCRIPT" : "IMPORT";

        Msg firstOp = msgs.stream().filter(m -> m.speaker.equals("operator")).findFirst().orElse(null);
        BigDecimal last = msgs.isEmpty() ? null : msgs.get(msgs.size() - 1).offset;
        BigDecimal duration = last;
        BigDecimal opDuration = firstOp != null && last != null && firstOp.offset != null ? last.subtract(firstOp.offset) : null;

        List<String> opTexts = msgs.stream().filter(m -> m.speaker.equals("operator")).limit(2).map(m -> m.text).toList();
        OperatorResolver.Resolved op = operators.resolve(id, opTexts);

        db.sql("""
                INSERT INTO conversation(id, group_id, import_run_id, channel, channel_raw, language, audio_page_url,
                  conversation_date, date_source, started_at, duration_sec, operator_duration_sec, message_count,
                  operator_start_seq, operator_id, operator_name_raw)
                VALUES (:id, :g, :run, :ch, :chr, :lang, :audio, :d, :ds, :st, :dur, :odur, :cnt, :oss, :op, :opn)
                """)
                .param("id", id).param("g", groupId).param("run", runId).param("ch", channel).param("chr", channelRaw)
                .param("lang", language).param("audio", audio).param("d", convDate).param("ds", dateSource)
                .param("st", startedAt).param("dur", duration).param("odur", opDuration).param("cnt", msgs.size())
                .param("oss", firstOp == null ? null : firstOp.seq).param("op", op.operatorId()).param("opn", op.nameRaw())
                .update();
        for (Msg m : msgs) {
            db.sql("INSERT INTO message(conversation_id, seq, timestamp_raw, offset_sec, speaker, text) VALUES (:c,:s,:r,:o,:sp,:t)")
                    .param("c", id).param("s", m.seq).param("r", m.raw).param("o", m.offset).param("sp", m.speaker).param("t", m.text)
                    .update();
        }
        return true;
    }

    /** Chats: "01:15" = time since chat start. Calls: ISO date-time -> seconds since the first message. */
    static void computeOffsets(List<Msg> msgs) {
        Double base = null;
        for (Msg m : msgs) {
            Double abs = absoluteSeconds(m.raw);
            if (abs == null) continue;
            if (base == null) base = abs;
            m.offset = BigDecimal.valueOf(abs - base).setScale(3, RoundingMode.HALF_UP);
        }
    }

    static Double absoluteSeconds(String raw) {
        Matcher c = CLOCK.matcher(raw.trim());
        if (c.matches()) {
            int h = c.group(1) == null ? 0 : Integer.parseInt(c.group(1));
            return h * 3600.0 + Integer.parseInt(c.group(2)) * 60.0 + Integer.parseInt(c.group(3));
        }
        OffsetDateTime t = parseIso(raw);
        return t == null ? null : t.toInstant().toEpochMilli() / 1000.0;
    }

    static OffsetDateTime parseIso(String raw) {
        try {
            return OffsetDateTime.parse(raw.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static String normalizeSpeaker(String s) {
        String v = s == null ? "" : s.toLowerCase();
        return switch (v) {
            case "client", "customer", "user" -> "client";
            case "operator", "agent" -> "operator";
            case "bot" -> "bot";
            default -> "system";
        };
    }

    static final class Msg {
        final int seq;
        final String raw, speaker, text;
        BigDecimal offset;

        Msg(int seq, String raw, String speaker, String text) {
            this.seq = seq;
            this.raw = raw;
            this.speaker = speaker;
            this.text = text;
        }
    }
}
