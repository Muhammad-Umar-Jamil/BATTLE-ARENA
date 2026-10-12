import { chromium } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL
const path = process.env.E2E_ADMIN_STORAGE_STATE
if (!baseURL || !path || !path.endsWith('.local')) throw new Error('Set the deployed URL and an ignored .local session path.')
const browser = await chromium.launch({ headless: false, channel: 'chrome' })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${baseURL}/login`)
  console.log('Please sign in as admin in the test browser. No password will be saved.')
  await page.getByTestId('admin-page').waitFor({ state: 'visible', timeout: 900_000 })
  await context.storageState({ path })
  console.log('Admin session ready for live tests. Delete the .local session file after testing.')
} finally { await browser.close() }
