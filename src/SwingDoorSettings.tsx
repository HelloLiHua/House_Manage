import type { Door, Wall } from './model'

function screenDirection(dx: number, dy: number) {
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  const horizontal = Math.abs(dx) > size * .3 ? (dx < 0 ? '左' : '右') : ''
  const vertical = Math.abs(dy) > size * .3 ? (dy < 0 ? '上' : '下') : ''
  return horizontal + vertical
}

export default function SwingDoorSettings({ door, wall, onChange }: { door: Door; wall: Wall; onChange: (patch: Partial<Door>) => void }) {
  const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y
  return <>
    <div className="section-heading"><h4>门轴位置</h4><span>门扇固定的一端</span></div>
    <div className="door-segmented" role="group" aria-label="门轴位置">
      <button type="button" aria-pressed={door.hingeSide !== 'end'} onClick={() => onChange({ hingeSide: 'start' })}>{screenDirection(-dx, -dy)}侧</button>
      <button type="button" aria-pressed={door.hingeSide === 'end'} onClick={() => onChange({ hingeSide: 'end' })}>{screenDirection(dx, dy)}侧</button>
    </div>
    <div className="section-heading"><h4>开启方向</h4><span>按画布方向选择</span></div>
    <div className="door-segmented" role="group" aria-label="开启方向">
      <button type="button" aria-pressed={!door.flip} onClick={() => onChange({ flip: false })}>向{screenDirection(-dy, dx)}开启</button>
      <button type="button" aria-pressed={door.flip} onClick={() => onChange({ flip: true })}>向{screenDirection(dy, -dx)}开启</button>
    </div>
  </>
}
