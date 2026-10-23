import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { authenticate, requireActiveUser } from './middleware/auth';

import authRoutes from './routes/auth.routes';
import branchRoutes from './routes/branch.routes';
import itemsRoutes from './routes/items.routes';
import employeesRoutes from './routes/employees.routes';
import sessionsRoutes from './routes/sessions.routes';
import stockRoutes from './routes/stock.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportsRoutes from './routes/reports.routes';
import miscRoutes from './routes/misc.routes';

fs.mkdirSync(env.uploadDir, { recursive: true });
fs.mkdirSync(env.backupDir, { recursive: true });
fs.mkdirSync(path.resolve(__dirname, '../../../data'), { recursive: true });

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  '/api',
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      app: 'IceFlow Branch Manager',
      assistant: 'Ashok',
      status: 'ok',
      time: new Date().toISOString(),
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api', miscRoutes);

app.use('/uploads', authenticate, requireActiveUser, express.static(env.uploadDir));

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`🍦 IceFlow API listening on http://localhost:${env.port}`);
  console.log(`🤖 Ashok AI endpoints ready at /api/ashok/*`);
});

export default app;
