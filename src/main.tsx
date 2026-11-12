import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Smart API Interceptor for Netlify Functions + Token Header Injection
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  try {
    const nativeFetch = window.fetch.bind(window);
    const isNetlifyHost = window.location.hostname.endsWith('.netlify.app');
    let useNetlifyFunctionsPath = isNetlifyHost;

    const toNetlifyFunctionUrl = (apiUrl: string) => {
      // Rewrite /api/v1/... -> /.netlify/functions/api/v1/...
      if (apiUrl.startsWith('/api/')) {
        return `/.netlify/functions/api${apiUrl.slice(4)}`;
      }
      return apiUrl;
    };

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

        if (useNetlifyFunctionsPath) {
          return nativeFetch(toNetlifyFunctionUrl(urlStr), enhancedInit);
        }

        const res = await nativeFetch(urlStr, enhancedInit);
        const contentType = (res.headers.get('content-type') || '').toLowerCase();

        // If /api/* returned HTML (e.g. custom domain on Netlify where SPA fallback caught /api/*), route to /.netlify/functions/api/*
        if (contentType.includes('text/html')) {
          useNetlifyFunctionsPath = true;
          return nativeFetch(toNetlifyFunctionUrl(urlStr), enhancedInit);
        }

        return res;
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
