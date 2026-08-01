import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

/**
 * jest-dom's own vitest entry point cannot be resolved under this project's
 * isolated pnpm store, so matchers are registered manually in setup.ts. These
 * declarations restore the type information for them.
 */
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends TestingLibraryMatchers<T, void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
