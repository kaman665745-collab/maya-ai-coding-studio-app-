export default {
  testDir: './tests/e2e',
  timeout: 45_000,
  use: {
    baseURL: process.env.ACS_BASE_URL || 'http://localhost:3000',
    headless: true,
  },
};
