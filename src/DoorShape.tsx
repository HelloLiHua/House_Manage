import type { Door, Wall } from './model'
import { doorPassage, slidingPanels, swingDoorGeometry } from './geometry'

export default function DoorShape({ door: d, wall: w, selected }: { door: Door; wall: Wall; selected: boolean }) {
  const sign = d.flip ? -1 : 1
  if (d.type !== 'sliding') {
    const { hinge, closed, open, sweep } = swingDoorGeometry(d)
    return <g className="swing-door-symbol" data-hinge-side={d.hingeSide ?? 'start'}>
      <rect x={0} y={-w.thickness / 2} width={d.width} height={w.thickness} fill={selected ? '#dbe6c8' : '#f5f3ec'} />
      <path className="swing-arc" d={`M ${closed.x} ${closed.y} A ${d.width} ${d.width} 0 0 ${sweep} ${open.x} ${open.y}`} fill="none" stroke="#a5ac99" strokeWidth={1.4} strokeDasharray="4 3" />
      <line className="swing-leaf" x1={hinge.x} y1={hinge.y} x2={open.x} y2={open.y} stroke="#8f9b7e" strokeWidth={3} />
      <circle className="swing-hinge" cx={hinge.x} cy={hinge.y} r={2.5} fill="#71894f" />
      <text x={d.width / 2} y={sign * 17} fontSize={11} fill="#859178" textAnchor="middle">{d.width}</text>
    </g>
  }
  const passage = doorPassage(d), panels = slidingPanels(d, w), single = d.slidingStyle === 'single'
  const trackStart = single && d.slideDirection === 'start' ? -d.width : 0
  const trackEnd = single && d.slideDirection !== 'start' ? d.width * 2 : d.width
  const trackYs = panels.map(panel => panel.y + panel.depth / 2)
  const openStart = passage.from - (d.offset - d.width / 2)
  const arrowY = sign * (w.thickness / 2 + (single ? (d.panelThickness ?? 4) + 13 : 13))
  const arrowStart = d.width * (d.slideDirection === 'start' ? .62 : .38)
  const arrowEnd = d.width * (d.slideDirection === 'start' ? .38 : .62)
  const arrowSign = d.slideDirection === 'start' ? -1 : 1
  return <g className="sliding-door-symbol" data-testid={`sliding-symbol-${d.id}`}>
    <rect x={0} y={-w.thickness / 2} width={d.width} height={w.thickness} fill={selected ? '#e0e9d1' : '#f5f3ec'} />
    <rect x={trackStart} y={Math.min(...trackYs) - 8} width={trackEnd - trackStart} height={Math.max(...trackYs) - Math.min(...trackYs) + 16} fill="transparent" />
    {trackYs.map((y, i) => <line className="sliding-track" key={i} x1={trackStart} x2={trackEnd} y1={y} y2={y} stroke="#a7b29a" strokeWidth={.8} strokeDasharray={single ? '4 2' : undefined} />)}
    {passage.width > 0 && <line x1={openStart} x2={openStart + passage.width} y1={0} y2={0} stroke="#a9c18e" strokeWidth={2} strokeDasharray="4 3" />}
    {panels.map((panel, i) => <g key={i} className="sliding-panel">
      <rect x={panel.x} y={panel.y} width={panel.width} height={panel.depth} rx={.5} fill={selected ? '#a6bb89' : '#c1cbb6'} stroke={selected ? '#71894f' : '#869779'} strokeWidth={1} />
      <line x1={panel.x + panel.width * .8} x2={panel.x + panel.width * .8} y1={panel.y - 1} y2={panel.y + panel.depth + 1} stroke="#6f825c" strokeWidth={1.5} />
    </g>)}
    <path className="sliding-arrow" d={`M ${arrowStart} ${arrowY} H ${arrowEnd} M ${arrowEnd - arrowSign * 5} ${arrowY - 4} L ${arrowEnd} ${arrowY} L ${arrowEnd - arrowSign * 5} ${arrowY + 4}`} fill="none" stroke="#81986b" strokeWidth={1.2} pointerEvents="none" />
    <text x={d.width / 2} y={-sign * (w.thickness / 2 + 14)} fontSize={11} fill="#71845d" textAnchor="middle" pointerEvents="none">推拉 · 净 {Number(passage.width.toFixed(1))}</text>
    {selected && <rect x={-3} y={-w.thickness / 2 - 3} width={d.width + 6} height={w.thickness + 6} rx={2} fill="none" stroke="#8ba66c" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />}
  </g>
}
