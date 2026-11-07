package kz.freedom.cqa.llm;

import kz.freedom.cqa.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Chooses provider + model for a conversation:
 *  1) explicit override from the request (OKK chose a model for this run), else
 *  2) llm_route row for the conversation language, else
 *  3) llm_route DEFAULT.
 */
@Service
public class LlmRouter {
    private final Map<String, LlmClient> clients;
    private final JdbcClient db;

    public LlmRouter(List<LlmClient> all, JdbcClient db) {
        this.clients = all.stream().collect(Collectors.toMap(LlmClient::provider, Function.identity()));
        this.db = db;
    }

    public record Choice(LlmClient client, String model) {}

    public record Route(String language, String provider, String model) {}

    public Choice choose(String language, String overrideProvider, String overrideModel) {
        String provider = overrideProvider;
        String model = overrideModel;
        if (provider == null || provider.isBlank()) {
            Route r = route(language);
            provider = r.provider();
            if (model == null || model.isBlank()) model = r.model();
        }
        LlmClient client = client(provider);
        if (model == null || model.isBlank()) model = client.defaultModel();
        return new Choice(client, model);
    }

    public LlmClient client(String provider) {
        LlmClient c = clients.get(provider.toUpperCase());
        if (c == null) throw ApiException.badRequest("Неизвестный провайдер: " + provider);
        if (!c.available())
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVIDER_NO_KEY", "Для " + provider + " не задан API-ключ в .env");
        return c;
    }

    public Route route(String language) {
        return db.sql("""
                SELECT language, provider, model FROM llm_route
                WHERE language IN (:l, 'DEFAULT') ORDER BY (language = 'DEFAULT') LIMIT 1
                """).param("l", language == null ? "DEFAULT" : language.toUpperCase())
                .query(Route.class).single();
    }

    public List<Route> routes() {
        return db.sql("SELECT language, provider, model FROM llm_route ORDER BY language").query(Route.class).list();
    }

    public Route saveRoute(String language, String provider, String model) {
        LlmClient c = clients.get(provider == null ? "" : provider.toUpperCase());
        if (c == null) throw ApiException.badRequest("Неизвестный провайдер: " + provider);
        String m = model == null || model.isBlank() ? c.defaultModel() : model.trim();
        db.sql("""
                INSERT INTO llm_route(language, provider, model) VALUES (:l, :p, :m)
                ON CONFLICT (language) DO UPDATE SET provider = EXCLUDED.provider, model = EXCLUDED.model, updated_at = now()
                """).param("l", language.toUpperCase()).param("p", c.provider()).param("m", m).update();
        return route(language);
    }

    public List<Map<String, Object>> providers() {
        return clients.values().stream()
                .map(c -> Map.<String, Object>of("provider", c.provider(), "available", c.available(), "defaultModel", c.defaultModel()))
                .sorted((a, b) -> a.get("provider").toString().compareTo(b.get("provider").toString()))
                .toList();
    }
}
