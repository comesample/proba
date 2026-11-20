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

/* ── 실행 단위 — 스위트 순서대로 (스위트, 케이스). 같은 케이스가 두 스위트에 있으면 두 번 돈다
   🔴 실행 못 하는 것도 '건너뜀 + 이유' 로 남긴다 (F9 — 사라진 것을 통과로 세지 않는다)
     · 스위트 실행 불가(승인 전 · 삭제됨) → 그 스위트의 케이스 전부 건너뜀
     · 격리된 케이스 → 그 케이스와 뒤가 건너뜀 (앞 단계 격리)
   '앞 단계 실패' 건너뜀은 실행 중에 정해진다 (runLogic.buildTcs) */
export const runItems = (p, cases, suites, onlySuites) => {
  const out = [];
  planSuites(p, suites).forEach((s) => {
    if (onlySuites && !onlySuites.includes(s.id)) return;   // 다시 실행 — 실패한 스위트만 처음부터
    const base = { suiteId: s.id, suiteName: s.name, acctRole: s.acctRole || "" };
    const block = suiteBlock(s, cases);
    const m = byId(cases);
    let broken = "";
    (s.items || []).forEach((id) => {
      const c = m[id] || { id, name: "(삭제된 케이스)" };
      if (block) { out.push({ ...base, c, skip: "실행 불가 — " + block }); return; }
      if (!broken && c.quarantined) { out.push({ ...base, c, skip: "격리됨" }); broken = "앞 단계 격리 (" + c.id + ")"; return; }
      out.push({ ...base, c, ...(broken ? { skip: broken } : {}) });
    });
  });
  return out;
};

/* ── 결과 합치기 — 한 회차에서 같은 케이스가 여러 번 돌면 하나로 본다 (통과율 · 회귀 · 불안정 · 대시보드 · 알림 공통)
   실패 > 경고(재시도 통과) > 보정 > 통과 > 건너뜀. 대표 행(원인 · 보정 · 행 결과 · rev)은 그 판정이 나온 첫 행이다 */
const RANK = { FAIL: 0, WARN: 1, HEAL: 2, PASS: 3, SKIP: 4 };
export const mergedTcs = (run) => {
  const by = {}, order = [];
  ((run && run.tcs) || []).forEach((t) => {
    const cur = by[t.id];
    if (!cur) { by[t.id] = t; order.push(t.id); return; }
    if ((RANK[t.v] != null ? RANK[t.v] : 3) < (RANK[cur.v] != null ? RANK[cur.v] : 3)) by[t.id] = t;
  });
  return order.map((id) => by[id]);
};
export const mergedTc = (run, id) => mergedTcs(run).find((t) => t.id === id) || null;
/* 회차 집계 — 건너뜀은 분모에서 빼고 건수만 따로 센다 */
export const tally = (tcs) => {
  const m = mergedTcs({ tcs });
  const n = (v) => m.filter((t) => t.v === v).length;
  const skip = n("SKIP");
  return { total: m.length - skip, pass: n("PASS") + n("HEAL"), fail: n("FAIL"), warn: n("WARN"), skip };
};
