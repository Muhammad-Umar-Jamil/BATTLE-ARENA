import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, done) => {
    const email = process.env.E2E_ADMIN_EMAIL
    const password = process.env.E2E_ADMIN_PASSWORD
    if (!process.env.E2E_BASE_URL || !email || !password) {
      throw new Error('Set E2E_BASE_URL, E2E_ADMIN_EMAIL, and E2E_ADMIN_PASSWORD before running browser tests.')
    }
    await page.goto('/login')
    await page.getByTestId('email-input').fill(email)
    await page.getByTestId('password-input').fill(password)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('admin-page')).toBeVisible()
    await done(page)
  },
})

export { expect }

export async function createTeam(page: Page, suffix: string) {
  const email = `e2e-${suffix}-${Date.now()}@example.test`
  const password = `E2ePass-${Date.now()}!`
  await page.getByTestId('admin-tab-teams').click()
  await page.getByTestId('team-email').fill(email)
  await page.getByTestId('team-password').fill(password)
  await page.getByTestId('team-name-input').fill(`E2E-${suffix}`)
  await page.getByTestId('create-team').click()
  await expect(page.getByText(`Team E2E-${suffix} created.`)).toBeVisible()
  return { email, password, username: `E2E-${suffix}` }
}

export async function assignSecrets(page: Page, username: string) {
  const secrets = [process.env.E2E_TEAM_SECRET_EASY, process.env.E2E_TEAM_SECRET_MEDIUM, process.env.E2E_TEAM_SECRET_HARD]
  if (secrets.some((secret) => !secret)) throw new Error('Set all E2E_TEAM_SECRET_* variables before assigning secrets.')
  await page.getByTestId('admin-tab-secrets').click()
  for (const [index, secret] of secrets.entries()) {
    const input = page.getByTestId(`secret-input-${username}-${index + 1}`)
    await input.fill(secret as string)
    await page.getByTestId(`secret-save-${username}-${index + 1}`).click()
  }
}

export async function startEvent(page: Page) {
  await page.getByTestId('admin-tab-event').click()
  await page.getByTestId('event-duration').fill('10')
  await page.getByTestId('start-event').click()
  await expect(page.getByText('running', { exact: true })).toBeVisible()
}

export async function stopEvent(page: Page) {
  await page.getByTestId('admin-tab-event').click()
  await page.getByTestId('stop-event').click()
  await expect(page.getByText('finished', { exact: true })).toBeVisible()
}

export async function loginTeam(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByTestId('email-input').fill(credentials.email)
  await page.getByTestId('password-input').fill(credentials.password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('arena-page')).toBeVisible()
}

export async function logoutTeam(page: Page) {
  await page.getByTestId('logout-button').click()
  await expect(page.getByTestId('login-page')).toBeVisible()
}
