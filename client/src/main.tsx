import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LeadVaktPublic } from './components/LeadVaktPublic';
import './styles.css';
import './company.css';
import './lead-vakt.css';
import './lead-vakt-public.css';

const publicLeadVaktPath = window.location.pathname.replace(/\/+$/, '') === '/leadvakt';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publicLeadVaktPath ? <LeadVaktPublic /> : <App />}
  </React.StrictMode>
);
