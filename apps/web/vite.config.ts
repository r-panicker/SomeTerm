import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative asset paths so the Electron app can load the build from file://.
export default defineConfig({ base: './', plugins: [svelte()] });
