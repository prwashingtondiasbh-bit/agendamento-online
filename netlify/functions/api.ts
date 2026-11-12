import serverless from 'serverless-http';
import { createApp } from '../../src/server/app.js';

// Ensure Hostinger MySQL connection is available in Netlify Functions even if not manually added in Netlify UI
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'mysql://srv119798258_usalink1:Usalink%402025@193.203.166.19:3306/srv119798258_usalink1';
}

const app = createApp();
const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
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
