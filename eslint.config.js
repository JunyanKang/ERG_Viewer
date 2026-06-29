// ESLint flat config for ERG Viewer
// - src/renderer/**    : browser globals (React, Plotly, XLSX exposed via window.libs)
// - src/main/**        : Node + Electron main process globals
// - src/preload/**     : Node + Electron preload context (commonjs)
// - scripts/**         : Node CLI globals
//
// Keep warnings-only on rules that would force a huge refactor (e.g. no-unused-vars
// in a 2700-line file). Tighten later as files shrink.

const globals = require('globals')

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'docs/examples/**',
      'release/**',
      'coverage/**',
      '**/*.min.js',
      'src/renderer/renderer.bundle.js',
      'src/**',
      '.omc/**',
    ],
  },

  // Common rules for all JS files
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',           // renderer + main legitimately log
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'no-throw-literal': 'warn',
      'no-prototype-builtins': 'off', // many places use hasOwnProperty.call
    },
  },

  // Electron main process
  {
    files: ['src-v2/main/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },

  // Preload (Node + Electron renderer globals)
  {
    files: ['src-v2/preload/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Renderer (browser-like, React via libs)
  {
    files: ['src-v2/renderer/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ergLibs: 'readonly',
        // React/Plotly/XLSX may be referenced as globals when libs.* not used
        React: 'readonly',
        ReactDOM: 'readonly',
        Plotly: 'readonly',
        XLSX: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Renderer core modules
  {
    files: ['src-v2/renderer/core/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
    },
  },

  // Test files
  {
    files: ['src-v2/renderer/core/__tests__/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  },

  // CLI scripts
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
