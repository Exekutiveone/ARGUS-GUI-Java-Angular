package de.jdbcrew.devicebridge.controller;

import de.jdbcrew.devicebridge.model.TelemetrySnapshot;
import de.jdbcrew.devicebridge.service.TelemetryGenerator;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TelemetryController {

    private final TelemetryGenerator telemetryGenerator;

    public TelemetryController(TelemetryGenerator telemetryGenerator) {
        this.telemetryGenerator = telemetryGenerator;
    }

    @GetMapping("/telemetry")
    public TelemetrySnapshot telemetry() {
        return telemetryGenerator.nextSnapshot();
    }
}
