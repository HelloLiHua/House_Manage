import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { emptyPlan, parsePlan, type Plan, type Point } from '../src/model'

const sample = (): Plan => ({
  ...emptyPlan(), name: '多选测试',
  rooms: [{ id: 'room', name: '客厅', x: 100, y: 100, width: 700, depth: 500, color: '#f0eee7' }],
  walls: [{ id: 'wall', a: { x: 100, y: 100 }, b: { x: 800, y: 100 }, thickness: 12 }],
  doors: [{ id: 'door', wallId: 'wall', offset: 500, width: 90, height: 210, flip: true }],
  items: [
    { id: 'a', name: '沙发', kind: 'sofa', x: 250.25, y: 260.5, width: 100, depth: 60, height: 80, rotation: 0, color: '#bbc8b3' },
    { id: 'b', name: '茶几', kind: 'table', x: 450.75, y: 280.5, width: 90, depth: 50, height: 60, rotation: 35, color: '#d5bc98' },
    { id: 'c', name: '边柜', kind: 'cabinet', x: 650, y: 460, width: 60, depth: 50, height: 120, rotation: 0, color: '#c7bfb3' },
  ],
})
async function load(page: Page) {
  await page.addInitScript(plan => {
    if (!sessionStorage.getItem('selection-loaded')) {
      localStorage.setItem('roomly.plan.v1', JSON.stringify(plan)); sessionStorage.setItem('selection-loaded', 'true')
    }
  }, sample())
  await page.goto('/')
  await expect(page.getByTestId('item-a')).toBeVisible()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}
async function screen(page: Page, point: Point) {
  return page.getByTestId('floor-canvas').evaluate((el, p) => {
    const v = new DOMPoint(p.x, p.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!)
    return { x: v.x, y: v.y }
  }, point)
}
async function drag(page: Page, from: Point, to: Point, release = true) {
  const a = await screen(page, from), b = await screen(page, to)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 7 })
  if (release) await page.mouse.up()
}
async function click(page: Page, point: Point) {
  const p = await screen(page, point); await page.mouse.click(p.x, p.y)
}
async function saved(page: Page): Promise<Plan> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('roomly.plan.v1')!))
}
async function selected(page: Page, ids: string[]) {
  await expect.poll(() => page.locator('[data-item-name][data-selected="true"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')!.replace('item-', '')).sort())).toEqual([...ids].sort())
}
const first = { x: 190, y: 200 }, last = { x: 520, y: 350 }

test('room-floor rectangle selection works in both directions, previews, and does not edit the plan', async ({ page }) => {
  await load(page)
  await click(page, { x: 180, y: 180 })
  await expect(page.getByLabel('房间名称')).toHaveValue('客厅')
  await drag(page, first, last, false)
  await expect(page.getByTestId('selection-box')).toBeVisible(); await selected(page, ['a', 'b'])
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await page.mouse.up()
  await expect(page.getByTestId('selection-box')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '已选中 2 件物品' })).toBeVisible()
  await page.screenshot({ path: 'work/roomly-multiselect.png', fullPage: true })
  await drag(page, last, first); await selected(page, ['a', 'b'])
  await drag(page, { x: 40, y: 170 }, last); await selected(page, ['a', 'b'])
  await drag(page, { x: 550, y: 370 }, { x: 580, y: 400 }); await selected(page, [])
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  expect(await saved(page)).toEqual(sample())
})

test('Shift click and Shift rectangle add and remove items, including the placed list', async ({ page }) => {
  await load(page)
  await page.keyboard.down('Shift'); await click(page, sample().items[1]); await page.keyboard.up('Shift')
  await selected(page, ['a', 'b'])
  await page.keyboard.down('Shift'); await click(page, sample().items[0]); await page.keyboard.up('Shift')
  await selected(page, ['b']); await expect(page.getByLabel('物件名称', { exact: true })).toHaveValue('茶几')
  await page.keyboard.down('Shift'); await drag(page, { x: 600, y: 410 }, { x: 700, y: 510 }); await page.keyboard.up('Shift')
  await selected(page, ['b', 'c'])
  await page.getByRole('button', { name: /已放置/ }).click()
  await page.locator('.objects-list').getByRole('button', { name: /沙发/ }).click({ modifiers: ['Shift'] })
  await selected(page, ['a', 'b', 'c'])
  await page.locator('.objects-list').getByRole('button', { name: /茶几/ }).click({ modifiers: ['Shift'] })
  await selected(page, ['a', 'c'])
  await page.locator('.objects-list').getByRole('button', { name: /边柜/ }).click()
  await selected(page, ['c'])
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  expect(await saved(page)).toEqual(sample())
})

test('moving a group preserves spacing and rotations, commits once and survives history, export and reload', async ({ page }) => {
  await load(page); await drag(page, first, last)
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  const view = await page.getByTestId('floor-canvas').getAttribute('viewBox')
  await click(page, sample().items[0]); await expect(undo).toBeDisabled(); await selected(page, ['a', 'b'])
  await drag(page, sample().items[0], { x: 323.25, y: 304.5 }, false)
  await expect(page.getByTestId('item-a')).toHaveAttribute('transform', 'translate(320.25,300.5) rotate(0)')
  await expect(page.getByTestId('item-b')).toHaveAttribute('transform', 'translate(520.75,320.5) rotate(35)')
  expect(await saved(page)).toEqual(sample()); await expect(undo).toBeDisabled()
  await page.mouse.up()
  await expect(page.getByTestId('floor-canvas')).toHaveAttribute('viewBox', view!)
  await expect.poll(async () => (await saved(page)).items[0].x).toBe(320.25)
  const moved = await saved(page)
  expect(moved.walls).toEqual(sample().walls); expect(moved.doors).toEqual(sample().doors); expect(moved.rooms).toEqual(sample().rooms); expect(moved.items[2]).toEqual(sample().items[2])
  await undo.click(); await expect(page.getByTestId('item-a')).toHaveAttribute('transform', 'translate(250.25,260.5) rotate(0)'); await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.getByTestId('item-b')).toHaveAttribute('transform', 'translate(520.75,320.5) rotate(35)')
  await page.getByRole('button', { name: '导出方案', exact: true }).click()
  let download = page.waitForEvent('download'); await page.getByRole('button', { name: /可编辑方案/ }).click()
  expect(parsePlan(await readFile((await (await download).path())!, 'utf-8'))).toEqual(moved)
  await page.getByRole('button', { name: '导出方案', exact: true }).click()
  download = page.waitForEvent('download'); await page.getByRole('button', { name: /平面图.*SVG/ }).click()
  const svg = await readFile((await (await download).path())!, 'utf-8')
  expect(svg).not.toContain('data-selection-overlay'); expect(svg).toContain('translate(520.75,320.5) rotate(35)')
  await expect.poll(async () => (await saved(page)).items).toEqual(moved.items)
  await page.reload(); await expect(page.getByTestId('item-b')).toHaveAttribute('transform', 'translate(520.75,320.5) rotate(35)')
})

test('group copy, keyboard adjustment and delete each undo in one step; undo clears removed ids', async ({ page }) => {
  await load(page); await drag(page, first, last)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('item-a')).toHaveAttribute('transform', 'translate(260.25,260.5) rotate(0)')
  await page.keyboard.press('Control+z')
  await page.getByRole('button', { name: '复制所选' }).click()
  await expect(page.locator('[data-item-name]')).toHaveCount(5)
  const copy = page.locator('[data-item-name="茶几 副本"]')
  await expect(copy).toHaveAttribute('transform', 'translate(490.75,320.5) rotate(35)')
  await expect(copy).toHaveAttribute('data-selected', 'true')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-item-name]')).toHaveCount(3); await selected(page, [])
  await drag(page, first, last)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-item-name]')).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-item-name]')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await expect.poll(() => saved(page)).toEqual(sample())
})

test('Escape, blur and pointer cancellation discard selection and movement previews', async ({ page }) => {
  await load(page)
  for (const cancel of ['Escape', 'blur', 'pointercancel']) {
    await drag(page, first, last, false); await selected(page, ['a', 'b'])
    if (cancel === 'Escape') await page.keyboard.press('Escape')
    else if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else await page.getByTestId('floor-canvas').dispatchEvent('pointercancel', { pointerId: 1 })
    await page.mouse.up(); await selected(page, ['a']); await expect(page.getByTestId('selection-box')).toHaveCount(0)
  }
  await drag(page, first, last)
  for (const cancel of ['Escape', 'blur', 'pointercancel']) {
    await drag(page, sample().items[0], { x: 320, y: 300 }, false)
    if (cancel === 'Escape') await page.keyboard.press('Escape')
    else if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else await page.getByTestId('floor-canvas').dispatchEvent('pointercancel', { pointerId: 1 })
    await page.mouse.up(); await selected(page, ['a', 'b'])
    await expect(page.getByTestId('item-a')).toHaveAttribute('transform', 'translate(250.25,260.5) rotate(0)')
  }
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled(); expect(await saved(page)).toEqual(sample())
})

test('zoom and pan keep selection aligned; movement trials prevent multi-selection', async ({ page }) => {
  await load(page)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await page.keyboard.down('Alt'); await drag(page, first, { x: 210, y: 220 }); await page.keyboard.up('Alt')
  await drag(page, first, last); await selected(page, ['a', 'b'])
  await page.getByRole('switch', { name: '网格吸附', exact: true }).setChecked(false)
  await drag(page, sample().items[0], { x: 273.25, y: 277.5 })
  await expect(page.getByTestId('item-a')).toHaveAttribute('transform', 'translate(273.25,277.5) rotate(0)')
  await expect(page.getByTestId('item-b')).toHaveAttribute('transform', 'translate(473.75,297.5) rotate(35)')
  await page.keyboard.press('Control+z')
  await page.getByRole('button', { name: '取消选择茶几', exact: true }).click()
  await page.getByRole('button', { name: '开始搬运试验', exact: true }).click()
  await drag(page, first, last)
  await page.keyboard.down('Shift'); await click(page, sample().items[1]); await page.keyboard.up('Shift')
  await selected(page, ['a'])
  await expect(page.getByTestId('item-b')).toHaveAttribute('transform', 'translate(450.75,280.5) rotate(35)')
  await expect(page.getByTestId('selection-box')).toHaveCount(0)
  await page.getByRole('button', { name: /结束试验/ }).click()
})

test.describe('touch multi-selection', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('touch selects and translates a group and can cancel a preview', async ({ page }) => {
    await load(page)
    const session = await page.context().newCDPSession(page)
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', p?: Point) => {
      const point = p ? await screen(page, p) : undefined
      await session.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] })
    }
    await touch('touchStart', first); await touch('touchMove', last); await touch('touchEnd'); await selected(page, ['a', 'b'])
    await touch('touchStart', sample().items[0]); await touch('touchMove', { x: 320.25, y: 300.5 }); await touch('touchCancel')
    await expect(page.getByTestId('item-a')).toHaveAttribute('transform', 'translate(250.25,260.5) rotate(0)')
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
    await touch('touchStart', sample().items[0]); await touch('touchMove', { x: 320.25, y: 300.5 }); await touch('touchEnd')
    await expect.poll(async () => (await saved(page)).items[0].x).toBe(320.25)
    await page.screenshot({ path: 'work/roomly-multiselect-mobile.png', fullPage: true })
    await session.detach()
  })
})
