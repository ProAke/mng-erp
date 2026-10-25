/* eslint-env node */
/* MNG ERP — ESLint config
   โครงการนี้มี 2 สไตล์ที่ปะปนกัน:
     1) server/  — CommonJS (โค้ด Express เดิม, มี semicolon)
     2) web/ + tests/ — ESM + TypeScript (Next.js, ไม่มี semicolon)
   จึงแยก override ตามภาษาของแต่ละส่วน ไม่บังคับให้เป็นแบบเดียว */

module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/**',
    'server/node_modules/**',
    'web/node_modules/**',
    'web/.next/**',
    'web/out/**',
    'server/public/**',
    'assets/**',
    'team-viewer/**',
    'docs/**',
    'scripts/**'
  ],
  overrides: [
    {
      files: ['server/**/*.js', 'server/**/*.cjs'],
      env: { node: true, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
      rules: {
        semi: 'off',
        curly: 'off',
        'no-console': 'off',
        eqeqeq: 'off',
        camelcase: 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
      }
    },
    {
      files: ['web/**/*.ts', 'web/**/*.tsx', 'tests/**/*.ts'],
      env: { es2022: true, browser: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: {
        semi: 'off',
        quotes: 'off',
        indent: 'off',
        'no-console': 'off',
        eqeqeq: 'off',
        camelcase: 'off',
        'no-unused-vars': 'off'
      }
    }
  ]
};
