import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyBrandTheme } from '../config/branding';
import { App } from './App';
import './styles.css';

applyBrandTheme();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
