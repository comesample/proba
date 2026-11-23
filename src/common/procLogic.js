// ============================================================
// 자연어 절차 — MQA · FQA 공통 (원래 mqa/caseLogic.js 에 있던 것을 옮김 · 동작 변경 없음)
//   절차 행 { t: 할 일, e: 기대 결과(선택), b: 스텝을 마지막으로 맞춘 시점의 문장 }
//   스텝 s.n = 그 스텝이 수행하는 절차 번호(1부터)
// ============================================================
/* ── 자연어 절차 ── 한 줄 = 한 단계, "→" 뒤는 기대 결과 */
export const stripNo = (t) => t.replace(/^\s*(\d+[.)]|[-•*·])\s*/, "").trim();
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

/* ── TC 임포트 — 표의 한 행 → { name, pre, suite, proc } · CSV 읽기 ── */
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
