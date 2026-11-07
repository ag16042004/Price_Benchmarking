import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// The app calls fetch('/api/...') and relies on the dev proxy; in tests we point it at the real API.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => realFetch(typeof url === 'string' && url.startsWith('/') ? `http://127.0.0.1:4031${url}` : url, opts);

afterEach(() => { cleanup(); localStorage.clear(); });
