import { formatGrade } from '../lib/format'

export function PeriodBars({ items = [], passing = 6 }) {
  return (
    <div className="period-bars">
      {items.map((item) => {
        const value = item.average
        const height = value === null ? 0 : Math.max(4, (value / 10) * 100)
        const tone =
          value === null
            ? 'empty'
            : value >= passing
              ? value >= passing + 2
                ? 'success'
                : 'warning'
              : 'danger'
        return (
          <div className="period-bar-item" key={item.id}>
            <div className="period-bar-track">
              {value !== null ? (
                <span
                  className={`period-bar-fill tone-${tone}`}
                  style={{ height: `${height}%` }}
                >
                  <span className="period-bar-value">{formatGrade(value)}</span>
                </span>
              ) : (
                <span className="period-bar-empty">Sin notas</span>
              )}
            </div>
            <span className="period-bar-label">{item.name}</span>
            <span className="period-bar-detail">
              {item.gradedStudents} alumno{item.gradedStudents === 1 ? '' : 's'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function DistributionBars({ bins = [], total = 0 }) {
  const max = Math.max(1, ...bins.map((bin) => bin.count))
  return (
    <div className="distribution">
      {bins.map((bin) => (
        <div className="distribution-row" key={bin.label}>
          <span className="distribution-label">{bin.label}</span>
          <div className="distribution-track">
            <span
              className={`distribution-fill tone-${bin.tone}`}
              style={{ width: `${(bin.count / max) * 100}%` }}
            />
          </div>
          <span className="distribution-count">
            {bin.count}
            <small>
              {total > 0 ? `${Math.round((bin.count / total) * 100)}%` : '0%'}
            </small>
          </span>
        </div>
      ))}
    </div>
  )
}

export function DonutChart({ segments = [], centerLabel, centerValue }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  let cursor = 0
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor
      cursor += (segment.value / total) * 100
      return `${segment.color} ${start}% ${cursor}%`
    })
    .join(', ')

  return (
    <div className="donut-wrap">
      <div
        className="donut"
        style={{
          background: total > 0 ? `conic-gradient(${stops})` : 'var(--surface-3)',
        }}
      >
        <div className="donut-hole">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="donut-legend">
        {segments.map((segment) => (
          <span className="legend-item" key={segment.label}>
            <i style={{ background: segment.color }} />
            {segment.label}
            <b>{segment.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}
