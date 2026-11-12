import serverless from 'serverless-http';
import { createApp } from '../../src/server/app.js';

const app = createApp();
const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  // Normalize path when invoked via /.netlify/functions/api/*
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    const suffix = event.path.replace('/.netlify/functions/api', '');
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
