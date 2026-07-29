import type { MunicipalityConfig } from '../../domain/types';
import { formatRateAsPercent } from '../parseAmount';

/** 空文字/NaN/負値はnullを返す(呼び出し側で「未入力・不正」としてブロックする。既定値へのフォールバックはしない) */
function parseNonNegative(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parsePercentToFraction(input: string): number | null {
  const n = parseNonNegative(input);
  return n === null ? null : Number((n / 100).toFixed(6));
}

/** 均等割は常に整数円のため、非負の整数のみを受け付ける(小数はnullとしてブロックする) */
function parseNonNegativeInteger(input: string): number | null {
  const n = parseNonNegative(input);
  return n === null || !Number.isInteger(n) ? null : n;
}

/** 入力途中の文字列をそのまま保持する下書き。数値へ変換できない状態(空文字など)も表現できる */
export interface MunicipalityDraft {
  prefectureName: string;
  cityName: string;
  municipalRatePct: string;
  prefecturalRatePct: string;
  municipalPerCapita: string;
  prefecturalPerCapita: string;
}

export function toDraft(config: MunicipalityConfig): MunicipalityDraft {
  return {
    prefectureName: config.prefectureName,
    cityName: config.name,
    municipalRatePct: formatRateAsPercent(config.municipalIncomeRate),
    prefecturalRatePct: formatRateAsPercent(config.prefecturalIncomeRate),
    municipalPerCapita: String(config.municipalPerCapita),
    prefecturalPerCapita: String(config.prefecturalPerCapita),
  };
}

export type MunicipalityDraftErrors = Record<'municipalRate' | 'prefecturalRate' | 'municipalCapita' | 'prefecturalCapita', string | null>;

export function validateDraft(draft: MunicipalityDraft): MunicipalityDraftErrors {
  return {
    municipalRate: parsePercentToFraction(draft.municipalRatePct) === null ? '0以上の数値を入力してください' : null,
    prefecturalRate: parsePercentToFraction(draft.prefecturalRatePct) === null ? '0以上の数値を入力してください' : null,
    municipalCapita: parseNonNegativeInteger(draft.municipalPerCapita) === null ? '0以上の整数(円)を入力してください' : null,
    prefecturalCapita: parseNonNegativeInteger(draft.prefecturalPerCapita) === null ? '0以上の整数(円)を入力してください' : null,
  };
}

export function hasDraftError(errors: MunicipalityDraftErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * 下書きをMunicipalityConfigへ変換する。1項目でも不正ならnullを返す。
 * forestTax(森林環境税・国税)とuseStandardRateForFurusato(ふるさと納税の20%枠を標準税率で算出するか)は
 * 本フォームの編集対象ではないため、変換元のbaseから引き継ぐ。
 */
export function draftToConfig(draft: MunicipalityDraft, base: MunicipalityConfig): MunicipalityConfig | null {
  const municipalRate = parsePercentToFraction(draft.municipalRatePct);
  const prefecturalRate = parsePercentToFraction(draft.prefecturalRatePct);
  const municipalCapita = parseNonNegativeInteger(draft.municipalPerCapita);
  const prefecturalCapita = parseNonNegativeInteger(draft.prefecturalPerCapita);
  if (municipalRate === null || prefecturalRate === null || municipalCapita === null || prefecturalCapita === null) return null;
  return {
    ...base,
    name: draft.cityName.trim(),
    prefectureName: draft.prefectureName.trim(),
    municipalIncomeRate: municipalRate,
    prefecturalIncomeRate: prefecturalRate,
    municipalPerCapita: municipalCapita,
    prefecturalPerCapita: prefecturalCapita,
  };
}

interface MunicipalityFormProps {
  draft: MunicipalityDraft;
  onChange(draft: MunicipalityDraft): void;
  errors: MunicipalityDraftErrors;
  /** 詳細設定(超過課税)のdetailsを最初から開いておくか。編集画面では現在値を確認できるよう開く */
  detailsOpen?: boolean;
  forestTax: number;
}

/**
 * 自治体設定(FR-09)の入力フォーム。S-12オンボーディングのステップ3とS-08設定画面の
 * 両方から使うため、状態は持たず下書きと変更ハンドラを親から受け取る。
 */
export function MunicipalityForm({ draft, onChange, errors, detailsOpen = false, forestTax }: MunicipalityFormProps) {
  const patch = (p: Partial<MunicipalityDraft>) => onChange({ ...draft, ...p });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <label>
        都道府県
        <input
          type="text"
          value={draft.prefectureName}
          onChange={(e) => patch({ prefectureName: e.target.value })}
          placeholder="例: 神奈川県"
          style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
        />
      </label>
      <label>
        市区町村
        <input
          type="text"
          value={draft.cityName}
          onChange={(e) => patch({ cityName: e.target.value })}
          placeholder="例: 横浜市"
          style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
        />
      </label>

      <details open={detailsOpen}>
        <summary>詳細設定(お住まいの自治体に超過課税がある場合に調整)</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label>
            所得割率(市町村) %
            <input
              type="text"
              inputMode="decimal"
              value={draft.municipalRatePct}
              onChange={(e) => patch({ municipalRatePct: e.target.value })}
              aria-invalid={Boolean(errors.municipalRate)}
              style={{ display: 'block', marginTop: '0.25rem' }}
            />
          </label>
          {errors.municipalRate && (
            <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
              {errors.municipalRate}
            </p>
          )}
          <label>
            所得割率(道府県) %
            <input
              type="text"
              inputMode="decimal"
              value={draft.prefecturalRatePct}
              onChange={(e) => patch({ prefecturalRatePct: e.target.value })}
              aria-invalid={Boolean(errors.prefecturalRate)}
              style={{ display: 'block', marginTop: '0.25rem' }}
            />
          </label>
          {errors.prefecturalRate && (
            <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
              {errors.prefecturalRate}
            </p>
          )}
          <label>
            均等割(市町村) 円
            <input
              type="text"
              inputMode="numeric"
              value={draft.municipalPerCapita}
              onChange={(e) => patch({ municipalPerCapita: e.target.value })}
              aria-invalid={Boolean(errors.municipalCapita)}
              style={{ display: 'block', marginTop: '0.25rem' }}
            />
          </label>
          {errors.municipalCapita && (
            <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
              {errors.municipalCapita}
            </p>
          )}
          <label>
            均等割(道府県) 円
            <input
              type="text"
              inputMode="numeric"
              value={draft.prefecturalPerCapita}
              onChange={(e) => patch({ prefecturalPerCapita: e.target.value })}
              aria-invalid={Boolean(errors.prefecturalCapita)}
              style={{ display: 'block', marginTop: '0.25rem' }}
            />
          </label>
          {errors.prefecturalCapita && (
            <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
              {errors.prefecturalCapita}
            </p>
          )}
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
            森林環境税(国税) {forestTax.toLocaleString()}円は自治体によらず一律です。
          </p>
        </div>
      </details>
    </div>
  );
}
