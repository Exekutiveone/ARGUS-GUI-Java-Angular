package de.jdbcrew.devicebridge.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class ControlWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ControlWebSocketHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, String> lastPayloadBySession = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        lastPayloadBySession.remove(session.getId());
        log.info("Control WebSocket connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String rawPayload = message.getPayload();
        String previous = lastPayloadBySession.get(session.getId());
        if (rawPayload.equals(previous)) {
            return;
        }

        lastPayloadBySession.put(session.getId(), rawPayload);
        JsonNode payload = objectMapper.readTree(rawPayload);
        log.info("Control WS message: {}", payload);
        // TODO: forward control command to hardware layer
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        lastPayloadBySession.remove(session.getId());
        log.info("Control WebSocket closed: {}", session.getId());
    }
}
