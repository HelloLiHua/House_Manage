import { useState } from 'react'
import { Check } from 'lucide-react'
import CompassDial from './CompassDial'
import OrientationToggle from './OrientationToggle'

export default function OrientationSettings({ angle, locked, onApply, onCancel }: { angle: number; locked: boolean; onApply: (angle: number, locked: boolean) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(String(angle))
  const [fixed, setFixed] = useState(locked)
  const value = Number(draft)
  const valid = draft.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 360
  const preview = valid ? value % 360 : angle
  const [error, setError] = useState(false)
  function change(next: string) { setDraft(next); setError(false) }
  return <form className="orientation-settings" noValidate onSubmit={e => {
    e.preventDefault()
    if (!valid) { setError(true); return }
    onApply(preview, fixed)
  }}>
    <h2 id="modal-title">设置房屋朝向</h2>
    <p className="modal-description">让绿色箭头指向户型图中的北方，东、南、西会一起调整。</p>
    <div className="orientation-lock-row"><span>自由调整朝向</span><OrientationToggle locked={fixed} onChange={next => { if (!valid) { setError(true); return }; setFixed(next) }} /></div>
    <div className="orientation-preview"><CompassDial angle={preview} locked={fixed} onChange={next => change(String(next))} testId="orientation-preview-dial" /></div>
    <p className="orientation-hint">{fixed ? '朝向已固定。打开自由调整后，可以拖动指示盘或输入角度。' : '拖动指示盘，让北方对准实际方向；调整好后关闭开关即可固定。'}</p>
    <div className="orientation-presets" aria-label="北向快捷设置">
      {[{ label: '北朝上', angle: 0 }, { label: '北朝右', angle: 90 }, { label: '北朝下', angle: 180 }, { label: '北朝左', angle: 270 }].map(p =>
        <button key={p.angle} type="button" disabled={fixed} aria-pressed={valid && preview === p.angle} onClick={() => change(String(p.angle))}>{p.label}</button>
      )}
    </div>
    <label className={`number-field ${error ? 'invalid' : ''}`}><span>北向角度</span><div>
      <input aria-label="北向角度" aria-describedby="orientation-angle-hint" aria-invalid={error || undefined} type="number" min="0" max="360" step="any" disabled={fixed} value={draft} onChange={e => change(e.target.value)} /><em>°</em>
    </div></label>
    <p id="orientation-angle-hint" className="orientation-hint">从画面上方向顺时针计：0° 朝上，90° 朝右。支持小数，360° 等同于 0°。</p>
    <div className="orientation-adjust"><button type="button" disabled={fixed} onClick={() => change(String(Math.round((preview + 345) % 360 * 10) / 10))}>逆时针 15°</button><button type="button" disabled={fixed} onClick={() => change(String(Math.round((preview + 15) % 360 * 10) / 10))}>顺时针 15°</button></div>
    {error && <p className="form-error" role="alert">请输入 0–360° 之间的角度。</p>}
    <p className="orientation-hint">朝向按你提供的信息设置，不会自动定位。这里只调整方位标识，房屋和家具位置保持不变。</p>
    <div className="orientation-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button type="submit" className="primary-button"><Check size={15} />应用朝向</button></div>
  </form>
}
