import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // api-contract ต้อง DB จริง — ใช้ project แยก (รันด้วย --project=integration)
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/api-contract.test.ts'],
    coverage: {
      provider: 'v8',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/api-contract.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/api-contract.test.ts'],
        },
      },
    ],
  },
})
