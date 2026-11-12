import serverless from 'serverless-http';
import { createApp } from '../../src/server/app.js';
import { saasService } from '../../src/server/saasService.js';

const DEFAULT_HOSTINGER_DB_URL =
  'mysql://u117523286_Skayiuoep:8cJL%3A%600KI%7CP8jFg7%60Q%26%2F@srv1661.hstgr.io:3306/u117523286_agendOnline';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_HOSTINGER_DB_URL;
}

const app = createApp();
const serverlessHandler = serverless(app);

let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 60000;

export const handler = async (event: any, context: any) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_HOSTINGER_DB_URL;
  }

  const now = Date.now();
  if (now - lastSyncTime > SYNC_INTERVAL_MS) {
    try {
      await saasService.syncTenantsFromMySql();
      lastSyncTime = now;
    } catch (e) {
      console.warn('[Netlify Function] MySQL sync warning:', e);
    }
  }

  // Normalize path whether invoked via /api/* rewrite or /.netlify/functions/api/*
  const rawPath = event.path || event.rawUrl || '';
  if (rawPath.includes('/.netlify/functions/api')) {
    const idx = rawPath.indexOf('/.netlify/functions/api');
    const suffix = rawPath.slice(idx + '/.netlify/functions/api'.length);
    if (suffix === '/robots.txt' || suffix === '/sitemap.xml') {
      event.path = suffix;
    } else if (!suffix.startsWith('/api')) {
      event.path = `/api${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
    } else {
      event.path = suffix;
    }
  }

  return serverlessHandler(event, context);
};
