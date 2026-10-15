import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Sin esto, los renders de RTL se ACUMULAN entre tests (no hay auto-cleanup sin globals de vitest)
afterEach(() => cleanup());
