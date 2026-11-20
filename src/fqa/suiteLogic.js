// ============================================================
// FQA 스위트 — 위에서부터 순서대로 실행하는 흐름 하나 (MQA suiteLogic 과 같은 규칙)
//   suite { id, name, desc, acctRole, items: [caseId...] }
//   · 브라우저 세션을 한 번 열고 순서대로 이어서 실행한다. 앞 케이스가 끝난 화면 · 로그인 상태에서 다음 케이스가 시작한다
//   · 앞이 실패하면 뒤는 건너뜀 (앞 단계가 시작 상태를 만들기 때문)
//   · 로그인이 필요하면 1번에 로그인 케이스를 둔다. 서로 무관한 검증은 스위트를 작게 나눈다
//   · 케이스는 스위트를 모른다 — 한 케이스(로그인 등)를 여러 스위트에서 재사용한다
//   · 계정 역할은 스위트가 정한다 — 역할이 다른 흐름은 스위트를 나눈다
//   · 데이터셋은 케이스에 둔다 — 그 케이스만 행 수만큼 제자리에서 반복한다 (웹 케이스는 보통 주소 이동으로 시작)
// ============================================================
const byId = (cases) => { const m = {}; (cases || []).forEach((c) => { m[c.id] = c; }); return m; };

export const usesCase = (s, id) => (s.items || []).includes(id);
export const suitesOfCase = (suites, id) => (suites || []).filter((s) => usesCase(s, id));
export const suiteCases = (s, cases) => { const m = byId(cases); return (s.items || []).map((id) => m[id]).filter(Boolean); };
export const suiteNamesOf = (suites, id) => suitesOfCase(suites, id).map((s) => s.name);

/* 실행할 수 없는 이유 — 없으면 "". 🔴 조용히 빼지 않는다: 중간 하나가 빠지면 뒤가 엉뚱한 상태에서 시작한다 */
export const suiteBlock = (s, cases) => {
  const m = byId(cases), items = s.items || [];
  if (!items.length) return "케이스가 없습니다";
  const i = items.findIndex((id) => !m[id] || m[id].status !== "승인");
  if (i >= 0) return (i + 1) + "번 " + items[i] + (m[items[i]] ? " 승인 전" : " 삭제됨");
  return "";
};

/* 계획이 돌릴 케이스 (중복 제거 — 대상 건수 · 사전 검사용). 실행 가능한 스위트만 통째로 */
export const planSuites = (p, suites) => (p.suiteIds || []).map((id) => (suites || []).find((s) => s.id === id)).filter(Boolean);
export const casesOfPlanSuites = (p, cases, suites) => {
  const seen = new Set(), out = [];
  planSuites(p, suites).forEach((s) => { if (suiteBlock(s, cases)) return; suiteCases(s, cases).forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }); });
  return out;
};
export const planSuiteNotes = (p, suites, cases) => planSuites(p, suites).map((s) => ({ s, block: suiteBlock(s, cases) }));
/* 계획이 쓰는 계정 역할 — 실행 가능한 스위트의 역할만 */
export const planRoles = (p, suites, cases) => [...new Set(planSuites(p, suites).filter((s) => s.acctRole && !suiteBlock(s, cases)).map((s) => s.acctRole))];
