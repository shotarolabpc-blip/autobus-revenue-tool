import type { Basemap } from '../data/schemas'

type Props = {
  items: Basemap[]
  value: string
  onChange: (id: string) => void
}

export function BasemapSwitcher({ items, value, onChange }: Props) {
  return (
    <div className="map-panel basemap-switcher" role="radiogroup" aria-label="背景地図">
      {items.map((b) => (
        <label key={b.id}>
          <input
            type="radio"
            name="basemap"
            value={b.id}
            checked={b.id === value}
            onChange={() => onChange(b.id)}
          />
          {b.label}
        </label>
      ))}
    </div>
  )
}
