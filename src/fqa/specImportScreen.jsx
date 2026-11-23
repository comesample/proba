// FQA 스크립트 임포트 — Playwright .spec.ts (파일 또는 붙여넣기) → Low-Code(스텝) 또는 Full-Code
//   화면 틀은 MQA 와 공용(common/TcImport.ScriptImport) · 해석은 specImport.js
//   코드로 시작하는 길은 여기 하나다 — 직접 작성은 스텝(Low-Code)으로만 시작한다 (MQA 와 같은 규칙)
import { Badge } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { ScriptImport } from "../common/TcImport.jsx";
import { TAGS, nextTcId } from "./logic.js";
import * as SP from "./specImport.js";

export function FqaSpecImportScreen({ onDone, onCancel }) {
  const { fqaCases, addFqaCase } = useApp();
  const analyze = (list) => {
    const acc = { files: list.map((x) => x.name), tests: [], notes: [], imports: [] };
    list.forEach(({ name, text }) => { const r = SP.parseSpec(text, name); acc.tests.push(...r.tests); acc.notes.push(...r.notes); acc.imports.push(...r.imports); });
    if (!acc.tests.length) return { error: "test() 를 찾지 못했습니다 — Playwright 테스트 코드인지 확인하세요" };
    return { files: acc.files, notes: acc.notes, rows: acc.tests.map((t, i) => ({ key: i, name: t.name, tags: t.tags, ...SP.specTestToCase(t, acc.imports) })) };
  };
  /* 🔑 코드 스텝 줄 수를 같이 보여준다 — 비율이 높으면 "Low-Code" 라는 말이 거짓말이 된다 */
  const renderMode = (x) => (x.reasons.length
    ? <><Badge kind="warn">Full-Code로</Badge><span className="ml-1.5 text-slate-500">{x.reasons.join(" · ")}</span></>
    : <><Badge kind="pass">Low-Code로</Badge><span className="ml-1.5 text-slate-500">{x.steps.length}스텝{x.raws ? " · 코드 스텝 " + x.raws + "줄" : ""}{x.acct ? " · 계정 값 → 변수" : ""}{x.abs ? " · 주소는 경로만" : ""}{x.login ? " · 로그인 스텝 포함 — 로그인 케이스로 따로 두는 것을 권장" : ""}</span></>);
  const go = (rows) => {
    // 태그는 정해진 목록만 쓴다 — 목록에 없는 태그는 버린다
    rows.forEach((x, k) => addFqaCase({ id: nextTcId(fqaCases, k), origin: "스크립트 임포트", name: x.name, tags: (x.tags || []).filter((g) => TAGS.includes(g)).join(","), status: "초안", level: x.level, dataset: "-", steps: x.steps, code: x.code || "" }));
    onDone(rows.length + "건 가져옴 (초안)" + (rows.some((x) => x.acct) ? " · 계정 값은 ${계정 ID} · ${계정 비밀번호} 로 바꿨습니다" : ""));
  };
  return <ScriptImport title="스크립트 임포트" desc="Playwright (.spec.ts) → Low-Code(스텝) 또는 Full-Code"
    accept=".ts,.js" fileRe={/\.(ts|js)$/i} fileErr=".spec.ts 파일을 올려 주세요" fileHint="Playwright 테스트 파일(.spec.ts)을 올리세요 — test() 하나가 케이스 하나가 됩니다"
    pasteName="붙여넣은 코드" pastePh={"test('로그인 실패 안내', async ({ page }) => {\n  await page.goto('/login');\n  ...\n});"} sample={SP.SAMPLE_SPEC}
    analyze={analyze} renderMode={renderMode} onGo={go} onCancel={onCancel} footNote="가져온 케이스는 모두 초안입니다. 스위트에는 가져온 뒤 넣습니다." />;
}
