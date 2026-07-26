import { beforeEach, describe, expect, it } from 'vitest';
import { clearAppData, loadAppData, saveAppData } from '../repository';
import { emptyAppData, type AppData } from '../types';

function samplePerson(id: string) {
  return {
    id,
    displayName: '本人',
    color: '#336699',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    years: {},
    defaults: {
      municipality: {
        name: '横浜市',
        prefectureName: '神奈川県',
        municipalIncomeRate: 0.06,
        prefecturalIncomeRate: 0.04025,
        municipalPerCapita: 3900,
        prefecturalPerCapita: 1000,
        forestTax: 1000,
        useStandardRateForFurusato: true,
      },
      safetyRatio: 0.9,
    },
  };
}

describe('repository (T-20 保存と復元)', () => {
  beforeEach(async () => {
    await clearAppData();
  });

  it('データが無い場合はnullを返す', async () => {
    expect(await loadAppData()).toBeNull();
  });

  it('保存したAppDataを再読込するとdeep equalになる', async () => {
    const data: AppData = { ...emptyAppData(), persons: [samplePerson('p1')], activePersonId: 'p1' };
    await saveAppData(data);
    const loaded = await loadAppData();
    expect(loaded).toEqual(data);
  });

  it('上書き保存すると最新の内容に置き換わる', async () => {
    const data1: AppData = { ...emptyAppData(), persons: [samplePerson('p1')], activePersonId: 'p1' };
    const data2: AppData = { ...emptyAppData(), persons: [samplePerson('p1'), samplePerson('p2')], activePersonId: 'p2' };
    await saveAppData(data1);
    await saveAppData(data2);
    const loaded = await loadAppData();
    expect(loaded?.persons).toHaveLength(2);
    expect(loaded?.activePersonId).toBe('p2');
  });

  it('clearAppDataで削除した後はnullになる(FR-31 全データ削除)', async () => {
    await saveAppData({ ...emptyAppData(), persons: [samplePerson('p1')] });
    await clearAppData();
    expect(await loadAppData()).toBeNull();
  });
});
