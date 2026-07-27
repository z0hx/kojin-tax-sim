import { parseNonNegativeInt } from '../parseAmount';

interface EarthquakeInsuranceValue {
  long: number;
  short: number;
}

interface EarthquakeInsuranceFormProps {
  value: EarthquakeInsuranceValue;
  onChange: (value: EarthquakeInsuranceValue) => void;
}

/** S-03 地震保険料控除欄(02仕様書§3.2.4)。長期(地震保険料本体)・短期(旧長期損害保険料の経過措置)。 */
export function EarthquakeInsuranceForm({ value, onChange }: EarthquakeInsuranceFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ minWidth: '9rem' }}>地震保険料(本体)</span>
        <input
          className="amount"
          type="text"
          inputMode="numeric"
          aria-label="地震保険料(本体)"
          value={value.long}
          onChange={(e) => {
            const n = parseNonNegativeInt(e.target.value);
            if (n !== null) onChange({ ...value, long: n });
          }}
          style={{ width: '8rem' }}
        />
        円
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ minWidth: '9rem' }}>旧長期損害保険料</span>
        <input
          className="amount"
          type="text"
          inputMode="numeric"
          aria-label="旧長期損害保険料"
          value={value.short}
          onChange={(e) => {
            const n = parseNonNegativeInt(e.target.value);
            if (n !== null) onChange({ ...value, short: n });
          }}
          style={{ width: '8rem' }}
        />
        円
      </label>
    </div>
  );
}
