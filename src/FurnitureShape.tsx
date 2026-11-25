import type { Furniture, Template } from './model'

export function FurnitureShape({ item, stroke = '#7d8275' }: { item: Furniture | Template; stroke?: string }) {
  const { width: w, depth: d, kind, color } = item
  const style = { fill: color, stroke, strokeWidth: 1.5 }
  const line = { fill: 'none', stroke, strokeWidth: 1.3 }
  const inset = Math.min(10, w / 10, d / 8)
  if (kind === 'plant') return <g><circle r={Math.min(w, d) / 2} fill="#dce3d2" stroke="#b3c0a5" />{[0, 60, 120, 180, 240, 300].map(a => <ellipse key={a} cx={0} cy={-d * .18} rx={w * .14} ry={d * .27} transform={`rotate(${a})`} fill={color} stroke="#6c8b65" strokeWidth={1} />)}<circle r={w * .09} fill="#6c8b65" /></g>
  if (kind === 'bed') return <g>
    <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={4} {...style} />
    <rect x={-w / 2 + 5} y={-d / 2 + 8} width={w - 10} height={d - 13} rx={5} fill="#faf8f3" stroke={stroke} strokeWidth={1} />
    <rect x={-w / 2 + 10} y={-d / 2 + 14} width={w / 2 - 17} height={d * .19} rx={6} fill="#eee9df" stroke={stroke} strokeWidth={1} />
    <rect x={7} y={-d / 2 + 14} width={w / 2 - 17} height={d * .19} rx={6} fill="#eee9df" stroke={stroke} strokeWidth={1} />
    <rect x={-w / 2 + 5} y={-d * .15} width={w - 10} height={d * .62} rx={3} fill={color} stroke={stroke} strokeWidth={1} />
    <path d={`M ${-w / 2 + 6} ${-d * .05} H ${w / 2 - 6}`} {...line} />
  </g>
  if (kind === 'sofa' || kind === 'chair') return <g>
    <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={9} {...style} />
    <rect x={-w / 2 + inset} y={-d / 2 + d * .22} width={w - 2 * inset} height={d * .68} rx={5} fill={color} stroke={stroke} strokeWidth={1.4} />
    {kind === 'sofa' && [1, 2].map(n => <path key={n} d={`M ${-w / 2 + inset + (w - 2 * inset) * n / 3} ${-d / 2 + d * .22} v ${d * .68}`} {...line} />)}
    <path d={`M ${-w / 2 + inset} ${-d / 2 + d * .2} V ${d / 2 - 4} M ${w / 2 - inset} ${-d / 2 + d * .2} V ${d / 2 - 4}`} {...line} />
  </g>
  return <g>
    <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={kind === 'table' ? Math.min(10, d / 8) : 2} {...style} />
    {kind === 'cabinet' ? <><path d={`M 0 ${-d / 2} V ${d / 2}`} {...line} /><path d={`M -6 -5 V 5 M 6 -5 V 5`} {...line} /><path d={`M ${-w / 2} ${d / 2 - 5} H ${w / 2}`} {...line} /></> : <rect x={-w / 2 + 5} y={-d / 2 + 5} width={Math.max(1, w - 10)} height={Math.max(1, d - 10)} rx={5} fill="none" stroke={stroke} strokeWidth={.7} opacity={.5} />}
    {kind === 'custom' && <path d={`M ${-w / 2 + 6} ${-d / 2 + 6} L ${w / 2 - 6} ${d / 2 - 6} M ${w / 2 - 6} ${-d / 2 + 6} L ${-w / 2 + 6} ${d / 2 - 6}`} {...line} opacity={.35} />}
  </g>
}

export function FurnitureThumbnail({ item }: { item: Template }) {
  const max = Math.max(item.width, item.depth) * 1.25
  return <svg viewBox={`${-max / 2} ${-max / 2} ${max} ${max}`} aria-hidden="true"><FurnitureShape item={item} /></svg>
}
