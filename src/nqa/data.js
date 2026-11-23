import { LayoutDashboard, Plug, Code2, ClipboardList, Play, History, TrendingUp } from "lucide-react";

/* 부하(NQA) 메뉴 IA — 다른 도메인과 같은 모니터링 / 준비·설계 / 실행·분석 골격.
   앱·웹 성능 상수는 PQA 분리(2026-07) 때 옮겨졌고 잔재를 제거했다. */
export const NQA_SECTIONS = [
  { group: "모니터링", items: [
    { id: "nqa-dashboard", label: "대시보드", icon: LayoutDashboard },
  ] },
  { group: "준비 · 설계", items: [
    { id: "nqa-targets", label: "환경", icon: Plug },
    { id: "nqa-scenarios", label: "부하 테스트", icon: Code2 },
  ] },
  { group: "실행 · 분석", items: [
    { id: "nqa-run", label: "측정 실행", icon: Play },
    { id: "nqa-history", label: "실행 이력", icon: History },
  ] },
];

/* 부하(v1) — 서버 엔드포인트 자극(HTTP). 기능 QA와 완전 독립. */
export const NQA_HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];
export const NQA_AUTH_TYPES = ["Bearer 토큰", "API Key", "OAuth 2.0 (client credentials)", "없음"];
// (시크릿은 공통 "변수" 화면에서 관리·참조)
/* 🔑 부하 생성기는 전용 VM 1대다 (N4) — k6는 단일 프로세스로 전 코어를 쓰므로
   한 머신에 여러 개를 띄우면 서로 경합한다. 워커를 늘리려면 VM을 늘려야 한다.
   따라서 동시 실행은 1건이고, 워커 수라는 선택지 자체가 없다. */
export const NQA_CONCURRENCY = 1;
export const NQA_LOAD_UNITS = ["가상 사용자(VU)", "도착률(RPS)"];
export const NQA_LOAD_SHAPES = [
  { id: "스테디", label: "스테디", hint: "일정 부하 유지 — 기준 성능 확인" },
  { id: "램프업", label: "램프업", hint: "점진 증가 — 한계·변곡점 탐색" },
  { id: "스파이크", label: "스파이크", hint: "순간 급증 — 급변 대응·복구력" },
  { id: "스트레스", label: "스트레스(계단)", hint: "계단식 증가 — 포화점까지" },
  { id: "소크", label: "소크(내구)", hint: "장시간 유지 — 누수·성능 저하" },
];

/* 성능 QA 하위 워크스페이스 — 부하(서버 부하). 앱 성능은 앱 테스트의 '성능 측정' 계획으로 옮겼다 (adb · Perfetto). 필드(RUM)는 벤더 콘솔·전문 APM과 중복·저ROI로 제외. */
export const NQA_SUBTYPES = [
  { id: "load", label: "부하", ready: true },
];


/* 부하 시나리오 시드 — 대상(nqaSystems)과 sutId로 연결. 비율 혼합은 endpoints 가중치 사용, 순차 진행은 journey 순서 참조. 워크로드는 상관 유무로 자동 판정(forceOrder로 수동 순차). */
export const INIT_NQA_SCENARIOS = [
  { id: 1, name: "커머스 로그인 순차 부하", sutId: 1, unit: "가상 사용자(VU)", shape: "램프업", peak: 800, rampUp: 5, sustain: 20, rampDown: 3, thinkTime: 3, dataset: "accounts_10k", forceOrder: false, sla: { p95: 1500, p99: 2500, errRate: 1.0, minRps: 600 }, endpoints: [{ method: "GET", path: "/v1/products", weight: 50, headers: [], body: "", expect: 200, extracts: [] }, { method: "POST", path: "/v1/auth/login", weight: 30, headers: [{ k: "Content-Type", v: "application/json" }], body: '{ "phone": "${row.phone}", "pw": "${row.pw}" }', expect: 200, extracts: [{ var: "token", path: "$.data.token" }, { var: "userId", path: "$.data.userId" }] }, { method: "GET", path: "/v1/users/${userId}", weight: 20, headers: [{ k: "Authorization", v: "Bearer ${token}" }], body: "", expect: 200, extracts: [] }], journey: [{ method: "POST", path: "/v1/auth/login" }, { method: "GET", path: "/v1/users/${userId}" }, { method: "GET", path: "/v1/products" }] },
  { id: 2, name: "커머스 조회 혼합 부하", sutId: 1, unit: "도착률(RPS)", shape: "스테디", peak: 1500, maxVU: 2000, rampUp: 3, sustain: 15, rampDown: 2, thinkTime: 1, dataset: "", forceOrder: false, sla: { p95: 800, p99: 1500, errRate: 0.5, minRps: 1200 }, endpoints: [{ method: "GET", path: "/v1/products", weight: 60, headers: [], body: "", expect: 200, extracts: [] }, { method: "GET", path: "/v1/users/me", weight: 40, headers: [{ k: "Authorization", v: "Bearer ${stg_onmarket_token}" }], body: "", expect: 200, extracts: [] }], journey: [] },
  { id: 3, name: "예약 오픈 스파이크", sutId: 2, unit: "가상 사용자(VU)", shape: "스파이크", peak: 400, baseline: 80, spikeHold: 30, rampUp: 1, sustain: 5, rampDown: 1, thinkTime: 2, dataset: "", forceOrder: false, sla: { p95: 1200, p99: 2000, errRate: 2.0, minRps: 300 }, endpoints: [{ method: "GET", path: "/v1/availability", weight: 70, headers: [], body: "", expect: 200, extracts: [] }, { method: "POST", path: "/v1/reservations", weight: 30, headers: [{ k: "Content-Type", v: "application/json" }, { k: "Authorization", v: "Bearer ${stg_booking_token}" }], body: '{ "slotId": "S-1001", "seats": 2 }', expect: 201, extracts: [] }], journey: [] },
  { id: 4, name: "커머스 용량 한계 측정", sutId: 1, unit: "도착률(RPS)", shape: "스트레스", peak: 3500, start: 500, step: 500, steps: 6, stepHold: 3, maxVU: 3000, thinkTime: 1, dataset: "", forceOrder: false, sla: { p95: 1500, p99: 2500, errRate: 2.0, minRps: 2000 }, endpoints: [{ method: "GET", path: "/v1/products", weight: 70, headers: [], body: "", expect: 200, extracts: [] }, { method: "GET", path: "/v1/users/me", weight: 30, headers: [{ k: "Authorization", v: "Bearer ${stg_onmarket_token}" }], body: "", expect: 200, extracts: [] }], journey: [] },
  { id: 5, name: "예약 내구 부하(소크)", sutId: 2, unit: "가상 사용자(VU)", shape: "소크", peak: 200, soakH: 4, rampUp: 2, sustain: 10, rampDown: 2, thinkTime: 3, dataset: "", forceOrder: false, sla: { p95: 1000, p99: 1800, errRate: 0.5, minRps: 150 }, endpoints: [{ method: "GET", path: "/v1/availability", weight: 60, headers: [], body: "", expect: 200, extracts: [] }, { method: "GET", path: "/v1/reservations", weight: 40, headers: [{ k: "Authorization", v: "Bearer ${stg_booking_token}" }], body: "", expect: 200, extracts: [] }], journey: [] },
];



/* 실행 회차 — 부하 테스트를 1회 돌린 인스턴스 + 결과 + SLA 판정. 이력·추이가 파생.
   (계획 계층 없음 — 부하 테스트가 곧 실행 단위다)
/* 이전 주석: 계획을 1회 돌린 실행 인스턴스(회차) + 결과 + SLA 판정. 이력·추이가 파생. */
export const INIT_NQA_RUNS = [
  { id: "RUN-0715-21", scnId: 2, no: 2, startedAt: "2026-07-15 22:00", endedAt: "2026-07-15 22:15", durationSec: 900, status: "완료", by: "이민준", result: { rps: 1460, errRate: 0.3, p50: 135, p95: 780, p99: 1210, throughput: 1455, totalReq: 1314000, verdict: "판정 없음", gateResult: "판정 없음", target: 1500, shortfall: 2.7, breaches: [], cond: { unit: "도착률(RPS)", shape: "스테디", peak: 1500, maxVU: 2000, gen: "1.4.0", sig: "6e93b0" } } },
  { id: "RUN-0714-03", scnId: 1, no: 3, startedAt: "2026-07-14 02:10", endedAt: "2026-07-14 02:38", durationSec: 1680, status: "완료", by: "야간 배치", result: { rps: 650, errRate: 0.6, p50: 250, p95: 1410, p99: 2160, throughput: 648, totalReq: 1092000, gateResult: "통과", target: 800, shortfall: 0, cond: { unit: "가상 사용자(VU)", shape: "램프업", peak: 800, gen: "1.4.0", sig: "a41f7c" }, verdict: "합격", breaches: [] } },
  { id: "RUN-0712-11", scnId: 4, no: 1, startedAt: "2026-07-12 03:00", endedAt: "2026-07-12 03:18", durationSec: 1080, status: "완료", by: "노경원", result: { rps: 2600, errRate: 1.1, p50: 420, p95: 1380, p99: 2150, throughput: 2580, totalReq: 2808000, gateResult: "통과", target: 3500, shortfall: 0, cond: { unit: "도착률(RPS)", shape: "스트레스", peak: 3500, maxVU: 3000, gen: "1.4.0", sig: "2b58ef" }, verdict: "합격", breaches: [] } },
  { id: "RUN-0710-07", scnId: 3, no: 1, startedAt: "2026-07-10 14:30", endedAt: "2026-07-10 14:37", durationSec: 420, status: "완료", by: "이벤트(배포)", result: { rps: 350, errRate: 3.2, p50: 380, p95: 1450, p99: 2400, throughput: 344, totalReq: 147000, gateResult: "실패", target: 400, shortfall: 0, cond: { unit: "가상 사용자(VU)", shape: "스파이크", peak: 400, gen: "1.4.0", sig: "c17d24" }, verdict: "불합격", breaches: ["p95 1450 > 1200ms", "에러율 3.2 > 2.0%"] } },
  { id: "RUN-0708-15", scnId: 5, no: 1, startedAt: "2026-07-08 22:00", endedAt: "2026-07-09 02:00", durationSec: 14400, status: "완료", by: "야간 배치", result: { rps: 160, errRate: 0.3, p50: 210, p95: 920, p99: 1650, throughput: 159, totalReq: 2304000, gateResult: "통과", target: 200, shortfall: 0, cond: { unit: "가상 사용자(VU)", shape: "소크", peak: 200, gen: "1.4.0", sig: "9d0a63" }, verdict: "합격", breaches: [] } },
  { id: "RUN-0707-02", scnId: 1, no: 2, startedAt: "2026-07-07 02:10", endedAt: "2026-07-07 02:38", durationSec: 1680, status: "완료", by: "야간 배치", result: { rps: 610, errRate: 1.4, p50: 320, p95: 1720, p99: 2680, throughput: 604, totalReq: 1024800, gateResult: "실패", target: 800, shortfall: 0, cond: { unit: "가상 사용자(VU)", shape: "램프업", peak: 800, gen: "1.4.0", sig: "a41f7c" }, verdict: "불합격", breaches: ["p95 1720 > 1500ms", "에러율 1.4 > 1.0%"] } },
  { id: "RUN-0705-01", scnId: 2, no: 1, startedAt: "2026-07-05 22:00", endedAt: "2026-07-05 22:15", durationSec: 900, status: "완료", by: "이민준", result: { rps: 1495, errRate: 0.2, p50: 120, p95: 720, p99: 1120, throughput: 1491, totalReq: 1345500, verdict: "합격", gateResult: "통과", target: 1500, shortfall: 0, breaches: [], cond: { unit: "도착률(RPS)", shape: "스테디", peak: 1500, maxVU: 2000, gen: "1.4.0", sig: "6e93b0" } } },
  { id: "RUN-0630-01", scnId: 1, no: 1, startedAt: "2026-06-30 02:10", endedAt: "2026-06-30 02:38", durationSec: 1680, status: "완료", by: "야간 배치", result: { rps: 660, errRate: 0.5, p50: 240, p95: 1340, p99: 2050, throughput: 658, totalReq: 1108800, gateResult: "통과", target: 800, shortfall: 0, cond: { unit: "가상 사용자(VU)", shape: "램프업", peak: 800, gen: "1.4.0", sig: "a41f7c" }, verdict: "합격", breaches: [] } },
];

/* 부하 대상(SUT) 시드 — 베이스 URL · 부하 생성기 · 인증. */
export const INIT_NQA_SYSTEMS = [
  { id: 1, name: "커머스 API 부하", subtype: "load", baseUrl: "https://api-stg.shop.example.com", protocol: "HTTP/HTTPS", loadgen: { tool: "k6" }, auth: { type: "없음" } },
  { id: 2, name: "예약 API 부하", subtype: "load", baseUrl: "https://api-stg.booking.example.com", protocol: "HTTP/HTTPS", loadgen: { tool: "k6" }, auth: { type: "없음" } },
];
