import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Add this to link your Tailwind/CSS

const rootElement = document.getElementById('root');

if (!rootElement) {
  // Helpful for Vercel logs if something goes wrong
  throw new Error("Harmonix: Root element not found. Check index.html id='root'");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
