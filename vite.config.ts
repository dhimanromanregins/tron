import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    nodePolyfills({ protocolImports: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  define: {
    'process.env': {},
  },
})
