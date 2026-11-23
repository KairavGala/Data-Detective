/**
 * Data Detective — Thin Local Development Server (Express + Vite Middleware)
 *
 * Parity invariant:
 * - Contains ZERO AI business logic, prompt handling, or SDK imports.
 * - Mounts the exact same native Node.js handlers deployed by Vercel under `/api/*`.
 * - Does NOT attach `express.json()` before `/api/*` so raw byte-size limiting
 *   and stream parsing behave identically to Vercel Serverless Functions.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import healthHandler from './api/ai/health.js';
import prototypeHandler from './api/ai/prototype.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
const HOST = '0.0.0.0';

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');

  // Mount native Node serverless handlers directly (no express.json() ahead of them).
  app.all('/api/ai/health', (req, res, next) => {
    void healthHandler(req, res).catch(next);
  });
  app.all('/api/ai/prototype', (req, res, next) => {
    void prototypeHandler(req, res).catch(next);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.info(
      JSON.stringify({
        event: 'local_server_started',
        host: HOST,
        port: PORT,
        nodeVersion: process.version,
      }),
    );
  });
}

void startServer();
