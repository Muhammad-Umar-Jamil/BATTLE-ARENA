import { test, expect } from './fixtures'

test('ADMIN-HISTORY: cleared chats use nested team and level accordions', async ({ adminPage }) => {
  await adminPage.getByTestId('admin-tab-history').click()
  await expect(adminPage.getByTestId('admin-history-panel')).toBeVisible()

  const teams = adminPage.locator('[data-testid^="cleared-team-"]')
  const teamCount = await teams.count()
  if (teamCount === 0) {
    await expect(adminPage.getByText('No cleared chat history.')).toBeVisible()
    return
  }

  const firstTeam = teams.first()
  const teamToggle = firstTeam.getByRole('button').first()
  await expect(teamToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(firstTeam.locator('.chat-archive-level')).toHaveCount(0)
  await teamToggle.click()
  await expect(teamToggle).toHaveAttribute('aria-expanded', 'true')

  const firstLevel = firstTeam.locator('.chat-archive-level').first()
  const levelToggle = firstLevel.getByRole('button').first()
  await expect(levelToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(firstLevel.locator('.chat-archive-row')).toHaveCount(0)
  await levelToggle.click()
  await expect(levelToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(firstLevel.locator('.chat-archive-row').first()).toBeVisible()
  await levelToggle.click()
  await expect(levelToggle).toHaveAttribute('aria-expanded', 'false')

  await adminPage.getByTestId('refresh-cleared-history').click()
  await expect(adminPage.getByTestId('admin-history-panel')).toBeVisible()
  await expect(adminPage.locator('[data-testid^="cleared-team-"]').first().getByRole('button').first()).toHaveAttribute('aria-expanded', 'false')
})
