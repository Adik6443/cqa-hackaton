package kz.freedom.cqa.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.ZoneId;

/** All settings from application.properties (prefix "cqa"). Secrets come from application-local.properties. */
@ConfigurationProperties(prefix = "cqa")
public record CqaProperties(
        String organizerUrl,
        String timezone,
        String corsOrigins,
        String operatorsMode,
        Rating rating,
        Evaluation evaluation,
        Llm llm,
        Results results,
        Auto auto) {

    /** results.json export: dir relative to the backend working directory, team name for the file. */
    public record Results(String dir, String teamName) {}

    /** Hourly job: import new dialogs of groupId and evaluate only them. */
    public record Auto(boolean enabled, String groupId, String cron) {}

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
