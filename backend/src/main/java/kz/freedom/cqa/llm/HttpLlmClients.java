package kz.freedom.cqa.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kz.freedom.cqa.config.CqaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Anthropic, OpenAI and Gemini clients. Keys come from application-local.properties; an empty key disables the provider. */
@Configuration
public class HttpLlmClients {

    private static RestClient http(CqaProperties p) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(p.llm().timeoutSeconds() * 1000);
        return RestClient.builder().requestFactory(f).build();
    }

    private static boolean has(String key) {
        return key != null && !key.isBlank();
    }

    @Bean
    LlmClient anthropicClient(CqaProperties p, ObjectMapper mapper) {
        RestClient http = http(p);
        String key = p.llm().anthropicKey();
        return simple("ANTHROPIC", has(key), p.llm().anthropicModel(), req -> {
            // Prompt caching: everything before the dialog is the same for every conversation,
            // so it is marked as a cache breakpoint (reads cost ~10% of normal input).
            String user = req.user();
            int cut = user.indexOf(PromptBuilder.DIALOG_MARKER);
            List<Map<String, Object>> content = cut > 0
                    ? List.of(Map.of("type", "text", "text", user.substring(0, cut), "cache_control", Map.of("type", "ephemeral")),
                              Map.of("type", "text", "text", user.substring(cut)))
                    : List.of(Map.of("type", "text", "text", user));
            Map<String, Object> body = Map.of(
                    "model", req.model(),
                    "max_tokens", 4000,
                    "system", req.system(),
                    "messages", List.of(Map.of("role", "user", "content", content)));
            JsonNode r = http.post().uri("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", key).header("anthropic-version", "2023-06-01")
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            StringBuilder text = new StringBuilder();
            r.path("content").forEach(c -> { if ("text".equals(c.path("type").asText())) text.append(c.path("text").asText()); });
            JsonNode u = r.path("usage");
            int read = u.path("cache_read_input_tokens").asInt(), write = u.path("cache_creation_input_tokens").asInt();
            return new LlmClient.Reply(text.toString(), u.path("input_tokens").asInt() + read + write, u.path("output_tokens").asInt(), read);
        });
    }

    @Bean
    LlmClient openAiClient(CqaProperties p) {
        RestClient http = http(p);
        String key = p.llm().openaiKey();
        return simple("OPENAI", has(key), p.llm().openaiModel(), req -> {
            Map<String, Object> body = new java.util.HashMap<>(Map.of(
                    "model", req.model(),
                    "response_format", Map.of("type", "json_object"),
                    "messages", List.of(Map.of("role", "system", "content", req.system()),
                            Map.of("role", "user", "content", req.user()))));
            // reasoning models (o*, gpt-5*) accept only the default temperature
            if (!req.model().startsWith("o") && !req.model().startsWith("gpt-5")) body.put("temperature", 0);
            JsonNode r = http.post().uri("https://api.openai.com/v1/chat/completions")
                    .header("Authorization", "Bearer " + key)
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            JsonNode u = r.path("usage");   // OpenAI caches prompts > 1024 tokens automatically
            return new LlmClient.Reply(r.path("choices").path(0).path("message").path("content").asText(),
                    u.path("prompt_tokens").asInt(), u.path("completion_tokens").asInt(),
                    u.path("prompt_tokens_details").path("cached_tokens").asInt());
        });
    }

    @Bean
    LlmClient geminiClient(CqaProperties p) {
        RestClient http = http(p);
        String key = p.llm().geminiKey();
        return simple("GEMINI", has(key), p.llm().geminiModel(), req -> {
            Map<String, Object> body = Map.of(
                    "systemInstruction", Map.of("parts", List.of(Map.of("text", req.system()))),
                    "contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", req.user())))),
                    "generationConfig", Map.of("responseMimeType", "application/json", "temperature", 0));
            JsonNode r = http.post()
                    .uri("https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent", req.model())
                    .header("x-goog-api-key", key)
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            StringBuilder text = new StringBuilder();
            r.path("candidates").path(0).path("content").path("parts").forEach(x -> text.append(x.path("text").asText()));
            JsonNode u = r.path("usageMetadata");   // "thinking" tokens are billed as output
            return new LlmClient.Reply(text.toString(), u.path("promptTokenCount").asInt(),
                    u.path("candidatesTokenCount").asInt() + u.path("thoughtsTokenCount").asInt(),
                    u.path("cachedContentTokenCount").asInt());
        });
    }

    private static LlmClient simple(String provider, boolean available, String defaultModel,
                                    Function<LlmClient.Request, LlmClient.Reply> call) {
        return new LlmClient() {
            public String provider() { return provider; }
            public boolean available() { return available; }
            public String defaultModel() { return defaultModel; }
            public Reply complete(Request request) { return call.apply(request); }
        };
    }
}
