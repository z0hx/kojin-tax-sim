import { describe, expect, it } from 'vitest';
import { buildExportPayload, exportData } from '../exporter';
import { applyImport, buildImportPreview, parseImportFile } from '../importer';
import { emptyAppData, type AppData, type Person } from '../types';

function makePerson(id: string, displayName: string, updatedAt: string): Person {
  return {
    id,
    displayName,
    color: '#336699',
    createdAt: updatedAt,
    updatedAt,
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

describe('parseImportFile / applyImport (T-21 ラウンドトリップ)', () => {
  it('エクスポート→インポート(replace)でpersonsが完全一致する', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')], activePersonId: 'p1' };
    const blob = await exportData(current, { personIds: 'all', includeSettings: true });
    const parsed = await parseImportFile(blob);
    const result = applyImport(current, parsed.data, 'replace');
    expect(result.persons).toEqual(current.persons);
  });

  it('暗号化エクスポートしたファイルもパスフレーズがあればインポートできる', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')], activePersonId: 'p1' };
    const blob = await exportData(current, { personIds: 'all', includeSettings: true, passphrase: 'secret' });
    const parsed = await parseImportFile(blob, 'secret');
    expect(parsed.data.persons[0].id).toBe('p1');
  });

  it('パスフレーズ無しで暗号化ファイルを開こうとすると例外を投げる', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')] };
    const blob = await exportData(current, { personIds: 'all', includeSettings: true, passphrase: 'secret' });
    await expect(parseImportFile(blob)).rejects.toThrow();
  });
});

describe('applyImport: merge (T-25)', () => {
  it('同一idはupdatedAtが新しい方が採用される', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人(旧)', '2026-01-01T00:00:00.000Z')] };
    const incoming: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人(新)', '2026-06-01T00:00:00.000Z')] };
    const result = applyImport(current, incoming, 'merge');
    expect(result.persons).toHaveLength(1);
    expect(result.persons[0].displayName).toBe('本人(新)');
  });

  it('古い方のデータで上書きしない', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人(新)', '2026-06-01T00:00:00.000Z')] };
    const incoming: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人(旧)', '2026-01-01T00:00:00.000Z')] };
    const result = applyImport(current, incoming, 'merge');
    expect(result.persons[0].displayName).toBe('本人(新)');
  });

  it('存在しない人物は追加される', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')] };
    const incoming: AppData = { ...emptyAppData(), persons: [makePerson('p2', '配偶者', '2026-01-01T00:00:00.000Z')] };
    const result = applyImport(current, incoming, 'merge');
    expect(result.persons.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('applyImport: addAsNew (T-26)', () => {
  it('全員に新しいidが採番され、既存人物数が変わらない', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')] };
    const incoming: AppData = { ...emptyAppData(), persons: [makePerson('p1', '他人のp1', '2026-01-01T00:00:00.000Z')] };
    const result = applyImport(current, incoming, 'addAsNew');
    expect(result.persons).toHaveLength(2);
    expect(result.persons[0].id).toBe('p1');
    expect(result.persons[1].id).not.toBe('p1');
  });

  it('表示名が既存人物と重複する場合は(インポート)を付けて区別する(レビュー指摘Low#8是正)', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')] };
    const incoming: AppData = { ...emptyAppData(), persons: [makePerson('p2', '本人', '2026-01-01T00:00:00.000Z')] };
    const result = applyImport(current, incoming, 'addAsNew');
    const names = result.persons.map((p) => p.displayName);
    expect(names).toContain('本人');
    expect(names).toContain('本人(インポート)');
  });

  it('インポートするファイル内に同名の人物が複数含まれる場合も連番で区別する(レビュー2巡目Low#4是正)', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')] };
    const incoming: AppData = {
      ...emptyAppData(),
      persons: [
        makePerson('p2', '本人', '2026-01-01T00:00:00.000Z'),
        makePerson('p3', '本人', '2026-01-01T00:00:00.000Z'),
      ],
    };
    const result = applyImport(current, incoming, 'addAsNew');
    const names = result.persons.map((p) => p.displayName);
    expect(names).toEqual(['本人', '本人(インポート)', '本人(インポート2)']);
    // 全員のidが異なること(表示名が同じでも別人物として扱われること)
    expect(new Set(result.persons.map((p) => p.id)).size).toBe(3);
  });

  it('表示名が重複しなければそのまま追加される', async () => {
    const current: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z')] };
    const incoming: AppData = { ...emptyAppData(), persons: [makePerson('p2', '配偶者', '2026-01-01T00:00:00.000Z')] };
    const result = applyImport(current, incoming, 'addAsNew');
    expect(result.persons.map((p) => p.displayName).sort()).toEqual(['本人', '配偶者']);
  });
});

describe('buildImportPreview', () => {
  it('replaceモードでは追加・更新・削除の内訳を返す', async () => {
    const current: AppData = {
      ...emptyAppData(),
      persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z'), makePerson('p2', '削除される人', '2026-01-01T00:00:00.000Z')],
    };
    const incomingData: AppData = { ...emptyAppData(), persons: [makePerson('p1', '本人', '2026-02-01T00:00:00.000Z'), makePerson('p3', '新規', '2026-01-01T00:00:00.000Z')] };
    const preview = buildImportPreview(current, { data: incomingData, originalSchemaVersion: 1 }, 'replace', 'test.json');
    expect(preview.added.map((p) => p.id)).toEqual(['p3']);
    expect(preview.updated.map((p) => p.id)).toEqual(['p1']);
    expect(preview.removed.map((p) => p.id)).toEqual(['p2']);
  });

  it('originalSchemaVersionと現行が異なればmigrationAppliedがtrueになる', () => {
    const current = emptyAppData();
    const incomingData = emptyAppData();
    const preview = buildImportPreview(current, { data: incomingData, originalSchemaVersion: 0 }, 'merge', 'old.json');
    expect(preview.migrationApplied).toBe(true);
  });
});

describe('buildExportPayload', () => {
  it('personIds指定時はその人物のみを含める', () => {
    const root: AppData = {
      ...emptyAppData(),
      persons: [makePerson('p1', '本人', '2026-01-01T00:00:00.000Z'), makePerson('p2', '配偶者', '2026-01-01T00:00:00.000Z')],
    };
    const payload = buildExportPayload(root, { personIds: ['p1'], includeSettings: true });
    expect(payload.persons.map((p) => p.id)).toEqual(['p1']);
    expect(payload.activePersonId).toBeNull();
  });
});
