package kz.freedom.cqa.checklist;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.math.BigDecimal;
import java.util.List;

/** One checklist row. Same shape as the frontend's Criterion type (plus internal fields hidden from JSON). */
public record Criterion(
        String id,
        String code,
        String title,
        String section,
        String instruction,
        String answerType,      // BOOLEAN | SCALE | FLAG
        BigDecimal weight,
        boolean allowNa,
        String naCondition,
        List<Step> steps,
        @JsonIgnore int sortOrder,
        @JsonIgnore String fingerprint,
        String exportId) {      // criterion_id in results.json: contact, discovery, ...

    public record Step(BigDecimal value, String label) {}

    @JsonIgnore
    public BigDecimal maxStep() {
        return steps.stream().map(Step::value).max(BigDecimal::compareTo).orElse(BigDecimal.ONE);
    }

    @JsonIgnore
    public boolean isFlag() {
        return "FLAG".equals(answerType);
    }

    public boolean allowsValue(BigDecimal v) {
        return steps.stream().anyMatch(s -> s.value().compareTo(v) == 0);
    }
}
