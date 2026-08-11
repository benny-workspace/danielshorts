import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * The dashboard is code-split and only ever requested at /admin, so the
 * charts, the tables and the admin client never land in the bundle that
 * ordinary visitors download.
 */
const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));

const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={<div className="min-h-screen bg-ink-950" />}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
