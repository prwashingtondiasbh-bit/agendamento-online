import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Smart API Interceptor for Netlify / Static Hosting + Token Header Injection
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  try {
    const nativeFetch = window.fetch.bind(window);
    const configuredApiBase = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
    const fallbackCloudBackend = 'https://ais-pre-3kx5mr4gwoah5onw4gj6o5-464677955233.us-east1.run.app';
    let activeRemoteBase: string | null = configuredApiBase || null;

    const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (urlStr.startsWith('/api/')) {
        const token = localStorage.getItem('agenda_token');
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (token && !headers.has('x-session-token')) {
          headers.set('x-session-token', token);
        }

        const enhancedInit: RequestInit = {
          ...init,
          headers,
          credentials: init?.credentials || 'include',
        };

        if (activeRemoteBase) {
          return nativeFetch(`${activeRemoteBase}${urlStr}`, enhancedInit);
        }

        try {
          const res = await nativeFetch(urlStr, enhancedInit);
          const contentType = (res.headers.get('content-type') || '').toLowerCase();

          // If hosted on a static-only server (e.g. Netlify Drop) where /api/* returns HTML or 404 HTML
          if (contentType.includes('text/html') || (res.status === 404 && !contentType.includes('application/json'))) {
            activeRemoteBase = fallbackCloudBackend;
            return nativeFetch(`${activeRemoteBase}${urlStr}`, enhancedInit);
          }

          return res;
        } catch (err) {
          if (window.location.hostname.endsWith('.netlify.app')) {
            activeRemoteBase = fallbackCloudBackend;
            return nativeFetch(`${activeRemoteBase}${urlStr}`, enhancedInit);
          }
          throw err;
        }
      }

      return nativeFetch(input, init);
    };

    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      configurable: true,
      writable: true,
    });
  } catch {
    // Environment has a read-only window.fetch getter (e.g. AI Studio preview iframe where /api/* is already local)
  }
}

createRoot(document.getElementById('root')!).render(<App />);
