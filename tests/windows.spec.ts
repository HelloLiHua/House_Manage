import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { emptyPlan, parsePlan, type Plan, type Point } from '../src/model'
import { wallPoint } from '../src/geometry'

const sample = (): Plan => ({
  ...emptyPlan(), name: '窗户测试',
  rooms: [{ id: 'room', name: '客厅', x: 100, y: 180, width: 700, depth: 400, color: '#f0eee7' }],
  walls: [{ id: 'wall', a: { x: 100, y: 180 }, b: { x: 800, y: 180 }, thickness: 14 }],
  doors: [{ id: 'door', wallId: 'wall', offset: 500, width: 90, height: 210, flip: true }],
  items: [{ id: 'box', name: '箱子', kind: 'custom', x: 300, y: 350, width: 40, depth: 40, height: 80, rotation: 0, color: '#bbc8b3' }],
})
const withWindow = (): Plan => ({ ...sample(), windows: [{ id: 'win', wallId: 'wall', offset: 200, width: 120, height: 150, sillHeight: 90 }] })
async function load(page: Page, plan = sample()) {
  await page.addInitScript(p => {
    if (!sessionStorage.getItem('window-test-loaded')) {
      localStorage.setItem('roomly.plan.v1', JSON.stringify(p)); sessionStorage.setItem('window-test-loaded', 'true')
    }
  }, plan)
  await page.goto('/')
  await expect(page.getByTestId('wall-wall')).toBeAttached()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}
async function screen(page: Page, point: Point) {
  return page.getByTestId('floor-canvas').evaluate((el, p) => {
    const v = new DOMPoint(p.x, p.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!)
    return { x: v.x, y: v.y }
  }, point)
}
async function click(page: Page, point: Point) { const p = await screen(page, point); await page.mouse.click(p.x, p.y) }
async function drag(page: Page, from: Point, to: Point, release = true) {
  const a = await screen(page, from), b = await screen(page, to)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 })
  if (release) await page.mouse.up()
}
async function saved(page: Page): Promise<Plan> { return page.evaluate(() => JSON.parse(localStorage.getItem('roomly.plan.v1')!)) }
async function setNumber(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).fill(String(value)); await page.getByLabel(label, { exact: true }).press('Enter')
}

test('window tool creates a wall opening with editable dimensions, history, persistence and JSON/SVG export', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await load(page)
  await page.getByRole('button', { name: '添加窗户', exact: true }).click(); await click(page, { x: 300, y: 180 })
  await expect(page.getByLabel('窗户宽度', { exact: true })).toHaveValue('120')
  await expect(page.getByLabel('窗户高度', { exact: true })).toHaveValue('150')
  await expect(page.getByLabel('窗台高度', { exact: true })).toHaveValue('90')
  await setNumber(page, '窗户宽度', 160); await setNumber(page, '窗户高度', 140); await setNumber(page, '窗台高度', 95)
  await setNumber(page, '窗户距墙起点（中心）', 250)
  await expect(page.locator('.window-top-height')).toContainText('235')
  await expect(page.locator('[data-window-id]')).toHaveAttribute('transform', 'translate(270,180) rotate(0)')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByLabel('窗户距墙起点（中心）')).toHaveValue('200')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect.poll(async () => (await saved(page)).windows?.[0].offset).toBe(250)
  const edited = await saved(page)
  await page.screenshot({ path: 'work/roomly-windows.png', fullPage: true })
  await page.getByRole('button', { name: '导出方案', exact: true }).click()
  let download = page.waitForEvent('download'); await page.getByRole('button', { name: /可编辑方案/ }).click()
  expect(parsePlan(await readFile((await (await download).path())!, 'utf-8'))).toEqual(edited)
  await page.getByRole('button', { name: '导出方案', exact: true }).click()
  download = page.waitForEvent('download'); await page.getByRole('button', { name: /平面图.*SVG/ }).click()
  const svg = await readFile((await (await download).path())!, 'utf-8')
  expect(svg).toContain('window-symbol'); expect(svg).toContain('窗台高 95 cm'); expect(svg).not.toContain('data-selection-overlay')
  await page.reload(); await click(page, { x: 350, y: 180 }); await expect(page.getByLabel('窗台高度')).toHaveValue('95')
  await page.getByRole('button', { name: '删除窗户', exact: true }).click(); await expect(page.locator('[data-window-id]')).toHaveCount(0)
  await page.keyboard.press('Control+z'); await expect(page.locator('[data-window-id]')).toHaveCount(1)
  await page.getByLabel('导入方案文件').setInputFiles({ name: 'window.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(edited)) })
  await expect.poll(() => saved(page)).toEqual(edited)
  await page.getByLabel('导入方案文件').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...edited, windows: [{ ...edited.windows![0], offset: 500 }] })) })
  await expect(page.getByRole('status')).toContainText('文件格式不正确'); expect(await saved(page)).toEqual(edited)
  expect(errors).toEqual([])
})

for (const [name, a, b] of [
  ['horizontal', { x: 100, y: 180 }, { x: 800, y: 180 }],
  ['reversed vertical', { x: 300, y: 600 }, { x: 300, y: 100 }],
  ['diagonal', { x: 100, y: 100 }, { x: 700, y: 500 }],
] as const) test(`windows drag along a ${name} wall without changing dimensions`, async ({ page }) => {
  const plan: Plan = { ...emptyPlan(), walls: [{ id: 'wall', a, b, thickness: 14 }], windows: withWindow().windows }
  await load(page, plan)
  const from = wallPoint(plan.walls[0], 200), to = wallPoint(plan.walls[0], 273)
  await drag(page, from, to, false)
  const start = wallPoint(plan.walls[0], 210), angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  await expect(page.getByTestId('window-win')).toHaveAttribute('transform', `translate(${start.x},${start.y}) rotate(${angle})`)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled(); expect(await saved(page)).toEqual(plan)
  await page.mouse.up(); await expect(page.getByLabel('窗户距墙起点（中心）')).toHaveValue('270')
  await expect.poll(async () => (await saved(page)).windows?.[0].offset).toBe(270)
  await page.keyboard.press('Control+z'); await expect(page.getByLabel('窗户距墙起点（中心）')).toHaveValue('200')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('windows follow dragged walls, prevent shortening across them and are removed with their wall', async ({ page }) => {
  await load(page, withWindow())
  await drag(page, { x: 150, y: 180 }, { x: 210, y: 230 }, false)
  await expect(page.getByTestId('window-win')).toHaveAttribute('transform', 'translate(300,230) rotate(0)')
  await page.mouse.up()
  await setNumber(page, '墙体长度', 200)
  await expect(page.getByRole('status')).toContainText('门窗会超出墙体')
  await expect(page.getByLabel('墙体长度', { exact: true })).toHaveValue('700')
  await page.getByRole('button', { name: '删除墙体及其门窗', exact: true }).click()
  await expect(page.getByTestId('window-win')).toHaveCount(0); await expect(page.getByTestId('door-door')).toHaveCount(0)
  await page.keyboard.press('Control+z'); await expect(page.getByTestId('window-win')).toHaveAttribute('transform', 'translate(300,230) rotate(0)')
  await page.keyboard.press('Control+z'); await expect(page.getByTestId('window-win')).toHaveAttribute('transform', 'translate(240,180) rotate(0)')
})

test('window and door edits reject overlaps, drag stops at a door, and wall-panel creation is available', async ({ page }) => {
  await load(page, withWindow())
  await click(page, { x: 300, y: 180 }); await setNumber(page, '窗户距墙起点（中心）', 480)
  await expect(page.getByRole('status')).toContainText('不能超出墙体或与其他门窗重叠')
  await expect(page.getByLabel('窗户距墙起点（中心）')).toHaveValue('200')
  await setNumber(page, '窗户宽度', 700); await expect(page.getByLabel('窗户宽度')).toHaveValue('120')
  await drag(page, { x: 300, y: 180 }, { x: 700, y: 180 })
  await expect(page.getByLabel('窗户距墙起点（中心）')).toHaveValue('395')
  await page.keyboard.press('Control+z')
  await click(page, { x: 600, y: 180 }); await setNumber(page, '距墙起点（中心）', 220)
  await expect(page.getByRole('status')).toContainText('与其他门窗重叠'); await expect(page.getByLabel('距墙起点（中心）', { exact: true })).toHaveValue('500')
  await page.getByRole('button', { name: '添加窗户', exact: true }).click(); await click(page, { x: 300, y: 180 })
  await expect(page.locator('[data-window-id]')).toHaveCount(1); await expect(page.getByRole('status')).toContainText('窗户与现有门窗重叠')
  await page.keyboard.press('Escape'); await click(page, { x: 750, y: 180 })
  await page.getByRole('button', { name: '在墙体上添加窗户', exact: true }).click(); await click(page, { x: 720, y: 180 })
  await expect(page.locator('[data-window-id]')).toHaveCount(2)
})

test('window gestures cancel without edits and movement trials cannot edit or cross windows', async ({ page }) => {
  await load(page, withWindow())
  for (const cancel of ['Escape', 'blur', 'pointercancel']) {
    await drag(page, { x: 300, y: 180 }, { x: 360, y: 180 }, false)
    if (cancel === 'Escape') await page.keyboard.press('Escape')
    else if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else await page.getByTestId('floor-canvas').dispatchEvent('pointercancel', { pointerId: 1 })
    await page.mouse.up(); await expect(page.getByTestId('window-win')).toHaveAttribute('transform', 'translate(240,180) rotate(0)')
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  }
  await click(page, { x: 300, y: 350 }); await page.getByRole('button', { name: '开始搬运试验', exact: true }).click()
  await expect(page.getByRole('button', { name: '添加窗户', exact: true })).toBeDisabled()
  await page.keyboard.press('n'); await drag(page, { x: 300, y: 180 }, { x: 360, y: 180 })
  await expect(page.getByTestId('window-win')).toHaveAttribute('transform', 'translate(240,180) rotate(0)')
  await drag(page, { x: 300, y: 350 }, { x: 300, y: 80 })
  await expect(page.getByText('此处无法通过', { exact: true })).toBeVisible()
  expect(Number(await page.getByLabel('Y 坐标').inputValue())).toBeGreaterThan(200)
  await page.getByRole('button', { name: /结束试验/ }).click()
})

test.describe('touch windows', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('touch selects a window and cancellation restores its position', async ({ page }) => {
    await load(page, withWindow())
    const session = await page.context().newCDPSession(page)
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', p?: Point) => {
      const point = p ? await screen(page, p) : undefined
      await session.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] })
    }
    await touch('touchStart', { x: 300, y: 180 }); await touch('touchMove', { x: 370, y: 180 }); await touch('touchCancel')
    await expect(page.getByTestId('window-win')).toHaveAttribute('transform', 'translate(240,180) rotate(0)')
    await touch('touchStart', { x: 300, y: 180 }); await touch('touchMove', { x: 370, y: 180 }); await touch('touchEnd')
    await expect.poll(async () => (await saved(page)).windows?.[0].offset).toBe(270)
    await page.screenshot({ path: 'work/roomly-windows-mobile.png', fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await session.detach()
  })
})
