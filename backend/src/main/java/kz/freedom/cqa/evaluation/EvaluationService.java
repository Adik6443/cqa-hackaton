package kz.freedom.cqa.evaluation;

import kz.freedom.cqa.checklist.ChecklistService;
import kz.freedom.cqa.common.ApiException;
import kz.freedom.cqa.llm.LlmRouter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Starts an evaluation: creates a PENDING row synchronously, then the LLM call runs in the background
 * (EvaluationRunner). The frontend polls the conversation / batch to see PENDING -> DONE / FAILED.
 */
@Service
public class EvaluationService {
    private final JdbcClient db;
    private final ChecklistService checklists;
    private final LlmRouter router;
    private final EvaluationRunner runner;
    private final TransactionTemplate tx;

    public EvaluationService(JdbcClient db, ChecklistService checklists, LlmRouter router, EvaluationRunner runner,
                             TransactionTemplate tx) {
        this.tx = tx;
        this.db = db;
        this.checklists = checklists;
        this.router = router;
        this.runner = runner;
    }

    public long evaluate(String conversationId, Long batchId, String provider, String model) {
        long evalId = createPending(conversationId, batchId, provider, model);
        runner.runAsync(evalId);
        return evalId;
    }

    public long createPending(String conversationId, Long batchId, String provider, String model) {
        Long id = tx.execute(st -> createPendingTx(conversationId, batchId, provider, model));
        return id;
    }

    private long createPendingTx(String conversationId, Long batchId, String provider, String model) {
        String language = db.sql("SELECT language FROM conversation WHERE id=:id").param("id", conversationId)
                .query(String.class).optional().orElseThrow(() -> ApiException.notFound("Диалог " + conversationId));
        int open = db.sql("""
                SELECT count(*) FROM appeal a JOIN criterion_result cr ON cr.id=a.criterion_result_id
                JOIN evaluation e ON e.id=cr.evaluation_id
                WHERE e.conversation_id=:id AND e.is_latest AND a.status='OPEN'
                """).param("id", conversationId).query(Integer.class).single();
        if (open > 0) throw ApiException.conflict("OPEN_APPEALS", "У диалога есть открытые апелляции — сначала рассмотрите их");
        int pending = db.sql("SELECT count(*) FROM evaluation WHERE conversation_id=:id AND is_latest AND status='PENDING'")
                .param("id", conversationId).query(Integer.class).single();
        if (pending > 0) throw ApiException.conflict("ALREADY_PENDING", "Диалог уже оценивается");

        LlmRouter.Choice choice = router.choose(language, provider, model);
        long versionId = checklists.activeVersionId();
        db.sql("UPDATE evaluation SET is_latest=false WHERE conversation_id=:id AND is_latest").param("id", conversationId).update();
        return db.sql("""
                INSERT INTO evaluation(conversation_id, checklist_version_id, batch_id, status, provider, model, simulated, prompt_version)
                VALUES (:c, :v, :b, 'PENDING', :p, :m, :sim, :pv) RETURNING id
                """)
                .param("c", conversationId).param("v", versionId).param("b", batchId)
                .param("p", choice.client().provider()).param("m", choice.model())
                .param("sim", "MOCK".equals(choice.client().provider()))
                .param("pv", kz.freedom.cqa.llm.PromptBuilder.PROMPT_VERSION)
                .query(Long.class).single();
    }
}
