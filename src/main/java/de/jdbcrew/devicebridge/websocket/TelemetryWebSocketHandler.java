package de.jdbcrew.devicebridge.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.jdbcrew.devicebridge.model.TelemetrySnapshot;
import de.jdbcrew.devicebridge.service.TelemetryGenerator;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class TelemetryWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TelemetryWebSocketHandler.class);

    private final TelemetryGenerator telemetryGenerator;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Set<WebSocketSession> sessions = new CopyOnWriteArraySet<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public TelemetryWebSocketHandler(TelemetryGenerator telemetryGenerator) {
        this.telemetryGenerator = telemetryGenerator;
    }

    @PostConstruct
    void startBroadcastScheduler() {
        scheduler.scheduleAtFixedRate(this::broadcastSnapshot, 0, 1, TimeUnit.SECONDS);
    }

    @PreDestroy
    void shutdownScheduler() {
        scheduler.shutdownNow();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("Telemetry WebSocket connected: {}", session.getId());
        sendSnapshot(session, telemetryGenerator.nextSnapshot());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        log.info("Telemetry WebSocket closed: {}", session.getId());
        sessions.remove(session);
    }

    private void broadcastSnapshot() {
        TelemetrySnapshot snapshot = telemetryGenerator.nextSnapshot();
        TextMessage message;
        try {
            message = new TextMessage(objectMapper.writeValueAsString(snapshot));
        } catch (JsonProcessingException e) {
            log.error("Unable to serialize telemetry snapshot", e);
            return;
        }

        sessions.stream()
                .filter(WebSocketSession::isOpen)
                .forEach(session -> {
                    try {
                        session.sendMessage(message);
                    } catch (IOException e) {
                        log.warn("Failed to push telemetry to session {}", session.getId(), e);
                    }
                });
    }

    private void sendSnapshot(WebSocketSession session, TelemetrySnapshot snapshot) {
        if (!session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(snapshot)));
        } catch (IOException e) {
            log.warn("Unable to send initial telemetry snapshot to {}", session.getId(), e);
        }
    }
}
