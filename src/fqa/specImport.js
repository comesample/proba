// ============================================================
// 스크립트 임포트 — Playwright 테스트 파일(.spec.ts) → 케이스 (MQA .robot 가져오기와 같은 규칙)
//   · test() 하나 = 케이스 하나 (초안)
//   · 아는 동작만 있으면 Low-Code(스텝) · 반복 · 조건 · 함수 정의 · 다른 파일에서 불러온 함수가 있으면 Full-Code(원문)
//   · 스텝으로 바꾸지 못한 page 호출 한 줄은 '코드 스텝' 으로 보존한다 (레코딩과 같은 규칙 · 손실 0)
//   · beforeEach / beforeAll 의 로그인 등은 케이스에 넣지 않는다 — 스위트 앞 순서 케이스가 맡는다
//   · test.describe 이름으로 스위트를 만들지 않는다 (스위트는 실행 흐름이라 가져온 뒤 스위트에서 넣는다)
//   · 코드에 그대로 적힌 계정 값은 ${계정 ID} · ${계정 비밀번호} 로 바꾼다 (레코딩과 같은 규칙)
//   목업: 정규식으로 읽는다. 실 구현은 서버가 TypeScript AST 로 읽는다 (레코딩 CLI 와 같은 파서)
// ============================================================

/* 따옴표 문자열 하나 읽기 — '…' · "…" · `…`(치환 없는 것만) */
const STR = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60([^\x60$]*)\x60)`;
const strOf = (m, i) => (m[i] != null ? m[i] : m[i + 1] != null ? m[i + 1] : m[i + 2] || "").replace(/\\(.)/g, "$1");

/* 로케이터 식 → PROBA 로케이터 표기 (stepLogic.LOC_DSL 의 반대 방향 — 두 표가 어긋나면 안 된다) */
const LOC_RE = [
  [new RegExp("^getByTestId\\(" + STR + "\\)$"), (m) => "[data-testid=" + strOf(m, 1) + "]"],
  [new RegExp("^getByRole\\(" + STR + ",\\s*\\{\\s*name:\\s*" + STR + "\\s*\\}\\)$"), (m) => "role=" + strOf(m, 1) + "[" + strOf(m, 4) + "]"],
  [new RegExp("^getByRole\\(" + STR + "\\)$"), (m) => "role=" + strOf(m, 1)],
  [new RegExp("^getByText\\(" + STR + "\\)$"), (m) => "text=" + strOf(m, 1)],
  [new RegExp("^getByPlaceholder\\(" + STR + "\\)$"), (m) => "placeholder=" + strOf(m, 1)],
  [new RegExp("^getByLabel\\(" + STR + "\\)$"), (m) => "label=" + strOf(m, 1)],
  [new RegExp("^getByAltText\\(" + STR + "\\)$"), (m) => "alt=" + strOf(m, 1)],
  [new RegExp("^getByTitle\\(" + STR + "\\)$"), (m) => "title=" + strOf(m, 1)],
  [new RegExp("^locator\\(" + STR + "\\)$"), (m) => strOf(m, 1)],
];
const locOf = (expr) => { for (const [re, fn] of LOC_RE) { const m = expr.match(re); if (m) return fn(m); } return null; };
/* 'page.X.Y(arg)' 꼴을 [로케이터 식, 동작, 인자] 로 — 체인(.first() · .nth() · .filter())이 붙으면 모름 */
const splitCall = (s) => { const m = s.match(/^page\.(.+)\.(\w+)\((.*)\)$/); return m ? { loc: locOf(m[1]), act: m[2], arg: m[3] } : null; };
const argStr = (a) => { const m = String(a || "").trim().match(new RegExp("^" + STR + "$")); return m ? strOf(m, 1) : null; };

/* 계정 값 — 로케이터가 아이디 · 비밀번호 칸이면 적힌 값을 변수로 바꾼다 */
const acctVar = (loc, v) => (/password|비밀번호|pw\b/i.test(loc) ? "${계정 비밀번호}" : /userid|username|아이디|email|login-id|\bid\b/i.test(loc) ? "${계정 ID}" : v);

/* 한 줄 → 스텝 · 모르면 null */
const lineToStep = (raw) => {
  const s = raw.trim().replace(/;$/, "").replace(/^await\s+/, "");
  let m;
  if ((m = s.match(new RegExp("^page\\.goto\\(" + STR + "\\)$")))) { let u = strOf(m, 1); const abs = /^https?:\/\//.test(u); if (abs) u = u.replace(/^https?:\/\/[^/]+/, "") || "/"; return { act: "이동", loc: u, val: "-", abs }; }
  if ((m = s.match(/^expect\((page\..+?)\)\.(not\.)?(\w+)\((.*)\)$/))) {
    const loc = locOf(m[1].replace(/^page\./, "")); if (!loc) return null;
    const a = argStr(m[4]); const not = !!m[2]; const k = m[3];
    const val = k === "toBeVisible" ? (not ? "visible = false" : "visible = true") : k === "toBeHidden" ? "visible = false"
      : k === "toBeChecked" ? (not ? "checked = false" : "checked = true") : k === "toBeEnabled" ? "enabled = true" : k === "toBeDisabled" ? "enabled = false"
      : (k === "toContainText" || k === "toHaveText") && a != null && !not ? 'text = "' + a + '"' : k === "toHaveValue" && a != null && !not ? 'value = "' + a + '"' : null;
    return val ? { act: "화면 검증", loc, val } : null;
  }
  const c = splitCall(s); if (!c || !c.loc) return null;
  const a = argStr(c.arg);
  if (c.act === "click" && !c.arg.trim()) return { act: "클릭", loc: c.loc, val: "-" };
  if (c.act === "fill" && a != null) { const v = acctVar(c.loc, a); return { act: "입력", loc: c.loc, val: v, acct: v !== a }; }
  if (c.act === "selectOption" && a != null) return { act: "선택", loc: c.loc, val: a };
  if (c.act === "check" && !c.arg.trim()) return { act: "체크", loc: c.loc, val: "체크" };
  if (c.act === "uncheck" && !c.arg.trim()) return { act: "체크", loc: c.loc, val: "해제" };
  if (c.act === "press" && a != null) return { act: "키 누르기", loc: c.loc, val: a };
  return null;
};

/* 중괄호 짝 맞추기 — 문자열 · 주석 안의 괄호는 센다고 치지 않는다 (목업 수준) */
const blockEnd = (src, open) => { let d = 0, q = ""; for (let i = open; i < src.length; i++) { const ch = src[i]; if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; continue; } if (ch === "'" || ch === '"' || ch === "`") { q = ch; continue; } if (ch === "{") d++; else if (ch === "}") { d--; if (d === 0) return i; } } return -1; };

export const parseSpec = (text, file) => {
  const src = String(text || "").replace(/\r/g, "");
  const notes = [];
  const imports = [...src.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  if (imports.length) notes.push(file + ": 다른 파일에서 불러온 " + imports.join(", ") + " 은(는) 함께 가져오지 않습니다 — 이를 쓰는 테스트는 Full-Code로 들어옵니다");
  if (/test\.(beforeEach|beforeAll)\s*\(/.test(src)) notes.push(file + ": beforeEach · beforeAll 은 가져오지 않았습니다 — 로그인 같은 앞 단계는 스위트 앞 순서에 그 케이스를 두세요");
  const tests = [];
  const re = new RegExp("\\btest(?:\\.only|\\.skip)?\\(\\s*" + STR + "\\s*,\\s*(\\{[^}]*\\}\\s*,\\s*)?async\\s*\\(\\s*\\{[^}]*\\}\\s*\\)\\s*=>\\s*\\{", "g");
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1; const end = blockEnd(src, open); if (end < 0) break;
    const body = src.slice(open + 1, end).split("\n").map((l) => l.replace(/^\s{2,4}/, "")).filter((l) => l.trim());
    const name = strOf(m, 1);
    const tags = [...new Set([...(name.match(/@\w+/g) || []), ...(((m[4] || "").match(/@\w+/g)) || [])].map((t) => t.slice(1)))];
    tests.push({ name: name.replace(/\s*@\w+/g, "").trim(), tags, body, file });
    re.lastIndex = end;
  }
  return { tests, notes, imports };
};

/* 테스트 하나 → Low-Code 스텝 또는 Full-Code 판단 */
export const specTestToCase = (t, imports) => {
  const reasons = [];
  const src = t.body.join("\n");
  if (/^\s*(for|while|if|switch|try)\b|\.forEach\(|=>\s*\{/m.test(src)) reasons.push("반복 · 조건이 있음");
  if (/^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?(\(|function)/m.test(src) || /^\s*function\s/m.test(src)) reasons.push("함수 정의가 있음");
  const usedImp = (imports || []).filter((n) => new RegExp("\\b" + n + "\\b").test(src));
  if (usedImp.length) reasons.push("불러온 " + usedImp.join(", ") + " 사용");
  if (/\b(chromium|firefox|webkit)\.launch\(|\.newContext\(|\.newPage\(/.test(src)) reasons.push("케이스 안에서 브라우저를 엶");
  if (reasons.length) {
    const code = "import { test, expect } from '@playwright/test';\n\ntest(" + JSON.stringify(t.name).replace(/^"|"$/g, "'") + ", async ({ page }) => {\n" + t.body.map((l) => "  " + l).join("\n") + "\n});";
    return { level: "Full-Code", steps: [], code, reasons, raws: 0, acct: false, abs: false };
  }
  const steps = []; let raws = 0, acct = false, abs = false;
  t.body.forEach((l) => {
    if (/^\s*\/\//.test(l)) return;
    const st = lineToStep(l);
    if (st) { if (st.acct) acct = true; if (st.abs) abs = true; const { acct: _a, abs: _b, ...rest } = st; steps.push(rest); }
    else { raws++; const last = steps[steps.length - 1]; if (last && last.act === "코드 스텝") last.code += "\n" + l.trim(); else steps.push({ act: "코드 스텝", loc: "", val: "", code: l.trim() }); }
  });
  return { level: "Low-Code", steps, reasons: [], raws, acct, abs, login: steps.some((s) => s.val === "${계정 비밀번호}") };
};

export const SAMPLE_SPEC = { name: "checkout.spec.ts", text: `import { test, expect } from '@playwright/test';
import { addToCart } from './helpers';

test.describe('주문', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://staging.onmarket.io/login');
    await page.getByTestId('userid').fill('qa_user01');
    await page.getByTestId('password').fill('Passw0rd!');
    await page.getByRole('button', { name: '로그인' }).click();
  });

  test('쿠폰 적용 상태 반영 @regression', async ({ page }) => {
    await page.goto('/my/coupons');
    await page.locator('#btn_apply_coupon').click();
    await expect(page.getByTestId('coupon_status')).toContainText('적용됨');
  });

  test('장바구니 담기 후 수량 표시', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('product-featured').click();
    await page.getByRole('button', { name: '장바구니 담기' }).click();
    await page.getByTestId('cart-count').first().waitFor();
    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  test('여러 상품 한 번에 담기', async ({ page }) => {
    for (const name of ['수분 립밤', '컬러 립밤']) {
      await addToCart(page, name);
    }
    await expect(page.getByTestId('cart-count')).toHaveText('2');
  });
});
` };
