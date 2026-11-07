package kz.freedom.cqa.results;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/results")
public class ResultsController {
    private final ResultsExportService service;

    public ResultsController(ResultsExportService service) {
        this.service = service;
    }

    /**
     * POST /api/results/export?groupId=DEV&set=dev  -> writes ../results/dev/results.json (repo root) and returns a report.
     * source=ai (default, system output) | final (after appeals). write=false -> only preview.
     */
    @PostMapping("/export")
    public ResultsExportService.ExportReport export(@RequestParam String groupId,
                                                    @RequestParam String set,
                                                    @RequestParam(defaultValue = "ai") String source,
                                                    @RequestParam(defaultValue = "true") boolean write,
                                                    @RequestParam(defaultValue = "false") boolean allowSimulated) {
        return service.export(groupId, set, source, write, allowSimulated);
    }
}
