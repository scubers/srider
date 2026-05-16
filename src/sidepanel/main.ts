import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app root not found');
}

mount(App, { target });
