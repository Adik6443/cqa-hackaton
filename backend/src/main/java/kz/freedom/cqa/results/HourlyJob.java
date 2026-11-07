package kz.freedom.cqa.results;

import kz.freedom.cqa.config.CqaProperties;
import kz.freedom.cqa.conversation.ConversationFilter;
import kz.freedom.cqa.evaluation.BatchService;
import kz.freedom.cqa.importer.ImportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Production mode (cqa.auto.enabled=true): every hour import the group and evaluate ONLY new dialogs.
 * Already imported/evaluated dialogs are skipped, so the LLM is paid once per dialog.
 */
@Component
@ConditionalOnProperty(name = "cqa.auto.enabled", havingValue = "true")
public class HourlyJob {
    private static final Logger log = LoggerFactory.getLogger(HourlyJob.class);
    private final ImportService importer;
    private final BatchService batches;
    private final CqaProperties props;

    public HourlyJob(ImportService importer, BatchService batches, CqaProperties props) {
        this.importer = importer;
        this.batches = batches;
        this.props = props;
    }

    @Scheduled(cron = "${cqa.auto.cron}")
    public void run() {
        String group = props.auto().groupId();
        try {
            ImportService.ImportResult r = importer.importGroup(group, null);
            log.info("Hourly import {}: {} new, {} skipped", group, r.imported(), r.skipped());
            if (r.imported() == 0) return;
            ConversationFilter f = new ConversationFilter(null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, group, null, null);
            BatchService.Batch b = batches.start(new BatchService.BatchInput(null, f, null, null, true));
            log.info("Hourly batch {} started for {} dialogs", b.id(), b.total());
        } catch (Exception e) {
            log.warn("Hourly job failed: {}", e.getMessage());
        }
    }
}
