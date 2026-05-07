import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { registerServiceWorker } from './lib/pwa/registerSW';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Phase B — Service worker for offline shell + camera-capture install flow.
// No-op outside production builds (vite-plugin-pwa only emits the SW asset
// when `vite build` runs); the registration call is safe to ship in dev too
// because the virtual module ships a no-op fallback there.
registerServiceWorker();
