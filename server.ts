import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './src/server/app.js';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = createApp();
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Agenda Beauty] Server running on http://0.0.0.0:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

startServer().catch(err => {
  console.error('[Agenda Beauty] Failed to start server:', err);
  process.exit(1);
});
