# ARGUS Web UI (Angular)

Angular 17 dashboard for the ARGUS remote vehicle control system. The application delivers a dark-mode operator console with live telemetry, camera feeds, map, compass, 3D model, task overview and keyboard/gamepad control visualisations.

The Angular build is served directly by the Spring Boot backend (`src/main/resources/static`). Any production build will overwrite the static assets that Spring Boot exposes.

## Development

- `npm install` – install dependencies
- `npm start` – run the Angular dev server on <http://localhost:4200>
- `npm run lint` / `npm test` – optional quality gates (tests currently limited to generated specs)

### Building & syncing with Spring Boot

```bash
npm run build
```

The command compiles the Angular app in production mode and writes the bundle into `../src/main/resources/static`. After building you can start the Spring Boot backend and access the SPA at <http://localhost:4800>.

## Project structure highlights

- `src/app/modules/auth` – login module with reactive form and authentication service integration
- `src/app/modules/dashboard` – dashboard shell that orchestrates all feature components
- `src/app/modules/components` – reusable feature components (map, compass, car model, camera, controls, sensors, tasks)
- `src/app/services` – WebSocket/REST integrations for telemetry, video, control and authentication
- `src/app/models` – shared TypeScript interfaces used across modules

## Further CLI help

For scaffolding or advanced CLI usage see the [Angular CLI docs](https://angular.io/cli).
