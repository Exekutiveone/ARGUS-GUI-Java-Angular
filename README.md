
## Schnellstart

1. **Voraussetzungen installieren**
   - Java 17 (z. B. Temurin 17) und Maven 3.9+
   - Node.js 18 LTS sowie npm (Angular CLI wird automatisch als Dev-Dependency mitinstalliert)
2. **Backend starten**
   ```bash
   mvn spring-boot:run
   ```
   Läuft anschließend unter `http://localhost:4800`.
3. **Frontend starten**
   ```bash
   cd src/main/frontend
   npm install
   npm start
   ```
   Angular dev server auf `http://localhost:4200`. Die Proxy-Konfiguration leitet Aufrufe unter `/device-api/*` an den zuletzt gewählten Geräte-Host weiter.
4. **Anmelden und testen**
   - Zugangsdaten Demo: Benutzer `admin`, Passwort `1234`
   - Dashboard erreichen unter `http://localhost:4200/login`

---

## Systemüberblick

- **Spring Boot Backend (`device-bridge`)**  
  Kümmert sich um REST-Endpunkte, WebSockets sowie das Fan-out von Kamerastreams.

- **Angular Frontend (`src/main/frontend`)**  
  Bietet ein Single-Page-Dashboard mit Kartenansicht (Leaflet), 3D-Fahrzeugmodell (Three.js), Sensorkacheln, Gamepad- / Tastatursteuerung sowie einem flexiblen Host-Management für verschiedene Hardware-Setups.

- **Geräte-Services**  
 Über `DeviceHostService` können beliebige Basispfade (z. B. API eines Raspberry Pi) gewählt werden. Das Skript `API.py` läuft verpflichtend auf dem Endgerät und liefert die Sensor-, Servo- und Kameradaten an das Dashboard.
---

## Projektstruktur

```
ARGUS-GUI-Java-Angular
├── src/main/java/de/jdbcrew/devicebridge  # Spring Boot Quellcode
├── src/main/resources                     # application.yml + ausgeliefertes Frontend
├── src/main/frontend                      # Angular Projekt (Entwicklungsversion)
├── docs/api-dokumentation.tex             # Begleitende LaTeX-Dokumentation
├── API.py                                 # Pflichtskript für das Endgerät (Flask)
└── Pin_Layout.txt                         # Kanalzuordnung für PWM/Servo-Requests
```

---

## Backend: Spring Boot Device Bridge

### Start & Entwicklung

- Port konfigurierbar über `src/main/resources/application.yml` (`server.port`, Default 4800)
- Entwicklungsstart: `mvn spring-boot:run`
- Für ein ausführbares JAR: `mvn clean package` → `target/device-bridge-0.0.1-SNAPSHOT.jar`

### Wichtige Endpunkte

| Typ          | Pfad                    | Beschreibung                                                      |
|--------------|------------------------|-------------------------------------------------------------------|
| `GET`        | `/api/telemetry`       | Liefert Telemetrie-Snapshot (aktuell Demo-Daten)                  |
| `POST`       | `/api/control`         | Nimmt Fahrbefehle entgegen (Log-Ausgabe)                          |
| `POST`       | `/api/mode`            | Wechsel des Fahrmodus                                             |
| `POST`       | `/api/steering`        | Wechsel des Lenkmodus                                             |
| `POST`       | `/api/auth/login`      | Mock-Login, liefert Dummy-Token                                   |
| `GET`        | `/stream-proxy?target` | Proxyt MJPEG-Streams von Gerätekameras                           |
| WebSocket    | `/ws/telemetry`        | Push von Telemetriedaten (1 Hz)                                   |
| WebSocket    | `/ws/control`          | Entgegennahme von Steuerbefehlen aus der UI                       |

> Hinweis: Aktuell loggen die Controller die Befehle nur. Der Übergang zur Hardware findet über eigene Services oder das Python-Skript statt.


## Frontend: Angular Dashboard

### Setup & Skripte

| Befehl                 | Zweck                                      |
|------------------------|--------------------------------------------|
| `npm install`          | Abhängigkeiten installieren                |
| `npm start`            | Dev-Server mit Proxy & Live-Reload         |
| `npm run build`        | Produktions-Build in `dist/frontend`       |
| `npm test`             | Jasmine/Karma Unit-Tests                   |

> Node 18 wird empfohlen. Bei Fehlern mit OpenSSL (unter macOS) ggf. `export NODE_OPTIONS=--openssl-legacy-provider`.

### Kernfunktionen im Dashboard

- **Login** mit lokalem Mock (`AuthService`) – speichert Token 12 h im `localStorage`.
- **Karte & Navigation** (`MapComponent` mit Leaflet) – zeigt Position, erlaubt zügige Orientierung.
- **3D-Modell** (`CarModelComponent`) – STL (`assets/models/Car.stl`), reagiert auf Roll/Pitch/Yaw.
- **Sensorik** (`SensorsComponent`) – Temperaturwerte, Verlaufsdiagramme, Akku/Beschleunigung.
- **Kamerazentrale** (`CameraComponent`) – mehrere Feeds, Umschalten, Schwenk-Modi, Bildplatzhalter.
- **Kontrollpanel** (`ControlsComponent`) – Bedienung mit Gamepad (Controller erforderlich), Tastatur-Backup, Fahr-/Lenkmodi, LED/Laser-Schalter.
- **Aufgaben & Kalibrierung** (`TasksComponent`, `CalibrationComponent`) – simulierte Workflows plus Netzwerkpanel zum Verwalten der Geräte-Hosts.

### Praktische Hinweise

- UI ist auf breite Bildschirme (≈ 1920 px) optimiert – bei kleineren Displays per Browser-Zoom (`Strg/Cmd` + `-`) herauszoomen, um alle Panels zu sehen.

---

## Hardware- und Gerätestacks

- **Python-Service `API.py`**  
  Pflichtdienst auf dem Endgerät (z. B. Raspberry Pi). Er liest Sensoren (BME280, MLX90640, Kompass, IMU), steuert Servos/LEDs über den PCA9685, stellt Kamerastreams bereit und liefert die Daten an das Dashboard. Nutzt `smbus2`, `adafruit_mlx90640`, OpenCV – muss parallel zur Spring-Boot-Anwendung laufen, damit Telemetrie & Streams sichtbar werden.

- **Pin_Layout.txt**  
  Dokumentiert die Zuordnung der Servokanäle (LEDs, Laser, Fahrwerk). Die Kanalnummern werden bei API-Requests benötigt, um das Endgerät korrekt anzusteuern.

---

## Häufige Stolpersteine

- **Portkonflikte**: Frontend (4200) ↔ Backend (4800). Bei Änderungen anpassen sowohl im Angular `ControlService` als auch in den Proxy-Einstellungen.
- **CORS/HTTPS**: Für externe Geräte-Hosts ggf. HTTPS-Zertifikat oder Reverse-Proxy einrichten, sonst blockt der Browser gemischte Inhalte.
- **Fehlende Sensorwerte**: Das Dashboard filtert `undefined`-Werte – lieber mit `TelemetryGenerator` kontrollieren, ob Datenreihen vollständig sind.
- **WebGL/Three.js**: STL-Modelle sollten sauber trianguliert sein. Eigene Modelle in `src/main/frontend/src/assets/models/` ablegen und Pfad im `CarModelComponent` anpassen.

---

## Weiterführende Ressourcen

- `docs/api-dokumentation.tex` – ausformulierter Hintergrund zur Architektur.
- Angular Komponenten: `src/main/frontend/src/app/components/*`
- WebSocket-Handler: `src/main/java/de/jdbcrew/devicebridge/websocket/*`
- Telemetrie-Mock: `src/main/java/de/jdbcrew/devicebridge/service/TelemetryGenerator.java`
- Assets für Visualisierung: `src/main/frontend/src/assets/models/Car.stl`.
