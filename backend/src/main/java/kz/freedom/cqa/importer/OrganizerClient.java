package kz.freedom.cqa.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.config.CqaProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Calls the organizers' Power Automate endpoint.
 * The URL contains sig=... (an access key), so it is never logged and never returned to the frontend.
 */
@Component
public class OrganizerClient {
    private final CqaProperties props;
    private final ObjectMapper mapper;
    private final RestClient http;

    public OrganizerClient(CqaProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(60_000);
        this.http = RestClient.builder().requestFactory(f).build();
    }

    /** Returns data.records of the organizers' response. */
    public JsonNode fetchRecords(String groupId) {
        String base = props.organizerUrl();
        if (base == null || base.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_ORGANIZER_URL",
                    "cqa.organizer-url не задан в application.properties");
        }
        String url = base.replaceAll("([?&])group_id=[^&]*&?", "$1").replaceAll("[?&]$", "");
        url += (url.contains("?") ? "&" : "?") + "group_id=" + URLEncoder.encode(groupId, StandardCharsets.UTF_8);
        try {
            String body = http.get().uri(java.net.URI.create(url)).retrieve().body(String.class);
            JsonNode root = mapper.readTree(body);
            if (root.has("isSuccess") && !root.path("isSuccess").asBoolean()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "ORGANIZER_ERROR",
                        "API организаторов вернуло ошибку: " + root.path("error").asText());
            }
            JsonNode records = root.path("data").path("records");
            if (!records.isArray()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "ORGANIZER_FORMAT", "Нет data.records в ответе");
            }
            return records;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            // do not include the URL in the message
            throw new ApiException(HttpStatus.BAD_GATEWAY, "ORGANIZER_UNAVAILABLE",
                    "Не удалось получить данные организаторов: " + e.getClass().getSimpleName());
        }
    }
}
