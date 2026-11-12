import express from 'express';
import { createApp } from './src/server/app.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ override: true });

// Normalize environment variables that may have been pasted with literal surrounding quotes
for (const [key, val] of Object.entries(process.env)) {
  if (typeof val === 'string' && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
    process.env[key] = val.slice(1, -1).trim();
  }
}

// Prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[Agenda Beauty] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Agenda Beauty] Unhandled Rejection:', reason);
});

async function startServer() {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  const isDev = process.env.NODE_ENV !== 'production';

  // In production, enforce strict MySQL persistence by default unless explicitly overridden
  if (!isDev && process.env.DB_STRICT_MODE === undefined) {
    process.env.DB_STRICT_MODE = 'true';
  }

  const app = createApp();

  if (isDev) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('[Agenda Beauty] Vite dev server failed to start, falling back to static mode:', e);
      app.use(express.static(path.join(process.cwd(), 'dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
      });
    }
  } else {
    // Serve static files in production with optimal caching and SPA catch-all fallback
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '365d',
        immutable: true,
      })
    );
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1h',
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Agenda Beauty] Server running on port ${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

startServer().catch(err => {
  console.error('[Agenda Beauty] Failed to start server:', err);
  process.exit(1);
});
