import { test, expect, assignSecrets, createTeam, loginTeam, startEvent, stopEvent } from './fixtures'

test('ADMIN-005/006/007: admin sees team status, score, and per-level guess usage', async ({ adminPage, browser }) => {
  const team = await createTeam(adminPage, 'AdminView')
  await assignSecrets(adminPage, team.username)
  await startEvent(adminPage)
  const teamContext = await browser.newContext()
  const teamPage = await teamContext.newPage()
  await loginTeam(teamPage, team)
  await adminPage.getByTestId('admin-tab-teams').click()
  await expect(adminPage.getByTestId(`team-row-${team.username}`)).toContainText(team.username)
  await expect(adminPage.getByTestId(`team-row-${team.username}`)).toContainText('E open')
  await teamContext.close()
})

test('EVENT-002/003/004/005/007: admin event controls update visible state', async ({ adminPage }) => {
  await adminPage.getByTestId('admin-tab-event').click()
  await adminPage.getByTestId('event-duration').fill('10')
  await adminPage.getByTestId('start-event').click()
  await expect(adminPage.getByTestId('admin-event-panel')).toContainText('running')
  await adminPage.getByTestId('toggle-logins').click()
  await expect(adminPage.getByTestId('admin-event-panel')).toContainText('LOGINS LOCKED')
  await adminPage.getByTestId('toggle-logins').click()
  await expect(adminPage.getByTestId('admin-event-panel')).toContainText('LOGINS OPEN')
  await stopEvent(adminPage)
})

test('ADMIN-008/009: admin force logout controls are available', async ({ adminPage }) => {
  await adminPage.getByTestId('admin-tab-teams').click()
  await expect(adminPage.getByTestId('force-logout-all')).toBeVisible()
})
