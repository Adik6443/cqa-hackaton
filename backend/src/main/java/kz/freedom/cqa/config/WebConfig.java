package kz.freedom.cqa.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class WebConfig implements WebMvcConfigurer {

    private final CqaProperties props;

    public WebConfig(CqaProperties props) {
        this.props = props;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(props.corsOrigins().split(","))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE");
    }

    /** Pool for LLM calls: limits parallel requests to the provider (rate limits, cost). */
    @Bean(name = "llmExecutor")
    public Executor llmExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        int n = Math.max(1, props.evaluation().concurrency());
        ex.setCorePoolSize(n);
        ex.setMaxPoolSize(n);
        ex.setQueueCapacity(10_000);
        ex.setThreadNamePrefix("llm-");
        ex.initialize();
        return ex;
    }
}
