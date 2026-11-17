// ============================================================
// MQA 스위트 — 위에서부터 순서대로 실행하는 흐름 하나 (방식 구분 없음)
//   suite { id, name, desc, systemId, acctRole, items: [caseId...] }
//   · 앱을 한 번 열고 순서대로 이어서 실행한다. 앞 케이스가 끝난 화면·데이터에서 다음 케이스가 시작한다
//   · 앞이 실패하면 뒤는 건너뜀 (앞 단계가 시작 상태를 만들기 때문)
//   · 로그인이 필요하면 1번에 로그인 케이스를 둔다. 서로 무관한 검증은 스위트를 작게 나눈다
//   · 케이스는 스위트를 모른다 — 한 케이스(로그인 등)를 여러 스위트에서 재사용한다
//   · 앱 열기·닫기는 스위트가 한다 — Full-Code 도 본문만 두므로 어디에나 넣을 수 있다
// ============================================================
const byId = (cases) => { const m = {}; (cases || []).forEach((c) => { m[c.id] = c; }); return m; };

export const usesCase = (s, id) => (s.items || []).includes(id);
export const suitesOfCase = (suites, id) => (suites || []).filter((s) => usesCase(s, id));
export const suiteCases = (s, cases) => { const m = byId(cases); return (s.items || []).map((id) => m[id]).filter(Boolean); };
export const suiteNamesOf = (suites, id) => suitesOfCase(suites, id).map((s) => s.name);

/* 넣을 수 있는가 — 같은 앱이면 된다 (로케이터가 앱마다 다르다) */
export const canJoin = (s, c) => !!c && c.systemId === s.systemId;

/* 실행할 수 없는 이유 — 없으면 "". 🔴 조용히 빼지 않는다: 중간 하나가 빠지면 뒤가 엉뚱한 상태에서 시작한다 */
export const suiteBlock = (s, cases) => {
  const m = byId(cases), items = s.items || [];
  if (!items.length) return "케이스가 없습니다";
  const i = items.findIndex((id) => !m[id] || m[id].status !== "승인");
  if (i >= 0) return (i + 1) + "번 " + items[i] + (m[items[i]] ? " 승인 전" : " 삭제됨");
  return "";
};

/* 계획이 돌릴 케이스 (중복 제거 — 대상 건수 · 버전 확인용). 실행 가능한 스위트만 통째로 */
export const planSuites = (p, suites) => (suites || []).filter((s) => (p.suiteIds || []).includes(s.id) && s.systemId === p.systemId);
export const suiteRunCases = (p, s, cases) => (suiteBlock(s, cases) ? [] : suiteCases(s, cases));
export const casesOfPlanSuites = (p, cases, suites) => {
  const seen = new Set(), out = [];
  planSuites(p, suites).forEach((s) => suiteRunCases(p, s, cases).forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }));
  return out;
};
export const planSuiteNotes = (p, suites, cases) => planSuites(p, suites).map((s) => ({ s, block: suiteBlock(s, cases) }));

/* ── 실행 단위 — 스위트 순서대로 (스위트, 케이스). 같은 케이스가 두 스위트에 있으면 두 번 돈다
   🔴 실행 못 하는 것도 '건너뜀 + 이유' 로 남긴다 (F9 — 사라진 것을 통과로 세지 않는다)
     · 스위트 실행 불가(승인 전 · 삭제됨) → 그 스위트의 케이스 전부 건너뜀
     · 격리된 케이스 → 그 케이스와 뒤가 건너뜀 (앞 단계 격리) */
export const runItems = (p, cases, suites, onlySuites) => {
  const out = [];
  planSuites(p, suites).forEach((s) => {
    const base = { suiteId: s.id, suiteName: s.name, acctRole: s.acctRole || "" };
    const block = suiteBlock(s, cases);
    let broken = "";
    suiteCases(s, cases).forEach((c) => {
      if (block) { out.push({ ...base, c, skip: "실행 불가 — " + block }); return; }
      if (!broken && c.quarantined) { out.push({ ...base, c, skip: "격리됨" }); broken = "앞 단계 격리 (" + c.id + ")"; return; }
      out.push({ ...base, c, ...(broken ? { skip: broken } : {}) });
    });
  });
  if (!onlySuites) return out;
  /* 다시 실행 — 실패한 스위트만 처음부터 (앞 단계가 시작 상태를 만든다).
     🔑 케이스 ID 로 고르지 않는다 — 로그인처럼 여러 스위트에 든 케이스가 한 곳에서 실패해도 나머지 스위트까지 돌게 된다 */
  return out.filter((it) => onlySuites.includes(it.suiteId));
};
/* 계획의 스위트가 쓰는 계정 역할이 그 환경에 있는가 — 없으면 ${계정 ID} 가 비어 로그인이 실패한다 */
export const missingRoles = (p, suites, cases, env) => planSuites(p, suites)
  .filter((s) => s.acctRole && !suiteBlock(s, cases) && !((env && env.accts) || []).some((a) => a.role === s.acctRole))
  .map((s) => ({ s, role: s.acctRole }));
