package kz.freedom.cqa.importer;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ImportController {
    private final ImportService service;
    private final JdbcClient db;

    public ImportController(ImportService service, JdbcClient db) {
        this.service = service;
        this.db = db;
    }

    /** POST /api/import?groupId=DEV&date=2026-11-03  (date is optional, applies to chats only) */
    @PostMapping("/import")
    public ImportService.ImportResult importGroup(@RequestParam String groupId,
                                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.importGroup(groupId, date);
    }

    /** History of imports: when each group arrived and how many records were new. */
    @GetMapping("/imports")
    public List<Map<String, Object>> imports() {
        return db.sql("""
                SELECT id::text AS id, group_id AS "groupId", business_date::text AS "businessDate", status,
                       total, imported, skipped, to_char(started_at, 'YYYY-MM-DD HH24:MI') AS "startedAtLabel", error_text AS "error"
                FROM import_run ORDER BY id DESC LIMIT 100
                """).query().listOfRows();
    }

    @GetMapping("/operators")
    public List<Map<String, Object>> operators() {
        return db.sql("SELECT id::text AS id, name, fictional, source FROM operator ORDER BY name").query().listOfRows();
    }
}
