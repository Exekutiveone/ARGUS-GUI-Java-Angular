package de.jdbcrew.devicebridge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestClient;

@SpringBootApplication
public class DeviceBridgeApplication {
    public static void main(String[] args) {
        // Startpunkt der Spring-Boot-Anwendung
        SpringApplication.run(DeviceBridgeApplication.class, args);
    }

    @Bean
    RestClient.Builder restClientBuilder() {
        // Stellt einen RestClient.Builder als Spring-Bean bereit,
        // damit er in Services (z. B. RaspberryPiService, ServerDeviceService) per Dependency Injection genutzt werden kann
        return RestClient.builder();
    }
}