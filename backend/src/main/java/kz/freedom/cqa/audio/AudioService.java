package kz.freedom.cqa.audio;

import kz.freedom.cqa.common.ApiException;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * audio_url from the organizers is an HTML page with a player. Inside it there is
 * <source src="https://...dynamics.com/api/filedownload/...&se=...">: a signed mp3 link that expires (~1 hour).
 * We store only the page URL; the mp3 link is taken from the page on demand and cached in memory until shortly before expiry.
 * The recording itself stays in the organizers' CRM: we do not download or keep the mp3.
 */
@Service
public class AudioService {
    private static final Pattern SOURCE = Pattern.compile("<source[^>]+src=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);
    private static final Pattern SE = Pattern.compile("[?&]se=([^&]+)");

    private final JdbcClient db;
    private final RestClient http;
    private final Map<String, AudioSource> cache = new ConcurrentHashMap<>();

    public AudioService(JdbcClient db) {
        this.db = db;
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(20_000);
        this.http = RestClient.builder().requestFactory(f).build();
    }

    /** streamUrl = mp3 for <audio src>, expiresAt = when to ask again, audioPageUrl = fallback "open in new tab". */
    public record AudioSource(String streamUrl, String expiresAt, String audioPageUrl) {}

    public AudioSource resolve(String conversationId) {
        String page = db.sql("SELECT audio_page_url FROM conversation WHERE id=:id").param("id", conversationId)
                .query(String.class).optional().orElseThrow(() -> ApiException.notFound("Диалог " + conversationId));
        if (page == null || page.isBlank()) return new AudioSource(null, null, null);   // chats have no audio

        AudioSource cached = cache.get(conversationId);
        if (cached != null && cached.expiresAt() != null
                && OffsetDateTime.parse(cached.expiresAt()).toInstant().isAfter(Instant.now().plusSeconds(120))) {
            return cached;
        }
        try {
            String html = http.get().uri(java.net.URI.create(page)).retrieve().body(String.class);
            Matcher m = SOURCE.matcher(html == null ? "" : html);
            if (!m.find()) return new AudioSource(null, null, page);
            String stream = m.group(1).replace("&amp;", "&");
            String expires = null;
            Matcher se = SE.matcher(stream);
            if (se.find()) {
                try {
                    expires = OffsetDateTime.parse(URLDecoder.decode(se.group(1), StandardCharsets.UTF_8)).toString();
                } catch (Exception ignored) {
                    // unknown format: frontend will re-request on playback error
                }
            }
            AudioSource result = new AudioSource(stream, expires, page);
            if (expires != null) cache.put(conversationId, result);
            return result;
        } catch (Exception e) {
            // player page unavailable: frontend shows "Открыть запись" with the page link
            return new AudioSource(null, null, page);
        }
    }
}
