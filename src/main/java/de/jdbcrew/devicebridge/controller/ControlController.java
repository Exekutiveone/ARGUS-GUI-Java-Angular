package de.jdbcrew.devicebridge.controller;

import de.jdbcrew.devicebridge.model.ModeChangeRequest;
import de.jdbcrew.devicebridge.model.SteeringModeRequest;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ControlController {

    private static final Logger log = LoggerFactory.getLogger(ControlController.class);

    @PostMapping("/control")
    public ResponseEntity<Void> control(@RequestBody JsonNode payload) {
        if (payload.has("action") && "camera-pan-tilt".equals(payload.path("action").asText())) {
            log.info("Camera pan/tilt adjustment received: panDelta={}, tiltDelta={}",
                    payload.path("panDelta").asDouble(), payload.path("tiltDelta").asDouble());
        } else {
            log.info("Control command received: source={}, command={}, value={}",
                    payload.path("source").asText(), payload.path("command").asText(), payload.path("value").asDouble());
        }
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/mode")
    public ResponseEntity<Void> changeMode(@RequestBody ModeChangeRequest modeChange) {
        log.info("Drive mode changed to {}", modeChange.mode());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/steering")
    public ResponseEntity<Void> changeSteering(@RequestBody SteeringModeRequest steering) {
        log.info("Steering mode changed to {}", steering.mode());
        return ResponseEntity.accepted().build();
    }
}
