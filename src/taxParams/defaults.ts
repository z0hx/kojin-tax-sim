/**
 * 税制パラメータの取得に失敗した場合のフォールバック方針(03詳細設計書§8参照)。
 *
 * この方針は「取得できたパラメータで計算を進める」のではなく、fail closedとすること。
 * そのため、このファイルはデフォルトの税制パラメータ値を一切持たない。古い/欠損データで
 * 黙って計算を続行するとR-01・R-10で挙げた「誤った税額の提示」につながるため、
 * fetch自体が失敗した場合(オフライン等)のユーザー向けメッセージの組み立てのみを担う。
 */
export function describeTaxParamsUnavailable(year: number, detail: string): string {
  const hint =
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'オフラインのため取得できません。この端末に利用可能なキャッシュがありません。オンラインになってから再度お試しください。'
      : `取得できません: ${detail}`;
  return `税制パラメータを取得できません(${year}年分)。${hint} 計算結果は表示されません。`;
}
