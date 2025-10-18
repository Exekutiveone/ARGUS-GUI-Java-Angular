package de.jdbcrew.devicebridge.model;

public record ControlCommand(
    String source,
    String command,
    Double value,
    long timestamp
) {
}
