// ============================================================
// MQA 앱 버전 — '기본 테스트 버전' 없이, 쓰는 곳에서 고른다
//   대상·환경: 버전 목록만 (올리기·삭제 · 버전마다 앱 실행 확인)
//   케이스 편집: 작업 버전을 고른다 (처음엔 최신)
//   실행 계획: 테스트할 버전 = 최신 | 특정 버전 (p.buildId, "" = 최신)
//   🔑 최신 = 빌드 번호(versionCode)가 가장 높은 것 — 사람이 지정하는 값이 아니라 계산한다
// ============================================================
export const buildsOf = (e) => (((e && e.app) || {}).builds || []).slice().sort((a, b) => (b.code || 0) - (a.code || 0));
export const latestBuild = (e) => buildsOf(e)[0] || null;
/* buildId 가 비어 있으면 최신. 지정했는데 지워졌으면 null — 조용히 최신으로 바꾸지 않는다 */
export const resolveBuild = (e, buildId) => (buildId ? buildsOf(e).find((b) => b.id === buildId) || null : latestBuild(e));
export const buildLabel = (e, buildId) => {
  if (!buildId) { const b = latestBuild(e); return "항상 최신 버전" + (b ? " (현재: v" + b.ver + ")" : ""); }
  const b = resolveBuild(e, buildId); return b ? "v" + b.ver + " (" + b.code + ")" : "삭제된 버전";
};

/* 확인된 버전 — 케이스를 만든 버전(baseBuild) + 디버그·정식 실행에서 통과한 버전(verifiedOn) */
export const verifiedVers = (c) => [...new Set([c && c.baseBuild, ...((c && c.verifiedOn) || [])].filter(Boolean))];
/* 이 버전에서 돌려도 되는가 — 기준이 없는 케이스(스텝을 아직 안 만든 것)는 판단하지 않는다 */
export const isVerified = (c, ver) => !c || !c.baseBuild || !ver || verifiedVers(c).includes(ver);
export const withVerified = (c, ver) => (ver && !verifiedVers(c).includes(ver) ? [...((c && c.verifiedOn) || []), ver] : (c && c.verifiedOn) || []);
