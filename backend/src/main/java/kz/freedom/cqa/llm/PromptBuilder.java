package kz.freedom.cqa.llm;

import kz.freedom.cqa.checklist.Criterion;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Builds the prompt from DB rows: criteria (active checklist) + past AI mistakes + transcript.
 * Nothing about specific criteria is hard-coded here, so a replaced criterion works immediately.
 */
@Component
public class PromptBuilder {
    public static final String PROMPT_VERSION = "v2";

    public record Line(int seq, String time, String speaker, String text) {}

    public record Correction(String criterionCode, String language, String snippet, String aiValue, String correctValue, String reason) {}

    public String system() {
        return """
                Ты — специалист отдела контроля качества (ОКК) брокерской компании Freedom Broker.
                Ты оцениваешь работу ОПЕРАТОРА поддержки по чек-листу. Диалоги на русском, казахском или английском.

                Правила:
                1. Оценивай только реплики с ролью operator. Реплики bot (AI-ассистент, голосовое меню) и system — контекст, оператора за них не оценивай.
                2. Сообщения system — достоверные факты платформы. Например, «Личность клиента подтверждена» / «Customer identity verified» подтверждает идентификацию; «Клиент покинул чат», «Соединение прервано» могут делать «Завершение» неприменимым (N/A).
                3. Персональные данные скрыты метками. «[Имя скрыто]» в реплике оператора значит, что оператор назвал своё имя (представился). «[Данные идентификации скрыты]» значит, что клиент передал данные для проверки. За метки не снижай оценку.
                4. Для звонков текст — автоматическая расшифровка речи: в ней бывают искажённые слова («Фридом брокер» может быть записан с ошибками). Не снижай оценку за ошибки распознавания, оценивай смысл. Цифры клиента вроде «2» — это нажатия в голосовом меню.
                5. Для каждого критерия выбери ровно одно значение из списка «Допустимые значения». N/A (isNa=true, value=null) ставь только если у критерия разрешено N/A и выполнено его условие.
                6. «Нет» — действие было нужно, но оператор его пропустил или сделал неправильно. N/A — критерий неприменим по условию.
                7. evidenceSeqs — номера реплик (#), которые подтверждают ответ. Для пропущенного действия укажи реплику, где его ожидали. Номера должны существовать в стенограмме.
                8. explanation — 1–2 предложения на русском: что подтверждает реплика.
                9. confidence — твоя уверенность от 0 до 1.
                10. Не считай итоговый балл — его считает система.
                11. Не придумывай факты. Если данных для уверенного вывода нет, выбери самое обоснованное значение, честно напиши об этом в explanation и снизь confidence.

                Ответь ТОЛЬКО JSON без markdown:
                {"criteria":[{"code":"C01","value":1,"isNa":false,"confidence":0.9,"explanation":"...","evidenceSeqs":[5]}]}
                """;
    }

    public String user(String channel, String language, Integer operatorStartSeq, List<Criterion> criteria,
                       List<Correction> corrections, List<Line> lines) {
        // Order matters for cost: the part that is the same for every dialog (checklist, corrections)
        // goes first so providers' prompt caching can reuse it; the dialog itself goes last.
        StringBuilder sb = new StringBuilder();
        sb.append("=== ЧЕК-ЛИСТ ===\n");
        for (Criterion c : criteria) {
            sb.append("\n[").append(c.code()).append("] ").append(c.title()).append(" (").append(c.section()).append(")\n");
            sb.append("Инструкция: ").append(c.instruction()).append('\n');
            sb.append("Допустимые значения: ");
            sb.append(c.steps().stream().map(s -> s.value().stripTrailingZeros().toPlainString() + " = " + s.label()).collect(Collectors.joining("; ")));
            sb.append('\n');
            sb.append(c.allowNa() ? "N/A разрешено, если: " + c.naCondition() + "\n" : "N/A запрещено.\n");
        }

        if (!corrections.isEmpty()) {
            sb.append("\n=== ПРОШЛЫЕ ОШИБКИ AI, ИСПРАВЛЕННЫЕ ОКК (учти их) ===\n");
            Map<String, List<Correction>> byCode = corrections.stream().collect(Collectors.groupingBy(Correction::criterionCode));
            byCode.forEach((code, list) -> list.forEach(x -> sb.append("- [").append(code).append(", ").append(x.language()).append("] Фрагмент: «")
                    .append(x.snippet()).append("». AI поставил: ").append(x.aiValue()).append(". Правильно: ").append(x.correctValue())
                    .append(". Причина: ").append(x.reason()).append('\n')));
        }

        sb.append("\n=== ДИАЛОГ ===\n");
        sb.append("Канал: ").append("VOICE".equals(channel) ? "звонок (расшифровка речи)" : "чат").append('\n');
        sb.append("Язык диалога: ").append(language).append('\n');
        if (operatorStartSeq != null) sb.append("Оператор подключился с реплики #").append(operatorStartSeq).append(". Всё до неё — бот/меню, это контекст.\n");
        else sb.append("Реплик оператора нет.\n");
        sb.append("\n=== СТЕНОГРАММА ===\n");
        for (Line l : lines) {
            sb.append('#').append(l.seq()).append(" [").append(l.time()).append("] ").append(l.speaker()).append(": ").append(l.text()).append('\n');
        }
        return sb.toString();
    }
}
