package de.jdbcrew.devicebridge.controller;

import de.jdbcrew.devicebridge.model.AuthRequest;
import de.jdbcrew.devicebridge.model.AuthResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody AuthRequest request) {
        if (request == null
                || !StringUtils.hasText(request.username())
                || !StringUtils.hasText(request.password())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        // Mock-Login: akzeptiert alle Anmeldedaten und erstellt Dummy-Token
        var token = UUID.randomUUID().toString();
        return ResponseEntity.ok(new AuthResponse(token, 3600));
    }
}
