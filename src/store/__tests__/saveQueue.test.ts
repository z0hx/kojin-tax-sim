import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAppData, type AppData } from '../../persistence/types';

/**
 * fake-indexeddbはfake timers(vi.useFakeTimers)と組み合わせるとコールバックが解決されず
 * ハングすることがあるため、saveQueue単体のテストではrepositoryをモックし、
 * デバウンス・直列化・ロックの挙動のみを検証する(実際の永続化はrepository.test.ts側で検証済み)。
 */
const saveAppDataMock = vi.fn(async (_data: AppData) => {});

vi.mock('../../persistence/repository', () => ({
  saveAppData: (data: AppData) => saveAppDataMock(data),
}));

import {
  DEBOUNCE_MS,
  cancelPendingTimer,
  flushNow,
  recordSaved,
  resetSaveQueueForTests,
  run,
  schedule,
  setSavingListener,
  withLock,
} from '../saveQueue';

function dataWith(personCount: number): AppData {
  return { ...emptyAppData(), persons: Array.from({ length: personCount }, (_, i) => ({ id: `p${i}` }) as never) };
}

describe('saveQueue', () => {
  beforeEach(() => {
    resetSaveQueueForTests();
    saveAppDataMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSaveQueueForTests();
  });

  it('scheduleはDEBOUNCE_MS経過後に保存する(それまでは保存されない)', async () => {
    const data = dataWith(1);
    schedule(data);
    expect(saveAppDataMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saveAppDataMock).toHaveBeenCalledTimes(1);
    expect(saveAppDataMock).toHaveBeenCalledWith(data);
  });

  it('連続scheduleはタイマーを再設定し、最後のdataのみ保存する(T-29相当)', async () => {
    const data1 = dataWith(1);
    const data2 = dataWith(2);
    schedule(data1);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    schedule(data2);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    expect(saveAppDataMock).not.toHaveBeenCalled(); // 最初のタイマーからまだDEBOUNCE_MS経過していない
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    expect(saveAppDataMock).toHaveBeenCalledTimes(1);
    expect(saveAppDataMock).toHaveBeenCalledWith(data2);
  });

  it('cancelPendingTimerは保留中のタイマーを実行せずに破棄する', async () => {
    schedule(dataWith(1));
    cancelPendingTimer();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saveAppDataMock).not.toHaveBeenCalled();
  });

  it('flushNowは保留タイマーを即座に実行して完了を待つ', async () => {
    const data = dataWith(1);
    schedule(data);
    await flushNow();
    expect(saveAppDataMock).toHaveBeenCalledTimes(1);
    expect(saveAppDataMock).toHaveBeenCalledWith(data);
  });

  it('flushNowは保留タイマーが無い場合、現在実行中の保存の完了を待つ', async () => {
    // gateはmockが実際に呼ばれるタイミング(pending.then()内、マイクロタスク経由)より前に生成しておく。
    // resolveGateをmock実装の中で初めて代入すると、テスト側から同期的に呼んだ時点ではまだ
    // 実際のresolver関数が代入されておらず、空振りしてデッドロックする(実際にハングして判明した)。
    let resolveGate: () => void = () => {};
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });
    saveAppDataMock.mockImplementationOnce(() => gate);
    const p = run(() => saveAppDataMock(dataWith(1)));
    const flushed = flushNow();
    resolveGate();
    await p;
    await flushed;
    expect(saveAppDataMock).toHaveBeenCalledTimes(1);
  });

  it('recordSavedで記録したdataをflushNowが使う(scheduleを介さない直接保存の直後)', async () => {
    const data = dataWith(1);
    recordSaved(data);
    await flushNow();
    expect(saveAppDataMock).toHaveBeenCalledWith(data);
  });

  it('runは直列化され、途中の失敗があっても後続のrunは実行される', async () => {
    const order: string[] = [];
    const p1 = run(async () => {
      order.push('a');
      throw new Error('boom');
    });
    const p2 = run(async () => {
      order.push('b');
    });
    await expect(p1).rejects.toThrow('boom');
    await p2;
    expect(order).toEqual(['a', 'b']);
  });

  it('withLock中はscheduleがタイマーを設定しない(永続化がスキップされる)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const lockPromise = withLock(() => gate);

    schedule(dataWith(2)); // ロック中なのでタイマーは設定されないはず
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saveAppDataMock).not.toHaveBeenCalled();

    release();
    await lockPromise;
  });

  it('isSavingの変化がsetSavingListener経由でtrue→falseの順に通知される', async () => {
    const states: boolean[] = [];
    setSavingListener((s) => states.push(s));
    schedule(dataWith(1));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(states).toEqual([true, false]);
    setSavingListener(undefined);
  });
});
