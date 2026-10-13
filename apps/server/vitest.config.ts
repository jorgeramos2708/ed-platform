import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc emite decorator metadata (esbuild no puede) — imprescindible para el DI de NestJS en tests
// fileParallelism false: los tests comparten la BD de desarrollo; en paralelo se truncan entre sí
// testTimeout 20s: los tests de cola con re-entrega (crash+resume) tardan segundos reales
export default defineConfig({
  test: { environment: 'node', fileParallelism: false, testTimeout: 20000 },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
