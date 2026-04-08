import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css';

// Inject chrome API stubs in dev mode so the popup works in a normal browser
if (import.meta.env.DEV) {
  await import('./chrome-mock.js');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
