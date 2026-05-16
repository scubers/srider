import { mount } from 'svelte';
import Options from './Options.svelte';
import '../sidepanel/styles.css';
import './options.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app root not found');
}

mount(Options, { target });
