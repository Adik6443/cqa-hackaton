package kz.freedom.cqa.llm;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** OKK screen "Модели AI": which model evaluates which language + an editable memo. */
@RestController
@RequestMapping("/api/llm")
public class LlmController {
    private final LlmRouter router;
    private final JdbcClient db;

    public LlmController(LlmRouter router, JdbcClient db) {
        this.router = router;
        this.db = db;
    }

    /** [{provider, available, defaultModel}] - available=false means no API key in application-local.properties */
    @GetMapping("/providers")
    public List<Map<String, Object>> providers() {
        return router.providers();
    }

    @GetMapping("/routes")
    public List<LlmRouter.Route> routes() {
        return router.routes();
    }

    public record RouteInput(String provider, String model) {}

    /** PUT /api/llm/routes/KZ {"provider":"OPENAI","model":"gpt-4.1"} */
    @PutMapping("/routes/{language}")
    public LlmRouter.Route saveRoute(@PathVariable String language, @RequestBody RouteInput in) {
        return router.saveRoute(language, in.provider(), in.model());
    }

    @GetMapping("/memo")
    public Map<String, String> memo() {
        String v = db.sql("SELECT value FROM app_setting WHERE key='llm_memo'").query(String.class).optional().orElse("");
        return Map.of("text", v);
    }

    public record MemoInput(String text) {}

    @PutMapping("/memo")
    public Map<String, String> saveMemo(@RequestBody MemoInput in) {
        db.sql("INSERT INTO app_setting(key,value) VALUES ('llm_memo',:v) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value")
                .param("v", in.text() == null ? "" : in.text()).update();
        return memo();
    }
}
