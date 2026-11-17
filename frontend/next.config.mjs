import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Salida autocontenida para la imagen Docker (server.js en .next/standalone/frontend/).
  output: 'standalone',
  outputFileTracingRoot: join(here, '..'),
};
