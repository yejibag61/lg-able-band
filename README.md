# lg-able-band

## Structure

- `BE`: single Spring Boot backend project
- `BE` modules: `app`, `wearable` packages inside one backend
- `FE/app`: React + Vite frontend for the mobile app
- `FE/wearable`: React + Vite frontend for the wearable client
- `ML`: lightweight local ML test server

## Backend DB Setup

1. Copy `BE/.env.example` to `BE/.env`
2. Fill in your Aiven MySQL values
3. Keep `DB_NAME=able_band`
4. SSL is already enforced in the JDBC connection with `sslMode=REQUIRED`

Example variables:

```bash
DB_HOST=your-aiven-host
DB_PORT=26151
DB_NAME=able_band
DB_USER=avnadmin
DB_PASSWORD=your-aiven-password
```

## Run Manually

```bash
cd BE && .\mvnw.cmd spring-boot:run
cd FE/app && npm install && npm run dev
cd FE/wearable && npm install && npm run dev
cd ML/context && python server.py
cd ML/warning && python server.py
cd ML/emergency && python server.py
```

## Batch Files

- `start-be.bat`: starts the Spring Boot backend
- `start-fe.bat`: starts both frontend dev servers
- `start-ml.bat`: starts the context, warning, and emergency AI servers
- `start-all.bat`: starts BE, FE, and ML together
- `stop-all.bat`: stops servers listening on ports `8080`, `5173`, `5174`, and `8000`-`8003`

## Backend Endpoints

- `http://localhost:8080/api/status`
- `http://localhost:8080/api/app/status`
- `http://localhost:8080/api/wearable/status`
- `http://localhost:8080/api/db/status`

## Frontend

- Open `http://localhost:5173` after running the backend and frontend
- `FE/wearable` runs on `http://localhost:5174`

## AI Servers

- Context AI: `http://localhost:8000/health`
- Warning AI: `http://localhost:8001/health`
- Emergency AI: `http://localhost:8003/health`

## Notes

- `.env` is ignored by Git through `BE/.gitignore`
- `BE/.env.example` is the committed template
- The backend only creates the MySQL connection when all `DB_*` variables are present
