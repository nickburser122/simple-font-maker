import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { mount } from 'svelte';
import App from './app/App.svelte';
import { initTheme } from './store/theme.svelte';

initTheme();

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js');
  });
}
