export default function CompassRose({ angle }: { angle: number }) {
  return <svg className="compass-rose" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label={`方位：北向从画面上方顺时针旋转 ${angle}°`} data-north-angle={angle}>
    <circle cx="50" cy="50" r="29" fill="#fafbf6" stroke="#e0e6d7" />
    <g transform={`rotate(${angle} 50 50)`}>
      <path d="M 23 50 H 77 M 50 23 V 77" stroke="#cbd5bf" strokeWidth="1" />
      <path d="M 50 23 L 58 55 L 50 50 L 42 55 Z" fill="#71894f" />
      <path d="M 50 77 L 42 45 L 50 50 L 58 45 Z" fill="#c4cfb5" />
      <circle cx="50" cy="50" r="3" fill="#fff" stroke="#71894f" />
      {[{ label: '北', x: 50, y: 11 }, { label: '东', x: 89, y: 50 }, { label: '南', x: 50, y: 89 }, { label: '西', x: 11, y: 50 }].map(({ label, x, y }) =>
        <text key={label} data-direction={label} x={x} y={y} transform={`rotate(${-angle} ${x} ${y})`} textAnchor="middle" dominantBaseline="central" fontFamily="Arial, Microsoft YaHei, sans-serif" fontSize="12" fontWeight={label === '北' ? 700 : 400} fill={label === '北' ? '#617b42' : '#8d9b7d'}>{label}</text>
      )}
    </g>
  </svg>
}
