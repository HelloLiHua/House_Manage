import { LockKeyhole, LockKeyholeOpen } from 'lucide-react'

export default function OrientationToggle({ locked, disabled = false, onChange }: { locked: boolean; disabled?: boolean; onChange: (locked: boolean) => void }) {
  const Icon = locked ? LockKeyhole : LockKeyholeOpen
  return <button type="button" role="switch" aria-label="自由调整朝向" aria-checked={!locked} disabled={disabled} className="orientation-toggle" onClick={() => onChange(!locked)} title={locked ? '打开后可自由调整朝向' : '关闭后固定当前朝向'}>
    <Icon size={13} /><span>{locked ? '已锁定' : '可调整'}</span><span className="orientation-switch-track" aria-hidden="true"><i /></span>
  </button>
}
