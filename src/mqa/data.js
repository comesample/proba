// ============================================================
// MQA (기능 QA · 모바일 앱) 네비게이션 설정 · 초기 데이터 (단일 출처)
// 시작 시점: FQA(웹) 구조를 복제한 기획 브랜치. 대상·환경부터 앱 기준 범용 샘플로 정의한다 (나머지 데이터는 아직 비어 있음).
// 재편(2026-07): platform 축 제거 · 환경 멀티 접점(웹/API) · 케이스 상대경로 · 계획 ID참조/다중스위트
//   대상   = 제품(SUT).            환경 = 한 배포본이 노출하는 접점(webUrl/apiUrl) + 공유 계정
//   스위트 = 순수 업무 흐름 묶음.   케이스 = 상대경로 스텝(act가 접점을 결정) — 웹·API 혼합 가능
//   계획   = 환경 1개 바인딩(ID참조) + 스위트 다중 선택 + 실행 옵션
// ============================================================
import { LayoutDashboard, Plug, Layers, Code2, ClipboardList, Play, FileText, History, GitCompare, Activity, Smartphone } from "lucide-react";

export const MQA_SECTIONS = [
  { group: "모니터링", items: [
    { id: "mqa-dashboard", label: "대시보드", icon: LayoutDashboard },
  ] },
  { group: "준비 · 설계", items: [
    { id: "mqa-targets", label: "대상·환경", icon: Plug },
    { id: "mqa-devices", label: "테스트 기기", icon: Smartphone },
    { id: "mqa-suites", label: "테스트 스위트", icon: Layers },
    { id: "mqa-cases", label: "테스트케이스", icon: Code2 },
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

/* ── 스텝 액션 카탈로그 ──────────────────────────────────────
   act가 접점(surface)을 결정한다 — 별도 platform 필드 불필요.
     화면(web) : 이동 · 입력 · 클릭 · 화면 검증   → 환경의 webUrl 주입
     요청(api) : 요청 · 응답 검증                → 환경의 apiUrl 주입
   loc(이동)는 반드시 상대경로("/login") — 절대 URL 금지(환경 주입 불가해짐)

   스텝 필드
     공통      : act · loc · val
     요청(api) : + body(JSON 본문) · headers(예외 헤더만) · save("이름 = $.경로")
                 인증 헤더는 환경의 apiAuth에서 주입 — 케이스에 적지 않는다.
                 save로 저장한 값은 이후 스텝에서 ${이름}으로 참조(웹 스텝 포함).
                 요청은 웹 세션의 쿠키를 공유한다(page.request) — 웹→API 흐름이 성립하는 근거. */
export const WEB_ACTS = ["이동", "입력", "클릭", "선택", "체크", "키 누르기", "화면 검증"];
export const API_ACTS = ["요청", "응답 검증"];
export const STEP_ACTS = [...WEB_ACTS, ...API_ACTS, "코드 스텝"];
export const surfaceOf = (act) => (API_ACTS.includes(act) ? "api" : WEB_ACTS.includes(act) ? "web" : "code");

/* ── 초기 데이터 — 비어 있는 상태로 시작한다 (앱 자동화 기준으로 새로 정의) ── */
/* ── 대상(앱) · 환경 — 특정 고객사·서비스명이 아닌 범용 샘플 ──
   환경 = 테스트할 앱 버전(빌드) + 테스트 계정. 앱 파일 작업은 화면에서 즉시 반영된다.
   env.ver 는 기본 테스트 버전의 버전값 — 실행·계획 화면이 env.ver 를 읽으므로 기본 버전과 항상 같게 둔다. */
const MB = 1048576;
export const INIT_MQA_SYSTEMS = [
  { id: 1, name: "샘플 쇼핑 앱", platforms: ["Android"], envs: [
    { env: "스테이징", prod: false, status: "확인됨", ver: "3.2.0", deploy: { mode: "수동" },
      lastCheck: { at: "2026-10-29 16:40", device: "Galaxy S23 · Android 14", ver: "3.2.0" },
      app: { platform: "Android", appId: "com.example.shop", defBuild: "B-102", builds: [
        { id: "B-102", ver: "3.2.0", code: 30200, minSdk: 26, file: "shop-stg-3.2.0.apk", size: 78.4 * MB, at: "2026-10-29 16:32", by: "박지영", note: "보안 기능 해제 테스트 빌드" },
        { id: "B-101", ver: "3.1.4", code: 30104, minSdk: 26, file: "shop-stg-3.1.4.apk", size: 77.9 * MB, at: "2026-10-20 10:05", by: "박지영", note: "" },
      ] },
      accts: [
        { role: "일반", acct: "qa_user01", secretRef: "${stg_test_pw}" },
        { role: "로그인 전용", acct: "qa_login01", secretRef: "${stg_test_pw}" },
      ] },
  ] },
  { id: 2, name: "샘플 멤버십 앱", platforms: ["Android"], envs: [
    { env: "스테이징", prod: false, status: "미확인", ver: "1.8.0", deploy: { mode: "수동" },
      app: { platform: "Android", appId: "com.example.membership", defBuild: "B-201", builds: [
        { id: "B-201", ver: "1.8.0", code: 10800, minSdk: 28, file: "membership-stg-1.8.0.apk", size: 41.3 * MB, at: "2026-10-27 11:48", by: "이민준", note: "" },
      ] },
      accts: [
        { role: "일반", acct: "qa_member01", secretRef: "${stg_test_pw}" },
      ] },
  ] },
];
/* ── 스위트 — 업무 흐름 묶음 (스위트 메뉴 재설계 전 임시 최소본) ── */
export const INIT_MQA_SUITES = [
  { id: 1, name: "로그인", desc: "로그인·계정" },
  { id: 2, name: "상품 탐색", desc: "검색·상품 상세" },
  { id: 3, name: "주문", desc: "장바구니·주문 내역" },
];
/* ── 테스트케이스 — 정본 3단: proc(자연어 절차) → steps(실행 스텝) → .robot(화면에서 생성)
   step: { id, n(연결된 절차 번호), act, loc, val, why(미확정 사유) } · 확정/미확정은 저장하지 않고 계산한다
   status: 초안 → 검토중 → 승인 (FQA 와 동일) · level: Low-Code | Full-Code (FQA 와 같은 관리 수준, 단방향)
   재사용: 로그인 같은 공통 절차는 케이스로 만들고 다른 케이스의 preCase(전제조건)로 지정한다 (FQA 와 동일)
   baseBuild: 생성 기준 앱 버전 */
const P = "id=com.example.shop:id/";
export const INIT_MQA_CASES = [
  { id: "TC-001", name: "로그인", systemId: 1, suite: "로그인", tags: "smoke", status: "승인", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", preCase: "", acctRole: "일반", lastDry: { at: "10:12", build: "3.2.0", env: "스테이징", result: "통과" },
    proc: [{ t: "하단 마이 탭을 누른다", e: "" }, { t: "아이디와 비밀번호를 입력한다", e: "" }, { t: "로그인 버튼을 누른다", e: "\"로그아웃\"이 보인다" }],
    steps: [
      { id: "s101", n: 1, act: "탭", loc: "accessibility_id=마이 탭" },
      { id: "s102", n: 2, act: "입력", loc: P + "input_id", val: "${계정 ID}" },
      { id: "s103", n: 2, act: "입력", loc: P + "input_pw", val: "${계정 비밀번호}" },
      { id: "s104", n: 3, act: "탭", loc: P + "btn_login" },
      { id: "s105", n: 3, act: "화면 확인", val: "로그아웃" },
    ] },
  { id: "TC-002", name: "상품 검색 결과 확인", systemId: 1, suite: "상품 탐색", tags: "smoke,regression", status: "검토중", origin: "TC 임포트", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", preCase: "",
    proc: [{ t: "검색창을 누른다", e: "" }, { t: "\"립밤\"을 입력한다", e: "\"수분 립밤\"이 보인다" }],
    steps: [
      { id: "s201", n: 1, act: "탭", loc: P + "search_bar" },
      { id: "s202", n: 2, act: "입력", loc: P + "search_bar", val: "립밤" },
      { id: "s203", n: 2, act: "화면 확인", val: "수분 립밤" },
    ] },
  { id: "TC-003", name: "장바구니 담기", systemId: 1, suite: "주문", tags: "regression", status: "초안", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", preCase: "TC-001", acctRole: "일반",
    proc: [{ t: "검색창을 누른다", e: "" }, { t: "\"립밤\"을 입력한다", e: "결과 목록이 뜬다" }, { t: "두 번째 상품을 연다", e: "" }, { t: "장바구니 담기를 누른다", e: "담기 완료 안내가 뜬다" }],
    steps: [
      { id: "s301", n: 1, act: "탭", loc: P + "search_bar" },
      { id: "s302", n: 2, act: "입력", loc: P + "search_bar", val: "립밤" },
      { id: "s303", n: 2, act: "화면 확인", val: "수분 립밤" },
      { id: "s304", n: 3, act: "탭", loc: "", why: "화면에서 요소를 특정하지 못함" },
      { id: "s305", n: 4, act: "탭", loc: P + "btn_add_cart" },
      { id: "s306", n: 4, act: "화면 확인", val: "장바구니에 담았습니다" },
    ] },
  { id: "TC-004", name: "로그인 후 주문 내역을 연다", systemId: 1, suite: "주문", tags: "", status: "초안", origin: "TC 임포트", level: "Low-Code", code: "", mismatch: false, baseBuild: "",
    note: "테스트 관리 도구 CSV에서 가져온 절차입니다. 로그인은 왼쪽 '전제조건'에 로그인 케이스를 지정하세요.",
    pre: "", preCase: "",
    proc: [{ t: "로그인한다", e: "" }, { t: "마이 탭을 누른다", e: "" }, { t: "주문 내역을 누른다", e: "\"주문 내역\"이 보인다" }],
    steps: [] },
  /* 전제조건용 케이스 — 전제조건의 전제조건은 둘 수 없으므로(연쇄 금지) 시작 상태를 혼자 끝까지 만든다: 로그인 + 장바구니 비우기 */
  { id: "TC-006", name: "로그인 · 빈 장바구니로 시작", systemId: 1, suite: "주문", tags: "", status: "승인", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.2.0",
    pre: "", preCase: "", acctRole: "일반", lastDry: { at: "10:20", build: "3.2.0", env: "스테이징", result: "통과" },
    proc: [{ t: "하단 마이 탭을 누른다", e: "" }, { t: "아이디와 비밀번호를 입력하고 로그인한다", e: "" }, { t: "장바구니 탭에서 전체 삭제를 누른다", e: "\"장바구니가 비어 있습니다\"가 보인다" }],
    steps: [
      { id: "s601", n: 1, act: "탭", loc: "accessibility_id=마이 탭" },
      { id: "s602", n: 2, act: "입력", loc: P + "input_id", val: "${계정 ID}" },
      { id: "s603", n: 2, act: "입력", loc: P + "input_pw", val: "${계정 비밀번호}" },
      { id: "s604", n: 2, act: "탭", loc: P + "btn_login" },
      { id: "s605", n: 3, act: "탭", loc: "accessibility_id=장바구니" },
      { id: "s606", n: 3, act: "탭", loc: P + "btn_cart_clear" },
      { id: "s607", n: 3, act: "화면 확인", val: "장바구니가 비어 있습니다" },
    ] },
  /* 이전 버전(v3.1.4)에서 만든 케이스 — v3.2.0 에서 '장바구니 담기' 버튼 ID가 바뀌어 디버그 실행이 4번 스텝에서 실패한다 */
  { id: "TC-007", name: "검색 후 첫 상품 담기", systemId: 1, suite: "주문", tags: "regression", status: "검토중", origin: "직접 작성", level: "Low-Code", code: "", mismatch: false, baseBuild: "3.1.4",
    pre: "", preCase: "TC-001", acctRole: "일반",
    proc: [{ t: "검색창에 \"립밤\"을 입력한다", e: "" }, { t: "첫 번째 상품을 연다", e: "" }, { t: "장바구니 담기를 누른다", e: "\"장바구니에 담았습니다\"가 보인다" }],
    steps: [
      { id: "s701", n: 1, act: "탭", loc: P + "search_bar", el: "검색창" },
      { id: "s702", n: 1, act: "입력", loc: P + "search_bar", el: "검색창", val: "립밤" },
      { id: "s703", n: 2, act: "탭", loc: "accessibility_id=product_0", el: "상품 카드 1" },
      { id: "s704", n: 3, act: "탭", loc: P + "btn_cart_add", el: "장바구니 담기 버튼" },
      { id: "s705", n: 3, act: "화면 확인", val: "장바구니에 담았습니다" },
    ] },
  { id: "TC-005", name: "상품 3개 연속 담기", systemId: 1, suite: "주문", tags: "", status: "초안", origin: "스크립트 임포트", level: "Full-Code", mismatch: false, baseBuild: "",
    note: "Full-Code로 가져옴 — 반복·조건·변수 대입 포함",
    pre: "", preCase: "TC-001", acctRole: "일반", proc: [], steps: [],
    code: "*** Settings ***\nLibrary    AppiumLibrary\nResource    proba.resource    # 앱 실행 · 계정 변수 (실행 시 자동 주입)\nTest Setup    앱 실행\nTest Teardown    Close Application\n\n*** Test Cases ***\n상품 3개 연속 담기\n    FOR    ${i}    IN RANGE    3\n        Click Element    xpath=//android.view.ViewGroup[${i}+1]\n        Click Element    id=com.example.shop:id/btn_add_cart\n        Go Back\n    END" },
];

/* ── 테스트 기기 — 러너(사용자 PC 상주 에이전트) · 연결된 단말 ──
   11층 QA PC 를 고객사로 가정한 샘플. 단말 1대는 USB 디버깅 승인 전 상태(화면 흐름 확인용).
   단말 필드: adb(인식) · auth(USB 디버깅 허용) · helper(Appium 보조 앱 설치: true/false/null=미점검) · busy(점유 중인 작업, 없으면 null) */
export const INIT_MQA_RUNNERS = [
  { id: "R-1", name: "11층 QA PC", role: "저작용", host: "QA-PC-11F", os: "Windows 11", status: "연결됨", lastSeen: "방금 전", pkg: "0.1.0",
    registeredAt: "2026-10-30 14:20", registeredBy: "박지영", checks: { server: true, appium: true },
    devices: [
      { id: "D-1", model: "Galaxy S23", maker: "Samsung", sdk: 34, serial: "R3CT40XXXXX", adb: true, auth: true, helper: true, busy: null, connectedAt: "2026-10-30 14:25" },
      { id: "D-2", model: "Pixel 7", maker: "Google", sdk: 33, serial: "2B191FDH20XXXX", adb: true, auth: false, helper: null, busy: null, connectedAt: "2026-10-30 14:31" },
    ] },
];
/* 실행용 PC — 상시 켜 두고 예약 실행을 맡는다 (저작은 개인 PC 에서) */
INIT_MQA_RUNNERS.push(
  { id: "R-2", name: "10층 실행 PC", role: "실행용", host: "QA-RUN-10F", os: "Windows 11", status: "연결됨", lastSeen: "방금 전", pkg: "0.1.0",
    registeredAt: "2026-10-31 09:10", registeredBy: "박지영", checks: { server: true, appium: true },
    devices: [
      { id: "D-3", model: "Galaxy A54", maker: "Samsung", sdk: 34, serial: "R5CW30XXXXX", adb: true, auth: true, helper: true, busy: null, connectedAt: "2026-10-31 09:14" },
    ] },
);
/* ── 실행 계획 · 실행 이력 (한 바퀴 확인용 샘플) ──
   계획은 앱 · 환경 · 버전(빈 값 = 기본 테스트 버전) + 스위트 · 태그 + 실행 단말 1대 + 예약
   이력: v3.1.4 에서 통과 → v3.2.0 으로 올린 뒤 TC-006 이 한 번 대기 시간 초과로 실패(불안정) */
export const INIT_MQA_PLANS = [
  { id: 1, name: "야간 회귀 · 스테이징", systemId: 1, env: "스테이징", buildId: "", suites: ["로그인", "상품 탐색", "주문"], tags: "", devId: "D-3", retry: 1, onfail: "계속 진행", gate: 90, status: "활성", schedule: { mode: "매일", time: "02:00" }, createdBy: "박지영", createdAt: "2026-10-31 09:20", updatedBy: "박지영", updatedAt: "2026-10-31 09:20" },
];
const st = (act, name, s, val) => ({ act, name, val: val || "", st: s || "통과", msg: "" });
const TC1 = (s) => ({ id: "TC-001", name: "로그인", st: s || "통과", preCase: "", steps: [st("탭", "마이 탭"), st("입력", "아이디 입력칸", "통과", "${계정 ID}"), st("입력", "비밀번호 입력칸", "통과", "${계정 비밀번호}"), st("탭", "로그인 버튼"), st("화면 확인", "\"로그아웃\"")] });
const TC6 = (fail) => ({ id: "TC-006", name: "로그인 · 빈 장바구니로 시작", st: fail ? "실패" : "통과", preCase: "", ...(fail ? { failStep: 6, failMsg: "요소를 찾지 못했습니다 — 10초 동안 기다렸지만 화면에 없습니다", retried: 1 } : {}),
  steps: [st("탭", "마이 탭"), st("입력", "아이디 입력칸", "통과", "${계정 ID}"), st("입력", "비밀번호 입력칸", "통과", "${계정 비밀번호}"), st("탭", "로그인 버튼"), st("탭", "장바구니 탭"), fail ? { ...st("탭", "전체 삭제", "실패"), msg: "요소를 찾지 못했습니다" } : st("탭", "전체 삭제"), fail ? st("화면 확인", "\"장바구니가 비어 있습니다\"", "실행 안 함") : st("화면 확인", "\"장바구니가 비어 있습니다\"")] });
const RUN = (id, build, at, end, trig, cases) => ({ id, planId: 1, planName: "야간 회귀 · 스테이징", systemId: 1, sysName: "샘플 쇼핑 앱", env: "스테이징", build, devId: "D-3", device: "Galaxy A54 (Android 14) — 10층 실행 PC", trigger: trig, status: "완료", startedAt: at, endedAt: end, gate: 90, retry: 1, note: "", cases, log: [] });
export const INIT_MQA_RUNS = [
  RUN("MRUN-003", "3.2.0", "2026-11-02 02:00", "2026-11-02 02:01", "예약", [TC1(), TC6(false)]),
  RUN("MRUN-002", "3.2.0", "2026-11-01 02:00", "2026-11-01 02:02", "예약", [TC1(), TC6(true)]),
  RUN("MRUN-001", "3.1.4", "2026-10-31 02:00", "2026-10-31 02:01", "예약", [TC1(), TC6(false)]),
];
