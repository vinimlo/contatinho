import '@fontsource-variable/schibsted-grotesk';
import '@fontsource-variable/big-shoulders-text';
import 'open-props/style';
import './global.scss';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
