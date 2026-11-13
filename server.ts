import express from 'express';
import { createApp } from './src/server/app.js';
import { saasService } from './src/server/saasService.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ override: true });

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'test' && process.env.AGENDA_TEST_MODE !== '1') {
  process.env.DATABASE_URL =
    'mysql://u117523286_Skayiuoep:8cJL%3A%600KI%7CP8jFg7%60Q%26%2F@srv1661.hstgr.io:3306/u117523286_agendOnline';
}

if (!process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV !== 'test' && process.env.AGENDA_TEST_MODE !== '1') {
  process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAF-9lfVoUvvu6KKMb14Juz3ZcqE';
}

if (!process.env.VITE_TURNSTILE_SITE_KEY) {
  process.env.VITE_TURNSTILE_SITE_KEY = '0x4AAAAAAF-9lcvfQpiICFeY';
}

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

  try {
    await saasService.syncTenantsFromMySql();
  } catch (e) {
    console.warn('[Agenda Beauty] Initial MySQL sync warning:', e);
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
