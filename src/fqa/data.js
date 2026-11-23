import { tally } from "./suiteLogic.js";
// ============================================================
// FQA 시드 데이터 · 네비게이션 설정 (단일 출처)
// 재편(2026-07): platform 축 제거 · 환경 멀티 접점(웹/API) · 케이스 상대경로 · 계획 ID참조/다중스위트
//   대상   = 제품(SUT).            환경 = 한 배포본이 노출하는 접점(webUrl/apiUrl) + 공유 계정
//   스위트 = 순수 업무 흐름 묶음.   케이스 = 상대경로 스텝(act가 접점을 결정) — 웹·API 혼합 가능
//   계획   = 환경 1개 바인딩(ID참조) + 스위트 다중 선택 + 실행 옵션
// ============================================================
import { LayoutDashboard, Plug, Layers, Code2, ClipboardList, Play, FileText, History, GitCompare, Activity } from "lucide-react";

export const FQA_SECTIONS = [
  { group: "모니터링", items: [
    { id: "fqa-dashboard", label: "대시보드", icon: LayoutDashboard },
  ] },
  { group: "준비 · 설계", items: [
    { id: "fqa-targets", label: "대상·환경", icon: Plug },
    { id: "fqa-suites", label: "테스트 스위트", icon: Layers },
    { id: "fqa-cases", label: "테스트케이스", icon: Code2 },
    { id: "fqa-plan", label: "실행 계획", icon: ClipboardList },
  ] },
  { group: "실행 · 분석", items: [
    { id: "fqa-run", label: "실행", icon: Play },
    { id: "fqa-history", label: "실행 이력", icon: History },
    { id: "fqa-regression", label: "회귀 비교", icon: GitCompare },
    { id: "fqa-flaky", label: "불안정(Flaky)", icon: Activity },
  ] },
];
export const FQA_HIDDEN = [
  { id: "fqa-result-detail", label: "결과 상세", icon: FileText, group: "실행 · 분석" },
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

/* ── 대상(제품) · 환경(배포본 = 멀티 접점) ───────────────── */
export const INIT_FQA_SYSTEMS = [
  { id: 1, name: "온마켓", envs: [
    { env: "스테이징", prod: false, status: "연결됨", ver: "v5.12.0-rc",
      webUrl: "https://stg.onmarket.io",
      apiUrl: "https://api-stg.onmarket.io",
      accts: [
        { role: "일반", acct: "qa_user01", secretRef: "${stg_test_pw}" },
        { role: "VIP", acct: "qa_vip01", secretRef: "${stg_test_pw}" },
        { role: "관리자", acct: "qa_admin", secretRef: "${stg_test_pw}" },
        // 로그인 자체만 따로 검증하는 스위트에 쓰는 전용 계정 — 다른 스위트와 동시에 돌아도 세션이 겹치지 않게
        { role: "로그인 전용", acct: "qa_login01", secretRef: "${stg_test_pw}" },
      ],
      apiAuth: { type: "OAuth 2.0 (Client Credentials)", tokenUrl: "https://auth-stg.onmarket.io/oauth2/token", clientId: "proba-runner", clientSecret: "${stg_oauth_secret}", scope: "orders.read orders.write" },
      access: { basicAuth: true, baUser: "stg", baPw: "${stg_basic_pw}", tlsIgnore: true },
      deploy: { mode: "배포 웹훅 알림", verUrl: "", verPath: "$.version", interval: "15분" } },
    { env: "운영", prod: true, status: "연결됨", ver: "v5.11.3",
      webUrl: "https://www.onmarket.io",
      apiUrl: "https://api.onmarket.io",
      accts: [
        { role: "일반", acct: "synth_prod01", secretRef: "${prod_synth_pw}" },
      ],
      apiAuth: { type: "OAuth 2.0 (Client Credentials)", tokenUrl: "https://auth.onmarket.io/oauth2/token", clientId: "proba-runner", clientSecret: "${prod_oauth_secret}", scope: "orders.read" },
      access: { basicAuth: false, baUser: "", baPw: "", tlsIgnore: false },
      deploy: { mode: "배포 웹훅 알림", verUrl: "", verPath: "$.version", interval: "15분" } },
  ] },
  { id: 2, name: "고객센터", envs: [
    { env: "스테이징", prod: false, status: "연결됨", ver: "v2.3.0",
      webUrl: "https://stg-cs.onmarket.io",
      accts: [
        { role: "일반", acct: "cs_qa01", secretRef: "${stg_test_pw}", status: "활성" },
      ],
      access: { basicAuth: false, baUser: "", baPw: "", tlsIgnore: true },
      deploy: { mode: "버전 엔드포인트 폴링", verUrl: "https://stg-cs.onmarket.io/health", verPath: "$.version", interval: "15분" } },
  ] },
];

/* ── 테스트 스위트 = 위에서부터 순서대로 실행하는 흐름 (fqa/suiteLogic.js) ──
   로그인이 필요하면 1번에 로그인 케이스(TC-0031). 계정 역할이 다른 흐름은 스위트를 나눈다.
   케이스는 스위트를 모른다 — TC-0031 은 네 스위트에서 재사용된다 */
export const INIT_FQA_SUITES = [
  { id: 1, name: "로그인 / 인증", desc: "로그인 → 세션 만료", acctRole: "일반", items: ["TC-0031", "TC-0055"] },
  { id: 6, name: "OTP", desc: "로그인 전 — OTP 재발송", acctRole: "", items: ["TC-0203"] },
  { id: 2, name: "회원가입", desc: "가입 폼 검증 (데이터셋 반복)", acctRole: "", items: ["TC-0021"] },
  { id: 3, name: "메인 화면", desc: "로그인 → 배너 → 추천 상품", acctRole: "일반", items: ["TC-0031", "TC-0101", "TC-0102"] },
  /* 같은 결제 흐름이라도 역할이 다르면 나눈다 — VIP 결제 / 일반 계정 쿠폰 */
  { id: 4, name: "결제 / 주문", desc: "로그인(VIP) → 상품 선택(웹) → 결제(API) → 주문 확인", acctRole: "VIP", items: ["TC-0031", "TC-0301"] },
  { id: 7, name: "쿠폰", desc: "로그인 → 쿠폰 적용 상태 반영", acctRole: "일반", items: ["TC-0031", "TC-0156"] },
  /* 토큰 발급을 먼저 — 뒤 요청이 그 토큰을 쓴다. TC-0405(검토중)는 승인 뒤에 넣는다 */
  { id: 5, name: "API 연동", desc: "토큰 발급 → 공개 API 계약 검증", acctRole: "", items: ["TC-0403", "TC-0401", "TC-0402", "TC-0404"] },
];

/* ── 테스트케이스 = 상대경로 스텝 (환경 독립) ─────────────── */
export const INIT_FQA_CASES = [
  /* 케이스는 스위트를 모른다 — 소속 · 순서 · 계정 역할은 스위트(INIT_FQA_SUITES)가 갖는다 */
  { id: "TC-0031", origin: "레코딩", name: "로그인 성공", tags: "smoke,critical", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "이동", loc: "/login", val: "-" },
    { act: "입력", loc: "[data-testid=userid]", val: "${계정 ID}" },
    { act: "입력", loc: "[data-testid=password]", val: "${계정 비밀번호}" },
    { act: "클릭", loc: "role=button[로그인]", val: "-" },
    { act: "화면 검증", loc: "[data-testid=welcome]", val: 'text = "환영합니다"' },
  ] },
  { id: "TC-0203", origin: "레코딩", name: "OTP 재발송", tags: "regression", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "이동", loc: "/login", val: "-" },
    { act: "클릭", loc: "role=button[OTP 재발송]", val: "-" },
    { act: "화면 검증", loc: "[data-testid=otp_msg]", val: 'text = "재발송되었습니다"' },
  ] },
  /* Full-Code = 케이스에 코드가 저장된다(스텝에서 재생성하지 않음). versions에 직전 버전 스냅샷이 쌓인다. */
  { id: "TC-0055", origin: "직접 작성", name: "세션 만료 처리", tags: "regression", status: "승인", level: "Full-Code", dataset: "-", quarantined: false, rev: 3,
    steps: [
      { act: "코드 스텝", loc: "", val: "", code: "await page.context().clearCookies();\nawait page.goto('/my');\nawait expect(page).toHaveURL(/\\/login/);" },
    ],
    code: "import { test, expect } from '@playwright/test';\n\ntest('TC-0055 세션 만료 처리', async ({ page }) => {\n  await page.context().clearCookies();\n  await page.goto('/my');\n  await expect(page).toHaveURL(/\\/login/);\n});",
    /* 리비전 = 그 시점의 전체 스냅샷 (최신이 앞) */
    versions: [
      { rev: 2, at: "2026-06-14 11:20", by: "김지훈", note: "", level: "Full-Code", name: "세션 만료 처리", suiteId: 1, tags: "regression", dataset: "-", acctRole: "",
        steps: [{ act: "코드 스텝", loc: "", val: "", code: "await page.goto('/my');\nawait expect(page).toHaveURL(/\\/login/);" }],
        code: "import { test, expect } from '@playwright/test';\n\ntest('TC-0055 세션 만료 처리', async ({ page }) => {\n  await page.goto('/my');\n  await expect(page).toHaveURL(/\\/login/);\n});" },
      { rev: 1, at: "2026-05-30 09:05", by: "이서연", note: "", level: "Low-Code", name: "세션 만료 확인", suiteId: 1, tags: "", dataset: "-", acctRole: "",
        steps: [
          { act: "이동", loc: "/my", val: "-" },
          { act: "화면 검증", loc: "[data-testid=login-form]", val: "visible = true" },
        ],
        code: "" },
    ] },
  { id: "TC-0021", origin: "레코딩", name: "회원가입 이메일 형식 검증", tags: "regression", status: "승인", level: "Low-Code", dataset: "signup_emails", steps: [
    { act: "이동", loc: "/signup", val: "-" },
    { act: "입력", loc: "[data-testid=email]", val: '"invalid-email"' },
    { act: "클릭", loc: "role=button[다음]", val: "-" },
    { act: "화면 검증", loc: "[data-testid=error]", val: 'text = "올바른 이메일 형식이 아닙니다"' },
  ] },
  { id: "TC-0101", origin: "레코딩", name: "메인 배너 노출", tags: "smoke", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "이동", loc: "/", val: "-" },
    { act: "화면 검증", loc: "[data-testid=main-banner]", val: "visible = true" },
  ] },
  { id: "TC-0102", origin: "레코딩", name: "추천 상품 카드 렌더", tags: "smoke", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "이동", loc: "/", val: "-" },
    { act: "화면 검증", loc: "[data-testid=product-card]", val: "count >= 3" },
  ] },

  /* ★ 혼합 케이스 — 웹으로 담고 → 결제 API 호출 → 다시 웹으로 확인 (한 세션·한 케이스)
     결제 요청은 웹 세션 쿠키를 그대로 쓰므로 장바구니 상태가 이어진다.
     응답의 orderId를 save로 저장해 뒤의 웹 스텝에서 ${orderId}로 사용한다. */
  { id: "TC-0301", origin: "직접 작성", name: "상품 선택(웹) → 결제(API) → 주문 확인(웹)", tags: "critical", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "이동", loc: "/products", val: "-" },
    { act: "클릭", loc: "[data-testid=product-featured]", val: "-" },
    { act: "클릭", loc: "role=button[장바구니 담기]", val: "-" },
    { act: "화면 검증", loc: "[data-testid=cart-count]", val: 'text = "1"' },
    { act: "요청", loc: "POST /v1/orders/checkout", val: "-", body: '{ "payment": "card" }', headers: "", save: "orderId = $.orderId" },
    { act: "응답 검증", loc: "상태코드", val: "200" },
    { act: "응답 검증", loc: "$.orderId", val: "존재" },
    { act: "이동", loc: "/orders/${orderId}", val: "-" },
    { act: "화면 검증", loc: "[data-testid=order-status]", val: 'text = "결제완료"' },
  ] },
  /* 로그인된 상태에서 시작하는 케이스 — 스텝에 로그인이 없다. 검증할 내용만 남는다.
     로그인은 스위트가 1번에 로그인 케이스(TC-0031)를 두어 해결한다 (쿠폰 스위트) */
  { id: "TC-0156", origin: "레코딩", name: "쿠폰 적용 상태 반영", tags: "regression", status: "승인", level: "Low-Code", dataset: "-", quarantined: false,
    // 자연어 절차 — 스텝 n = 절차 번호 (레코딩 뒤 사람이 적어 둔 예)
    proc: [{ t: "내 쿠폰 화면으로 간다", e: "" }, { t: "쿠폰 적용 버튼을 누른다", e: "쿠폰 상태가 '적용됨'으로 바뀐다" }],
    steps: [
    { n: 1, act: "이동", loc: "/my/coupons", val: "-" },
    { n: 2, act: "클릭", loc: "#btn_apply_coupon", val: "-" },
    { n: 2, act: "화면 검증", loc: "[data-testid=coupon_status]", val: 'text = "적용됨"' },
  ] },

  { id: "TC-0401", origin: "API 임포트", name: "사용자 조회", tags: "smoke", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "요청", loc: "GET /v1/users/qa_user01", val: "-", body: "", headers: "", save: "" },
    { act: "응답 검증", loc: "상태코드", val: "200" },
    { act: "응답 검증", loc: "$.name", val: "존재" },
  ] },
  /* 생성 → 저장(userId) → 조회 : save 체이닝 */
  { id: "TC-0402", origin: "API 임포트", name: "사용자 생성 후 조회", tags: "regression", status: "승인", level: "Low-Code", dataset: "signup_emails", steps: [
    { act: "요청", loc: "POST /v1/users", val: "-", body: '{ "name": "${row.name}", "phone": "010-0000-0000" }', headers: "", save: "userId = $.id" },
    { act: "응답 검증", loc: "상태코드", val: "201" },
    { act: "요청", loc: "GET /v1/users/${userId}", val: "-", body: "", headers: "", save: "" },
    { act: "응답 검증", loc: "상태코드", val: "200" },
  ] },
  { id: "TC-0403", origin: "직접 작성", name: "로그인 토큰 발급", tags: "smoke,critical", status: "승인", level: "Full-Code", dataset: "-", steps: [
    { act: "요청", loc: "POST /v1/auth/login", val: "-", body: '{ "id": "${계정 ID}", "pw": "${계정 비밀번호}" }', headers: "", save: "token = $.token" },
    { act: "응답 검증", loc: "상태코드", val: "200" },
    { act: "응답 검증", loc: "$.token", val: "존재" },
  ] },
  { id: "TC-0404", origin: "API 임포트", name: "상품 목록 조회", tags: "smoke", status: "승인", level: "Low-Code", dataset: "-", steps: [
    { act: "요청", loc: "GET /v1/products", val: "-", body: "", headers: "Accept: application/json", save: "" },
    { act: "응답 검증", loc: "상태코드", val: "200" },
    { act: "응답 검증", loc: "$.items", val: "존재" },
  ] },
  { id: "TC-0405", origin: "API 임포트", name: "사용자 삭제", tags: "regression", status: "검토중", level: "Low-Code", dataset: "-", steps: [
    { act: "요청", loc: "DELETE /v1/users/qa_user01", val: "-", body: "", headers: "", save: "" },
    { act: "응답 검증", loc: "상태코드", val: "204" },
  ] },
];

/* ── 실행 이력 ─────────────────────────────────────────────── */
// 데모용 상대 날짜 — 시드가 항상 "오늘/어제" 기준으로 보이도록 (offsetDays: 0=오늘, -1=어제)
/* ═══ 실패 원인 분류 (0단계) ═══
   러너가 실패할 때 뱉는 에러 문장을 규칙으로 훑어 딱지를 붙인다. AI 를 쓰지 않는다.
     로케이터  요소를 못 찾음            → 테스트가 낡았다. 자가보정 대상
     검증      찾았는데 값이 다르다       → 제품 결함 후보. 결함 등록 대상
     타이밍    대기가 부족하다(재시도 통과) → 대기 조건 검토 또는 격리
     환경      연결·인증·5xx             → 인프라. 고칠 사람이 다르다
     기타      규칙이 못 붙였다

   🔑 애매하면 "기타" 로 둔다. 모르는 것을 로케이터로 몰면 틀린 보정 제안이 쏟아진다.
   🔑 자가보정은 "요소 변경" 으로 분류된 실패에만 발동한다 — 그래서 이게 0단계다.
      분류가 없으면 보정을 켤 자리 자체가 없다.
   🔑 원인은 케이스가 아니라 실행에 붙는다. 그 회차에 관측된 사실이기 때문이다(F5).      */
const _rd = (offsetDays, hhmm) => { const t = new Date(); t.setDate(t.getDate() + offsetDays); const z = (n) => String(n).padStart(2, "0"); return t.getFullYear() + "-" + z(t.getMonth() + 1) + "-" + z(t.getDate()) + " " + hhmm; };
/* 실행 행 = (스위트, 케이스) — key 로 구분한다. 같은 케이스(TC-0031)가 여러 스위트에서 돈다.
   앞 케이스가 실패하면 같은 스위트의 뒤 케이스는 SKIP(건너뜀) + 이유. 집계(total · pass …)는 아래 tally 로 케이스 기준 합산 */
const RUNS0 = [
  { id: "FRUN-503", pw: "1.49.1", brVer: "131.0.6778.33", name: "API 스모크", plan: "API 스모크 (스테이징)", planId: 4, suite: "API 연동", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "", trig: "이벤트", by: "CI/CD Bot", status: "완료", prog: 100, progt: "5/5", dur: "0분 9초", at: "오늘 10:30", startedAt: _rd(0, "10:30"), endedAt: _rd(0, "10:30"), total: 5, pass: 3, fail: 2, warn: 0, tcs: [
    { key: "5:TC-0403", suiteId: 5, suiteName: "API 연동", id: "TC-0403", name: "로그인 토큰 발급", rev: 1, v: "PASS", dur: "0.5s" },
    { key: "5:TC-0401", suiteId: 5, suiteName: "API 연동", id: "TC-0401", name: "사용자 조회", rev: 1, v: "PASS", dur: "0.3s" },
    /* 데이터 구동 케이스 — 행 단위로 저장하고 판정은 케이스 단위로 접는다(1행이라도 실패 시 FAIL).
       data는 실행에 쓴 행의 스냅샷이다. 데이터셋을 참조하지 않으므로 데이터셋이 바뀌어도 이 결과는 그대로 유효하다. */
    { key: "5:TC-0402", suiteId: 5, suiteName: "API 연동", id: "TC-0402", name: "사용자 생성 후 조회", rev: 1, v: "FAIL", cause: "API 응답 불일치", dur: "2.6s", ds: "signup_emails", rows: [
      { i: 1, data: { email: "valid@example.com", expected: "pass" }, v: "PASS", dur: "0.4s" },
      { i: 2, data: { email: "invalid-email", expected: "fail" }, v: "PASS", dur: "0.4s" },
      { i: 3, data: { email: "no@dot", expected: "fail" }, v: "FAIL", dur: "0.5s", err: "기대 400 · 실제 201 — 형식 검증 통과됨" },
      { i: 4, data: { email: "user@shop.co.kr", expected: "pass" }, v: "PASS", dur: "0.4s" },
      { i: 5, data: { email: "a@b.c", expected: "fail" }, v: "FAIL", dur: "0.5s", err: "기대 400 · 실제 201 — 최소 도메인 길이 미검증" },
      { i: 6, data: { email: "dup@example.com", expected: "fail" }, v: "PASS", dur: "0.4s" },
    ] },
    { key: "5:TC-0404", suiteId: 5, suiteName: "API 연동", id: "TC-0404", name: "상품 목록 조회", rev: 1, v: "SKIP", skipWhy: "앞 단계 실패 (TC-0402)", dur: "-" },
  ] },
  { id: "FRUN-512", pw: "1.50.0", brVer: "132.0.6834.83", name: "로그인 회귀", plan: "로그인 회귀 (스테이징)", planId: 1, suite: "로그인 / 인증 · OTP", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "Chromium", trig: "수동", by: "QA Engineer", status: "실행 중", prog: 62, progt: "2/3", dur: "3분 12초", at: "방금 전", total: 3, pass: 2, fail: 0, warn: 0, tcs: [] },
  { id: "FRUN-511", pw: "1.49.1", brVer: "131.0.6778.33", name: "결제 회귀", plan: "결제 회귀 (웹+API)", planId: 3, suite: "결제 / 주문 · 쿠폰", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "Chromium", trig: "이벤트", by: "CI/CD Bot", status: "실행 중", prog: 50, progt: "1/3", dur: "5분 02초", at: "방금 전", total: 3, pass: 1, fail: 0, warn: 0, tcs: [] },
  /* 데이터 구동 30행 — 연속 3행 실패로 중단되어 나머지 18행은 미실행이다.
     판정은 케이스 단위 1건(FAIL)이고, 진행 상황은 행 요약으로 드러난다. */
  { id: "FRUN-513", pw: "1.50.0", brVer: "132.0.6834.83", name: "전체 스모크", plan: "전체 스모크 (운영)", planId: 2, suite: "메인 화면 · 회원가입", target: "온마켓 · 운영", ver: "v5.11.3", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "1/1", dur: "4분 18초", at: "오늘 09:15", startedAt: _rd(0, "09:15"), endedAt: _rd(0, "09:19"), total: 1, pass: 0, fail: 1, warn: 0, tcs: [
    { key: "3:TC-0031", suiteId: 3, suiteName: "메인 화면", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "3:TC-0101", suiteId: 3, suiteName: "메인 화면", id: "TC-0101", name: "메인 배너 노출", rev: 1, v: "PASS", dur: "0.6s" },
    { key: "3:TC-0102", suiteId: 3, suiteName: "메인 화면", id: "TC-0102", name: "추천 상품 카드 렌더", rev: 1, v: "PASS", dur: "0.9s" },
    { key: "2:TC-0021", suiteId: 2, suiteName: "회원가입", id: "TC-0021", name: "회원가입 이메일 형식 검증", rev: 1, v: "FAIL", cause: "기대값 불일치", dur: "4분 12초", ds: "signup_emails", stopped: "연속 3행 실패로 중단", rows: [
      { i: 1, data: { email: "valid@example.com", expected: "pass" }, v: "PASS", dur: "0.4s" },
      { i: 2, data: { email: "user.name@shop.co.kr", expected: "pass" }, v: "PASS", dur: "0.4s" },
      { i: 3, data: { email: "invalid-email", expected: "fail" }, v: "PASS", dur: "0.4s" },
      { i: 4, data: { email: "no@dot", expected: "fail" }, v: "PASS", dur: "0.4s" },
      { i: 5, data: { email: "a b@shop.com", expected: "fail" }, v: "PASS", dur: "0.4s" },
      { i: 6, data: { email: "user+tag@example.com", expected: "pass" }, v: "PASS", dur: "0.4s" },
      { i: 7, data: { email: "UPPER@Example.COM", expected: "pass" }, v: "PASS", dur: "0.4s" },
      { i: 8, data: { email: "@nolocal.com", expected: "fail" }, v: "PASS", dur: "0.4s" },
      { i: 9, data: { email: "trail.@shop.com", expected: "fail" }, v: "PASS", dur: "0.4s" },
      { i: 10, data: { email: "a@b.c", expected: "fail" }, v: "FAIL", dur: "0.5s", err: "기대 400 · 실제 201 — 최소 도메인 길이 미검증" },
      { i: 11, data: { email: "x@sub.b.c", expected: "fail" }, v: "FAIL", dur: "0.5s", err: "기대 400 · 실제 201 — 다단 도메인 최소 길이 미검증" },
      { i: 12, data: { email: "q@b.co", expected: "fail" }, v: "FAIL", dur: "0.5s", err: "기대 400 · 실제 201 — 2자 TLD 경계 미검증" },
      { i: 13, data: { email: "user1@example.com", expected: "pass" }, v: "SKIP" },
      { i: 14, data: { email: "user2@example.com", expected: "pass" }, v: "SKIP" },
      { i: 15, data: { email: "user3@example.com", expected: "pass" }, v: "SKIP" },
      { i: 16, data: { email: "user4@example.com", expected: "pass" }, v: "SKIP" },
      { i: 17, data: { email: "user5@example.com", expected: "pass" }, v: "SKIP" },
      { i: 18, data: { email: "user6@example.com", expected: "pass" }, v: "SKIP" },
      { i: 19, data: { email: "user7@example.com", expected: "pass" }, v: "SKIP" },
      { i: 20, data: { email: "user8@example.com", expected: "pass" }, v: "SKIP" },
      { i: 21, data: { email: "user9@example.com", expected: "pass" }, v: "SKIP" },
      { i: 22, data: { email: "bad1@no", expected: "fail" }, v: "SKIP" },
      { i: 23, data: { email: "bad2@no", expected: "fail" }, v: "SKIP" },
      { i: 24, data: { email: "bad3@no", expected: "fail" }, v: "SKIP" },
      { i: 25, data: { email: "bad4@no", expected: "fail" }, v: "SKIP" },
      { i: 26, data: { email: "bad5@no", expected: "fail" }, v: "SKIP" },
      { i: 27, data: { email: "bad6@no", expected: "fail" }, v: "SKIP" },
      { i: 28, data: { email: "bad7@no", expected: "fail" }, v: "SKIP" },
      { i: 29, data: { email: "bad8@no", expected: "fail" }, v: "SKIP" },
      { i: 30, data: { email: "bad9@no", expected: "fail" }, v: "SKIP" },
    ] },
  ] },
  { id: "FRUN-509", pw: "1.49.1", brVer: "131.0.6778.33", name: "전체 스모크", plan: "전체 스모크 (운영)", planId: 2, suite: "메인 화면 · 회원가입", target: "온마켓 · 운영", ver: "v5.11.3", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "대기 중", prog: 0, progt: "대기 #1", dur: "-", at: "-", total: 0, pass: 0, fail: 0, warn: 0, tcs: [] },
  { id: "FRUN-505", pw: "1.49.1", brVer: "131.0.6778.33", name: "전체 스모크", plan: "전체 스모크 (운영)", planId: 2, suite: "메인 화면 · 회원가입", target: "온마켓 · 운영", ver: "v5.11.3", brow: "Chromium", trig: "수동", by: "QA Engineer", status: "완료", prog: 100, progt: "2/2", dur: "2분 41초", at: "어제 18:20", startedAt: _rd(-1, "18:20"), endedAt: _rd(-1, "18:22"), total: 2, pass: 2, fail: 0, warn: 0, tcs: [
    { key: "3:TC-0031", suiteId: 3, suiteName: "메인 화면", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "3:TC-0101", suiteId: 3, suiteName: "메인 화면", id: "TC-0101", name: "메인 배너 노출", rev: 1, v: "PASS", dur: "0.6s" },
    { key: "3:TC-0102", suiteId: 3, suiteName: "메인 화면", id: "TC-0102", name: "추천 상품 카드 렌더", rev: 1, v: "PASS", dur: "0.9s" },
    { key: "2:TC-0021", suiteId: 2, suiteName: "회원가입", id: "TC-0021", name: "회원가입 이메일 형식 검증", rev: 1, v: "PASS", dur: "12.0s" },
  ] },
  { id: "FRUN-510", pw: "1.50.0", brVer: "132.0.6834.83", name: "전체 스모크", plan: "전체 스모크 (운영)", planId: 2, suite: "메인 화면 · 회원가입", target: "온마켓 · 운영", ver: "v5.11.3", brow: "Firefox", trig: "수동", by: "QA Engineer", status: "완료", prog: 100, progt: "2/2", dur: "2분 58초", at: "어제 18:40", startedAt: _rd(-1, "18:40"), endedAt: _rd(-1, "18:43"), total: 2, pass: 2, fail: 0, warn: 0, tcs: [
    { key: "3:TC-0031", suiteId: 3, suiteName: "메인 화면", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "3:TC-0101", suiteId: 3, suiteName: "메인 화면", id: "TC-0101", name: "메인 배너 노출", rev: 1, v: "PASS", dur: "0.7s" },
    { key: "3:TC-0102", suiteId: 3, suiteName: "메인 화면", id: "TC-0102", name: "추천 상품 카드 렌더", rev: 1, v: "PASS", dur: "1.1s" },
    { key: "2:TC-0021", suiteId: 2, suiteName: "회원가입", id: "TC-0021", name: "회원가입 이메일 형식 검증", rev: 1, v: "PASS", dur: "12.0s" },
  ] },
  { id: "FRUN-502", pw: "1.49.1", brVer: "131.0.6778.33", name: "결제 회귀", plan: "결제 회귀 (웹+API)", planId: 3, suite: "결제 / 주문 · 쿠폰", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "2/2", dur: "3분 30초", at: "오늘 11:10", startedAt: _rd(0, "11:10"), endedAt: _rd(0, "11:13"), total: 2, pass: 0, fail: 2, warn: 0, tcs: [
    { key: "4:TC-0031", suiteId: 4, suiteName: "결제 / 주문", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "4:TC-0301", suiteId: 4, suiteName: "결제 / 주문", id: "TC-0301", name: "상품 선택(웹) → 결제(API) → 주문 확인(웹)", rev: 1, v: "FAIL", cause: "요소 변경", dur: "8.4s", heal: { step: "추천 상품 카드", from: "[data-testid=product-featured]", to: "[data-testid=product-card-featured]", why: "data-testid 값만 바뀌었고 같은 위치·같은 태그입니다" } },
    { key: "7:TC-0031", suiteId: 7, suiteName: "쿠폰", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "7:TC-0156", suiteId: 7, suiteName: "쿠폰", id: "TC-0156", name: "쿠폰 적용 상태 반영", rev: 1, v: "FAIL", cause: "기대값 불일치", dur: "1.2s" },
  ] },
  /* 🔑 로케이터가 깨져서 생긴 '지속 실패' — 보정 제안이 결과 화면을 넘어
     불안정 화면·결함 등록까지 흘러가는 경로를 눈으로 볼 수 있게 둔 시드다.
     4일 전(FRUN-497)에는 둘 다 통과했고 그 뒤 두 회차 연속 실패다.
       TC-0301  로케이터가 낡았다 → 보정 제안 있음. 결함으로 올리면 오분류다.
       TC-0156  같은 '지속 실패' 지만 제안이 없다 → 결함 등록이 맞다.
     둘을 같은 목록에 나란히 두어야 "지속 실패라고 다 결함이 아니다" 가 드러난다. */
  { id: "FRUN-500", pw: "1.49.1", brVer: "131.0.6778.33", name: "결제 회귀", plan: "결제 회귀 (웹+API)", planId: 3, suite: "결제 / 주문 · 쿠폰", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "2/2", dur: "3분 26초", at: "어제 09:40", startedAt: _rd(-1, "09:40"), endedAt: _rd(-1, "09:44"), total: 2, pass: 0, fail: 2, warn: 0, tcs: [
    { key: "4:TC-0031", suiteId: 4, suiteName: "결제 / 주문", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "4:TC-0301", suiteId: 4, suiteName: "결제 / 주문", id: "TC-0301", name: "상품 선택(웹) → 결제(API) → 주문 확인(웹)", rev: 1, v: "FAIL", cause: "요소 변경", dur: "8.1s", heal: { step: "추천 상품 카드", from: "[data-testid=product-featured]", to: "[data-testid=product-card-featured]", why: "data-testid 값만 바뀌었고 같은 위치·같은 태그입니다" } },
    { key: "7:TC-0031", suiteId: 7, suiteName: "쿠폰", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "7:TC-0156", suiteId: 7, suiteName: "쿠폰", id: "TC-0156", name: "쿠폰 적용 상태 반영", rev: 1, v: "FAIL", cause: "기대값 불일치", dur: "1.3s" },
  ] },
  { id: "FRUN-497", pw: "1.49.1", brVer: "131.0.6778.33", name: "결제 회귀", plan: "결제 회귀 (웹+API)", planId: 3, suite: "결제 / 주문 · 쿠폰", target: "온마켓 · 스테이징", ver: "v5.11.9-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "2/2", dur: "3분 12초", at: "4일 전 20:30", startedAt: _rd(-4, "20:30"), endedAt: _rd(-4, "20:33"), total: 2, pass: 2, fail: 0, warn: 0, tcs: [
    { key: "4:TC-0031", suiteId: 4, suiteName: "결제 / 주문", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "4:TC-0301", suiteId: 4, suiteName: "결제 / 주문", id: "TC-0301", name: "상품 선택(웹) → 결제(API) → 주문 확인(웹)", rev: 1, v: "PASS", dur: "7.6s" },
    { key: "7:TC-0031", suiteId: 7, suiteName: "쿠폰", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "7:TC-0156", suiteId: 7, suiteName: "쿠폰", id: "TC-0156", name: "쿠폰 적용 상태 반영", rev: 1, v: "PASS", dur: "1.1s" },
  ] },
  { id: "FRUN-499", pw: "1.49.1", brVer: "131.0.6778.33", name: "API 스모크", plan: "API 스모크 (스테이징)", planId: 4, suite: "API 연동", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "", trig: "이벤트", by: "CI/CD Bot", status: "실행 불가", note: "대상 환경에 연결하지 못함", prog: 0, progt: "연결 실패", dur: "-", at: "오늘 08:50", startedAt: _rd(0, "08:50"), endedAt: "-", total: 0, pass: 0, fail: 0, warn: 0, tcs: [] },
  { id: "FRUN-487", pw: "1.49.1", brVer: "131.0.6778.33", name: "로그인 회귀", plan: "로그인 회귀 (스테이징)", planId: 1, suite: "로그인 / 인증 · OTP", target: "온마켓 · 스테이징", ver: "v5.11.9-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "3/3", dur: "3분 22초", at: "6일 전 22:00", startedAt: _rd(-6, "22:00"), endedAt: _rd(-6, "22:03"), total: 3, pass: 2, fail: 0, warn: 1, tcs: [
    { key: "1:TC-0031", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.1s" },
    { key: "1:TC-0055", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0055", name: "세션 만료 처리", rev: 1, v: "PASS", dur: "3.1s" },
    { key: "6:TC-0203", suiteId: 6, suiteName: "OTP", id: "TC-0203", name: "OTP 재발송", rev: 1, v: "WARN", cause: "대기 부족 (불안정)", dur: "1.0s" },
  ] },
  // ── 로그인 회귀 이력 (회귀 비교 · 불안정 시연용) — TC-0203=Flaky, TC-0055=지속 실패 패턴 ──
  { id: "FRUN-501", pw: "1.49.1", brVer: "131.0.6778.33", name: "로그인 회귀", plan: "로그인 회귀 (스테이징)", planId: 1, suite: "로그인 / 인증 · OTP", target: "온마켓 · 스테이징", ver: "v5.11.9-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "3/3", dur: "3분 05초", at: "4일 전 22:00", startedAt: _rd(-4, "22:00"), endedAt: _rd(-4, "22:03"), total: 3, pass: 3, fail: 0, warn: 0, tcs: [
    { key: "1:TC-0031", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "1:TC-0055", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0055", name: "세션 만료 처리", rev: 2, v: "PASS", dur: "3.0s" },
    { key: "6:TC-0203", suiteId: 6, suiteName: "OTP", id: "TC-0203", name: "OTP 재발송", rev: 1, v: "PASS", dur: "1.1s" },
  ] },
  { id: "FRUN-504", pw: "1.49.1", brVer: "131.0.6778.33", name: "로그인 회귀", plan: "로그인 회귀 (스테이징)", planId: 1, suite: "로그인 / 인증 · OTP", target: "온마켓 · 스테이징", ver: "v5.11.9-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "3/3", dur: "3분 18초", at: "3일 전 22:00", startedAt: _rd(-3, "22:00"), endedAt: _rd(-3, "22:04"), total: 3, pass: 1, fail: 2, warn: 0, tcs: [
    { key: "1:TC-0031", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "1:TC-0055", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0055", name: "세션 만료 처리", rev: 2, v: "FAIL", cause: "요소 변경", dur: "3.2s" },
    { key: "6:TC-0203", suiteId: 6, suiteName: "OTP", id: "TC-0203", name: "OTP 재발송", rev: 1, v: "FAIL", cause: "대기 부족 (불안정)", dur: "1.3s" },
  ] },
  { id: "FRUN-506", pw: "1.50.0", brVer: "132.0.6834.83", name: "로그인 회귀", plan: "로그인 회귀 (스테이징)", planId: 1, suite: "로그인 / 인증 · OTP", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "3/3", dur: "3분 09초", at: "2일 전 22:00", startedAt: _rd(-2, "22:00"), endedAt: _rd(-2, "22:03"), total: 3, pass: 2, fail: 1, warn: 0, tcs: [
    { key: "1:TC-0031", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "1:TC-0055", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0055", name: "세션 만료 처리", rev: 3, v: "FAIL", cause: "요소 변경", dur: "3.3s" },
    { key: "6:TC-0203", suiteId: 6, suiteName: "OTP", id: "TC-0203", name: "OTP 재발송", rev: 1, v: "PASS", dur: "1.1s" },
  ] },
  { id: "FRUN-508", pw: "1.50.0", brVer: "132.0.6834.83", name: "로그인 회귀", plan: "로그인 회귀 (스테이징)", planId: 1, suite: "로그인 / 인증 · OTP", target: "온마켓 · 스테이징", ver: "v5.12.0-rc", brow: "Chromium", trig: "스케줄", by: "스케줄", status: "완료", prog: 100, progt: "3/3", dur: "3분 12초", at: "어제 22:00", startedAt: _rd(-1, "22:00"), endedAt: _rd(-1, "22:03"), total: 3, pass: 1, fail: 1, warn: 1, tcs: [
    { key: "1:TC-0031", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0031", name: "로그인 성공", rev: 1, v: "PASS", dur: "1.0s" },
    { key: "1:TC-0055", suiteId: 1, suiteName: "로그인 / 인증", id: "TC-0055", name: "세션 만료 처리", rev: 3, v: "FAIL", cause: "요소 변경", dur: "3.1s" },
    { key: "6:TC-0203", suiteId: 6, suiteName: "OTP", id: "TC-0203", name: "OTP 재발송", rev: 1, v: "WARN", cause: "대기 부족 (불안정)", dur: "1.2s" },
  ] },
];
/* 완료 실행의 집계를 행에서 다시 낸다 — 손으로 적은 숫자가 행과 어긋나지 않게 (suiteLogic.tally) */
export const INIT_FQA_RUNS = RUNS0.map((r) => { if (r.status !== "완료" || !(r.tcs || []).length) return r; const t = tally(r.tcs); return { ...r, ...t, progt: t.total + "/" + t.total }; });

/* ── 실행 계획 = 환경 1개(ID참조) + 스위트 다중 + 실행 옵션 ── */
export const INIT_FQA_PLANS = [
  { id: 1, name: "로그인 회귀 (스테이징)", targetRef: { systemId: 1, env: "스테이징" }, suiteIds: [1, 6], sched: "매일 22:00", schedule: { mode: "schedule", freq: "daily", time: "22:00", dow: 1, dom: 1, cron: "0 22 * * *", tz: "Asia/Seoul", active: true, ev: {}, summary: "매일 22:00" }, status: "활성",
    brow: ["Chromium"], res: "1920×1080", headless: true, video: "실패 시만", timeout: 30, workers: "4", retry: 1, onfail: "계속 진행", gate: 95 },
  { id: 2, name: "전체 스모크 (운영)", targetRef: { systemId: 1, env: "운영" }, suiteIds: [3, 2], sched: "이벤트 · 배포 시", schedule: { mode: "event", freq: "weekly", time: "09:00", dow: 1, dom: 1, cron: "0 9 * * 1", tz: "Asia/Seoul", active: true, ev: { deploy: true }, summary: "이벤트 · 배포 시" }, status: "활성",
    brow: ["Chromium", "Firefox"], res: "1920×1080", headless: true, video: "녹화 안 함", timeout: 30, workers: "auto", retry: 0, onfail: "계속 진행", gate: 98 },
  { id: 3, name: "결제 회귀 (웹+API)", targetRef: { systemId: 1, env: "스테이징" }, suiteIds: [4, 7], sched: "예약 없음", status: "초안",
    brow: ["Chromium"], res: "1440×900", headless: false, video: "전체 녹화", timeout: 30, workers: "2", retry: 2, onfail: "첫 에러 시 중단", gate: 100 },
  /* 회원가입 스위트를 도는 계획 — 데이터 구동 케이스(TC-0021)가 여기 들어온다.
     데이터셋을 지우면 이 계획이 사전 검사에서 막힌다. */
  { id: 5, name: "회원가입 회귀 (스테이징)", targetRef: { systemId: 1, env: "스테이징" }, suiteIds: [2], sched: "예약 없음", status: "활성",
    brow: ["Chromium"], res: "1920×1080", headless: true, video: "실패 시만", timeout: 30, workers: "2", retry: 1, onfail: "계속 진행", gate: 95 },
  { id: 4, name: "API 스모크 (스테이징)", targetRef: { systemId: 1, env: "스테이징" }, suiteIds: [5], sched: "이벤트 · 배포 시", schedule: { mode: "event", freq: "weekly", time: "09:00", dow: 1, dom: 1, cron: "0 9 * * 1", tz: "Asia/Seoul", active: true, ev: { deploy: true }, summary: "이벤트 · 배포 시" }, status: "활성",
    brow: ["Chromium"], res: "1920×1080", headless: true, video: "녹화 안 함", timeout: 30, workers: "4", retry: 1, onfail: "계속 진행", gate: 95 },
];
