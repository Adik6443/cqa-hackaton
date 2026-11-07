package kz.freedom.cqa.evaluation;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class EvaluationController {
    private final EvaluationService evaluations;
    private final BatchService batches;

    public EvaluationController(EvaluationService evaluations, BatchService batches) {
        this.evaluations = evaluations;
        this.batches = batches;
    }

    /** Evaluate one dialog. provider/model optional: without them the language route is used. */
    @PostMapping("/conversations/{id}/evaluate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> evaluate(@PathVariable String id,
                                        @RequestParam(required = false) String provider,
                                        @RequestParam(required = false) String model) {
        return Map.of("evaluationId", String.valueOf(evaluations.evaluate(id, null, provider, model)));
    }

    /** Body: {conversationIds:[...]} OR {filter:{language:"KZ", from:"2026-11-03", durationBucket:"gt20"}, provider?, model?, onlyNotEvaluated?} */
    @PostMapping("/evaluations/batch")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public BatchService.Batch start(@RequestBody BatchService.BatchInput in) {
        return batches.start(in);
    }

    /** Same body as /batch, returns how many dialogs would be evaluated (no LLM calls). */
    @PostMapping("/evaluations/batch/preview")
    public BatchService.Preview preview(@RequestBody BatchService.BatchInput in) {
        return batches.preview(in);
    }

    @GetMapping("/evaluations/batch/{id}")
    public BatchService.Batch batch(@PathVariable long id) {
        return batches.get(id);
    }
}
