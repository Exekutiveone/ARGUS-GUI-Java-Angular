package de.jdbcrew.devicebridge.model;

public record AuthResponse(String token, long expiresIn) {
}
