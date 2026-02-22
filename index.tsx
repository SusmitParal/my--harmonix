import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // <--- CRITICAL: Ensure this matches your CSS file name

const rootElement = document.getElementById('root');

if (!rootElement) {
  // On Vercel, this error shows up in the browser console (F12)
  throw new Error("Harmonix Error: HTML Root element not found.");
}

const root = ReactDOM.createRoot(rootElement);

// Use a try-catch pattern to prevent total silent failure
try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Harmonix Render Crash:", error);
}
