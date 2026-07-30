import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { projectRoutes } from "./modules/projects/project.routes";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Better Auth API
app.all("/api/auth/*", toNodeHandler(auth.handler));

// Mount Modules
app.use("/api/projects", projectRoutes);

app.get('/', (req, res) => {
  res.send('UpNode API is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
