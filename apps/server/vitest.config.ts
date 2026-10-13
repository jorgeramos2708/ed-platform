import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc emite decorator metadata (esbuild no puede) — imprescindible para el DI de NestJS en tests
// fileParallelism false: los tests comparten la BD de desarrollo; en paralelo se truncan entre sí
export default defineConfig({
  test: { environment: 'node', fileParallelism: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
