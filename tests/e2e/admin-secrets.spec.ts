import { test, expect } from './fixtures'

test('ADMIN-SECRETS: each round has an independent shared word control', async ({ adminPage }) => {
  await adminPage.getByTestId('admin-tab-secrets').click()
  await expect(adminPage.getByTestId('admin-secrets-panel')).toBeVisible()
  for (const round of [1, 2, 3]) {
    await expect(adminPage.getByTestId(`round-word-input-${round}`)).toBeVisible()
    await expect(adminPage.getByTestId(`round-word-save-${round}`)).toBeVisible()
  }
  await adminPage.getByTestId('round-word-input-1').fill('Unsaved Round One')
  await adminPage.getByTestId('round-word-input-2').fill('Unsaved Round Two')
  await expect(adminPage.getByTestId('round-word-input-1')).toHaveValue('Unsaved Round One')
  await expect(adminPage.getByTestId('round-word-input-3')).toHaveValue('')
  adminPage.once('dialog', (dialog) => dialog.dismiss())
  await adminPage.getByTestId('round-word-save-1').click()
  await expect(adminPage.getByTestId('round-word-input-1')).toHaveValue('Unsaved Round One')
})
