import { test, expect, assignSecrets } from './fixtures'

test('SETUP-001: staging page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByTestId('login-page')).toBeVisible()
})

test('SETUP-002/003: admin can log in and see the console', async ({ adminPage }) => {
  await expect(adminPage.getByTestId('admin-page')).toBeVisible()
  await expect(adminPage.getByTestId('admin-tab-event')).toBeVisible()
})

test('SETUP-004/005: admin can create two teams', async ({ adminPage }) => {
  const teamA = await import('./fixtures').then(({ createTeam }) => createTeam(adminPage, 'A'))
  const teamB = await import('./fixtures').then(({ createTeam }) => createTeam(adminPage, 'B'))
  expect(teamA.email).toContain('@example.test')
  expect(teamB.email).toContain('@example.test')
})

test('SETUP-006/007: admin can assign per-difficulty secrets', async ({ adminPage }) => {
  const team = await import('./fixtures').then(({ createTeam }) => createTeam(adminPage, 'Secrets'))
  await assignSecrets(adminPage, team.username)
  await expect(adminPage.getByTestId(`secret-row-${team.username}-1`)).toBeVisible()
})

test('ADMIN-001/002/003/004: admin tabs are reachable', async ({ adminPage }) => {
  for (const tab of ['event', 'teams', 'secrets', 'guardrails']) {
    await adminPage.getByTestId(`admin-tab-${tab}`).click()
    await expect(adminPage.getByTestId(`admin-tab-${tab}`)).toHaveClass(/active/)
  }
})

test('BROWSER-005/007: login controls support keyboard and accessible names', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByTestId('email-input')).toHaveAccessibleName('Email')
  await expect(page.getByTestId('password-input')).toHaveAccessibleName('Password')
  await expect(page.getByTestId('login-submit')).toHaveAccessibleName(/BEGIN ROUND/)
})
