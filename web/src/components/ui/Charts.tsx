'use client'

interface Series {
  name: string
  color: string
  data: number[]
}

export function LineTrendChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[]
  series: Series[]
  height?: number
}) {
  const W = 640
  const H = height
  const padL = 36
  const padR = 16
  const padT = 18
  const padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const allVals = series.flatMap((s) => s.data)
  const maxVal = Math.max(4, ...allVals)

  const xAt = (i: number) =>
    labels.length <= 1 ? padL + plotW / 2 : padL + (i / (labels.length - 1)) * plotW
  const yAt = (v: number) => padT + plotH - (v / maxVal) * plotH

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t))

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-slate-400">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        {ticks.map((tv, idx) => {
          const y = yAt(tv)
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                {tv}
              </text>
            </g>
          )
        })}

        {series.map((s) => {
          if (!s.data.length) return null
          const pts = s.data.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')
          const areaPts = `${xAt(0)},${padT + plotH} ${pts} ${xAt(s.data.length - 1)},${padT + plotH}`
          return (
            <g key={s.name}>
              <polygon points={areaPts} fill={s.color} opacity={0.1} />
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
              {s.data.map((v, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill={s.color}>
                  <title>{`${labels[i] ?? ''}: ${v}`}</title>
                </circle>
              ))}
            </g>
          )
        })}

        {labels.map((lb, i) => (
          <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {lb}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function BarChart({
  labels,
  values,
  color = '#f59e0b',
  unit = '',
  targetLine,
  height = 220,
}: {
  labels: string[]
  values: number[]
  color?: string
  unit?: string
  targetLine?: number
  height?: number
}) {
  const W = 640
  const H = height
  const padL = 42
  const padR = 16
  const padT = 18
  const padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxVal = Math.max(10, targetLine ?? 0, ...values)
  const slotW = plotW / Math.max(1, labels.length)
  const barW = Math.min(28, slotW * 0.62)
  const yAt = (v: number) => padT + plotH - (v / maxVal) * plotH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0, 0.5, 1].map((t, idx) => {
        const tv = Math.round(maxVal * t)
        const y = yAt(tv)
        return (
          <g key={idx}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {tv}{unit}
            </text>
          </g>
        )
      })}

      {targetLine !== undefined && targetLine > 0 && (
        <g>
          <line
            x1={padL}
            y1={yAt(targetLine)}
            x2={W - padR}
            y2={yAt(targetLine)}
            stroke="#fb7185"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <text x={W - padR} y={yAt(targetLine) - 5} textAnchor="end" fontSize="10" fill="#fb7185">
            เป้าหมาย {targetLine}{unit}
          </text>
        </g>
      )}

      {values.map((v, i) => {
        const cx = padL + slotW * i + slotW / 2
        const y = yAt(v)
        const bh = Math.max(2, padT + plotH - y)
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={bh}
              rx={5}
              fill={color}
              opacity={v > 0 ? 0.9 : 0.25}
            >
              <title>{`${labels[i] ?? ''}: ${v}${unit}`}</title>
            </rect>
            {v > 0 && (
              <text x={cx} y={y - 5} textAnchor="middle" fontSize="9.5" fill="#cbd5e1">
                {Math.round(v)}{unit}
              </text>
            )}
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {labels[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function DonutChart({
  segments,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[]
  centerLabel: string
  centerSub?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = 56
  const c = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="16" />
          {total > 0 &&
            segments.map((seg) => {
              const frac = seg.value / total
              const dash = frac * c
              const offset = -acc * c
              acc += frac
              return (
                <circle
                  key={seg.label}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="16"
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={offset}
                />
              )
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-2xl font-bold text-white">{centerLabel}</div>
          {centerSub && <div className="text-[11px] text-slate-400">{centerSub}</div>}
        </div>
      </div>

      <div className="flex-1 w-full space-y-2 text-xs">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
          return (
            <div key={seg.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                {seg.label}
              </span>
              <span className="font-medium text-white tabular-nums">
                {seg.value} <span className="text-slate-500">({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function HorizontalBarChart({
  items,
  unit = 'ชม.',
}: {
  items: { label: string; value: number; color: string }[]
  unit?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) {
    return <p className="text-sm text-slate-500 py-8 text-center">ไม่มีงานค้างในขณะนี้</p>
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-200 font-medium truncate pr-2">{item.label}</span>
            <span className="text-slate-400 tabular-nums shrink-0">
              {item.value} {unit}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(4, Math.round((item.value / max) * 100))}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
