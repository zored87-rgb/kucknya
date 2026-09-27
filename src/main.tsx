import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { init } from './api/store';
import { App } from './App';
import './styles.css';

// Новая версия приложения ставится сама при следующем открытии.
registerSW({ immediate: true });
void init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
