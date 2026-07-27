import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { applyLeavePeriods, sumBonusSocialInsurance, sumMonthlySocialInsurance } from '../../domain/income';
import type { Yen } from '../../domain/types';
import { AccordionSection } from '../components/AccordionSection';
import { SocialInsuranceOverrideField } from '../components/SocialInsuranceOverrideField';
import { LifeInsuranceForm } from '../components/LifeInsuranceForm';
import { EarthquakeInsuranceForm } from '../components/EarthquakeInsuranceForm';
import { MedicalDeductionForm } from '../components/MedicalDeductionForm';
import { SpouseDependentForm } from '../components/SpouseDependentForm';
import { DisabilityDeductionForm } from '../components/DisabilityDeductionForm';

function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * S-03 控除入力画面(02仕様書§5相当、03詳細設計書§6.3、Issue #7)。
 *
 * 03詳細設計書§6.3は`IdecoForm`単体・`DisabilitySingleParentForm`(障害者控除+ひとり親控除を統合)を
 * 提案しているが、Issue #7本文のアコーディオン列挙(社会保険料・生命保険料・地震保険料・医療費・
 * 配偶者/扶養・iDeCo・ひとり親・障害者控除の8区分)に合わせ、iDeCoはインライン化・ひとり親と
 * 障害者控除は別アコーディオンに分離した。両者はロジック共有が無く統合する実利が無いため。
 */
export function DeductionsScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const taxParams = useAppStore((s) => s.taxParams);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);
  const updateDeductions = useAppStore((s) => s.updateDeductions);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>控除入力</h1>
        </div>
        <p style={{ marginTop: '1.5rem' }}>この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。</p>
        <button type="button" onClick={() => navigate('income')}>
          収入入力へ
        </button>
      </main>
    );
  }

  const params = taxParams[profile.year];

  if (lastError) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>控除入力</h1>
        </div>
        <div
          role="alert"
          style={{ marginTop: '1.5rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem' }}
        >
          {lastError.message}
          <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
            閉じる
          </button>
        </div>
      </main>
    );
  }

  if (!calculationResult || !params) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const d = profile.deductions;
  const incomeAfterLeave = applyLeavePeriods(profile.income, profile.year);
  const socialInsuranceActualSum = (sumMonthlySocialInsurance(incomeAfterLeave) + sumBonusSocialInsurance(incomeAfterLeave)) as Yen;
  const childUnder23CapApplicable = params.incomeTax.lifeInsurance.newGeneralChildUnder23Cap !== undefined;

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>控除入力 ({profile.year}年分)</h1>
      </div>

      <section style={{ marginTop: '1rem' }}>
        <p style={{ margin: 0 }}>
          所得控除合計(所得税): <span className="amount">{calculationResult.incomeTax.deductions.total.toLocaleString()}円</span>
          {'　'}
          所得控除合計(住民税): <span className="amount">{calculationResult.residentTax.deductions.total.toLocaleString()}円</span>
        </p>
      </section>

      <AccordionSection title="社会保険料">
        <SocialInsuranceOverrideField
          actualSum={socialInsuranceActualSum}
          value={d.socialInsuranceOverride}
          onChange={(socialInsuranceOverride) => updateDeductions({ socialInsuranceOverride })}
        />
      </AccordionSection>

      <AccordionSection title="生命保険料">
        <LifeInsuranceForm
          value={d.lifeInsurance}
          childUnder23CapApplicable={childUnder23CapApplicable}
          onChange={(lifeInsurance) => updateDeductions({ lifeInsurance })}
        />
      </AccordionSection>

      <AccordionSection title="地震保険料">
        <EarthquakeInsuranceForm value={d.earthquakeInsurance} onChange={(earthquakeInsurance) => updateDeductions({ earthquakeInsurance })} />
      </AccordionSection>

      <AccordionSection title="医療費">
        <MedicalDeductionForm
          value={d.medical}
          totalIncome={calculationResult.income.totalIncome}
          params={params.incomeTax.medical}
          oneStopSelected={profile.furusato.method === 'oneStop'}
          onChange={(medical) => updateDeductions({ medical })}
        />
      </AccordionSection>

      <AccordionSection title="配偶者・扶養">
        <SpouseDependentForm
          spouse={d.spouse}
          dependents={d.dependents}
          onChangeSpouse={(spouse) => updateDeductions({ spouse })}
          onChangeDependents={(dependents) => updateDeductions({ dependents })}
        />
      </AccordionSection>

      <AccordionSection title="iDeCo(小規模企業共済等掛金控除)">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ minWidth: '9rem' }}>年間掛金合計</span>
          <input
            className="amount"
            type="text"
            inputMode="numeric"
            aria-label="iDeCo年間掛金合計"
            value={d.ideco}
            onChange={(e) => {
              const n = parseNonNegativeInt(e.target.value);
              if (n !== null) updateDeductions({ ideco: n });
            }}
            style={{ width: '8rem' }}
          />
          円
        </label>
      </AccordionSection>

      <AccordionSection title="ひとり親">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={d.isSingleParent} onChange={(e) => updateDeductions({ isSingleParent: e.target.checked })} />
          ひとり親控除の対象とする
        </label>
      </AccordionSection>

      <AccordionSection title="障害者控除">
        <DisabilityDeductionForm value={d.disabilityDeductions} onChange={(disabilityDeductions) => updateDeductions({ disabilityDeductions })} />
      </AccordionSection>
    </main>
  );
}
