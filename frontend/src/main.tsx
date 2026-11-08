import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router';
import { App } from './App';
import { USE_HASH_ROUTER, initialPath } from './host';
import './styles.css';

// Inside Dynamics 365 the app is one HTML web resource, so screens live after "#": index.html#/conversations/p1-ru-001
const Router = USE_HASH_ROUTER ? HashRouter : BrowserRouter;
const start = initialPath();
if (USE_HASH_ROUTER && start && (!window.location.hash || window.location.hash === '#/')) window.location.hash = start;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
