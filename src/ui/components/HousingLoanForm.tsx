import { useEffect, useRef, useState } from 'react';
import type { HousingLoanInput } from '../../domain/types';
import { formatRateAsPercent, parseNonNegativeInt, parsePercentToRate } from '../parseAmount';

interface HousingLoanFormProps {
  value: HousingLoanInput | undefined;
  /** 対象年の値。housingLoanが未入力の場合の既定値の入居年・moveInYearの初期値に使う */
  year: number;
  /** 前年のYearProfileに住宅ローン入力があればその年末残高。前年データが無ければundefined(バリデーション6章の対象外) */
  previousYearBalance: number | undefined;
  onChange: (value: HousingLoanInput | null) => void;
}

const RULE_LABELS: Record<HousingLoanInput['residentTaxCapRule'], string> = {
  rule5pct97500: '課税総所得×5%・上限97,500円(2022年以降入居)',
  rule7pct136500: '課税総所得×7%・上限136,500円(2014〜2021年入居)',
};

/** 02仕様書§3.2.6: 2022年以降入居はrule5pct97500、2014〜2021年入居はrule7pct136500(レビュー指摘是正:
 *  以前は入居年に関わらず常にrule5pct97500を既定にしていたため、2021年以前の年度で有効化すると
 *  入居年とルールが矛盾する組み合わせが既定値になっていた)。 */
function defaultResidentTaxCapRule(moveInYear: number): HousingLoanInput['residentTaxCapRule'] {
  return moveInYear >= 2022 ? 'rule5pct97500' : 'rule7pct136500';
}

function defaultHousingLoan(year: number): HousingLoanInput {
  return {
    moveInYear: year,
    years: 13,
    rate: 0.007,
    yearEndBalance: 0,
    borrowingCap: 0,
    residentTaxCapRule: defaultResidentTaxCapRule(year),
  };
}

/**
 * S-04 住宅ローン控除の入力欄(02仕様書§2.2 HousingLoanInput、Issue #8)。
 * HousingLoanInputはYearProfile上optionalなため、有効/無効のトグルを持つ。
 * 無効化時はonChange(null)を呼び、useAppStore.updateHousingLoan側でundefinedとして扱われる。
 */
export function HousingLoanForm({ value, year, previousYearBalance, onChange }: HousingLoanFormProps) {
  const enabled = value !== undefined;

  const balanceIncreased = enabled && previousYearBalance !== undefined && value.yearEndBalance > previousYearBalance;

  // 控除率はパーセント表示(例:"0.7")↔小数(0.007)の非可逆な変換を伴うため、他の項目のように
  // valueへ直接bindすると入力途中の状態("1."等)がparse→format往復で歪む(例: "1"→"." "4"の
  // 3キー入力で最終的に"14"と表示され0.14が送られてしまう)。MedicalDeductionForm等と同様、
  // 生の入力文字列をローカルstateに保持する。
  // ただし「value.rateが変わったら常に同期」だと、自分自身のonChangeが引き起こした変化(例:
  // "0.7"の末尾を1文字消して"0."にする→Number("0.")=0によりrateが0.007→0へ実際に変わる)でも
  // 毎回上書きが走り、直後のタイプが上書き後の文字列に追記されてしまう(レビュー2巡目是正)。
  // 現在のrateTextを実際にparseした値がvalue.rateと既に一致しているなら、それは自分自身の入力
  // 結果であり同期不要と判断してスキップする。一致しない場合(年度切替・インポート等の外部要因)
  // のみ表示を上書きする。
  const [rateText, setRateText] = useState(() => formatRateAsPercent(value?.rate ?? 0.007));
  useEffect(() => {
    if (!value) return;
    if (parsePercentToRate(rateText) === value.rate) return;
    setRateText(formatRateAsPercent(value.rate));
  }, [value?.rate]);

  // 住民税繰越上限ルールを手動で選択したかどうかのフラグ。入居年の値とルールが既定値どおり
  // 一致しているかどうかで「手動選択済みか」を推測する方式(前回のレビュー是正)は、入居年を
  // 2回以上編集すると偶然デフォルトと一致する年を経由した際に手動選択の情報が失われ、同じ最終値
  // へ2回に分けて編集した場合と1回で編集した場合とで結果が変わる経路依存のバグがあった
  // (レビュー4巡目是正)。ユーザーがルールの<select>を実際に操作した事実だけをrefで直接記録する
  // ことで、この推測を無くし経路に依存しないようにする。
  const ruleManuallySet = useRef(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              ruleManuallySet.current = false;
              onChange(defaultHousingLoan(year));
            } else {
              onChange(null);
            }
          }}
        />
        住宅ローン控除の対象である
      </label>

      {enabled && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>入居年</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="入居年"
              value={value.moveInYear}
              onChange={(e) => {
                const n = parseNonNegativeInt(e.target.value);
                if (n === null) return;
                // 入居年の変更にルールを追従させる。ただしユーザーがルールを手動で選択済みの
                // 場合(ruleManuallySet)は上書きしない(レビュー3巡目是正: トグルON時の既定値
                // 合わせだけでは、有効化後にmoveInYearだけ変更した場合にルールが古いままになり
                // 入居年とルールが矛盾しうる)。
                const residentTaxCapRule = ruleManuallySet.current ? value.residentTaxCapRule : defaultResidentTaxCapRule(n);
                onChange({ ...value, moveInYear: n, residentTaxCapRule });
              }}
              style={{ width: '6rem' }}
            />
            年
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>適用年数</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="適用年数"
              value={value.years}
              onChange={(e) => {
                const n = parseNonNegativeInt(e.target.value);
                if (n !== null) onChange({ ...value, years: n });
              }}
              style={{ width: '6rem' }}
            />
            年間
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>控除率</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="控除率"
              value={rateText}
              onChange={(e) => {
                const text = e.target.value;
                setRateText(text);
                const rate = parsePercentToRate(text);
                if (rate !== null) onChange({ ...value, rate });
              }}
              style={{ width: '6rem' }}
            />
            %
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>年末残高</span>
            <input
              className="amount"
              type="text"
              inputMode="numeric"
              aria-label="年末残高"
              value={value.yearEndBalance}
              onChange={(e) => {
                const n = parseNonNegativeInt(e.target.value);
                if (n !== null) onChange({ ...value, yearEndBalance: n });
              }}
              style={{ width: '10rem' }}
            />
            円
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>借入限度額</span>
            <input
              className="amount"
              type="text"
              inputMode="numeric"
              aria-label="借入限度額"
              aria-describedby="borrowing-cap-help"
              value={value.borrowingCap}
              onChange={(e) => {
                const n = parseNonNegativeInt(e.target.value);
                if (n !== null) onChange({ ...value, borrowingCap: n });
              }}
              style={{ width: '10rem' }}
            />
            円
          </label>

          {/* Issue #50: 「借入限度額」が何の値か分からないという指摘への対応。控除額の式のどこに効くのかと、
              値の調べ方をフォーム内に置く。具体的な金額は住宅区分・入居年で変わり本アプリの税制パラメータ
              (public/taxParams)にも持っていないため、断定せず目安と一次情報の確認先を示す */}
          <div id="borrowing-cap-help" style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '-0.25rem 0 0 0', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              控除の対象にできる年末残高の上限額です。住宅の種類(認定住宅・ZEH水準・省エネ基準など)と入居年で決まり、
              入居時の住宅区分により3,000万〜5,000万円程度です。正確な額は国税庁「住宅借入金等特別控除」の区分表、または
              確定申告・年末調整で使った控除の計算明細書でご確認ください。
            </p>
            <p style={{ margin: '0.25rem 0 0' }}>
              控除額は <span className="amount">min(年末残高, 借入限度額) × 控除率</span> で計算するため、年末残高がこの額を超える部分は控除に反映されません。
            </p>
            <p style={{ margin: '0.25rem 0 0' }}>
              現在の控除対象残高{' '}
              <span className="amount">{Math.min(value.yearEndBalance, value.borrowingCap).toLocaleString()}円</span>
              {value.borrowingCap === 0 && (
                <span style={{ color: 'var(--color-warning)' }}>
                  {' '}
                  (借入限度額が0円のため、住宅ローン控除額は0円として計算されます)
                </span>
              )}
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>住民税繰越上限ルール</span>
            <select
              aria-label="住民税繰越上限ルール"
              value={value.residentTaxCapRule}
              onChange={(e) => {
                ruleManuallySet.current = true;
                onChange({ ...value, residentTaxCapRule: e.target.value as HousingLoanInput['residentTaxCapRule'] });
              }}
            >
              {(Object.entries(RULE_LABELS) as [HousingLoanInput['residentTaxCapRule'], string][]).map(([rule, label]) => (
                <option key={rule} value={rule}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {balanceIncreased && (
            <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem', margin: 0 }}>
              年末残高が前年({previousYearBalance!.toLocaleString()}円)より増加しています。入力内容をご確認ください。
            </p>
          )}
        </>
      )}
    </div>
  );
}
