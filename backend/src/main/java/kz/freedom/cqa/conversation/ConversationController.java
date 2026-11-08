package kz.freedom.cqa.conversation;

import kz.freedom.cqa.audio.AudioService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {
    private final ConversationService service;
    private final AudioService audio;

    public ConversationController(ConversationService service, AudioService audio) {
        this.service = service;
        this.audio = audio;
    }

    /**
     * GET /api/conversations?language=KZ&channel=CHAT&from=2026-11-03&to=2026-11-03&scoreBucket=0-49
     *      &durationBucket=gt20&status=DONE&grossError=true&operatorId=3&page=0&size=50
     * All filter params are optional (see ConversationFilter).
     */
    @GetMapping
    public ConversationService.Page<ConversationService.Summary> list(ConversationFilter filter,
                                                                      @RequestParam(defaultValue = "0") int page,
                                                                      @RequestParam(defaultValue = "50") int size) {
        return service.list(filter, page, size);
    }

    @GetMapping("/{id}")
    public ConversationService.Conversation get(@PathVariable String id) {
        return service.get(id);
    }

    /** All evaluations of the dialog, newest first. A re-evaluation never deletes the previous one. */
    @GetMapping("/{id}/evaluations")
    public java.util.List<ConversationService.HistoryItem> history(@PathVariable String id) {
        return service.history(id);
    }

    /** Full result of one past evaluation (criteria, explanations, evidence, appeal decisions). */
    @GetMapping("/{id}/evaluations/{evaluationId}")
    public ConversationService.Evaluation evaluation(@PathVariable String id, @PathVariable long evaluationId) {
        return service.evaluationOf(id, evaluationId);
    }

    /** Fresh mp3 link (it expires ~1 hour after it is issued), see AudioService. */
    @GetMapping("/{id}/audio")
    public AudioService.AudioSource audio(@PathVariable String id) {
        return audio.resolve(id);
    }
}
