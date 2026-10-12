import { test, expect, createTeam } from './fixtures'
import { execFileSync } from 'node:child_process'

function query(sql: string) {
  const output = execFileSync('supabase', ['db', 'query', '--linked', sql], { encoding: 'utf8' })
  return JSON.parse(output).rows as Record<string, unknown>[]
}

test('ADMIN-GUESSES: result dashboard and round filter work on desktop and phone', async ({ adminPage }) => {
  await adminPage.getByTestId('admin-tab-guesses').click()
  await expect(adminPage.getByTestId('admin-guesses-panel')).toBeVisible()
  await expect(adminPage.getByText('Team results', { exact: true })).toBeVisible()
  await adminPage.getByTestId('guess-round-filter').selectOption('2')
  await expect(adminPage.locator('.admin-guess-row > strong').first()).toContainText('Round 2')
  await expect(adminPage.locator('.admin-guess-row > strong').filter({ hasText: 'Round 1' })).toHaveCount(0)
  await adminPage.getByTestId('refresh-guesses').click()
  await adminPage.setViewportSize({ width: 390, height: 844 })
  await expect(adminPage.getByTestId('guess-round-filter')).toBeVisible()
  const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('ADMIN-DELETE: cancel preserves a disposable team; confirmation removes its account', async ({ adminPage, browser }) => {
  test.setTimeout(120_000)
  const team = await createTeam(adminPage, `DELETE-${Date.now()}`)
  // Seed only this newly created disposable account in the real linked database.
  expect(team.username).toMatch(/^E2E-DELETE-\d+$/)
  const id = query(`select id from public.profiles where username = '${team.username}'`)[0].id as string
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
  query(`begin;
    insert into public.chat_messages(user_id,level_id,role,content,deleted_at)
      values ('${id}',1,'user','Disposable active chat',null), ('${id}',1,'assistant','Disposable archived chat',now());
    insert into public.team_secrets(user_id,level_id,target_secret) values ('${id}',1,'E2E-Original');
    select * from public.record_submission_for_user('${id}',1,'E2E-Guess',50,50,'E2E-Original');
    update public.team_secrets set target_secret = 'E2E-Changed' where user_id = '${id}' and level_id = 1;
    commit;`)
  await adminPage.getByTestId('admin-tab-guesses').click()
  await adminPage.getByTestId('refresh-guesses').click()
  const guessRow = adminPage.getByTestId(`guess-row-${team.username}-1`)
  await expect(guessRow).toContainText('E2E-Guess')
  await expect(guessRow).toContainText('E2E-Original')
  await expect(guessRow).not.toContainText('E2E-Changed')
  await expect(guessRow.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/)
  await adminPage.getByTestId('admin-tab-history').click()
  await expect(adminPage.getByTestId(`cleared-team-${team.username}`)).toBeVisible()
  await adminPage.getByTestId('admin-tab-teams').click()
  const row = adminPage.getByTestId(`team-row-${team.username}`)
  adminPage.once('dialog', (dialog) => dialog.dismiss())
  await adminPage.getByTestId(`delete-team-${team.username}`).click()
  await expect(row).toBeVisible()
  adminPage.once('dialog', (dialog) => dialog.accept())
  await adminPage.getByTestId(`delete-team-${team.username}`).click()
  await expect(row).toHaveCount(0)
  expect(query(`select
    (select count(*) from auth.users where id='${id}') as accounts,
    (select count(*) from public.profiles where id='${id}') as profiles,
    (select count(*) from public.chat_messages where user_id='${id}') as chats,
    (select count(*) from public.team_secrets where user_id='${id}') as secrets,
    (select count(*) from public.submissions where user_id='${id}') as guesses`)[0])
    .toEqual({ accounts: 0, profiles: 0, chats: 0, secrets: 0, guesses: 0 })
  await adminPage.getByTestId('admin-tab-history').click()
  await expect(adminPage.getByTestId(`cleared-team-${team.username}`)).toHaveCount(0)
  await adminPage.getByTestId('admin-tab-guesses').click()
  await expect(adminPage.getByTestId(`guess-team-${team.username}`)).toHaveCount(0)
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto('/login')
    await page.getByTestId('email-input').fill(team.email)
    await page.getByTestId('password-input').fill(team.password)
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('alert')).toContainText('Invalid email or password')
  } finally { await context.close() }
})
