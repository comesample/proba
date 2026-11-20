// ============================================================
// MQA 테스트케이스 — 순수 로직 (화면과 분리해 단독 검증 가능)
//   정본 3단:  자연어 절차(의도)  →  실행 스텝(RF 키워드)  →  .robot(생성물)
//   · 스텝 → .robot 변환은 규칙 기반(결정적)이다 — AI 는 '절차 → 스텝 초안' 에만 쓴다
//   · 목업의 AI 초안·화면 구조·파서는 흉내 구현이다. 실 구현 교체 지점은 주석으로 표시
// ============================================================

/* ── 동작 = RF AppiumLibrary 키워드 1:1 ─────────────────────────
   🔑 이 표가 유일한 출처다. 스텝→.robot(stepLine), .robot→스텝(REV·lineToStep) 이
      전부 여기서 파생된다. 동작을 추가할 때 고칠 곳은 이 표와 편집 화면의 입력칸뿐이다.

      전에는 같은 매핑을 ACTS 와 REV 두 곳에 손으로 적었고, 역변환(REV·lineToStep)을
      빠뜨려도 알 방법이 없었다 — 내보낸 .robot 을 다시 가져오면 그 스텝만 조용히
      Full-Code 가 된다. (CLI 가 dsl.js 로 푼 문제와 같다)

   needs  이 동작이 확정되려면 무엇이 있어야 하나 (loc = 대상 요소, val = 값)
          동시에 키워드 인자의 순서이기도 하다 — Input Text <loc> <val>
   alias  같은 뜻으로 쓰이는 다른 키워드 (가져오기에서만 인식, 내보낼 때는 kw 를 쓴다)
   toLine / fromLine  인자가 1:1 이 아닌 동작의 예외 변환
   sample 왕복 예시 — 예외 변환이 있는 동작은 짝이 맞는지 여기서 눈으로 확인한다 */
export const ACTS = [
  { id: "탭", kw: "Click Element", alias: ["Tap"], needs: ["loc"] },
  { id: "입력", kw: "Input Text", alias: ["Input Value"], needs: ["loc", "val"] },
  { id: "화면 확인", kw: "Wait Until Page Contains", alias: ["Page Should Contain Text"], needs: ["val"], hint: "화면에 보여야 하는 문구" },
  { id: "요소 확인", kw: "Wait Until Element Is Visible", alias: ["Element Should Be Visible"], needs: ["loc"] },
  /* 🔑 부정 확인 — QA 케이스의 상당수가 "없어야 한다" 다.
     "삭제하면 목록에서 사라진다" 를 긍정 확인만으로는 쓸 수 없다. */
  { id: "요소 없음 확인", kw: "Wait Until Element Is Not Visible", alias: ["Element Should Not Be Visible"], needs: ["loc"] },
  /* 🔑 기다리는 쪽을 내보낸다. 즉시 평가(Page Should Not Contain Text)로 내보내면
     사라지는 중인 토스트·애니메이션을 "아직 있다" 고 읽어 거의 항상 거짓 실패가 난다.
     긍정 확인(Wait Until Page Contains)도 기다리는 쪽이라 짝이 맞는다. */
  { id: "화면에 없음 확인", kw: "Wait Until Page Does Not Contain", alias: ["Page Should Not Contain Text"], needs: ["val"], hint: "화면에서 사라져야 하는 문구" },
  /* '화면 확인' 은 포함이고 이쪽은 정확히 같은지를 본다 — "금액이 12,000원인가" */
  { id: "텍스트 비교", kw: "Element Text Should Be", alias: ["Element Should Contain Text"], needs: ["loc", "val"], hint: "정확히 일치해야 하는 값" },
  /* 퍼센트 네 개로 방향을 표현한다 — needs 로는 못 적어 예외로 둔다.
     좌우는 x 가, 상하는 y 가 움직인다. 역변환은 어느 축이 변했는지로 가른다. */
  { id: "스와이프", kw: "Swipe By Percent", needs: [], opts: ["위로", "아래로", "왼쪽으로", "오른쪽으로"],
    toLine: (s) => ({ "아래로": "50    20    50    80", "왼쪽으로": "80    50    20    50", "오른쪽으로": "20    50    80    50" }[s.val] || "50    80    50    20"),
    fromLine: (tok) => {
      const [x1, y1, x2, y2] = [tok[1], tok[2], tok[3], tok[4]].map(Number);
      if (y1 !== y2) return { val: y1 > y2 ? "위로" : "아래로" };
      return { val: x1 > x2 ? "왼쪽으로" : "오른쪽으로" };
    },
    sample: ["Swipe By Percent    50    80    50    20", "위로"] },
  { id: "뒤로", kw: "Go Back", needs: [] },
  /* 🔑 모바일에서만 생기는 두 가지 — 빈도가 명백해 증거를 기다리지 않고 올렸다.
     키보드 숨기기: 입력 후 키보드가 다음 버튼을 덮어 탭이 안 먹는다. '대기' 로는 못 푼다.
     WebView 전환: 네이티브 껍데기 + WebView 인 앱은 이것이 없으면 안쪽을 아예 못 만진다.
                   (국내 앱 상당수가 이 구조다 — 없으면 그 고객군이 통째로 Full-Code) */
  { id: "키보드 숨기기", kw: "Hide Keyboard", needs: [] },
  /* 🔑 드롭다운으로 만들 수 없다 — WebView 컨텍스트 이름은 WEBVIEW_<패키지> 또는 WEBVIEW_<번호> 라
     앱마다 다르다. 'WEBVIEW' 단독은 실기기에 존재하지 않는 값이라, 고르면 반드시 실패한다.
     이름은 기기에서 확인해 적는다(Appium 의 contexts 조회). */
  { id: "화면 전환", kw: "Switch To Context", needs: ["val"], hint: "NATIVE_APP 또는 WEBVIEW_com.example.shop" },
  /* 값은 숫자만 받고 내보낼 때 s 를 붙인다 */
  { id: "대기", kw: "Sleep", needs: ["val"], hint: "초",
    toLine: (s) => String(s.val).replace(/[^\d.]/g, "") + "s",
    fromLine: (tok) => ({ val: String(tok[1] || "1").replace(/[^\d.]/g, "") }),
    sample: ["Sleep    2s", "2"] },
  /* 🔑 API — UI 와 섞어 쓴다. 현장에서 준비·정리뿐 아니라 검증도 API 로 한다.
     화면 토스트 "장바구니에 담았습니다" 는 프론트가 보여준 것일 뿐이다.
     서버에 실제로 반영됐는지는 API 로 봐야 안다 — UI 만 보면 조용히 통과한다.

     🔑 RequestsLibrary 를 직접 쓰지 않고 proba.resource 의 키워드를 부른다.
        직접 쓰면 ${res}= 같은 변수 대입이 케이스 본문에 들어오는데, 그건 한 줄짜리
        동작이 아니라 상태를 만드는 문장이라 스텝 모델과 맞지 않는다.
        '앱 실행' 을 이미 같은 방식으로 주입하고 있다 — base URL·토큰도 거기로 들어간다. */
  { id: "요청", kw: "API 요청", needs: ["loc"], hint: "METHOD /경로 (예: POST /v1/orders)", api: true,
    toLine: (s) => [s.loc, ...(String(s.body || "").trim() ? ["body=" + s.body] : []), ...(String(s.save || "").trim() ? ["저장=" + s.save] : [])].join(SEP),
    fromLine: (tok) => {
      const rest = tok.slice(1);
      const pick = (p) => (rest.find((x) => x.startsWith(p)) || "").slice(p.length);
      return { loc: rest.filter((x) => !/^(body=|저장=)/.test(x)).join(" "), body: pick("body="), save: pick("저장=") };
    },
    sample: ["API 요청    POST /v1/orders    저장=orderId=$.orderId", "POST /v1/orders"] },
  /* loc = 검증 대상(상태코드 · $.경로), val = 기대값(200 · 존재 · 실제 값) — FQA 와 같은 모양 */
  { id: "응답 검증", kw: "응답 검증", needs: ["loc", "val"], hint: "상태코드 또는 $.경로", api: true },
  /* 🔑 탈출구 — 위 동작으로 표현 못 하는 키워드를 그 스텝만 원본으로 둔다(FQA 코드 스텝과 같은 역할).
     이것이 없으면 케이스 '전체' 가 Full-Code 로 간다 — 한 스텝을 잃는 쪽이 낫다.

     ⚠️ 대신 이 스텝은 요소 집기·자가보정·AI 초안을 받지 못한다. 로케이터가 문자열 안에
        묻혀 있어 플랫폼이 손댈 수 없다. 자주 쓰이는 키워드는 정식 동작으로 올려야 한다.
     ⚠️ AI 초안(draftSteps)은 이 동작을 만들지 않는다 — 허용하면 어려운 것을 전부
        여기로 떠넘겨 스텝 모델이 있으나 마나가 된다. 모르면 '미확정' 으로 남긴다. */
  { id: "코드 스텝", kw: "", needs: ["val"], raw: true, hint: "AppiumLibrary 키워드 한 줄" },
];
export const ACT = Object.fromEntries(ACTS.map((a) => [a.id, a]));

/* 키워드(소문자) → 동작 id. ACTS 에서 파생한다 — 손으로 적지 않는다. */
const REV = {};
ACTS.forEach((a) => [a.kw, ...(a.alias || [])].forEach((k) => { REV[String(k).toLowerCase()] = a.id; }));

/* 스텝 상태는 저장하지 않고 매번 계산한다 — 사람이 요소를 채우는 순간 '확정' 이 된다 */
export const stateOf = (s) => {
  const a = ACT[s.act];
  if (!a) return "미확정";
  if (a.needs.includes("loc") && !String(s.loc || "").trim()) return "미확정";
  if (a.needs.includes("val") && !String(s.val || "").trim()) return "미확정";
  /* 🔑 저장식이 틀린 것도 '미확정' 으로 본다 — 칸은 채워졌지만 그대로 내보내면 실행에서 깨진다.
     새 상태를 만들지 않는 이유: 미확정이 이미 저장·디버그 실행·승인을 막고 있다.
     상태를 하나 더 두면 같은 가드를 세 군데에 또 붙여야 한다. */
  if (saveError(s.save)) return "미확정";
  return "확정";
};
/* 미확정 사유 — 스텝 행이 'why' 자리에 보여준다. 무엇을 고쳐야 하는지 말해 주지 않으면
   칸이 다 찬 스텝이 노란 배지만 달고 있어 사용자가 이유를 알 수 없다. */
export const stepWhy = (s) => {
  const a = ACT[s.act];
  if (!a) return "알 수 없는 동작입니다";
  const e = saveError(s.save);
  if (e) return "응답 저장 — " + e;
  return s.why || "";
};
export const unresolvedOf = (steps) => (steps || []).filter((s) => stateOf(s) === "미확정").length;

/* 응답 저장 — "이름 = $.경로" 꼴. 이름은 .robot 에서 ${이름} 이 되므로 아무 글자나 쓸 수 없다.
   FQA 와 같은 규칙을 쓴다(영문·숫자·_ · 숫자로 시작 금지) — 두 도메인이 다르면 가져오기가 어긋난다.
   비어 있으면 '저장 안 함' 이라 오류가 아니다. */
const SAVE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const saveError = (save) => {
  const v = String(save || "").trim();
  if (!v) return "";
  const [nm, pth] = v.split("=").map((x) => (x || "").trim());
  if (!nm || !pth) return "\"이름 = $.경로\" 형식이 아닙니다 (예: orderId = $.orderId)";
  if (!SAVE_ID.test(nm)) return "이름 '" + nm + "' 을 쓸 수 없습니다 (영문·숫자·_ 만, 숫자로 시작 불가)";
  if (!/^\$\.?/.test(pth)) return "경로는 $. 로 시작합니다 (예: $.orderId)";
  return "";
};

/* 이 케이스가 기기를 쓰는가 — API 전용 케이스는 단말을 잡지 않는다.
   클라우드 Device Farm 은 동시 실행 1개당 월 비용이 붙는다. 안 쓰는 케이스가 점유하면 돈이 샌다. */
export const needsDevice = (steps) => (steps || []).some((s) => !(ACT[s.act] || {}).api);

/* ── 자연어 절차 ── 한 줄 = 한 단계, "→" 뒤는 기대 결과 */
const stripNo = (t) => t.replace(/^\s*(\d+[.)]|[-•*·])\s*/, "").trim();
export const procFromText = (text) => String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
  const [t, ...e] = l.split(/\s*(?:→|->)\s*/);
  return { t: stripNo(t), e: e.join(" → ").trim() };
}).filter((p) => p.t);
export const procToText = (proc) => (proc || []).map((p) => p.t + (p.e ? " → " + p.e : "")).join("\n");

/* AI 로 양식 정리 (목업) — 자유 서술을 '한 줄 한 단계' 로 쪼갠다.
   실 구현: LLM 에 "절차/기대 결과 구조로 정리" 를 요청한다. */
export const tidyProc = (text) => {
  const COND = [["누르면", "누른다"], ["열면", "연다"], ["들어가면", "들어간다"], ["하면", "한다"]];
  return String(text || "").replace(/\r/g, "")
    .replace(/한\s*(?:뒤|후|다음)\s*,?\s*/g, "한다\n").replace(/하고\s+/g, "한다\n").replace(/누르고\s+/g, "누른다\n").replace(/열고\s+/g, "연다\n")
    .split(/\n|(?<=다)[.]?\s+/).map((x) => stripNo(x.replace(/[.。]\s*$/, ""))).filter(Boolean)
    .map((x) => {
      for (const [c, d] of COND) { const i = x.indexOf(c + " "); if (i > 0) return x.slice(0, i) + d + " → " + x.slice(i + c.length + 1); }
      return x;
    }).join("\n");
};

/* ── 샘플 앱 화면 구조 (요소 집기·AI 초안용 흉내) ─────────────
   실 구현: 실행 PC 의 기기에서 Appium 으로 화면 구조(XML)와 스크린샷을 받는다. */
export const SAMPLE_PKG = "com.example.shop";
export const SCREEN_ELEMENTS = [
  { key: "search", label: "검색창", cls: "EditText", id: "search_bar", acc: "", text: "" },
  { key: "p0", label: "상품 카드 1", cls: "ViewGroup", id: "", acc: "product_0", text: "수분 립밤" },
  { key: "p1", label: "상품 카드 2", cls: "ViewGroup", id: "", acc: "", text: "컬러 립밤", xpath: "//androidx.recyclerview.widget.RecyclerView/android.view.ViewGroup[2]" },
  { key: "cart", label: "장바구니 담기 버튼", cls: "Button", id: "btn_add_cart", acc: "", text: "장바구니 담기" },
  { key: "toast", label: "안내 문구", cls: "TextView", id: "toast_msg", acc: "", text: "장바구니에 담았습니다" },
  { key: "my", label: "마이 탭", cls: "FrameLayout", id: "", acc: "마이 탭", text: "마이" },
  { key: "orders", label: "주문 내역 메뉴", cls: "TextView", id: "menu_orders", acc: "", text: "주문 내역" },
  { key: "id", label: "아이디 입력칸", cls: "EditText", id: "input_id", acc: "", text: "" },
  { key: "pw", label: "비밀번호 입력칸", cls: "EditText", id: "input_pw", acc: "", text: "" },
  { key: "login", label: "로그인 버튼", cls: "Button", id: "btn_login", acc: "", text: "로그인" },
  { key: "logout", label: "로그아웃 문구", cls: "TextView", id: "txt_logout", acc: "", text: "로그아웃" },
  { key: "cartTab", label: "장바구니 탭", cls: "FrameLayout", id: "", acc: "장바구니", text: "장바구니" },
  { key: "cartClear", label: "전체 삭제 버튼", cls: "Button", id: "btn_cart_clear", acc: "", text: "전체 삭제" },
  { key: "cartEmpty", label: "빈 장바구니 안내", cls: "TextView", id: "txt_cart_empty", acc: "", text: "장바구니가 비어 있습니다" },
  /* 시연용 확장 — 상품 상세 · 옵션 · 정렬 · 필터 · 찜 · 주문서 (TC 임포트 샘플이 쓰는 화면 요소) */
  { key: "detail", label: "상품 상세 제목", cls: "TextView", id: "txt_detail_title", acc: "", text: "상품 상세" },
  { key: "opt10", label: "용량 옵션 10g", cls: "Button", id: "opt_10g", acc: "", text: "10g" },
  { key: "qtyPlus", label: "수량 증가 버튼", cls: "ImageButton", id: "btn_qty_plus", acc: "", text: "" },
  { key: "qty", label: "수량 표시", cls: "TextView", id: "txt_qty", acc: "", text: "수량 2" },
  { key: "goCart", label: "장바구니로 이동 버튼", cls: "Button", id: "btn_go_cart", acc: "", text: "장바구니로 이동" },
  { key: "sort", label: "정렬 버튼", cls: "Button", id: "btn_sort", acc: "", text: "추천순" },
  { key: "sortLow", label: "낮은 가격순 옵션", cls: "TextView", id: "", acc: "sort_price_low", text: "낮은 가격순" },
  { key: "filter", label: "필터 버튼", cls: "Button", id: "btn_filter", acc: "", text: "필터" },
  { key: "tagMoist", label: "보습 태그", cls: "TextView", id: "", acc: "", text: "보습", xpath: "//android.widget.HorizontalScrollView//android.widget.TextView[@text='보습']" },
  { key: "apply", label: "적용 버튼", cls: "Button", id: "btn_apply", acc: "", text: "적용" },
  { key: "resultCnt", label: "검색 결과 수", cls: "TextView", id: "txt_result_count", acc: "", text: "검색 결과 12건" },
  { key: "wish", label: "찜하기 버튼", cls: "ImageButton", id: "", acc: "찜하기", text: "" },
  { key: "wishToast", label: "찜 안내 문구", cls: "TextView", id: "toast_wish", acc: "", text: "찜 목록에 추가했습니다" },
  { key: "wishMenu", label: "찜 목록 메뉴", cls: "TextView", id: "menu_wish", acc: "", text: "찜 목록" },
  { key: "order", label: "주문하기 버튼", cls: "Button", id: "btn_order", acc: "", text: "주문하기" },
  { key: "coupon", label: "쿠폰 선택 버튼", cls: "Button", id: "btn_coupon", acc: "", text: "쿠폰 선택" },
  { key: "couponNew", label: "신규 가입 쿠폰", cls: "TextView", id: "", acc: "coupon_welcome", text: "신규 가입 10% 할인" },
  { key: "discount", label: "할인 적용 표시", cls: "TextView", id: "txt_discount", acc: "", text: "쿠폰 할인 적용" },
  { key: "payCard", label: "신용카드 결제 선택", cls: "RadioButton", id: "pay_card", acc: "", text: "신용카드" },
];
/* 로케이터 추천 — 고유 ID > 접근성 ID > 위치(xpath). 위치는 화면이 조금만 바뀌어도 깨진다 */
export const recommendLoc = (el, pkg = SAMPLE_PKG) => {
  if (el.id) return { loc: "id=" + pkg + ":id/" + el.id, kind: "고유 ID", stable: true };
  if (el.acc) return { loc: "accessibility_id=" + el.acc, kind: "접근성 ID", stable: true };
  return { loc: "xpath=" + (el.xpath || "//*[@text='" + el.text + "']"), kind: "위치", stable: false };
};

/* ── 요소 이름 — 스텝에는 로케이터와 함께 사람이 읽는 이름(el)을 둔다
   요소 집기 · AI 생성은 이름을 같이 저장한다. 이름이 없는 스텝(스크립트 임포트 등)은 로케이터에서 유도한다 */
export const locKind = (loc) => { const l = String(loc || ""); return /^id=/.test(l) ? "고유 ID" : /^accessibility_id=/.test(l) ? "접근성 ID" : /^xpath=/.test(l) ? "위치" : l ? "기타" : ""; };
/* 버전별 화면 차이 (목업) — 앱이 업데이트되면 요소 ID가 바뀔 수 있다. 실제 실패의 가장 흔한 원인
   v3.1.4 → v3.2.0 : '장바구니 담기' 버튼 ID btn_cart_add → btn_add_cart */
const BUILD_DIFF = { "3.1.4": { cart: { id: "btn_cart_add" } } };
export const elementsFor = (build) => SCREEN_ELEMENTS.map((e) => ({ ...e, ...((BUILD_DIFF[build] || {})[e.key] || {}) }));
const ALL_VARIANTS = () => [...SCREEN_ELEMENTS, ...Object.keys(BUILD_DIFF).flatMap((b) => elementsFor(b))];
export const elOfLoc = (loc) => ALL_VARIANTS().find((e) => recommendLoc(e).loc === loc) || null;
export const elName = (s) => {
  if (s.el) return s.el;
  const e = elOfLoc(s.loc); if (e) return e.label;
  const l = String(s.loc || "");
  const m = l.match(/^id=.*?:id\/(.+)$/) || l.match(/^id=(.+)$/); if (m) return m[1];
  const a = l.match(/^accessibility_id=(.+)$/); if (a) return a[1];
  return l ? "위치로 지정한 요소" : "";
};

/* ── 로케이터 보정 제안 (자가 치유 · 제안형) ─────────────────
   스텝을 만들 때(요소 집기 · AI 생성) 로케이터와 함께 요소의 특징(ex)을 기억한다 — 화면에는 보이지 않는다.
   정식 실행에서 '요소 변경' 으로 실패하면, 실패 순간의 화면 구조에서 같은 요소를 다시 찾는다.
   🔴 판정은 뒤집지 않는다(실패는 실패) · 실행 중 자동 적용하지 않는다 · 후보가 딱 하나일 때만 제안한다
      (애매할 때 고르면 엉뚱한 요소를 누르고도 통과 — 조용히 틀린 결과가 된다) */
export const elSnap = (e) => (e ? { text: e.text || "", cls: e.cls || "", acc: e.acc || "", id: e.id || "" } : null);
export const healFor = (step, build) => {
  if (!step || !step.loc || !["탭", "입력", "요소 확인", "요소 없음 확인"].includes(step.act)) return null;
  const screen = elementsFor(build);
  if (screen.some((e) => recommendLoc(e).loc === step.loc)) return null;          // 요소가 있다 — 로케이터 문제가 아니다
  const was = step.ex || elSnap(elOfLoc(step.loc));                               // 실 구현은 ex 만 쓴다 (목업 시드는 로케이터로 유도)
  if (!was) return null;
  const same = (e) => e.cls === was.cls && ((was.text && e.text === was.text) || (was.acc && e.acc === was.acc));
  const hits = screen.filter(same);
  if (hits.length !== 1) return null;
  const e = hits[0], to = recommendLoc(e);
  if (to.loc === step.loc) return null;
  const by = [was.text && e.text === was.text ? "같은 문구 '" + e.text + "'" : "", was.acc && e.acc === was.acc ? "같은 접근성 ID" : "", "같은 종류(" + e.cls + ")"].filter(Boolean).join(" · ");
  return { step: elName(step), from: step.loc, to: to.loc, kind: to.kind, why: by + " — 로케이터만 바뀌었습니다", ex: elSnap(e) };
};

/* ── 실행 흉내 (목업) — 샘플 화면에 있는 요소 · 문구면 통과, 없으면 그 스텝에서 실패하고 멈춘다
   실 구현: 러너가 RF 로 실행하고 output.xml 에서 스텝별 결과 · 오류 · 스크린샷을 돌려준다 */
const KNOWN_TEXTS = () => new Set(SCREEN_ELEMENTS.map((e) => e.text).filter(Boolean));
export const simulateStep = (s, build, env) => {
  /* 🔑 API 스텝은 환경의 Base URL 이 있어야 돈다 — 없으면 경로만 가지고 어디로 보낼지 모른다.
     실제로 나는 오류이고, 원인이 UI 실패와 달라 담당자도 갈린다(flow.jsx judgeOf 참고). */
  if ((ACT[s.act] || {}).api && env && !String(env.apiBase || "").trim())
    return { st: "fail", msg: "API Base URL 이 없습니다 — 대상·환경에서 설정하세요 (응답 상태코드 없음)" };
  const needsLoc = ["탭", "입력", "요소 확인"].includes(s.act);
  const onScreen = (loc) => elementsFor(build).some((e) => recommendLoc(e).loc === loc);
  if (needsLoc && !onScreen(s.loc)) return { st: "fail", msg: "요소를 찾지 못했습니다 — 10초 동안 기다렸지만 화면에 없습니다" };
  /* 부정 확인은 판정이 뒤집힌다 — '있으면' 실패다. 긍정 확인과 같이 묶으면 거꾸로 동작한다. */
  if (s.act === "요소 없음 확인" && onScreen(s.loc)) return { st: "fail", msg: "요소가 아직 화면에 있습니다 — 사라져야 합니다" };
  if (s.act === "화면 확인" && !/^\$\{/.test(s.val || "") && !KNOWN_TEXTS().has(s.val)) return { st: "fail", msg: "화면에서 \"" + s.val + "\" 문구를 찾지 못했습니다" };
  if (s.act === "화면에 없음 확인" && KNOWN_TEXTS().has(s.val)) return { st: "fail", msg: "\"" + s.val + "\" 문구가 아직 화면에 있습니다 — 사라져야 합니다" };
  if (/^xpath=/.test(s.loc || "")) return { st: "warn", msg: "통과 — 위치로 찾은 요소는 화면이 바뀌면 깨지기 쉽습니다" };
  return { st: "ok", msg: "" };
};

/* ── AI 스텝 초안 (1단계 · 기기 없이) ────────────────────────
   목업 규칙: 문장의 동사로 동작을 고르고, 아는 요소 이름이면 로케이터를 채운다.
   모르는 요소·특정 못 한 확인 문구는 '미확정' 으로 남긴다 (사람이 요소 집기로 채움).
   실 구현: LLM 이 닫힌 동작 목록(ACTS) 안에서만 고르도록 제한한다. */
const KNOWN = [
  { k: ["장바구니 담기"], el: "cart" },
  { k: ["검색창", "검색 창"], el: "search" },
  { k: ["마이 탭", "마이"], el: "my" },
  { k: ["주문 내역"], el: "orders" },
  { k: ["전체 삭제"], el: "cartClear" },
  { k: ["로그인 버튼"], el: "login" },
  { k: ["첫 번째 상품", "첫 상품"], el: "p0" },
  { k: ["장바구니로 이동"], el: "goCart" },
  { k: ["장바구니 탭"], el: "cartTab" },
  { k: ["용량", "10g"], el: "opt10" },
  { k: ["수량 증가", "수량을 하나 늘", "+ 버튼"], el: "qtyPlus" },
  { k: ["정렬 버튼"], el: "sort" },
  { k: ["낮은 가격순"], el: "sortLow" },
  { k: ["필터 버튼"], el: "filter" },
  { k: ["보습"], el: "tagMoist" },
  { k: ["찜하기"], el: "wish" },
  { k: ["찜 목록"], el: "wishMenu" },
  { k: ["주문하기"], el: "order" },
  { k: ["쿠폰 선택"], el: "coupon" },
  { k: ["신규 가입"], el: "couponNew" },
  { k: ["신용카드"], el: "payCard" },
  { k: ["적용 버튼"], el: "apply" },
];
const findKnown = (t) => { const h = KNOWN.find((x) => x.k.some((k) => t.includes(k))); return h ? SCREEN_ELEMENTS.find((e) => e.key === h.el) : null; };
const quoted = (t) => { const m = String(t || "").match(/["“'‘]([^"”'’]+)["”'’]/); return m ? m[1] : ""; };
let _sid = 0;
export const sid = () => "S" + Date.now().toString(36) + (++_sid);

const isField = (loc) => /search_bar|input_|EditText/.test(loc || "");
export const draftSteps = (proc) => {
  const out = []; let lastField = "";
  (proc || []).forEach((p, i) => {
    const n = i + 1; const t = p.t; const q = quoted(t);
    const el = findKnown(t);
    const locOf = (e) => (e ? recommendLoc(e).loc : "");
    const nameOf = (e) => (e ? e.label : "");
    let s;
    /* 로그인은 대부분 '검증 대상' 이 아니라 '들어가기 위한 절차' 다 — 스위트에서 로그인 케이스를 앞에 둔다 */
    if (/로그인(한다|을 한다|을 수행|된 상태|상태)/.test(t) && !/버튼|누른/.test(t)) s = { act: "탭", loc: "", why: "로그인 절차입니다 — 스위트에서 로그인 케이스를 앞에 두고, 이 스텝은 지우는 것을 권장합니다" };
    else if (/입력|검색한다|적는다|쓴다/.test(t)) { const lc = locOf(el) || (/검색/.test(t) ? locOf(SCREEN_ELEMENTS[0]) : lastField); s = { act: "입력", loc: lc, val: q, why: !q ? "입력할 값을 찾지 못함" : !lc ? "입력할 칸을 특정하지 못함" : "" }; }
    else if (/스크롤|스와이프|내린다|올린다/.test(t)) s = { act: "스와이프", val: /올린다/.test(t) ? "아래로" : "위로" };
    else if (/뒤로/.test(t)) s = { act: "뒤로" };
    else if (/기다린다|대기/.test(t)) s = { act: "대기", val: (t.match(/(\d+)\s*초/) || [])[1] || "2" };
    else if (/누른다|누르고|탭한다|연다|선택한다|클릭|들어간다|이동한다/.test(t)) s = { act: "탭", loc: locOf(el), why: el ? "" : "화면에서 요소를 특정하지 못함" };
    else if (/확인|보인다|표시/.test(t)) s = { act: "화면 확인", val: q, why: q ? "" : "확인할 문구를 특정하지 못함" };
    else s = { act: "탭", loc: "", why: "동작을 판단하지 못함 — 절차를 더 구체적으로 쓰거나 직접 고르세요" };
    if (s.act === "탭" && isField(s.loc)) lastField = s.loc;
    out.push({ id: sid(), n, src: t, ...s, ...(s.loc && elOfLoc(s.loc) ? { el: elOfLoc(s.loc).label, ex: elSnap(elOfLoc(s.loc)) } : {}) });
    if (p.e) {
      const v = quoted(p.e) || (/담기 완료|담았/.test(p.e) ? "장바구니에 담았습니다" : "");
      out.push({ id: sid(), n, src: p.e, act: "화면 확인", val: v, why: v ? "" : "기대 결과에서 확인할 문구를 특정하지 못함" });
    }
  });
  return out;
};

/* ── 스텝 → .robot (결정적 변환) ───────────────────────────
   proba.resource = PROBA 실행기가 제공하는 리소스: '앱 실행' 키워드와 계정 변수를 실행 시 주입한다.
   (대상·환경의 앱 버전·계정, 테스트 기기 정보가 여기로 들어간다 — 케이스는 환경을 모른다) */
const SEP = "    ";
export const stepLine = (s, procLine) => {
  if (stateOf(s) === "미확정") return "# [미확정] " + s.n + ". " + s.act + " — " + (s.src || procLine || "값을 채워 주세요");
  const a = ACT[s.act];
  if (!a) return "# 알 수 없는 동작: " + s.act;
  if (a.raw) return s.val;   // 코드 스텝 — 적은 그대로 내보낸다
  // 예외 변환이 있으면 그것이 인자 전부를 만든다. 없으면 needs 순서대로 값을 늘어놓는다.
  const args = a.toLine ? [a.toLine(s)] : (a.needs || []).map((k) => s[k]);
  return [a.kw, ...args].join(SEP);
};
export const toRobot = (c) => {
  /* API 스텝이 있으면 RequestsLibrary 를 같이 싣는다 — 케이스가 쓰는 것은 proba.resource 의
     'API 요청'·'응답 검증' 이고, 그 안에서 이 라이브러리를 쓴다. 안 쓰는 케이스에는 싣지 않는다. */
  const hasApi = (c.steps || []).some((s) => (ACT[s.act] || {}).api);
  const L = ["*** Settings ***", "Library" + SEP + "AppiumLibrary",
    ...(hasApi ? ["Library" + SEP + "RequestsLibrary"] : []),
    "Resource" + SEP + "proba.resource" + SEP + "# 앱 실행 · 계정 변수 · API base·토큰 (실행 시 자동 주입)"];
  /* 앱 열기·닫기는 넣지 않는다 — 스위트가 한 번 열고 순서대로 이어서 실행한다 (toSuiteRobot) */
  L.push("", "*** Test Cases ***", c.id + " " + c.name);
  if (c.pre) L.push(SEP + "[Documentation]" + SEP + "사전조건: " + c.pre);
  /* 시작 상태(로그인 등)는 스위트가 정한다 — 케이스 .robot 에는 넣지 않는다 */
  const tags = String(c.tags || "").split(/[,\s]+/).filter(Boolean);
  if (tags.length) L.push(SEP + "[Tags]" + SEP + tags.join(SEP));
  /* 절차가 있으면 묶음마다 '# 절차 n' 주석을 넣는다 — .robot 만 보는 사람도 무엇을 검증하는 줄인지 알 수 있게 */
  let lastN = null;
  (c.steps || []).forEach((s) => {
    const pl = (c.proc || [])[s.n - 1];
    if ((c.proc || []).length && s.n !== lastN) { L.push(SEP + "# 절차 " + (pl ? s.n + ": " + pl.t : "연결 없음")); lastN = s.n; }
    L.push(SEP + stepLine(s, (pl || {}).t));
  });
  if (!(c.steps || []).length) L.push(SEP + "# 스텝이 없습니다");
  return L.join("\n");
};

/* ── 스위트 내보내기 — suite.robot + proba.resource 두 파일이면 PROBA 밖에서도 `robot suite.robot` 으로 돈다
   · 케이스는 부품(본문만), 실행 단위는 스위트: 앱은 Suite Setup 에서 한 번 열고 Suite Teardown 에서 닫는다
   · 앞이 실패하면 뒤는 건너뜀 — PROBA 실행과 같은 규칙을 Test Setup 의 Skip If 로 건다
   · Full-Code 원문의 설정 줄(Library 등)은 모으고, 앱 열기·닫기 줄은 버린다 · 키워드 이름이 겹치면 알린다
   · 비밀번호·토큰은 파일에 쓰지 않는다 — 실행할 때 -v 로 넘긴다 */
const sectionsOf = (text) => {
  const out = { settings: [], variables: [], tests: [], keywords: [] }; let sec = null;
  String(text || "").replace(/\r/g, "").split("\n").forEach((l) => {
    const m = l.match(/^\*{3}\s*(.+?)\s*\*{3}/);
    if (m) { const k = m[1].toLowerCase(); sec = /setting/.test(k) ? "settings" : /variable/.test(k) ? "variables" : /test case|task/.test(k) ? "tests" : /keyword/.test(k) ? "keywords" : null; return; }
    if (sec) out[sec].push(l);
  });
  return out;
};
const blocksOf = (lines) => { const bs = []; lines.forEach((l) => { if (l.trim() && !/^\s/.test(l)) bs.push({ name: l.trim(), lines: [l] }); else if (bs.length) bs[bs.length - 1].lines.push(l); }); return bs.map((b) => ({ ...b, lines: trimEnd(b.lines) })); };
const trimEnd = (ls) => { const a = [...ls]; while (a.length && !a[a.length - 1].trim()) a.pop(); return a; };
export const toSuiteRobot = (s, cases) => {
  const m = {}; (cases || []).forEach((c) => { m[c.id] = c; });
  const list = (s.items || []).map((id) => m[id]).filter(Boolean);
  const libs = ["Library" + SEP + "AppiumLibrary"], tests = [], vars = [], kws = [], warns = [], owner = {};
  list.forEach((c) => {
    const sec = sectionsOf(c.level === "Full-Code" ? stripAppSession(c.code) : toRobot(c));
    sec.settings.map((l) => l.trim().replace(/\s{2,}#.*$/, "")).forEach((t) => {
      if (/^library\s/i.test(t) && !libs.some((x) => x.toLowerCase() === t.toLowerCase())) libs.push(t);
      else if (/^resource\s/i.test(t) && !/proba\.resource/i.test(t) && !libs.includes(t)) { libs.push(t); warns.push(c.id + " 이(가) " + t.split(/\s{2,}/)[1] + " 을(를) 씁니다 — 이 파일도 같은 폴더에 두세요"); }
    });
    tests.push("# ── " + c.id + " · " + c.level + (c.status !== "승인" ? " · " + c.status : ""), ...trimEnd(sec.tests.filter((l, i, a) => l.trim() || a.slice(0, i).some((x) => x.trim()))), "");
    vars.push(...sec.variables.filter((l) => l.trim()));
    blocksOf(sec.keywords).forEach((b) => {
      const prev = owner[b.name];
      if (!prev) { owner[b.name] = { id: c.id, body: b.lines.join("\n") }; kws.push(...b.lines, ""); }
      else if (prev.body !== b.lines.join("\n")) warns.push("키워드 \"" + b.name + "\" 이(가) " + prev.id + " 와 " + c.id + " 에 서로 다르게 있습니다 — 한쪽 이름을 바꾸세요 (그대로면 실행 시 오류)");
    });
  });
  if (list.some((c) => (c.steps || []).some((x) => (ACT[x.act] || {}).api)) && !libs.includes("Library" + SEP + "RequestsLibrary")) libs.push("Library" + SEP + "RequestsLibrary");
  const L = ["*** Settings ***",
    "Documentation" + SEP + s.name + (s.desc ? " — " + s.desc : "") + " · PROBA 에서 내보냄. 위에서부터 순서대로 실행하고, 앞이 실패하면 뒤는 건너뜁니다",
    ...libs, "Resource" + SEP + "proba.resource",
    "Suite Setup" + SEP + "앱 실행", "Suite Teardown" + SEP + "Close All Applications",
    "Test Setup" + SEP + "Skip If" + SEP + "'${PREV TEST STATUS}' in ['FAIL', 'SKIP']" + SEP + "앞 단계 실패: ${PREV TEST NAME}", ""];
  if (vars.length) L.push("*** Variables ***", ...vars, "");
  L.push("*** Test Cases ***", ...tests);
  if (kws.length) L.push("*** Keywords ***", ...trimEnd(kws));
  return { text: trimEnd(L).join("\n") + "\n", warns };
};
/* 계정은 스위트의 계정 역할로 고른다. 비밀번호·토큰은 비워 둔다 (secretRef 이름만 주석으로 알려 준다) */
export const toProbaResource = (s, env, cases) => {
  const a = ((env && env.accts) || []).find((x) => x.role === s.acctRole) || ((env && env.accts) || [])[0] || {};
  const app = (env && env.app) || {};
  const api = (s.items || []).some((id) => ((cases || []).find((c) => c.id === id) || { steps: [] }).steps.some((x) => (ACT[x.act] || {}).api));
  return [
    "*** Settings ***", "Documentation" + SEP + "PROBA 실행 리소스 — " + (env ? env.env : "") + " 환경 · 계정 역할 " + (s.acctRole || "기본"),
    "Library" + SEP + "AppiumLibrary", ...(api ? ["Library" + SEP + "RequestsLibrary"] : []), "",
    "*** Variables ***",
    "${REMOTE_URL}" + SEP + "http://127.0.0.1:4723",
    "${APP_ID}" + SEP + (app.appId || ""),
    "${계정 ID}" + SEP + (a.acct || ""),
    "${계정 비밀번호}" + SEP + "${EMPTY}" + SEP + "# 파일에 쓰지 않는다 — 실행 시 -v 로 넘긴다" + (a.secretRef ? " (PROBA 변수 " + a.secretRef + ")" : ""),
    ...(api ? ["${API_BASE}" + SEP + (env.apiBase || ""), "${API_TOKEN}" + SEP + "${EMPTY}" + SEP + "# -v 로 넘긴다" + (env.apiTokenRef ? " (PROBA 변수 " + env.apiTokenRef + ")" : "")] : []), "",
    "*** Keywords ***",
    "앱 실행", SEP + "Open Application" + SEP + "${REMOTE_URL}" + SEP + "platformName=" + (app.platform || "Android") + SEP + "automationName=UiAutomator2" + SEP + "appPackage=${APP_ID}" + SEP + "noReset=false",
    ...(api ? ["", "API 요청", SEP + "[Arguments]" + SEP + "${요청}" + SEP + "@{옵션}", SEP + "# 러너가 쓰는 것과 같은 구현을 내보낸다 (목업에서는 생략)", "",
               "응답 검증", SEP + "[Arguments]" + SEP + "${대상}" + SEP + "${기대}", SEP + "# 러너가 쓰는 것과 같은 구현을 내보낸다 (목업에서는 생략)"] : []),
  ].join("\n") + "\n";
};

/* ── .robot 가져오기 파서 ─────────────────────────────────────
   RF 파일 형식: *** Section *** / 들여쓰지 않은 줄 = 테스트·키워드 이름 / 들여쓴 줄 = 본문(2칸 이상 공백으로 구분)
   판정: 아는 키워드만 있으면 Low-Code(스텝), 반복·조건·변수 대입·모르는 키워드가 있으면 Full-Code */
/* REV 는 위 ACTS 에서 파생된다 (파일 상단 참조) */
const IGNORE = ["open application", "close application", "close all applications", "log", "capture page screenshot"];
const CONTROL = /^(FOR|END|IF|ELSE IF|ELSE|WHILE|TRY|EXCEPT|FINALLY|BREAK|CONTINUE|RETURN)$/;
export const parseRobot = (text, fileName) => {
  const out = { tests: [], keywords: [], notes: [] };
  let sec = ""; let cur = null;
  String(text || "").replace(/\r/g, "").split("\n").forEach((raw) => {
    const sm = raw.match(/^\*{3}\s*(.+?)\s*\*{3}/);
    if (sm) { sec = sm[1].toLowerCase(); cur = null; return; }
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const isTest = /test case|task/.test(sec); const isKw = /keyword/.test(sec);
    if (!isTest && !isKw) { if (/^(test setup|suite setup)/i.test(raw) && /open application/i.test(raw)) out.notes.push("앱 열기·닫기 설정(Open Application)은 가져오지 않습니다 — 스위트가 한 번 열고 순서대로 이어서 실행합니다"); return; }
    if (!/^\s/.test(raw)) { cur = { name: raw.trim(), lines: [], tags: [], args: [], raw: [raw] }; (isTest ? out.tests : out.keywords).push({ ...cur, src: fileName }); cur = (isTest ? out.tests : out.keywords)[(isTest ? out.tests : out.keywords).length - 1]; return; }
    if (!cur) return;
    cur.raw.push(raw);
    const tok = raw.trim().split(/\s{2,}|\t+/).map((x) => x.trim()).filter(Boolean);
    if (!tok.length) return;
    if (/^\[tags\]$/i.test(tok[0])) { cur.tags = tok.slice(1); return; }
    if (/^\[arguments\]$/i.test(tok[0])) { cur.args = tok.slice(1); return; }
    if (/^\[/.test(tok[0])) return;
    cur.lines.push(tok);
  });
  return out;
};
/* 테스트 1건 → 스텝 변환 시도. 실패 사유가 있으면 Full-Code로 가져온다.
   사용자 키워드(*** Keywords ***) 호출은 그 내용을 '펼쳐 넣는다' — 인자는 호출 값으로 치환.
   (MQA 는 공통 키워드라는 별도 개념을 두지 않는다. 재사용은 스위트에 케이스를 순서대로 넣어 한다 — suiteLogic.js) */
const subst = (v, env) => String(v).replace(/\$\{([^}]+)\}/g, (m, k) => (k in env ? env[k] : m));
/* 줄 → 스텝. stepLine 의 역방향이고 같은 ACTS 를 본다 — 둘이 어긋날 수 없다. */
const lineToStep = (tok) => {
  const a = ACT[REV[String(tok[0] || "").toLowerCase()]];
  if (!a) return null;                       // 모르는 키워드 → 호출부가 Full-Code 로 보낸다
  if (a.fromLine) return { act: a.id, ...a.fromLine(tok) };
  const st = { act: a.id };
  (a.needs || []).forEach((k, i) => { st[k] = tok[i + 1] || ""; });
  return st;
};
export const robotTestToSteps = (t, kwMap) => {
  const steps = []; const reasons = []; const expanded = []; const raws = [];
  const walk = (lines, env, depth, from) => {
    lines.forEach((raw) => {
      const tok = raw.map((x) => subst(x, env));
      const k = tok[0]; const lk = k.toLowerCase();
      /* 🔑 블록 구조만 Full-Code 로 보낸다. 변수 대입(${x}= …)은 한 줄이라 코드 스텝으로 흘려보낸다.
         전에는 둘을 같이 막아서 변수 하나 때문에 케이스 전체를 잃었다 — 1단계의 판단과 같다.
         (대입을 코드 스텝으로 두어도 RF 는 같은 테스트 본문에서 그 변수를 그대로 읽는다) */
      if (CONTROL.test(k)) { reasons.push(from ? "키워드 '" + from + "'에 반복·조건 포함" : "반복·조건 포함"); return; }
      if (IGNORE.includes(lk)) return;
      const st = lineToStep(tok);
      if (st) { steps.push({ id: sid(), n: steps.length + 1, ...st }); return; }
      const kw = (kwMap || {})[k];
      if (kw && depth < 3) {
        const env2 = {}; (kw.args || []).forEach((a, i) => { env2[a.replace(/^\$\{|\}$/g, "")] = tok[i + 1] != null ? tok[i + 1] : ""; });
        expanded.push(k); walk(kw.lines, env2, depth + 1, k); return;
      }
      /* 🔑 모르는 키워드는 그 줄만 코드 스텝으로 보존한다 — 케이스 전체를 Full-Code 로 보내지 않는다.
         반복·조건(위 CONTROL)은 여전히 Full-Code 다. 한 줄이 아니라 블록이라 스텝으로 쪼갤 수 없다. */
      steps.push({ id: sid(), n: steps.length + 1, act: "코드 스텝", val: tok.join(SEP), src: k });
      raws.push(k);
    });
  };
  walk(t.lines, {}, 0, "");
  /* raws = 코드 스텝으로 보존한 키워드. 비율이 높으면 "Low-Code" 라 부르기 민망하므로
     가져오기 화면이 건수를 보여주고 Full-Code 를 권한다 — 통계가 거짓말하지 않게. */
  return { steps, reasons: [...new Set(reasons)], expanded: [...new Set(expanded)], raws: [...new Set(raws)] };
};

/* ── 엑셀 가져오기 ── 열 매핑 후 행 → 케이스. 절차 셀은 여러 줄 가능, 기대 결과는 줄 수가 같으면 짝지음 */
export const rowToCase = (row, map) => {
  const get = (k) => (map[k] != null && map[k] !== "" ? String(row[map[k]] || "") : "");
  const lines = get("proc").split(/\r?\n/).map((l) => stripNo(l)).filter(Boolean);
  const exps = get("exp").split(/\r?\n/).map((l) => stripNo(l)).filter(Boolean);
  /* 절차 칸 안의 '→ 기대 결과' 는 그 절차의 기대 결과로 (수동 TC 문서에 흔한 형식) */
  const proc = lines.map((l) => { const [t, ...e] = l.split(/\s*(?:→|->)\s*/); return { t: t.trim(), e: e.join(" → ").trim() }; });
  if (exps.length && exps.length === proc.length && !proc.some((p) => p.e)) proc.forEach((p, i) => { p.e = exps[i]; });
  else if (exps.length && proc.length) { const lp = proc[proc.length - 1]; lp.e = [lp.e, ...exps].filter(Boolean).join(" / "); }
  return { name: get("name").trim(), pre: get("pre").trim(), suite: get("suite").trim(), proc };
};
export const parseCsv = (text) => {
  const rows = []; let row = []; let cell = ""; let q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
};

/* ── 가져오기 체험용 샘플 파일 ── (특정 고객사·서비스명 없음) */
/* TC 임포트 샘플 — 실제 수동 TC 문서처럼 절차가 길고, 기대 결과가 절차 중간중간에 있다.
   시연 포인트: 대부분은 AI가 자동으로 스텝을 만들고(확정), 일부는 사람이 고른다
     · 3번 '마음에 드는 상품' → 요소를 특정할 수 없어 '확인 필요' (사람이 화면에서 선택)
     · 2번 '보습 태그' → 고유 ID가 없어 위치 로케이터 (통과하지만 깨지기 쉬움 경고)
     · 3 · 4번 사전조건 '로그인 상태' → 스위트에서 로그인 케이스를 앞에 두라는 안내 */
export const SAMPLE_EXCEL = [
  ["번호", "시나리오명", "사전조건", "테스트 절차", "기대결과", "분류"],
  ["1", "상품 검색 후 옵션 선택해 장바구니 담기", "",
    "1. 검색창을 누른다\n2. \"수분 립밤\"을 입력한다 → \"수분 립밤\"이 보인다\n3. 검색 결과 첫 번째 상품을 연다 → \"상품 상세\"가 보인다\n4. 용량 옵션 10g을 선택한다\n5. 수량 증가 버튼을 누른다 → \"수량 2\"가 보인다\n6. 장바구니 담기를 누른다 → \"장바구니에 담았습니다\"가 보인다\n7. 장바구니로 이동 버튼을 누른다",
    "장바구니에 \"수분 립밤\"이 담겨 있다", "주문"],
  ["2", "검색 결과 정렬 · 필터 적용", "",
    "1. 검색창을 누른다\n2. \"립밤\"을 입력한다\n3. 정렬 버튼을 누른다\n4. 낮은 가격순을 선택한다\n5. 필터 버튼을 누른다\n6. 보습 태그를 선택한다\n7. 적용 버튼을 누른다 → \"검색 결과 12건\"이 보인다\n8. 화면을 내린다",
    "", "상품 탐색"],
  ["3", "상품 찜하기 후 찜 목록 확인", "일반 계정으로 로그인 상태",
    "1. 검색창을 누른다\n2. \"립밤\"을 입력한다\n3. 마음에 드는 상품을 연다\n4. 찜하기 버튼을 누른다 → \"찜 목록에 추가했습니다\"가 보인다\n5. 뒤로 간다\n6. 하단 마이 탭을 누른다\n7. 찜 목록을 누른다",
    "찜 목록에 \"수분 립밤\"이 보인다", "상품 탐색"],
  ["4", "주문서 쿠폰 적용 (결제 전까지)", "일반 계정으로 로그인 상태 · 장바구니에 상품 1개 이상",
    "1. 하단 장바구니 탭을 누른다\n2. 주문하기 버튼을 누른다\n3. 쿠폰 선택 버튼을 누른다\n4. 신규 가입 쿠폰을 선택한다\n5. 적용 버튼을 누른다 → \"쿠폰 할인 적용\"이 보인다\n6. 결제 수단에서 신용카드를 선택한다",
    "\"신용카드\"가 선택된다 · 결제는 진행하지 않는다", "주문"],
];
export const SAMPLE_ROBOT = {
  name: "sample_tests.robot",
  text: `*** Settings ***
Library     AppiumLibrary
Test Setup    Open Application    \${REMOTE_URL}    platformName=Android    appPackage=com.example.shop

*** Test Cases ***
검색어 입력 후 결과 확인
    [Tags]    smoke
    Click Element    id=com.example.shop:id/search_bar
    Input Text    id=com.example.shop:id/search_bar    립밤
    Wait Until Page Contains    수분 립밤

로그인 후 마이 탭 확인
    공통 로그인    qa_user01    \${PW}
    Click Element    accessibility_id=마이 탭
    Wait Until Page Contains    주문 내역

상품 3개 연속 담기
    FOR    \${i}    IN RANGE    3
        Click Element    xpath=//android.view.ViewGroup[\${i}+1]
        Click Element    id=com.example.shop:id/btn_add_cart
        Go Back
    END

*** Keywords ***
공통 로그인
    [Arguments]    \${id}    \${pw}
    Click Element    accessibility_id=마이 탭
    Input Text    id=com.example.shop:id/input_id    \${id}
    Input Text    id=com.example.shop:id/input_pw    \${pw}
    Click Element    id=com.example.shop:id/btn_login
`,
};

/* ── AI 생성 '확인 필요' 후보 — 스텝 원문과 겹치는 단어가 많은 요소 순 (목업)
   실 구현: LLM 이 확신도와 함께 후보 요소를 돌려준다 (qa.rpc.ai.decide 응답) */
export const candidatesFor = (src, forText) => {
  const words = String(src || "").replace(/["“”'‘’]/g, " ").split(/\s+/).map((w) => w.replace(/(을|를|이|가|은|는|에|의|으로|로|한다|된다|뜬다|보인다|누른다|연다)$/, "")).filter((w) => w.length >= 2);
  const pool = L_ELEMS().filter((e) => !forText || e.text);
  const score = (e) => words.filter((w) => (e.label + " " + (e.text || "")).includes(w)).length;
  return pool.map((e) => ({ e, s: score(e) })).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.e);
};
const L_ELEMS = () => SCREEN_ELEMENTS;

/* ── Full-Code 문법 검사 (목업) — 실행하지 않고 구조만 본다
   실 구현: 러너/서버에서 Robot Framework 의 dry-run 으로 키워드 존재 · 인자 수까지 확인한다
   오류(error)는 검토중 저장 · 디버그 실행을 막고, 주의(warn)는 알리기만 한다 */
/* 🔑 ACTS 에서 파생한다 — 손으로 적으면 동작을 추가할 때마다 빠뜨리고,
   그러면 플랫폼이 '자기가 만든 키워드' 를 알 수 없는 키워드라고 경고한다(실제로 그랬다).
   뒤의 목록은 ACTS 에 없지만 .robot 에 정상적으로 나오는 것들 — 실행기가 넣거나 RF 기본 키워드다. */
const KNOWN_KW = [
  ...ACTS.filter((a) => a.kw).flatMap((a) => [a.kw, ...(a.alias || [])]).map((k) => k.toLowerCase()),
  "log", "capture page screenshot", "open application", "close application", "close all applications", "앱 실행",
];
/* 🔑 앱 열기·닫기는 스위트가 한다 — 케이스 안에서 하면 앞 케이스가 만든 상태가 사라지고, 뒤 케이스는 앱 없이 시작한다 */
const APP_KW = /^(open application|close application|close all applications|앱 실행)$/i;
const APP_SET = /^(test|suite) (setup|teardown)\b/i;
const APP_ANY = /open application|close (all )?applications?|앱 실행/i;
export const APP_SESSION_WARN = "앱 열기·닫기는 스위트가 합니다 — 여기서 하면 앞뒤 케이스와 이어지지 않습니다";
/* 가져온 원문의 앱 열기·닫기 설정 줄을 뺀다 */
export const stripAppSession = (code) => String(code || "").split("\n").filter((l) => !(APP_SET.test(l.trim()) && APP_ANY.test(l))).join("\n");
const CTRL = /^(FOR|END|IF|ELSE IF|ELSE|WHILE|TRY|EXCEPT|FINALLY|BREAK|CONTINUE|RETURN)$/;
export const checkRobot = (code) => {
  const lines = String(code || "").replace(/\r/g, "").split("\n");
  const errors = []; const warns = [];
  const userKw = new Set(); let sec = ""; let hasTests = false; let testCount = 0; let open = 0;
  lines.forEach((l) => { const m = l.match(/^\*{3}\s*(.+?)\s*\*{3}/); if (m) sec = m[1].toLowerCase(); else if (/keyword/.test(sec) && l.trim() && !/^\s/.test(l)) userKw.add(l.trim().toLowerCase()); });
  sec = "";
  lines.forEach((l, i) => {
    const n = i + 1; const m = l.match(/^\*{3}\s*(.+?)\s*\*{3}/);
    if (m) { sec = m[1].toLowerCase(); if (/test case/.test(sec)) hasTests = true; return; }
    if (!l.trim() || l.trim().startsWith("#")) return;
    if (/setting/.test(sec) && APP_SET.test(l.trim()) && APP_ANY.test(l)) { warns.push({ line: n, msg: APP_SESSION_WARN }); return; }
    if (!/test case|keyword/.test(sec)) return;
    if (!/^\s/.test(l)) { if (/test case/.test(sec)) testCount++; return; }
    if (/^ \S/.test(l)) { errors.push({ line: n, msg: "들여쓰기는 공백 2칸 이상이어야 합니다" }); return; }
    const tok = l.trim().split(/\s{2,}|\t+/);
    const k = tok[0];
    if (/^\[/.test(k) || /^\$\{.+\}\s*=?$/.test(k)) return;
    if (APP_KW.test(k)) { warns.push({ line: n, msg: APP_SESSION_WARN }); return; }
    if (CTRL.test(k)) { if (k === "FOR" || k === "IF" || k === "WHILE" || k === "TRY") open++; if (k === "END") open--; return; }
    if (/\s\S/.test(k) && tok.length === 1 && /\s/.test(l.trim()) && l.trim().split(/\s{2,}/).length === 1 && /^(Click Element|Input Text|Wait Until)\s\S/.test(l.trim())) { errors.push({ line: n, msg: "키워드와 인자 사이는 공백 2칸 이상으로 띄워야 합니다" }); return; }
    if (!KNOWN_KW.includes(k.toLowerCase()) && !userKw.has(k.toLowerCase())) warns.push({ line: n, msg: "알 수 없는 키워드 \"" + k + "\" — 실행할 때 실패할 수 있습니다" });
  });
  if (!hasTests) errors.unshift({ line: 0, msg: "테스트 섹션(*** Test Cases ***)이 없습니다" });
  else if (!testCount) errors.unshift({ line: 0, msg: "테스트 이름이 없습니다 — 들여쓰지 않은 줄로 테스트 이름을 쓰세요" });
  if (open > 0) errors.push({ line: 0, msg: "FOR · IF 블록이 END 로 닫히지 않았습니다" });
  return { errors, warns };
};

/* ── 절차 ↔ 스텝 연결 ───────────────────────────────────────
   스텝 s.n = 그 스텝이 수행하는 절차 번호(1부터). 스텝은 항상 절차 순서로 정렬해 둔다 — 화면의 묶음 순서 = 실행 순서
   절차 행의 b = 그 절차의 스텝을 마지막으로 맞춘 시점의 절차 문장. 지금 문장과 다르면 '확인 필요'
     · b 가 정해지는 때: AI 생성 반영 · 그 절차의 스텝을 고칠 때 · '확인함' · 처음 절차를 고치기 직전(이전 문장을 기억)
   → 아무 스텝이나 고쳤다고 경고하지 않고, '문장이 바뀌었는데 스텝은 그대로인 절차'만 짚는다 */
export const procKey = (p) => String((p || {}).t || "").trim() + "→" + String((p || {}).e || "").trim();
export const procChanged = (p, hasSteps) => !!hasSteps && p.b !== undefined && procKey(p) !== p.b;
export const changedProcs = (c) => (c.proc || []).map((p, k) => (procChanged(p, (c.steps || []).some((s) => s.n === k + 1)) ? k + 1 : 0)).filter(Boolean);
export const sortByProc = (steps, len) => steps.map((s, i) => ({ s, i, k: s.n >= 1 && s.n <= len ? s.n : len + 1 })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.s);
export const remapSteps = (steps, map, len) => sortByProc(steps.map((s) => (map[s.n] !== undefined ? { ...s, n: map[s.n] } : s)), len);
/* 빈 절차 행을 걷어낸다 — 그 행에 붙은 스텝은 앞 절차(없으면 다음 절차)로 */
export const compactProc = (proc, steps) => {
  const keep = []; (proc || []).forEach((p, j) => { if (String(p.t || "").trim()) keep.push(j); });
  const map = {};
  (proc || []).forEach((_, j) => { const ni = keep.indexOf(j); map[j + 1] = ni >= 0 ? ni + 1 : Math.max(1, keep.filter((x) => x < j).length); });
  const np = keep.map((j) => { const p = proc[j]; const o = { t: String(p.t).trim(), e: String(p.e || "").trim() }; if (p.b !== undefined) o.b = p.b; return o; });
  return { proc: np, steps: np.length ? remapSteps(steps || [], map, np.length) : (steps || []) };
};

/* ── AI 전송 전 가림 (서버에서 수행 · 목업은 같은 규칙을 화면에 보여주기만) ──
   전화번호 · 이메일 · 카드번호 형태를 [가림] 으로 바꾼다. 결과를 받으면 원래 값으로 되돌린다 */
const MASK_RE = [/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, /[\w.+-]+@[\w-]+\.[\w.]+/g, /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g];
export const maskText = (text) => { let n = 0; let t = String(text || ""); MASK_RE.forEach((re) => { t = t.replace(re, () => { n++; return "[가림]"; }); }); return { text: t, count: n }; };
