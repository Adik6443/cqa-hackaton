package kz.freedom.cqa.evaluation;

import kz.freedom.cqa.checklist.Criterion;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Score calculation from the checklist PDF, page 2. Done in Java, never by the LLM:
 *  1) "Yes" = full weight, "No" = 0; a scale step gives weight * step / topStep.
 *  2) N/A criteria are excluded; their weight is redistributed: total = sum(points) / sum(applicable weights) * 100.
 *  3) Round to 2 decimals. No applicable weighted criteria -> total is null ("not calculated").
 *  4) FLAG (gross errors) gives no points and is reported separately.
 */
@Service
public class ScoringService {

    public record Answer(BigDecimal value, boolean isNa) {}

    public record Scored(Criterion criterion, Answer answer) {}

    public record Total(BigDecimal score, boolean grossError) {}

    public BigDecimal maxPoints(Criterion c) {
        return c.isFlag() ? null : c.weight().setScale(2, RoundingMode.HALF_UP);
    }

    public BigDecimal points(Criterion c, Answer a) {
        if (c.isFlag() || a == null || a.isNa() || a.value() == null) return null;
        BigDecimal top = c.maxStep();
        if (top.signum() == 0) return BigDecimal.ZERO.setScale(2);
        return c.weight().multiply(a.value()).divide(top, 4, RoundingMode.HALF_UP).setScale(2, RoundingMode.HALF_UP);
    }

    public Total total(List<Scored> items) {
        BigDecimal sum = BigDecimal.ZERO;
        BigDecimal weights = BigDecimal.ZERO;
        boolean gross = false;
        for (Scored s : items) {
            Criterion c = s.criterion();
            Answer a = s.answer();
            if (c.isFlag()) {
                if (a != null && !a.isNa() && a.value() != null && a.value().signum() > 0) gross = true;
                continue;
            }
            if (a == null || a.isNa() || a.value() == null || c.weight().signum() == 0) continue;
            // use unrounded points for the total, round once at the end
            sum = sum.add(c.weight().multiply(a.value()).divide(c.maxStep(), 10, RoundingMode.HALF_UP));
            weights = weights.add(c.weight());
        }
        BigDecimal score = weights.signum() == 0 ? null
                : sum.multiply(BigDecimal.valueOf(100)).divide(weights, 2, RoundingMode.HALF_UP);
        return new Total(score, gross);
    }
}
