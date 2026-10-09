import { test, expect } from './fixtures'

test('ADMIN-SECRETS: shared word controls are available', async ({ adminPage }) => {
  await adminPage.getByTestId('admin-tab-secrets').click()
  await expect(adminPage.getByTestId('admin-secrets-panel')).toBeVisible()
  await expect(adminPage.getByTestId('bulk-secret-input')).toBeVisible()
  await expect(adminPage.getByTestId('bulk-secret-save')).toBeVisible()
})
