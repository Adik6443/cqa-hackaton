package kz.freedom.cqa.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import kz.freedom.cqa.checklist.Criterion;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;

/**
 * Works without any API key so the frontend and the whole flow can be tested.
 * Results are marked simulated=true. NOT a real evaluation: yes/top step everywhere,
 * gross-error flag only by a few keywords.
 */
@Component
public class MockLlmClient implements LlmClient {
    private static final List<String> GROSS = List.of("мне на карту", "на мою карту", "читать умеете", "мой личный номер",
            "менің картама", "my personal card", "my card", "идиот", "тупой");

    private final ObjectMapper mapper;

    public MockLlmClient(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public String provider() { return "MOCK"; }
    public boolean available() { return true; }
    public String defaultModel() { return "heuristic-v1"; }

    @Override
    public Reply complete(Request req) {
        List<PromptBuilder.Line> lines = req.ctx().lines();
        PromptBuilder.Line firstOp = lines.stream().filter(l -> l.speaker().equals("operator")).findFirst().orElse(null);
        int anchor = firstOp != null ? firstOp.seq() : (lines.isEmpty() ? 1 : lines.get(0).seq());
        PromptBuilder.Line gross = lines.stream().filter(l -> l.speaker().equals("operator"))
                .filter(l -> GROSS.stream().anyMatch(k -> l.text().toLowerCase().contains(k))).findFirst().orElse(null);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Criterion c : req.ctx().criteria()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", c.code());
            BigDecimal v = c.isFlag() ? (gross != null ? BigDecimal.ONE : BigDecimal.ZERO) : c.maxStep();
            m.put("value", v);
            m.put("isNa", false);
            m.put("confidence", 0.5);
            m.put("explanation", c.isFlag() && gross != null
                    ? "Демо-оценка (MOCK): найдена фраза из списка грубых нарушений."
                    : "Демо-оценка (MOCK) без LLM: подключите провайдера для реальной оценки.");
            m.put("evidenceSeqs", List.of(c.isFlag() && gross != null ? gross.seq() : anchor));
            out.add(m);
        }
        try {
            return new Reply(mapper.writeValueAsString(Map.of("criteria", out)), 0, 0);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
