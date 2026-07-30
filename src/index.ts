import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { projectRoutes } from "./modules/projects/project.routes";
import { incidentRoutes } from "./modules/incidents/incident.routes";
import { streamRoutes } from "./modules/stream/stream.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { startAlertWorker } from "./workers/alertWorker";

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Better Auth API
app.all("/api/auth/*", toNodeHandler(auth.handler));

// Mount Feature Modules
app.use("/api/projects", projectRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api", streamRoutes);

app.get('/', (req, res) => {
  res.send('UpNode API is running');
});

// Centralized Error Handler (must be registered after routes)
app.use(errorHandler);

// Start BullMQ Background Alert Worker
startAlertWorker();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
