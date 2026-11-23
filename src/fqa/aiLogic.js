// ============================================================
// FQA AI 활용 저작 — 자연어 절차 → 스텝 (MQA caseLogic.draftSteps 와 같은 역할)
//   실 구현: 러너(서버 worker)가 브라우저를 띄워 절차 한 줄씩 화면 구조(DOM · 접근성 트리)를 AI에 보내 판단 → 실행
//            사용자가 골라야 할 때만 그 시점 스크린샷 + 요소 위치를 받아 보여준다 (실시간 영상 아님 · 스크린샷은 AI에 보내지 않음)
//   목업: 샘플 화면(WEB_ELEMENTS)과 단어 규칙으로 판단을 흉내 낸다
//   · 줄마다 웹 조작인지 API 호출인지 판단한다 — API 줄은 메서드 · 경로만 읽어 뼈대를 만들고 나머지는 미확정
//   · 앞 단계(로그인 · 장바구니 담기 등)는 절차에 쓰지 않는다 — 스위트 앞 순서 케이스가 만든 화면에서 시작한다
// ============================================================

/* ── 샘플 웹 화면 (요소 집기 · AI 초안용 흉내) ──
   실 구현: 러너 브라우저에서 접근성 트리 + data-testid · id 를 받는다 */
export const WEB_ELEMENTS = [
  { key: "userid", label: "아이디 입력칸", role: "textbox", name: "아이디", testid: "userid", id: "", text: "" },
  { key: "password", label: "비밀번호 입력칸", role: "textbox", name: "비밀번호", testid: "password", id: "", text: "" },
  { key: "login", label: "로그인 버튼", role: "button", name: "로그인", testid: "", id: "", text: "로그인" },
  { key: "welcome", label: "환영 문구", role: "status", name: "", testid: "welcome", id: "", text: "환영합니다" },
  { key: "search", label: "검색창", role: "searchbox", name: "상품 검색", testid: "", id: "search", text: "" },
  { key: "featured", label: "추천 상품 카드", role: "link", name: "수분 립밤", testid: "product-featured", id: "", text: "수분 립밤" },
  { key: "addCart", label: "장바구니 담기 버튼", role: "button", name: "장바구니 담기", testid: "", id: "", text: "장바구니 담기" },
  { key: "cartCount", label: "장바구니 수량 배지", role: "status", name: "", testid: "cart-count", id: "", text: "1" },
  { key: "couponApply", label: "쿠폰 적용 버튼", role: "button", name: "쿠폰 적용", testid: "", id: "btn_apply_coupon", text: "쿠폰 적용" },
  { key: "couponStatus", label: "쿠폰 상태 표시", role: "status", name: "", testid: "coupon_status", id: "", text: "적용됨" },
  { key: "couponSelect", label: "쿠폰 선택 버튼", role: "button", name: "쿠폰 선택", testid: "", id: ":r7:", text: "쿠폰 선택" },   // 자동 생성 id — 쓰지 않는다
  { key: "couponNew", label: "신규 가입 쿠폰", role: "option", name: "신규 가입 10% 할인", testid: "", id: "", text: "신규 가입 10% 할인" },
  { key: "discount", label: "할인 금액 표시", role: "", name: "", testid: "", id: "", text: "-3,000원", css: ".price-row > span:nth-child(2)" },
  { key: "order", label: "주문하기 버튼", role: "button", name: "주문하기", testid: "order-submit", id: "", text: "주문하기" },
  { key: "orderStatus", label: "주문 상태 표시", role: "status", name: "", testid: "order-status", id: "", text: "결제완료" },
  { key: "agree", label: "약관 동의 체크박스", role: "checkbox", name: "약관에 동의합니다", testid: "agree", id: "", text: "" },
  { key: "error", label: "오류 문구", role: "alert", name: "", testid: "error", id: "", text: "아이디 또는 비밀번호가 올바르지 않습니다" },
];
/* 경로 이름 — "내 쿠폰 화면으로 간다" 처럼 경로 없이 쓴 이동 (실 구현: AI가 메뉴를 눌러 찾아가고 도착한 경로를 쓴다) */
const PAGES = [[/쿠폰/, "/my/coupons"], [/장바구니/, "/cart"], [/주문서|결제/, "/checkout"], [/주문 ?내역/, "/my/orders"], [/로그인/, "/login"], [/회원가입/, "/signup"], [/상품 ?목록/, "/products"], [/마이|내 정보/, "/my"], [/메인|홈/, "/"]];

/* 자동 생성처럼 보이는 id — React useId(:r1:) · CSS-in-JS 해시 · 긴 숫자. 빌드마다 바뀌어 쓰지 않는다 */
export const isAutoId = (id) => /^:r[0-9a-z]+:$|^(css|sc|jsx|emotion)-[0-9a-z]+$|\d{4,}|^[0-9a-f]{8,}$/i.test(String(id || ""));

/* ── 로케이터 추천 — 잘 변하지 않는 값부터 ──
   1 data-testid (개발자가 테스트용으로 붙인 값 — 디자인 · 문구가 바뀌어도 그대로)
   2 고정 id (자동 생성 id 제외)
   3 역할 + 이름 (구조 변경엔 강하지만 문구가 바뀌면 깨진다)
   4 글자 / CSS 위치 (최후 수단)
   3 · 4 는 '깨지기 쉬움' — 개발 측에 data-testid 를 요청할 근거가 된다 (MQA 와 같은 표시) */
export const recommendWebLoc = (el) => {
  if (!el) return { loc: "", kind: "", stable: false };
  if (el.testid) return { loc: "[data-testid=" + el.testid + "]", kind: "테스트 ID", stable: true };
  if (el.id && !isAutoId(el.id)) return { loc: "#" + el.id, kind: "고유 ID", stable: true };
  if (el.role && el.name) return { loc: "role=" + el.role + "[" + el.name + "]", kind: "역할 + 이름", stable: false };
  if (el.text) return { loc: "text=" + el.text, kind: "글자", stable: false };
  return { loc: el.css || "", kind: "CSS 위치", stable: false };
};
/* 이미 적힌 로케이터가 깨지기 쉬운가 — 스텝 행에 표시 (직접 쓴 것 · 레코딩한 것도 같은 기준) */
export const fragileLoc = (loc) => /^(role=|text=|placeholder=|label=)/.test(String(loc || "").trim()) || /nth-|:nth|>\s*\w/.test(String(loc || "")) || /^#/.test(String(loc || "").trim()) && isAutoId(String(loc).trim().slice(1));
export const elOfWebLoc = (loc) => WEB_ELEMENTS.find((e) => recommendWebLoc(e).loc === loc) || null;

const quoted = (t) => (String(t || "").match(/["“'‘]([^"”'’]+)["”'’]/) || [])[1] || "";
const words = (src) => String(src || "").replace(/["“”'‘’]/g, " ").split(/\s+/).map((w) => w.replace(/(을|를|이|가|은|는|에|의|에서|으로|로|한다|된다|뜬다|보인다|누른다|연다|고른다|바뀐다)$/, "")).filter((w) => w.length >= 2);
const score = (e, ws) => ws.filter((w) => (e.label + " " + (e.text || "") + " " + (e.name || "")).includes(w)).length;
/* 후보 — 절차 문장과 가장 가까운 요소 3개 (실 구현: AI 판단 요청이 함께 돌려주는 후보) */
export const webCandidates = (src, forText) => {
  const ws = words(src);
  return WEB_ELEMENTS.filter((e) => !forText || e.text).map((e) => ({ e, s: score(e, ws) })).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.e);
};
const findEl = (t, pred) => { const ws = words(t); const best = WEB_ELEMENTS.filter(pred || (() => true)).map((e) => ({ e, s: score(e, ws) })).sort((a, b) => b.s - a.s)[0]; return best && best.s >= 1 ? best.e : null; };
const API_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)/i;

/* ── 절차 → 스텝 초안 ──
   스텝 { n, src, act, loc, val, why, by? } — why 가 있으면 '확인 필요'(사람이 고르거나 채운다) */
export const draftWebSteps = (proc) => {
  const out = [];
  (proc || []).forEach((p, i) => {
    const n = i + 1; const t = p.t; const q = quoted(t);
    const api = t.match(API_RE);
    const push = (s) => out.push({ n, src: s.src || t, val: "-", ...s });
    /* 로그인 · 앞 단계는 '검증 대상' 이 아니라 '들어가기 위한 절차' — 스위트 앞 순서 케이스가 맡는다 */
    if (/로그인(한다|을 한다|된 상태|상태에서)/.test(t) && !/버튼|누른/.test(t)) { push({ act: "클릭", loc: "", why: "로그인 절차입니다 — 스위트 앞 순서에 로그인 케이스를 두고, 이 스텝은 지우는 것을 권장합니다" }); return; }
    if (api) {
      /* API 줄 — 메서드 · 경로만 문장에서 읽는다. 본문 · 기대 응답처럼 문장에 없는 값은 사람이 채운다 */
      push({ act: "요청", loc: api[1].toUpperCase() + " " + api[2], ...(/^(POST|PUT|PATCH)$/i.test(api[1]) ? { why: "요청 본문은 문장에 없어 비워 두었습니다 — 필요하면 채우세요", soft: true } : {}) });
      const code = (String(p.e || "").match(/\b([1-5]\d\d)\b/) || [])[1] || "";
      push({ src: p.e || t, act: "응답 검증", loc: "상태코드", val: code, why: code ? "" : "기대 응답 코드를 문장에서 찾지 못함" });
      return;
    }
    const path = (t.match(/(^|\s)(\/[\w\-/${}.]*)/) || [])[2];
    if (/이동|간다|들어간다|접속|연다/.test(t) && (path || PAGES.some(([re]) => re.test(t))) && !/누른/.test(t)) {
      const pg = path || (PAGES.find(([re]) => re.test(t)) || [])[1];
      push({ act: "이동", loc: pg });
    } else if (/입력|적는다|쓴다|검색한다/.test(t)) {
      const el = findEl(t, (e) => /textbox|searchbox/.test(e.role));
      push({ act: "입력", loc: recommendWebLoc(el).loc, val: q, why: !el ? "입력할 칸을 특정하지 못함" : !q ? "입력할 값을 찾지 못함 — 따옴표로 감싸 주세요" : "" });
    } else if (/체크|동의/.test(t)) {
      const el = findEl(t, (e) => e.role === "checkbox");
      push({ act: "체크", loc: recommendWebLoc(el).loc, val: /해제/.test(t) ? "해제" : "체크", why: el ? "" : "체크할 칸을 특정하지 못함" });
    } else if (/누른다|클릭|선택한다|고른다|탭한다/.test(t)) {
      const el = findEl(t, (e) => /button|link|option|checkbox|tab/.test(e.role));
      push({ act: "클릭", loc: recommendWebLoc(el).loc, why: el ? "" : "화면에서 요소를 특정하지 못함" });
    } else if (/확인|보인다|표시|뜬다|바뀐다/.test(t)) {
      const el = findEl(t, (e) => !!e.text);
      push({ act: "화면 검증", loc: recommendWebLoc(el).loc, val: q ? 'text = "' + q + '"' : "visible = true", why: el ? "" : "확인할 요소를 특정하지 못함" });
    } else push({ act: "클릭", loc: "", why: "동작을 판단하지 못함 — 절차를 더 구체적으로 쓰거나 직접 고르세요" });
    /* 기대 결과 → 화면 검증 */
    if (p.e) {
      const el = findEl(p.e, (e) => !!e.text && /status|alert|^$/.test(e.role || ""));
      const v = quoted(p.e);
      push({ src: p.e, act: "화면 검증", loc: recommendWebLoc(el).loc, val: v ? 'text = "' + v + '"' : "visible = true", why: el ? "" : "기대 결과에서 확인할 요소를 특정하지 못함" });
    }
  });
  return out.map((s) => (s.loc ? { ...s, frag: !recommendWebLoc(elOfWebLoc(s.loc)).stable && s.act !== "이동" && s.act !== "요청" && s.act !== "응답 검증" } : s));
};

/* AI에 보내는 정보 — 화면에 그대로 보여준다 (MQA 와 같은 틀) */
export const AI_SEND_WEB = [
  { k: "보냄", c: "text-slate-600", v: "자연어 절차 · 각 시점 화면 구조 (요소 역할 · 이름 · 글자 · data-testid · id)" },
  { k: "가려서 보냄", c: "text-amber-700", v: "화면 글자 중 전화번호 · 이메일 · 카드번호 형태 · 입력칸에 들어 있는 값" },
  { k: "보내지 않음", c: "text-emerald-700", v: "화면 캡처 이미지 · 쿠키 · 계정과 변수의 값 (이름만)" },
];

/* TC 임포트 샘플 — 수동 TC 문서 형식 (번호 · 시나리오명 · 사전조건 · 절차 · 기대결과 · 분류)
   '분류' · '사전조건' 은 스위트를 만들지 않는다 — 사전조건은 참고용 원문으로 남는다 */
export const SAMPLE_TC_WEB = [
  ["번호", "시나리오명", "사전조건", "테스트 절차", "기대결과", "분류"],
  ["1", "쿠폰 적용 후 할인 금액 표시", "일반 회원 로그인",
    "1. 주문서 화면으로 간다\n2. 쿠폰 선택을 누른다\n3. 신규 가입 쿠폰을 고른다 → 할인 금액이 표시된다", "", "주문"],
  ["2", "로그인 실패 안내", "",
    "1. 로그인 화면으로 간다\n2. 아이디에 \"qa_user01\" 입력\n3. 비밀번호에 \"wrong\" 입력\n4. 로그인 버튼을 누른다", "\"아이디 또는 비밀번호가 올바르지 않습니다\" 문구가 보인다", "회원"],
  ["3", "주문 생성 API 확인", "장바구니에 상품 1개",
    "1. POST /v1/orders/checkout 호출 → 201 응답\n2. 주문 내역 화면으로 간다\n3. 주문 상태 표시를 확인한다", "\"결제완료\"가 보인다", "주문"],
];
