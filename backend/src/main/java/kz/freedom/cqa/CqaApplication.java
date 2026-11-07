package kz.freedom.cqa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class CqaApplication {
    public static void main(String[] args) {
        SpringApplication.run(CqaApplication.class, args);
    }
}
