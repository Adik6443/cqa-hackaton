package kz.freedom.cqa.llm;

import kz.freedom.cqa.checklist.Criterion;

import java.util.List;

/**
 * One implementation per provider. The rest of the backend only knows this interface,
 * so switching a model is a DB setting (llm_route), not a code change.
 */
public interface LlmClient {

    /** ANTHROPIC | OPENAI | GEMINI | MOCK */
    String provider();

    /** false when the API key is not configured */
    boolean available();

    String defaultModel();

    Reply complete(Request request);

    /** ctx is used only by the MOCK provider (real providers read the prompt text). */
    record Request(String model, String system, String user, MockContext ctx) {}

    record Reply(String text, Integer tokensIn, Integer tokensOut) {}

    record MockContext(List<Criterion> criteria, List<PromptBuilder.Line> lines) {}
}
