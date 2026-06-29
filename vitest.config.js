// Vitest config for ERG Viewer
// - Pure lib/ modules run under node (default)
// - Tests live next to source: src/renderer/lib/__tests__/*.test.js
// - Coverage targets the lib/ tree (where correctness matters most)
// - globals: true so tests can use describe/it/expect without importing vitest
//   (matches the existing CommonJS source style of renderer.js).

const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src-v2/renderer/core/__tests__/**/*.test.js',
      'src-v2/**/*.test.js',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'docs/examples/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src-v2/renderer/core/**/*.js'],
      exclude: ['src-v2/renderer/core/__tests__/**'],
      thresholds: {
        // Soft target — start achievable, tighten over time
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
})
