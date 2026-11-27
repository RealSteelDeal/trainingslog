import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		serviceWorkers: 'block',
		...devices['Pixel 7'],
		// Lokal ohne heruntergeladenen Browser: PW_CHROMIUM_PATH=/usr/bin/google-chrome
		launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
	},
	webServer: {
		command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI
	}
});
