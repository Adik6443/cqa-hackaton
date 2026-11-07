package kz.freedom.cqa;

import kz.freedom.cqa.checklist.Criterion;
import kz.freedom.cqa.evaluation.ScoringService;
import kz.freedom.cqa.evaluation.ScoringService.Answer;
import kz.freedom.cqa.evaluation.ScoringService.Scored;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ScoringServiceTest {
    private final ScoringService s = new ScoringService();

    private static Criterion bool(String code, int w, boolean na) {
        return new Criterion(code, code, code, "S", "i", "BOOLEAN", BigDecimal.valueOf(w), na, "",
                List.of(new Criterion.Step(BigDecimal.ONE, "Да"), new Criterion.Step(BigDecimal.ZERO, "Нет")), 0, "");
    }

    private static Criterion scale(String code, int w, boolean na, int... steps) {
        return new Criterion(code, code, code, "S", "i", "SCALE", BigDecimal.valueOf(w), na, "",
                java.util.Arrays.stream(steps).mapToObj(v -> new Criterion.Step(BigDecimal.valueOf(v), "")).toList(), 0, "");
    }

    private static Criterion flag() {
        return new Criterion("C08", "C08", "C08", "S", "i", "FLAG", BigDecimal.ZERO, false, "",
                List.of(new Criterion.Step(BigDecimal.ONE, "Да"), new Criterion.Step(BigDecimal.ZERO, "Нет")), 0, "");
    }

    private static Answer v(int x) { return new Answer(BigDecimal.valueOf(x), false); }
    private static final Answer NA = new Answer(null, true);

    @Test
    void scaleStepIsProportionalToWeight() {
        // criterion 6: weight 15, step 7 of 10 -> 10.50
        assertEquals(new BigDecimal("10.50"), s.points(scale("C06", 15, false, 0, 4, 7, 10), v(7)));
    }

    @Test
    void naIsExcludedAndWeightsRedistributed() {
        Criterion c1 = bool("C01", 10, false), c2 = bool("C02", 15, true), c3 = bool("C03", 20, true),
                c4 = scale("C04", 20, true, 0, 5, 10, 15, 20), c5 = bool("C05", 15, false),
                c6 = scale("C06", 15, false, 0, 4, 7, 10), c7 = bool("C07", 5, true);
        // all yes / top, identification N/A -> 80/80 = 100
        var all = List.of(new Scored(c1, v(1)), new Scored(c2, v(1)), new Scored(c3, NA), new Scored(c4, v(20)),
                new Scored(c5, v(1)), new Scored(c6, v(10)), new Scored(c7, v(1)), new Scored(flag(), v(0)));
        assertEquals(new BigDecimal("100.00"), s.total(all).score());
        assertFalse(s.total(all).grossError());

        // 40 of 80 applicable -> 50.00; same answers with C03 counted as "No" -> 40/100 = 40.00
        var half = List.of(new Scored(c1, v(1)), new Scored(c2, v(0)), new Scored(c3, NA), new Scored(c4, v(10)),
                new Scored(c5, v(1)), new Scored(c6, v(0)), new Scored(c7, v(1)), new Scored(flag(), v(1)));
        assertEquals(new BigDecimal("50.00"), s.total(half).score());
        assertTrue(s.total(half).grossError());
    }

    @Test
    void nothingApplicableGivesNull() {
        assertNull(s.total(List.of(new Scored(bool("C02", 15, true), NA), new Scored(flag(), v(0)))).score());
    }
}
