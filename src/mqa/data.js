// ============================================================
// MQA (기능 QA · 모바일 앱) 네비게이션 설정 · 초기 데이터 (단일 출처)
// 대상(앱) → 환경 · 테스트 기기(러너 · 단말) · 스위트 · 케이스 · 실행 계획 · 실행 이력 — 범용 샘플 (고객사 이름 없음)
//   스위트가 케이스를 ID 로 가리키고(s.items), 계획이 스위트를 ID 로 가리킨다(p.suiteIds) — 이름을 바꿔도 연결이 끊기지 않는다
// ============================================================
import { LayoutDashboard, Plug, Layers, Code2, ClipboardList, Play, FileText, History, GitCompare, Activity, Smartphone } from "lucide-react";
import * as PF from "./perfLogic.js";
import * as PR from "./perfRun.js";

export const MQA_SECTIONS = [
  { group: "모니터링", items: [
    { id: "mqa-dashboard", label: "대시보드", icon: LayoutDashboard },
  ] },
  { group: "준비 · 설계", items: [
    /* 먼저 있어야 하는 것이 위 — 기기(앱 실행 확인이 단말을 쓴다) → 대상·환경 → 케이스 → 케이스를 묶는 스위트 → 계획 */
    { id: "mqa-devices", label: "테스트 기기", icon: Smartphone },
    { id: "mqa-targets", label: "대상·환경", icon: Plug },
    { id: "mqa-cases", label: "테스트케이스", icon: Code2 },
    { id: "mqa-suites", label: "테스트 스위트", icon: Layers },
    { id: "mqa-plan", label: "실행 계획", icon: ClipboardList },
  ] },
  { group: "실행 · 분석", items: [
    { id: "mqa-run", label: "실행", icon: Play },
    { id: "mqa-history", label: "실행 이력", icon: History },
    { id: "mqa-regression", label: "회귀 비교", icon: GitCompare },
    { id: "mqa-flaky", label: "불안정(Flaky)", icon: Activity },
  ] },
];
export const MQA_HIDDEN = [
  { id: "mqa-result-detail", label: "결과 상세", icon: FileText, group: "실행 · 분석" },
];


/* ── 대상(앱) · 환경 — 특정 고객사·서비스명이 아닌 범용 샘플 ──
   환경 = 테스트할 앱 버전(빌드) + 테스트 계정. 앱 파일 작업은 화면에서 즉시 반영된다.
   '기본 테스트 버전' 은 두지 않는다 — 버전은 쓰는 곳(케이스 편집 · 실행 계획)에서 고르고, 최신은 빌드 번호로 계산한다 (builds.js)
   앱 실행 확인 결과는 버전마다 남긴다 (build.check) */
const MB = 1048576;
export const INIT_MQA_SYSTEMS = [
  { id: 1, name: "샘플 쇼핑 앱", platforms: ["Android"], envs: [
    /* 🔑 apiBase·apiTokenRef — UI 와 섞인 케이스가 서버를 확인할 때 쓴다.
       check.url 은 WebView 화면 주소지 API 가 아니다. 케이스는 이 값을 모르고
       실행할 때 proba.resource 로 주입된다("케이스는 환경을 모른다"). */
    { env: "스테이징", prod: false, deploy: { mode: "수동" },
      apiBase: "https://api-stg.example.com", apiTokenRef: "${stg_api_token}",
      app: { platform: "Android", appId: "com.example.shop", builds: [
        { id: "B-102", ver: "3.2.0", code: 30200, minSdk: 26, file: "shop-stg-3.2.0.apk", size: 78.4 * MB, at: "2026-10-29 16:32", by: "박지영", note: "보안 기능 해제 테스트 빌드",
          check: { st: "확인됨", at: "2026-10-29 16:40", device: "Galaxy S23 · Android 14", ver: "3.2.0", secs: 6.8, launch: "com.example.shop.MainActivity", native: { n: 5, ids: 5 }, web: true, webview: "130", url: "https://m-stg.example.com/main" },
          _sim: { web: true, url: "https://m-stg.example.com/main" } },
        { id: "B-101", ver: "3.1.4", code: 30104, minSdk: 26, file: "shop-stg-3.1.4.apk", size: 77.9 * MB, at: "2026-10-20 10:05", by: "박지영", note: "", _sim: { web: true, url: "https://m-stg.example.com/main" } },
      ] },
      accts: [
        { role: "일반", acct: "qa_user01", secretRef: "${stg_test_pw}" },
        { role: "로그인 전용", acct: "qa_login01", secretRef: "${stg_test_pw}" },
      ] },
  ] },
  { id: 2, name: "샘플 멤버십 앱", platforms: ["Android"], envs: [
    { env: "스테이징", prod: false, deploy: { mode: "수동" },
      apiBase: "", apiTokenRef: "",   // 아직 안 받은 환경 — API 스텝을 쓰면 실행 전에 채워야 한다
      app: { platform: "Android", appId: "com.example.membership", builds: [
        { id: "B-201", ver: "1.8.0", code: 10800, minSdk: 28, file: "membership-stg-1.8.0.apk", size: 41.3 * MB, at: "2026-10-27 11:48", by: "이민준", note: "", _sim: { web: false, url: "https://membership-stg.example.com/home" } },
      ] },
      accts: [
        { role: "일반", acct: "qa_member01", secretRef: "${stg_test_pw}" },
      ] },
  ] },
];
/* ── 스위트 — 위에서부터 순서대로 실행하는 흐름 (suiteLogic.js)
   로그인이 필요하면 1번에 로그인 케이스. 서로 무관한 검증은 스위트를 작게 나눈다. 케이스는 여러 스위트에서 재사용 */
export const INIT_MQA_SUITES = [
  { id: 1, name: "로그인", desc: "로그인 단독 확인", systemId: 1, acctRole: "일반", items: ["TC-001"] },
  { id: 2, name: "상품 탐색", desc: "검색·상품 상세 — 로그인 없이", systemId: 1, acctRole: "", items: ["TC-002"] },
  /* 서로 무관한 검증은 나눈다 — 비우기가 실패해도 담기·서버 반영은 따로 확인된다 */
  { id: 3, name: "장바구니 비우기", desc: "로그인 → 장바구니 비우기", systemId: 1, acctRole: "일반", items: ["TC-001", "TC-006"] },
  { id: 7, name: "담기 · 서버 반영", desc: "로그인 → 담기 → 서버 장바구니 확인", systemId: 1, acctRole: "일반", items: ["TC-001", "TC-008"] },
  /* 승인 전 케이스가 있어 실행할 수 없는 스위트 — 계획에 넣으면 이유가 보인다 */
  { id: 4, name: "주문 내역", desc: "로그인 → 주문 내역", systemId: 1, acctRole: "일반", items: ["TC-001", "TC-004"] },
  { id: 5, name: "검색 후 담기", desc: "로그인 → 검색 → 담기", systemId: 1, acctRole: "일반", items: ["TC-001", "TC-007"] },
  /* Full-Code 도 본문만 — 앱 열기·닫기는 스위트가 하므로 Low-Code 뒤에 이어 붙일 수 있다 */
  { id: 6, name: "연속 담기", desc: "로그인 → 가져온 스크립트로 3개 연속 담기", systemId: 1, acctRole: "일반", items: ["TC-001", "TC-005"] },
];
/* ── 테스트케이스 — 정본 3단: proc(자연어 절차) → steps(실행 스텝) → .robot(화면에서 생성)
   step: { id, n(연결된 절차 번호), act, loc, val, why(미확정 사유) } · 확정/미확정은 저장하지 않고 계산한다
   status: 초안 → 검토중 → 승인 (FQA 와 동일) · level: Low-Code | Full-Code (FQA 와 같은 관리 수준, 단방향)
   재사용: 케이스는 스위트에 순서대로 넣어 재사용한다 — 케이스는 스위트를 모른다 (suiteLogic.js)
   baseBuild: 생성 기준 앱 버전 */
const P = "id=com.example.shop:id/";
export const INIT_MQA_CASES = [
  { id: "TC-001", name: "로그인", systemId: 1, tags: "smoke", status: "승인", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", lastDry: { at: "10:12", build: "3.2.0", env: "스테이징", result: "통과" },
    proc: [{ t: "하단 마이 탭을 누른다", e: "" }, { t: "아이디와 비밀번호를 입력한다", e: "" }, { t: "로그인 버튼을 누른다", e: "\"로그아웃\"이 보인다" }],
    steps: [
      { id: "s101", n: 1, act: "탭", loc: "accessibility_id=마이 탭" },
      { id: "s102", n: 2, act: "입력", loc: P + "input_id", val: "${계정 ID}" },
      { id: "s103", n: 2, act: "입력", loc: P + "input_pw", val: "${계정 비밀번호}" },
      { id: "s104", n: 3, act: "탭", loc: P + "btn_login" },
      { id: "s105", n: 3, act: "화면 확인", val: "로그아웃" },
    ] },
  { id: "TC-002", name: "상품 검색 결과 확인", systemId: 1, tags: "smoke,regression", status: "검토중", origin: "TC 임포트", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "",
    proc: [{ t: "검색창을 누른다", e: "" }, { t: "\"립밤\"을 입력한다", e: "\"수분 립밤\"이 보인다" }],
    steps: [
      { id: "s201", n: 1, act: "탭", loc: P + "search_bar" },
      { id: "s202", n: 2, act: "입력", loc: P + "search_bar", val: "립밤" },
      { id: "s203", n: 2, act: "화면 확인", val: "수분 립밤" },
    ] },
  { id: "TC-003", name: "장바구니 담기", systemId: 1, tags: "regression", status: "초안", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "",
    proc: [{ t: "검색창을 누른다", e: "" }, { t: "\"립밤\"을 입력한다", e: "결과 목록이 뜬다" }, { t: "두 번째 상품을 연다", e: "" }, { t: "장바구니 담기를 누른다", e: "담기 완료 안내가 뜬다" }],
    steps: [
      { id: "s301", n: 1, act: "탭", loc: P + "search_bar" },
      { id: "s302", n: 2, act: "입력", loc: P + "search_bar", val: "립밤" },
      { id: "s303", n: 2, act: "화면 확인", val: "수분 립밤" },
      { id: "s304", n: 3, act: "탭", loc: "", why: "화면에서 요소를 특정하지 못함" },
      { id: "s305", n: 4, act: "탭", loc: P + "btn_add_cart" },
      { id: "s306", n: 4, act: "화면 확인", val: "장바구니에 담았습니다" },
    ] },
  { id: "TC-004", name: "로그인 후 주문 내역을 연다", systemId: 1, tags: "", status: "초안", origin: "TC 임포트", level: "Low-Code", code: "", mismatch: false, baseBuild: "",
    note: "테스트 관리 도구 CSV에서 가져온 절차입니다. 로그인은 절차에 쓰지 말고, 스위트에서 로그인 케이스 뒤에 두세요(주문 내역 스위트).",
    pre: "",
    proc: [{ t: "로그인한다", e: "" }, { t: "마이 탭을 누른다", e: "" }, { t: "주문 내역을 누른다", e: "\"주문 내역\"이 보인다" }],
    steps: [] },
  /* 흐름용 케이스 — 로그인은 하지 않는다. 스위트에서 로그인 케이스 뒤에 둔다 (예전에는 로그인 스텝을 복사해 들고 있었다) */
  { id: "TC-006", name: "장바구니 비우기", systemId: 1, tags: "", status: "승인", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", lastDry: { at: "10:20", build: "3.2.0", env: "스테이징", result: "통과" },
    proc: [{ t: "장바구니 탭에서 전체 삭제를 누른다", e: "\"장바구니가 비어 있습니다\"가 보인다" }],
    steps: [
      { id: "s605", n: 1, act: "탭", loc: "accessibility_id=장바구니" },
      { id: "s606", n: 1, act: "탭", loc: P + "btn_cart_clear" },
      { id: "s607", n: 1, act: "화면 확인", val: "장바구니가 비어 있습니다" },
    ] },
  /* 이전 버전(v3.1.4)에서 만든 케이스 — v3.2.0 에서 '장바구니 담기' 버튼 ID가 바뀌어 4번 스텝에서 실패한다
     정식 실행(계획 '야간 회귀')에서는 원인 '요소 변경' + 로케이터 보정 제안(btn_cart_add → btn_add_cart)이 뜬다 */
  { id: "TC-007", name: "검색 후 첫 상품 담기", systemId: 1, tags: "regression", status: "승인", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.1.4",
    pre: "",
    proc: [{ t: "검색창에 \"립밤\"을 입력한다", e: "" }, { t: "첫 번째 상품을 연다", e: "" }, { t: "장바구니 담기를 누른다", e: "\"장바구니에 담았습니다\"가 보인다" }],
    steps: [
      { id: "s701", n: 1, act: "탭", loc: P + "search_bar", el: "검색창" },
      { id: "s702", n: 1, act: "입력", loc: P + "search_bar", el: "검색창", val: "립밤" },
      { id: "s703", n: 2, act: "탭", loc: "accessibility_id=product_0", el: "상품 카드 1" },
      { id: "s704", n: 3, act: "탭", loc: P + "btn_cart_add", el: "장바구니 담기 버튼" },
      { id: "s705", n: 3, act: "화면 확인", val: "장바구니에 담았습니다" },
    ] },
  /* 🔑 UI 와 API 가 섞인 케이스 — 화면 토스트는 "프론트가 보여준 것" 까지만 말한다.
     서버에 실제로 담겼는지는 API 로 확인해야 안다. UI 만 보면 조용히 통과한다. */
  { id: "TC-008", name: "장바구니 담기 · 서버 반영 확인", systemId: 1, tags: "regression", status: "승인", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", lastDry: { at: "10:31", build: "3.2.0", env: "스테이징", result: "통과" },
    proc: [{ t: "상품 상세에서 장바구니 담기를 누른다", e: "\"장바구니에 담았습니다\"가 보인다" }, { t: "서버 장바구니를 조회한다", e: "담긴 상품이 1건이다" }],
    steps: [
      { id: "s801", n: 1, act: "탭", loc: P + "btn_add_cart", el: "장바구니 담기 버튼" },
      { id: "s802", n: 1, act: "화면 확인", val: "장바구니에 담았습니다" },
      { id: "s803", n: 2, act: "요청", loc: "GET /v1/cart", save: "cnt = $.items.length" },
      { id: "s804", n: 2, act: "응답 검증", loc: "상태코드", val: "200" },
      { id: "s805", n: 2, act: "응답 검증", loc: "$.items.length", val: "1" },
    ] },
  { id: "TC-005", name: "상품 3개 연속 담기", systemId: 1, tags: "", status: "초안", origin: "스크립트 임포트", level: "Full-Code", mismatch: false, baseBuild: "",
    note: "Full-Code로 가져옴 — 반복·조건·변수 대입 포함",
    pre: "", proc: [], steps: [],
    code: "*** Settings ***\nLibrary    AppiumLibrary\nResource    proba.resource    # 앱 실행 · 계정 변수 (실행 시 자동 주입)\n\n*** Test Cases ***\n상품 3개 연속 담기\n    FOR    ${i}    IN RANGE    3\n        Click Element    xpath=//android.view.ViewGroup[${i}+1]\n        Click Element    id=com.example.shop:id/btn_add_cart\n        Go Back\n    END" },
];

/* _sim (목업 전용) — 실제로는 저장하지 않는다. '앱 실행 확인' 이 단말에서 읽어 오는 값을 흉내 내기 위한 것
     web: 웹 영역(WebView 디버깅)에 연결되는가 · url: 첫 화면에서 열린 웹 주소
   단말 webview: 단말의 WebView(Chrome) 버전 — 실제로는 러너가 단말에서 읽는다 */
/* ── 테스트 기기 — 러너(사용자 PC 상주 에이전트) · 연결된 단말 ──
   11층 QA PC 를 고객사로 가정한 샘플. 단말 1대는 USB 디버깅 승인 전 상태(화면 흐름 확인용).
   단말 필드: adb(인식) · auth(USB 디버깅 허용) · helper(자동화 준비 — 러너가 Appium 도우미를 설치: true/false/null=미점검) · busy(점유 중인 작업, 없으면 null) */
export const INIT_MQA_RUNNERS = [
  { id: "R-1", name: "11층 QA PC", host: "QA-PC-11F", os: "Windows 11", status: "연결됨", lastSeen: "방금 전", pkg: "0.1.0",
    registeredAt: "2026-10-30 14:20", registeredBy: "박지영", checks: { server: true, appium: true },
    devices: [
      { id: "D-1", model: "Galaxy S23", maker: "Samsung", sdk: 34, serial: "R3CT40XXXXX", adb: true, auth: true, helper: true, busy: null, webview: "130", connectedAt: "2026-10-30 14:25", tier: "고사양", power: false },
      { id: "D-2", model: "Pixel 7", maker: "Google", sdk: 33, serial: "2B191FDH20XXXX", adb: true, auth: false, helper: null, busy: null, webview: "129", connectedAt: "2026-10-30 14:31", tier: "고사양", power: true },
    ] },
];
/* 실행용 PC — 상시 켜 두고 예약 실행을 맡는다 (저작은 개인 PC 에서)
   단말의 tier(성능 등급) · power(전력 측정 가능)는 성능 측정 계획이 기기를 고를 때 쓴다 — 기능 실행에는 영향이 없다
   · tier: 사람이 정한다 (고사양 / 중사양 / 저사양)
   · power: 러너가 점검 때 알아낸다 (기기의 전력 측정 칩 — 주로 Pixel 6 이후) */
INIT_MQA_RUNNERS.push(
  { id: "R-2", name: "10층 실행 PC", host: "QA-RUN-10F", os: "Windows 11", status: "연결됨", lastSeen: "방금 전", pkg: "0.1.0",
    registeredAt: "2026-10-31 09:10", registeredBy: "박지영", checks: { server: true, appium: true },
    devices: [
      { id: "D-3", model: "Galaxy A54", maker: "Samsung", sdk: 34, serial: "R5CW30XXXXX", adb: true, auth: true, helper: true, busy: null, webview: "128", connectedAt: "2026-10-31 09:14", tier: "중사양", power: false },
      { id: "D-5", model: "Galaxy S24", maker: "Samsung", sdk: 35, serial: "R3DX55XXXXX", adb: true, auth: true, helper: true, busy: null, webview: "131", connectedAt: "2026-10-31 09:15", tier: "고사양", power: false },
      { id: "D-4", model: "Galaxy A15", maker: "Samsung", sdk: 34, serial: "R9KX12XXXXX", adb: true, auth: true, helper: true, busy: null, webview: "128", connectedAt: "2026-10-31 09:16", tier: "저사양", power: false },
    ] },
);
/* ── 실행 계획 · 실행 이력 (한 바퀴 확인용 샘플) ──
   계획은 앱 · 환경 · 버전(buildId — 빈 값 = 최신, 지정하면 그 버전으로 고정) + 스위트 + 실행 단말 1대 + 예약
   이력: v3.1.4 에서 통과 → v3.2.0 으로 올린 뒤 TC-006 이 한 번 대기 시간 초과로 실패(불안정) */
export const INIT_MQA_PLANS = [
  { id: 1, name: "야간 회귀 · 스테이징", systemId: 1, env: "스테이징", buildId: "", suiteIds: [2, 3, 7, 5], runnerId: "R-2", devIds: ["D-3"], retry: 1, onfail: "계속 진행", gate: 90, status: "활성", schedule: { mode: "schedule", freq: "daily", time: "02:00", dow: 1, dom: 1, cron: "0 2 * * *", tz: "Asia/Seoul", active: true, ev: {}, summary: "매일 02:00" }, createdBy: "박지영", createdAt: "2026-10-31 09:20", updatedBy: "박지영", updatedAt: "2026-10-31 09:20" },
  /* 성능 측정 계획 — 같은 앱 · 스위트 · 기기를 쓴다. 등급별 단말 3대 · 앱 시작(콜드 · 웜) + 스위트 케이스별 · 합격 기준이 게이트 */
  { id: 2, name: "릴리스 성능 · 스테이징", purpose: "성능", systemId: 1, env: "스테이징", buildId: "", suiteIds: [5], runnerId: "R-2", devIds: ["D-5", "D-3", "D-4"], retry: 0, onfail: "계속 진행", gate: 0, status: "활성",
    perf: { items: { start: ["콜드", "웜"], idle: 0, cases: true }, metrics: ["start", "jank", "slow", "mem", "cpu", "crash", "size"],
      criteria: { app: { size: 120 }, "start:콜드": { start: 900, mem: 320 }, "start:웜": { start: 400 }, "TC-007": { jank: 8, slow: 32, mem: 400 } },
      cond: { iters: 10, warmup: 1, clearData: true, compile: "설치 상태 그대로", maxTemp: 40, minBatt: 30, cvWarn: 10, cvBad: 20 } },
    schedule: { mode: "event", freq: "daily", time: "02:00", dow: 1, dom: 1, cron: "0 2 * * *", tz: "Asia/Seoul", active: true, ev: { newBuild: true }, summary: "새 버전" }, createdBy: "이민준", createdAt: "2026-11-20 10:00", updatedBy: "이민준", updatedAt: "2026-11-20 10:00" },
];
const st = (act, name, s, val) => ({ act, name, val: val || "", st: s || "통과", msg: "" });
const TC1 = (s) => ({ id: "TC-001", name: "로그인", st: s || "통과", steps: [st("탭", "마이 탭"), st("입력", "아이디 입력칸", "통과", "${계정 ID}"), st("입력", "비밀번호 입력칸", "통과", "${계정 비밀번호}"), st("탭", "로그인 버튼"), st("화면 확인", "\"로그아웃\"")] });
/* fail === "warn" → 1차 실패 후 재시도에서 통과 (경고 · 불안정 신호) */
const TC6 = (fail) => fail === "warn" ? ({ id: "TC-006", name: "장바구니 비우기", st: "경고", retried: 1, warnMsg: "1차 실패 후 재시도에서 통과 — 요소를 찾지 못했습니다 (10초 대기 초과)",
  steps: [st("탭", "장바구니 탭"), st("탭", "전체 삭제"), st("화면 확인", "\"장바구니가 비어 있습니다\"")] }) : ({ id: "TC-006", name: "장바구니 비우기", st: fail ? "실패" : "통과", ...(fail ? { failStep: 2, failMsg: "요소를 찾지 못했습니다 — 10초 동안 기다렸지만 화면에 없습니다", retried: 1 } : {}),
  steps: [st("탭", "장바구니 탭"), fail ? { ...st("탭", "전체 삭제", "실패"), msg: "요소를 찾지 못했습니다" } : st("탭", "전체 삭제"), fail ? st("화면 확인", "\"장바구니가 비어 있습니다\"", "실행 안 함") : st("화면 확인", "\"장바구니가 비어 있습니다\"")] });
const RUN = (id, build, at, end, trig, cases) => ({ id, planId: 1, planName: "야간 회귀 · 스테이징", systemId: 1, sysName: "샘플 쇼핑 앱", env: "스테이징", build, runnerId: "R-2", devIds: ["D-3"], devId: "D-3", device: "Galaxy A54 — 10층 실행 PC", trigger: trig, status: "완료", startedAt: at, endedAt: end, gate: 90, retry: 1, note: "", cases, log: [] });
/* API 스텝에서 실패한 회차 — 화면은 성공했는데 서버 반영이 안 됐다.
   UI 만 봤으면 '통과' 로 끝났을 실패이고, 원인은 앱이 아니라 백엔드로 간다(judgeOf 참고). */
const TC8 = (fail) => ({ id: "TC-008", name: "장바구니 담기 · 서버 반영 확인", st: fail ? "실패" : "통과",
  ...(fail ? { failStep: 4, failMsg: "응답 상태코드 500 — 기대 200", retried: 1 } : {}),
  steps: [
    st("탭", "장바구니 담기 버튼"),
    st("화면 확인", "\"장바구니에 담았습니다\""),   // 프론트는 성공했다고 말한다
    st("요청", "GET /v1/cart"),
    fail ? { ...st("응답 검증", "상태코드", "실패"), msg: "응답 상태코드 500 — 기대 200" } : st("응답 검증", "상태코드"),
    fail ? st("응답 검증", "$.items.length", "실행 안 함") : st("응답 검증", "$.items.length"),
  ] });
/* 실행 행 = (스위트, 케이스). 계획의 스위트 순서대로 — 실행 불가 스위트는 건너뜀 + 이유로 남는다 */
const IN = (su, c) => ({ ...c, key: su.id + ":" + c.id, suiteId: su.id, suiteName: su.name, acctRole: su.acctRole });
const S2 = { id: 2, name: "상품 탐색", acctRole: "" }, S3 = { id: 3, name: "장바구니 비우기", acctRole: "일반" }, S7 = { id: 7, name: "담기 · 서버 반영", acctRole: "일반" }, S5 = { id: 5, name: "검색 후 담기", acctRole: "일반" };
const TC7 = () => ({ id: "TC-007", name: "검색 후 첫 상품 담기", st: "통과", steps: [st("탭", "검색창"), st("입력", "검색창", "통과", "립밤"), st("탭", "상품 카드 1"), st("탭", "장바구니 담기 버튼"), st("화면 확인", "\"장바구니에 담았습니다\"")] });
const TC2SKIP = () => ({ id: "TC-002", name: "상품 검색 결과 확인", st: "건너뜀", skipWhy: "실행 불가 — 1번 TC-002 승인 전", steps: [] });
const ROWS = (f6, f8) => [IN(S2, TC2SKIP()), IN(S3, TC1()), IN(S3, TC6(f6)), IN(S7, TC1()), IN(S7, TC8(f8)), IN(S5, TC1()), IN(S5, TC7())];   // 계획 1 의 스위트 순서 [2, 3, 7, 5]
export const INIT_MQA_RUNS = [
  RUN("MRUN-003", "3.2.0", "2026-11-02 02:00", "2026-11-02 02:01", "예약", ROWS(false, false)),
  /* 한 회차에 원인이 둘 — 요소 변경(UI)과 백엔드 결함(API). 담당자가 갈리는 것을 보여준다 */
  RUN("MRUN-002", "3.2.0", "2026-11-01 02:00", "2026-11-01 02:02", "예약", ROWS(true, true)),
  RUN("MRUN-001", "3.1.4", "2026-10-31 02:00", "2026-10-31 02:01", "예약", ROWS("warn", false)),   // TC-006 재시도 통과 (경고)
];
/* ── 성능 측정 실행 시드 — 계획 2(릴리스 성능). v3.1.4 → v3.2.0 에서 콜드 시작이 느려져 저사양(A15)이 기준을 넘는다
   값은 고정 난수로 만든다 (새로고침해도 같은 숫자) */
const _rng = (seed) => { let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; };
const _P2 = INIT_MQA_PLANS.find((p) => p.id === 2);
const _P2_CASES = [{ id: "TC-001", name: "로그인" }, { id: "TC-007", name: "검색 후 첫 상품 담기" }];
const _PDEV = { "D-5": { model: "Galaxy S24", tier: "고사양", sdk: 35, runner: "10층 실행 PC", power: false }, "D-3": { model: "Galaxy A54", tier: "중사양", sdk: 34, runner: "10층 실행 PC", power: false }, "D-4": { model: "Galaxy A15", tier: "저사양", sdk: 34, runner: "10층 실행 PC", power: false } };
/* opt: fail { "단말:항목": 사유 } · noisy { "단말:항목": 지표 } · phaseDrift (시작 단계 중 늘어난 단계) */
const _PRUN = (id, build, at, end, drift, sizeDrift, seed, opt = {}) => {
  const perf = _P2.perf, rnd = _rng(seed);
  const items = PF.itemKeys(perf, _P2_CASES).filter((it) => it.kind !== "app");
  const subs = _P2.devIds.map((did, k) => { const d = { id: did, ..._PDEV[did] };
    const its = items.map((it) => { const fk = did + ":" + it.key; const fail = (opt.fail || {})[fk] || null;
      const m = PR.measureItem(it, PF.metricsFor(perf, it.kind), d, perf.cond, drift, rnd, { fail, noise: (opt.noisy || {})[fk] ? 0.9 : 0, noisyMetric: (opt.noisy || {})[fk], phaseDrift: opt.phaseDrift });
      const j = fail ? { over: [], judged: false } : PR.judgeItem(perf, it.key, m.vals);
      return { key: it.key, label: it.label, kind: it.kind, vals: m.vals, iters: m.iters, cv: m.cv, phases: m.phases, jankCause: m.jankCause, fail: m.fail || null, over: j.over, judged: j.judged, trace: PR.traceName(id, d, it) }; });
    const total = items.length * (perf.cond.iters + perf.cond.warmup);
    return { devId: did, model: d.model, tier: d.tier, sdk: d.sdk, runnerId: "R-2", runner: d.runner, power: d.power, st: "완료", why: "", batt: 70 + k * 9, temp: Math.round((32.1 + k * 0.6) * 10) / 10, items: its, prog: total, total };
  });
  const run = { id, purpose: "성능", planId: 2, planName: _P2.name, systemId: 1, sysName: "샘플 쇼핑 앱", env: "스테이징", build, trigger: "새 버전", status: "완료", startedAt: at, endedAt: end, elapsed: 0, phase: "", runnerId: "R-2", devIds: _P2.devIds, device: "Galaxy S24 외 2대 — 10층 실행 PC", devId: _P2.devIds[0], perf, cond: perf.cond, cases: [], subs, app: PR.appSize(perf, build, sizeDrift), log: [{ lv: "INFO", t: "성능 측정 — 시드" }] };
  run.verdict = PR.runVerdict(run);
  return run;
};
INIT_MQA_RUNS.push(
  /* v3.2.0 — 콜드 시작이 느려졌고(앱 초기화 단계가 늘어남) · A15 에서 TC-007 이 측정 중 실패 · A54 의 TC-001 프레임 값이 흔들림 */
  _PRUN("MRUN-005", "3.2.0", "2026-11-02 03:00", "2026-11-02 03:12", { start: 1.16, cpu: 1.1 }, 1.03, 7,
    { fail: { "D-4:TC-007": "케이스 실패 — 스텝 3 · 요소를 찾지 못했습니다 (10초 대기 초과)" }, noisy: { "D-3:TC-001": "jank" }, phaseDrift: { bind: 1.45 } }),
  _PRUN("MRUN-004", "3.1.4", "2026-10-31 03:00", "2026-10-31 03:11", {}, 1, 3),
  /* 추이용 이전 빌드 — 3.1.0 에서 메모리가 잠깐 늘었다가 3.1.4 에서 돌아온다 */
  _PRUN("MRUN-007", "3.1.0", "2026-10-24 03:00", "2026-10-24 03:11", { mem: 1.12 }, 0.99, 11),
  _PRUN("MRUN-006", "3.0.2", "2026-10-17 03:00", "2026-10-17 03:10", { start: 0.97 }, 0.97, 5),
);
INIT_MQA_RUNS.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));   // 최신이 앞
/* ── 결함 시드 (공통 '결함' 목록에 합쳐진다 · App.jsx) — 성능 불합격 하나를 등록한 상태.
   실행 쪽 run.defects 는 '어느 결과에서 등록했나' 의 연결만 (키 → 결함 번호). 결함 본문 · 상태는 공통 목록이 갖는다 */
export const INIT_MQA_DEFECTS = [
  { key: "SHOP-1881", tc: "앱 시작 · 콜드", target: "샘플 쇼핑 앱", domain: "MQA", perf: true, project: "SHOP", run: "MRUN-005", sev: "Major", status: "Open", assignee: "이민준",
    title: "Galaxy A15 콜드 시작 기준 초과 (v3.2.0 · 1224ms / 기준 900ms)", desc: "성능 측정: 릴리스 성능 · 스테이징 (MRUN-005)\n단말: Galaxy A15 (저사양)\n앱 시작 · 콜드 — 시작 시간 1224ms (기준 900ms)\n직전 빌드 대비 시작 단계 중 bind 구간 증가",
    steps: "1. 앱 데이터 초기화\n2. 콜드 시작 10회 (첫 회 버림)", expected: "중앙값 900ms 이하", actual: "중앙값 1224ms", evidence: ["Perfetto 트레이스"],
    createdBy: "이민준", createdAt: "2026-11-02 09:30", updatedBy: "이민준", updatedAt: "2026-11-02 09:30" },
];
{ const r = INIT_MQA_RUNS.find((x) => x.id === "MRUN-005"); if (r) r.defects = { "start:콜드|D-4|start": "SHOP-1881" }; }

