import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './state';
import { TelemetryProvider } from './telemetry';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <TelemetryProvider>
        <App />
      </TelemetryProvider>
    </AppProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
