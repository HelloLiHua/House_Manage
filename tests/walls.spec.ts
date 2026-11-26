import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { emptyPlan, parsePlan, type Plan, type Point } from '../src/model'

const wallPlan = (): Plan => ({
  ...emptyPlan(), name: '墙体拖动测试',
  rooms: [{ id: 'room', name: '房间', x: 100, y: 180, width: 600, depth: 300, color: '#f0eee7' }],
  walls: [{ id: 'wall', a: { x: 100, y: 180 }, b: { x: 700, y: 180 }, thickness: 12 }, { id: 'other', a: { x: 100, y: 480 }, b: { x: 700, y: 480 }, thickness: 12 }],
  doors: [{ id: 'swing', wallId: 'wall', offset: 200, width: 80, height: 210, flip: true, hingeSide: 'end' }, { id: 'slide', wallId: 'wall', offset: 450, width: 120, height: 210, flip: false, type: 'sliding', slidingStyle: 'single', slideDirection: 'end', opening: 50 }],
  items: [{ id: 'box', name: '箱子', kind: 'custom', x: 200, y: 350, width: 40, depth: 40, height: 60, rotation: 0, color: '#aabbcc' }],
})
async function load(page: Page, plan = wallPlan()) {
  await page.addInitScript(p => {
    if (!sessionStorage.getItem('wall-test-loaded')) {
      localStorage.setItem('roomly.plan.v1', JSON.stringify(p)); sessionStorage.setItem('wall-test-loaded', 'true')
    }
  }, plan)
  await page.goto('/')
  await expect(page.getByTestId('wall-wall')).toBeAttached()
  await expect(page.getByTestId('floor-canvas')).toBeVisible()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}
async function screen(page: Page, point: Point) {
  return page.getByTestId('floor-canvas').evaluate((el, p) => {
    const v = new DOMPoint(p.x, p.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!)
    return { x: v.x, y: v.y }
  }, point)
}
async function dragWall(page: Page, from: Point, to: Point, release = true) {
  const a = await screen(page, from), b = await screen(page, to)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 })
  if (release) await page.mouse.up()
}
async function saved(page: Page): Promise<Plan> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('roomly.plan.v1')!))
}

test('dragging a wall previews attached doors, commits once, and persists through history and export', async ({ page }) => {
  const initial = wallPlan()
  await load(page, initial)
  const wall = page.getByTestId('wall-wall').locator('line').first()
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  const view = await page.getByTestId('floor-canvas').getAttribute('viewBox')
  const at = await screen(page, { x: 200, y: 180 })
  await page.mouse.click(at.x, at.y)
  await expect(page.getByLabel('墙体长度', { exact: true })).toHaveValue('600')
  await expect(undo).toBeDisabled()
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 1, at.y + 1); await page.mouse.up()
  await expect(undo).toBeDisabled()
  await dragWall(page, { x: 200, y: 180 }, { x: 273, y: 224 }, false)
  await expect(wall).toHaveAttribute('x1', '170'); await expect(wall).toHaveAttribute('y1', '220')
  await expect(page.getByTestId('door-swing')).toHaveAttribute('transform', 'translate(330,220) rotate(0)')
  await expect(page.getByTestId('door-slide')).toHaveAttribute('transform', 'translate(560,220) rotate(0)')
  expect((await saved(page)).walls).toEqual(initial.walls)
  await expect(undo).toBeDisabled()
  await page.mouse.up()
  await expect(page.getByLabel('起点 X', { exact: true })).toHaveValue('170')
  await expect(page.getByLabel('墙体长度', { exact: true })).toHaveValue('600')
  await expect(page.getByTestId('floor-canvas')).toHaveAttribute('viewBox', view!)
  await undo.click()
  await expect(wall).toHaveAttribute('x1', '100'); await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect.poll(async () => (await saved(page)).walls[0].a).toEqual({ x: 170, y: 220 })
  const moved = await saved(page)
  expect(moved.walls[1]).toEqual(initial.walls[1]); expect(moved.doors).toEqual(initial.doors)
  expect(moved.rooms).toEqual(initial.rooms); expect(moved.items).toEqual(initial.items)
  await page.screenshot({ path: 'work/roomly-wall-drag.png', fullPage: true })
  await page.reload()
  await expect(wall).toHaveAttribute('x1', '170')
  await expect(page.getByTestId('door-swing')).toHaveAttribute('transform', 'translate(330,220) rotate(0)')
  await page.getByRole('button', { name: '导出方案', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '可编辑方案', exact: false }).click()
  const json = parsePlan(await readFile((await (await download).path())!, 'utf-8'))
  expect(json).toEqual(moved)
})

test('wall drag cancellation and pan tools preserve the plan and its undo history', async ({ page }) => {
  await load(page)
  const wall = page.getByTestId('wall-wall').locator('line').first()
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  await dragWall(page, { x: 200, y: 180 }, { x: 240, y: 230 }, false)
  await expect(wall).toHaveAttribute('x1', '140')
  await page.keyboard.press('Escape'); await page.mouse.up()
  await expect(wall).toHaveAttribute('x1', '100'); await expect(undo).toBeDisabled()
  await expect(page.getByLabel('墙体长度', { exact: true })).toBeVisible()
  await dragWall(page, { x: 200, y: 180 }, { x: 240, y: 230 }, false)
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up()
  await expect(wall).toHaveAttribute('x1', '100'); await expect(undo).toBeDisabled()
  const beforePan = await page.getByTestId('floor-canvas').getAttribute('viewBox')
  await page.keyboard.down('Alt')
  await dragWall(page, { x: 200, y: 180 }, { x: 240, y: 230 })
  await page.keyboard.up('Alt')
  await expect(page.getByTestId('floor-canvas')).not.toHaveAttribute('viewBox', beforePan!)
  await expect(wall).toHaveAttribute('x1', '100'); await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: '平移画布', exact: true }).click()
  await dragWall(page, { x: 200, y: 180 }, { x: 230, y: 200 })
  await expect(wall).toHaveAttribute('x1', '100'); await expect(undo).toBeDisabled()
  expect(await saved(page)).toEqual(wallPlan())
})

for (const b of [{ x: 100.25, y: 680.5 }, { x: 600.75, y: 580.5 }]) test(`wall dragging preserves non-grid endpoints at ${b.x},${b.y}`, async ({ page }) => {
  const a = { x: 100.25, y: 180.5 }
  await load(page, { ...emptyPlan(), walls: [{ id: 'wall', a, b, thickness: 14 }] })
  await page.getByRole('switch', { name: '网格吸附', exact: true }).setChecked(false)
  const from = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  await dragWall(page, from, { x: from.x + 23, y: from.y + 17 })
  const wall = page.getByTestId('wall-wall').locator('line').first()
  await expect(wall).toHaveAttribute('x1', '123.25'); await expect(wall).toHaveAttribute('y1', '197.5')
  await expect(wall).toHaveAttribute('x2', String(b.x + 23)); await expect(wall).toHaveAttribute('y2', String(b.y + 17))
})

test('wall dragging is disabled during movement trials', async ({ page }) => {
  await load(page)
  await page.getByRole('button', { name: '开始搬运试验', exact: true }).click()
  await dragWall(page, { x: 200, y: 180 }, { x: 260, y: 240 })
  await expect(page.getByTestId('wall-wall').locator('line').first()).toHaveAttribute('x1', '100')
  await expect(page.getByLabel('墙体长度', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '结束试验', exact: false }).click()
  await dragWall(page, { x: 200, y: 180 }, { x: 260, y: 240 })
  await expect(page.getByTestId('wall-wall').locator('line').first()).toHaveAttribute('x1', '160')
})

test.describe('touch wall dragging', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('a touch can move a wall or cancel without saving a partial movement', async ({ page }) => {
    await load(page)
    const session = await page.context().newCDPSession(page)
    const wall = page.getByTestId('wall-wall').locator('line').first()
    const a = await screen(page, { x: 200, y: 180 }), b = await screen(page, { x: 240, y: 230 })
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', point?: Point) => {
      await session.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] })
    }
    await touch('touchStart', a); await touch('touchMove', b)
    await expect(wall).toHaveAttribute('x1', '140')
    await touch('touchCancel')
    await expect(wall).toHaveAttribute('x1', '100')
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
    await touch('touchStart', a); await touch('touchMove', b); await touch('touchEnd')
    await expect.poll(async () => (await saved(page)).walls[0].a).toEqual({ x: 140, y: 230 })
    await page.screenshot({ path: 'work/roomly-wall-drag-mobile.png', fullPage: true })
    await session.detach()
  })
})
