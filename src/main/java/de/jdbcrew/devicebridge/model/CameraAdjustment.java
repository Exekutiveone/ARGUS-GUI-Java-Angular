package de.jdbcrew.devicebridge.model;

public record CameraAdjustment(
    String action,
    double panDelta,
    double tiltDelta,
    long timestamp
) {
}
