package kz.freedom.cqa.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.ZoneId;

/** All settings from application.yml (section "cqa"). Secrets come from .env / environment. */
@ConfigurationProperties(prefix = "cqa")
public record CqaProperties(
        String organizerUrl,
        String timezone,
        String corsOrigins,
        String operatorsMode,
        Rating rating,
        Evaluation evaluation,
        Llm llm) {

    public record Rating(int periodDays, int minDialogs) {}

    public record Evaluation(int concurrency, int maxAttempts, int correctionsPerCriterion) {}

    public record Llm(int timeoutSeconds,
                      String anthropicKey, String anthropicModel,
                      String openaiKey, String openaiModel,
                      String geminiKey, String geminiModel) {}

    public ZoneId zone() {
        return ZoneId.of(timezone == null ? "Asia/Almaty" : timezone);
    }
}
