package de.jdbcrew.devicebridge.config;

import de.jdbcrew.devicebridge.websocket.ControlWebSocketHandler;
import de.jdbcrew.devicebridge.websocket.TelemetryWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final TelemetryWebSocketHandler telemetryHandler;
    private final ControlWebSocketHandler controlHandler;

    public WebSocketConfig(TelemetryWebSocketHandler telemetryHandler,
                           ControlWebSocketHandler controlHandler) {
        this.telemetryHandler = telemetryHandler;
        this.controlHandler = controlHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(telemetryHandler, "/ws/telemetry")
                .setAllowedOriginPatterns("*");

        registry.addHandler(controlHandler, "/ws/control")
                .setAllowedOriginPatterns("*");
    }
}
