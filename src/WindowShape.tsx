import type { PlanWindow, Wall } from './model'

export default function WindowShape({ window: opening, wall, selected, showDims, scale }: { window: PlanWindow; wall: Wall; selected: boolean; showDims: boolean; scale: number }) {
  const half = wall.thickness / 2, glass = Math.max(1, wall.thickness / 6)
  return <g className="window-symbol">
    <title>{`窗户 · 宽 ${opening.width} cm · 高 ${opening.height} cm · 窗台高 ${opening.sillHeight} cm`}</title>
    <rect x={0} y={-Math.max(half, 9 / scale)} width={opening.width} height={Math.max(wall.thickness, 18 / scale)} fill="transparent" />
    <rect x={0} y={-half} width={opening.width} height={wall.thickness} fill={selected ? '#cfe6e9' : '#e4f0f0'} />
    <path d={`M 0 ${-half} V ${half} M ${opening.width} ${-half} V ${half}`} fill="none" stroke="#6d929b" strokeWidth={2} />
    <path d={`M 0 ${-glass} H ${opening.width} M 0 ${glass} H ${opening.width} M ${opening.width / 2} ${-half} V ${half}`} fill="none" stroke="#7ca4af" strokeWidth={1.5} />
    {showDims && <text x={opening.width / 2} y={-half - 12} textAnchor="middle" fontSize={11} fill="#6b8e98" pointerEvents="none">窗 {opening.width}</text>}
    {selected && <rect data-selection-overlay="true" x={-3} y={-half - 4} width={opening.width + 6} height={wall.thickness + 8} rx={2} fill="none" stroke="#698543" strokeWidth={1.5 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} pointerEvents="none" />}
  </g>
}
