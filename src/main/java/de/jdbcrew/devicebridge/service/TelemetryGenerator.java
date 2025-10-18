package de.jdbcrew.devicebridge.service;

import de.jdbcrew.devicebridge.model.GpsCoordinate;
import de.jdbcrew.devicebridge.model.Orientation;
import de.jdbcrew.devicebridge.model.TelemetrySnapshot;
import de.jdbcrew.devicebridge.model.TemperatureReading;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class TelemetryGenerator {

    private final Deque<Double> accelerationHistory = new ArrayDeque<>();
    private final Deque<Double> brakingHistory = new ArrayDeque<>();

    private double heading = 0;
    private double roll = 0;
    private double pitch = 0;
    private double yaw = 0;

    private double latitude = 52.52;
    private double longitude = 13.405;

    public TelemetryGenerator() {
        for (int i = 0; i < 20; i++) {
            accelerationHistory.addLast(0.0);
            brakingHistory.addLast(0.0);
        }
    }

    public synchronized TelemetrySnapshot nextSnapshot() {
        var random = ThreadLocalRandom.current();

        heading = (heading + random.nextDouble(0, 5)) % 360;
        roll = wrapAngle(roll + random.nextDouble(-2, 2));
        pitch = wrapAngle(pitch + random.nextDouble(-1.5, 1.5));
        yaw = wrapAngle(yaw + random.nextDouble(-3, 3));

        latitude += random.nextDouble(-0.0002, 0.0002);
        longitude += random.nextDouble(-0.0002, 0.0002);

        var throttle = clamp(random.nextDouble(0, 1), 0, 1);
        var brake = clamp(random.nextDouble(0, 0.4), 0, 1);

        pushValue(accelerationHistory, throttle * 9);
        pushValue(brakingHistory, brake * 7);

        var temps = List.of(
                new TemperatureReading("Temp #1", round(random.nextDouble(30, 40))),
                new TemperatureReading("Temp #3", round(random.nextDouble(28, 38)))
        );

        return new TelemetrySnapshot(
                new GpsCoordinate(round(latitude, 6), round(longitude, 6)),
                round(heading, 2),
                new Orientation(round(roll, 2), round(pitch, 2), round(yaw, 2)),
                round(throttle, 3),
                round(brake, 3),
                temps,
                new ArrayList<>(accelerationHistory),
                new ArrayList<>(brakingHistory),
                Instant.now().toEpochMilli()
        );
    }

    private void pushValue(Deque<Double> deque, double value) {
        if (deque.size() >= 20) {
            deque.removeFirst();
        }
        deque.addLast(round(value, 2));
    }

    private double wrapAngle(double angle) {
        angle %= 360;
        if (angle < 0) {
            angle += 360;
        }
        return angle;
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private double round(double value) {
        return round(value, 2);
    }

    private double round(double value, int precision) {
        double factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }
}
