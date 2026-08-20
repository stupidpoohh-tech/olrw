import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/fonts.css';
import './design/tokens.css';
import './design/global.css';
import './design/motion.css';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root 를 찾지 못했습니다.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
