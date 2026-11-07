package kz.freedom.cqa.appeal;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AppealController {
    private final AppealService service;
    private final JdbcClient db;

    public AppealController(AppealService service, JdbcClient db) {
        this.service = service;
        this.db = db;
    }

    /** Operator: POST /api/criterion-results/{id}/appeals?operatorId=3  {comment, desired:{value,isNa}|null} */
    @PostMapping("/criterion-results/{id}/appeals")
    @ResponseStatus(HttpStatus.CREATED)
    public AppealService.Appeal create(@PathVariable long id, @RequestBody AppealService.CreateInput in,
                                       @RequestParam(required = false) String operatorId) {
        return service.create(id, in, operatorId);
    }

    /** OKK: all appeals (?status=OPEN). Operator: ?role=OPERATOR&operatorId=3 -> own appeals only. */
    @GetMapping("/appeals")
    public List<AppealService.Appeal> list(@RequestParam(required = false) String status,
                                           @RequestParam(required = false) String role,
                                           @RequestParam(required = false) String operatorId) {
        return service.list(status, "OPERATOR".equalsIgnoreCase(role) ? operatorId : null);
    }

    @GetMapping("/appeals/{id}")
    public AppealService.Appeal get(@PathVariable long id) {
        return service.get(id);
    }

    /** OKK: {status:ACCEPTED|REJECTED, reason, newValue:{value,isNa}|null, addToExamples, reviewerName?} */
    @PostMapping("/appeals/{id}/decision")
    public AppealService.Appeal decide(@PathVariable long id, @RequestBody AppealService.DecisionInput in) {
        return service.decide(id, in);
    }

    // ---------- AI memory (accepted appeals marked "AI mistake") ----------

    @GetMapping("/ai-corrections")
    public List<Map<String, Object>> corrections() {
        return db.sql("""
                SELECT id::text AS id, criterion_code AS "criterionCode", criterion_title AS "criterionTitle", language,
                       ai_value AS "originalLabel", correct_value AS "correctedLabel", reason, snippet, is_active AS active,
                       to_char(created_at,'DD.MM.YYYY HH24:MI') AS "createdAtLabel"
                FROM ai_correction ORDER BY created_at DESC
                """).query().listOfRows();
    }

    public record CorrectionPatch(boolean active) {}

    /** Turn an example off if it confuses the model (it stops being added to prompts). */
    @PatchMapping("/ai-corrections/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void patch(@PathVariable long id, @RequestBody CorrectionPatch in) {
        db.sql("UPDATE ai_correction SET is_active=:a WHERE id=:id").param("a", in.active()).param("id", id).update();
    }
}
