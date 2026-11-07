import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import health from './routes/health.js';
import authRoutes from './routes/auth.js';
import queryRoutes from './routes/query.js';
import metaRoutes from './routes/meta.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middleware/errors.js';

export function createApp(container) {
  const app = express();
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY)); // behind Render/Railway: needed for per-client rate limits
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.use('/api/health', health);
  app.use('/api/auth', authRoutes(container));
  app.use('/api/query', queryRoutes(container));
  app.use('/api/meta', metaRoutes(container));
  app.use('/api/admin', adminRoutes(container));

  // Production: the same process serves the built React app, so there is one URL and no CORS.
  const staticDir = process.env.STATIC_DIR;
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.resolve(staticDir, 'index.html')));
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
