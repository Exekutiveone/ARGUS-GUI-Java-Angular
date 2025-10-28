package de.jdbcrew.devicebridge.controller;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@RestController
public class StreamProxyController {

    private static final int BUFFER_SIZE = 16 * 1024;

    @GetMapping("/stream-proxy")
    public void proxyStream(@RequestParam("target") String target, HttpServletResponse response) throws IOException {
        if (target == null || target.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target parameter is required");
        }

        URI uri;
        try {
            uri = URI.create(target);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid target URL");
        }

        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only http/https targets are supported");
        }

        HttpURLConnection connection = null;
        try {
            URL url = uri.toURL();
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(0);
            connection.setRequestProperty("Accept", "multipart/x-mixed-replace");
            connection.connect();

            int status = connection.getResponseCode();
            if (status >= 400) {
                InputStream errorStream = connection.getErrorStream();
                String message;
                if (errorStream != null) {
                    try (errorStream) {
                        message = new String(errorStream.readAllBytes(), StandardCharsets.UTF_8);
                    }
                } else {
                    message = "Upstream error " + status;
                }
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
            }

            String contentType = connection.getContentType();
            if (contentType == null || contentType.isBlank()) {
                contentType = "multipart/x-mixed-replace; boundary=frame";
            }
            response.setStatus(HttpStatus.OK.value());
            response.setHeader("Cache-Control", "no-cache");
            response.setContentType(contentType);

            try (InputStream inputStream = connection.getInputStream()) {
                var outputStream = response.getOutputStream();
                byte[] buffer = new byte[BUFFER_SIZE];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    outputStream.flush();
                }
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
