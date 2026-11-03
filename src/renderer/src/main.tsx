import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './theme/theme';
import './styles.css';
// Set the theme before the first render so there is no flash of the wrong colours.
initTheme();
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
