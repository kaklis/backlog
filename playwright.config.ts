import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // uses the Edge/Chrome already installed instead of downloading a browser; set PW_CHANNEL= to use Playwright's own
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1200, height: 800 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
