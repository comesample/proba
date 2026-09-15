// ============================================================
// 공통 테마 — 색상 팔레트 · 점수/판정 색상 규칙
// LQA · FQA · NQA 전 도메인 공용 (단일 출처)
// ============================================================

/* 차트·게이지 색상 팔레트
   🔑 sky 가 정식 이름이다. 예전 이름은 teal 이었는데 값은 처음부터 Tailwind sky-500(#0ea5e9)
      이었다 — 이름과 실체가 어긋나면 "teal 계열이니 teal-600 을 써도 되겠지" 같은 오용이 생긴다. */
export const C = {
  ok: "#059669", err: "#dc2626", warn: "#d97706",
  sky: "#0ea5e9", skyDark: "#0284c7", skyFill: "#bae6fd", skyBg: "#e0f2fe",
  blue: "#2563eb", grid: "#e2e8f0", axis: "#94a3b8", surface: "#ffffff", ink: "#334155",
};

/* Recharts 툴팁 공통 스타일 — 화면마다 인라인으로 적던 것을 모았다.
   같은 모양을 네 곳에서 각자 적고 있어 한쪽만 바뀌면 툴팁 생김새가 갈렸다. */
export const TOOLTIP = { background: C.surface, border: "1px solid " + C.grid, borderRadius: 8, color: C.ink };

/* 범주 계열 색 — 여러 계열을 한 차트에 겹칠 때 쓴다 (단말별 추이 등)
   🔴 판정 색(ok·warn·err)을 범주 구분에 재사용하면 안 된다.
      같은 화면에 "빨강 = 불합격"과 "빨강 = 3번째 단말"이 동시에 존재하게 되고,
      계열 순서가 바뀌는 순간 가장 빠른 단말이 빨간 선이 된다.
   sky 명도 단계를 쓰는 이유: 단말은 고사양→저사양처럼 자연스러운 순서가 있어
      명도가 그 순서를 그대로 표현한다. 팔레트 색 종수도 늘지 않는다.
   진한 쪽부터 쓴다 — 계열이 적을 때 대비가 확보된다. */
/* 순서: 900 → 700 → 500 → 300 → 800 → 400.
   계열이 2~4개일 때가 대부분이므로 앞쪽 네 개가 명도 폭을 최대로 벌리도록 배치했다.
   900·800·700 처럼 인접 단계를 앞에 몰면 선 세 개가 거의 같은 색으로 보인다. */
export const SERIES = ["#0c4a6e", "#0369a1", "#0ea5e9", "#7dd3fc", "#075985", "#38bdf8"];

// 판정(PASS/FAIL/WARN) → Badge kind
export const vKind = (v) => (v === "PASS" ? "pass" : v === "FAIL" ? "fail" : "warn");

// 점수(0~100) → 색상 규칙: ≥80 정상(sky) / ≥60 주의(warn) / <60 위험(err)
export const scoreColor = (v) => (v >= 80 ? C.sky : v >= 60 ? C.warn : C.err);

// 상태/속성 값 → Badge kind 매핑 (전 화면 단일 출처)
export const KIND = {
  priority:     { "높음": "fail", "중간": "warn", "낮음": "info" },
  caseStatus:   { "승인": "active", "검토중": "warn", "초안": "draft" },
  targetStatus: { "연결됨": "pass", "오류": "fail", "미확인": "warn" },
  channel:      { "REST API": "info", "Web 대화": "active", "Mobile 앱": "info" },
  trigger:      { "수동": "info", "스케줄": "active", "이벤트": "warn" },
  /* '대기' 가 빠져 있으면 대시보드 최근 실행에서 대기 행의 배지가 색 없이 뜬다.
     실행이 길어질수록 대기 상태가 화면에 보일 확률이 올라간다. */
  runStatus:    { "대기": "info", "진행중": "warn", "완료": "pass", "오류": "fail" },
  severity:     { Critical: "crit", Major: "major", Minor: "minor" },
  issueStatus:  { Open: "fail", "In Progress": "warn", Resolved: "pass" },
  domain:       { LQA: "active", FQA: "info", PQA: "pass", NQA: "warn" },
  userStatus:   { "활성": "pass", "대기": "warn", "차단": "fail" },
  modelStatus:  { "활성": "pass", "비활성": "draft" },
  tenantStatus: { "활성": "pass", "정지": "fail" },
  plan:         { Enterprise: "active", Team: "info", Trial: "draft" },
};
