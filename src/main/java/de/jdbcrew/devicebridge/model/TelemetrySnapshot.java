package de.jdbcrew.devicebridge.model;

import java.util.List;

public record TelemetrySnapshot(
    GpsCoordinate gps,
    double heading,
    Orientation orientation,
    double throttle,
    double brake,
    List<TemperatureReading> temps,
    List<Double> accelerationHistory,
    List<Double> brakingHistory,
    long timestamp
) {
}
