package kz.freedom.cqa.checklist;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/checklists")
public class ChecklistController {
    private final ChecklistService service;

    public ChecklistController(ChecklistService service) {
        this.service = service;
    }

    @GetMapping("/versions")
    public List<ChecklistService.Checklist> versions() {
        return service.versions();
    }

    @GetMapping("/active")
    public ChecklistService.Checklist active() {
        return service.active();
    }

    @PostMapping("/versions")
    @ResponseStatus(HttpStatus.CREATED)
    public ChecklistService.Checklist save(@RequestBody ChecklistService.SaveInput input) {
        return service.save(input);
    }

    @PostMapping("/versions/{id}/activate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void activate(@PathVariable long id) {
        service.activate(id);
    }
}
