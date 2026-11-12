import { Request, Response, NextFunction } from 'express';
import zlib from 'zlib';
import { saasService } from '../saasService.js';

/**
 * Applies enterprise HTTP security headers (OWASP best practices)
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self)'
  );

  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Prevent caching of sensitive authenticated API responses
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/public')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }

  next();
}

/**
 * Lightweight native Gzip compression middleware for JSON, HTML, CSS, JS, SVG, and XML
 */
export function compressionMiddleware(req: Request, res: Response, next: NextFunction) {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!acceptEncoding.includes('gzip') || req.method === 'HEAD') {
    return next();
  }

  const originalSend = res.send.bind(res);
  res.send = function (body?: any): Response {
    if (res.headersSent || res.getHeader('Content-Encoding')) {
      return originalSend(body);
    }

    const contentType = String(res.getHeader('Content-Type') || '');
    const isCompressible =
      contentType.includes('application/json') ||
      contentType.includes('text/html') ||
      contentType.includes('text/css') ||
      contentType.includes('javascript') ||
      contentType.includes('xml') ||
      contentType.includes('image/svg+xml') ||
      typeof body === 'object';

    if (!isCompressible) {
      return originalSend(body);
    }

    let rawBuffer: Buffer;
    if (Buffer.isBuffer(body)) {
      rawBuffer = body;
    } else if (typeof body === 'string') {
      rawBuffer = Buffer.from(body, 'utf8');
    } else if (body !== undefined && body !== null) {
      rawBuffer = Buffer.from(JSON.stringify(body), 'utf8');
      if (!contentType) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    } else {
      return originalSend(body);
    }

    // Only compress payloads >= 1024 bytes
    if (rawBuffer.byteLength < 1024) {
      return originalSend(body);
    }

    try {
      const compressed = zlib.gzipSync(rawBuffer, { level: zlib.constants.Z_BEST_SPEED });
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.byteLength));
      return originalSend(compressed);
    } catch {
      return originalSend(body);
    }
  };

  next();
}

/**
 * Dynamic /robots.txt generator
 */
export function robotsTxtHandler(req: Request, res: Response) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const baseUrl = (process.env.APP_BASE_URL || `${protocol}://${host}`).replace(/\/+$/, '');

  const lines = [
    'User-agent: *',
    'Allow: /agendar/',
    'Allow: /loja/',
    'Disallow: /api/',
    'Disallow: /super-admin-secreto',
    'Disallow: /master-admin-secret',
    'Disallow: /acesso-lojista',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ];

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(lines.join('\n'));
}

/**
 * Dynamic /sitemap.xml generator listing active published stores
 */
export async function sitemapXmlHandler(req: Request, res: Response) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = (process.env.APP_BASE_URL || `${protocol}://${host}`).replace(/\/+$/, '');

    const stores = await saasService.getPublicPartnerDirectory();
    const nowIso = new Date().toISOString().split('T')[0];

    const urlEntries = stores
      .map(
        (store: any) => `  <url>
    <loc>${baseUrl}/agendar/${encodeURIComponent(store.slug)}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch {
    res.status(500).setHeader('Content-Type', 'text/plain').send('Error generating sitemap');
  }
}
