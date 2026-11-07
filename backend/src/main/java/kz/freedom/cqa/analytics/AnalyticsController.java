package kz.freedom.cqa.analytics;

import kz.freedom.cqa.conversation.ConversationFilter;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** All endpoints accept the same filter params as GET /api/conversations. */
@RestController
@RequestMapping("/api")
public class AnalyticsController {
    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    /** Dashboard tiles: average, evaluated/total, gross errors, open appeals, score distribution, weak criteria. */
    @GetMapping("/analytics/summary")
    public AnalyticsService.Summary summary(ConversationFilter filter) {
        return service.summary(filter);
    }

    /** GET /api/analytics/breakdown?by=duration&language=RU  -> average score / gross errors per group. */
    @GetMapping("/analytics/breakdown")
    public List<AnalyticsService.Group> breakdown(@RequestParam String by, ConversationFilter filter) {
        return service.breakdown(by, filter);
    }

    @GetMapping("/analytics/criteria")
    public List<AnalyticsService.CriterionStat> criteria(ConversationFilter filter) {
        return service.criteria(filter);
    }

    @GetMapping("/operators/leaderboard")
    public List<AnalyticsService.Rating> leaderboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.leaderboard(from, to, null);
    }

    @GetMapping("/operators/{id}/rating")
    public AnalyticsService.Rating rating(@PathVariable String id,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.leaderboard(from, to, id).stream().findFirst()
                .orElseThrow(() -> kz.freedom.cqa.common.ApiException.notFound("Оператор"));
    }
}
