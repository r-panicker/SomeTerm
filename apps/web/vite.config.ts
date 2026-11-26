import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative asset paths support both static hosting and the desktop asset protocol.
export default defineConfig({ base: './', plugins: [svelte()], worker: { format: 'es' } });
