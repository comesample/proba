// FQA 테스트케이스 에디터 — 자연어 절차 · 스텝(Low-Code) · 코드(Full-Code) · 디버그 실행 · 검토(승인/반려)
import { Fragment, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Code2, Copy, GripVertical, History, Info, Lock, MoreHorizontal, MousePointerClick, Play, RefreshCw, Save, Send, Sparkles, X, XCircle } from "lucide-react";
import { Badge, Btn, Card, Input, Modal, Portal, SEL_CARD, Select, Toast, useToast } from "../common/ui.jsx";
import * as PL from "../common/procLogic.js";
import { useApp } from "../common/context.js";
import { DatasetPicker } from "../common/DatasetPicker.jsx";
import { STEP_ACTS } from "./data.js";
import { SURF_K, envCovers, envOpts, lastOf, nextTcId, refKey, surfacesOf } from "./logic.js";
import { Hdr, TagPicker, taCls } from "./parts.jsx";
import * as SL from "./suiteLogic.js";
import * as AI from "./aiLogic.js";
import { FqaGenModal, WebPickModal } from "./aiGen.jsx";
import { ASSERTS, DIFF_CLS, DIFF_MARK, DS_MAX_ROWS, LOC_HINT, LOC_PH, LV, REQ_METHODS, VAL_PH, assertDef, fieldDiff, fullCodeWarns, hasBody, isStatusTarget, lcsDiff, parseAssert, reqJoin, reqParts, respCond, simCode, simRun, stepErrors, stepKey, stepText, stepsToCode } from "./stepLogic.js";
export function FqaEditorScreen({ entry = "Low-Code", tc, onDirty, onOpen }) {
  const { commitFqaCase, addFqaCase, setFqaCaseStatus, updateFqaSuite, fqaSuites, fqaCases, fqaRuns, fqaSystems, datasets, debugEnv, setDebugEnv, setNavGuard } = useApp();
  const [msg, flash] = useToast();
  const [status, setStatus] = useState(tc && tc.status ? tc.status : "검토중");
  const stEK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const [qa, setQa] = useState(null);
  const [runRes, setRunRes] = useState(null);
  const ei = Math.max(0, LV.indexOf(entry));
  const [committed, setCommitted] = useState(ei);
  const [view, setView] = useState(entry);
  // 에디터는 언제나 케이스와 함께 열린다 — 스텝이 비어 있으면 비어 있는 채로(직접 작성)
  const initSteps = (tc && tc.steps) || [];
  const [steps, setSteps] = useState(initSteps);
  /* 자연어 절차 — 무엇을 검증하나 · AI로 스텝 만들기의 입력 (MQA 와 같은 모델: 행 { t, e }, 스텝 s.n = 절차 번호)
     절차가 있으면 보이고, 없으면 '+ 자연어 절차' 를 누를 때만 연다 (스텝부터 바로 쓰는 경우가 있다) */
  const initProc = (tc && tc.proc) || [];
  const [proc, setProc] = useState(initProc);
  const [showProc, setShowProc] = useState(initProc.length > 0);
  const [focusRow, setFocusRow] = useState(null);
  const [rowDrag, setRowDrag] = useState(null);
  const [paste, setPaste] = useState(null);      // 여러 줄 붙여넣기 { text }
  const [gen, setGen] = useState(false);         // AI로 스텝 만들기 진행 창
  // 생성 경로 — 최초 생성 때 정해진다. 아직 저장 전인 새 케이스를 AI로 채우면 'AI 생성'
  const [origin, setOrigin] = useState((tc && tc.origin) || "직접 작성");
  const [addSu, setAddSu] = useState("");         // 스위트에 넣기 — 고른 스위트
  /* 요소 집기 — 그 스텝 직전 화면이 필요하다. 러너 브라우저에서 시작 상태(스위트 앞 케이스) + 앞 스텝을 실행한 뒤 캡처한다 */
  const [more, setMore] = useState(false);       // 동작 줄 더보기 메뉴
  const [pickIdx, setPickIdx] = useState(null);
  const [prep, setPrep] = useState(null);        // 화면 준비 { i, pre }
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Full-Code 코드는 케이스에 저장된다. 없으면 스텝에서 생성한 것을 초기값으로.
  const initCode = (tc && tc.code) || stepsToCode(initSteps, tc || {});
  const [code, setCode] = useState(initCode);
  const [name, setName] = useState((tc && tc.name) || "");
  const [tags, setTags] = useState((tc && tc.tags) || "");
  const [dataset, setDataset] = useState(tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "");
  // 운영주의 — 운영 환경에서 실데이터를 변경/삭제하는 케이스. 태그와 별개 플래그.
  const [prodCaution, setProdCaution] = useState(!!(tc && tc.prodCaution));
  /* 이 케이스가 포함된 스위트 — 시작 상태(로그인)와 계정 역할은 스위트가 정한다. 케이스는 스위트를 모른다 */
  const usedIn = tc ? SL.suitesOfCase(fqaSuites, tc.id) : [];
  /* 🔑 디버그 실행의 스위트 문맥 — 스위트 안에서 앞 케이스가 만든 상태(로그인 등)에서 시작하는 케이스는 혼자 돌리면 실패한다.
     앞 단계를 먼저 돌리고 이어서 이 케이스를 돈다(기본: 앞 단계가 있는 첫 스위트). 계정 역할도 그 스위트를 따른다 */
  const preOpts = usedIn.filter((su) => (su.items || []).indexOf(tc.id) > 0);
  const [preSuId, setPreSuId] = useState(() => (preOpts[0] ? preOpts[0].id : 0));
  const preSu = preOpts.find((su) => su.id === preSuId) || null;
  // 계정 변수 사용 여부 — Full-Code는 V['계정 ID'] 형태로 나타난다
  const usesAcct = steps.some((s) => /\$\{계정/.test((s.val || "") + (s.loc || "") + (s.code || ""))) || /계정 (ID|비밀번호)/.test(code || "");
  const [dragIdx, setDragIdx] = useState(null);
  const [codeOpen, setCodeOpen] = useState({});
  const toggleCode = (i) => setCodeOpen((m) => ({ ...m, [i]: !m[i] }));
  /* 드래그 — 절차가 있으면 놓은 자리 스텝의 절차로 옮겨진다 (스텝은 항상 절차 순서로 정렬) */
  const reorder = (from, to) => { setSteps((prev) => { const arr = [...prev]; const tn = (arr[to] || {}).n; const [m] = arr.splice(from, 1); arr.splice(to, 0, proc.length && tn ? { ...m, n: tn } : m); return proc.length ? PL.sortByProc(arr, proc.length) : arr; }); setCodeOpen({}); seal((steps[to] || {}).n); };
  /* ── 자연어 절차 편집 — 절차 번호가 바뀌면 스텝의 연결(n)도 같이 옮긴다 ── */
  const newStep = (n) => ({ ...(steps.length === 0 ? { act: "이동", loc: "/", val: "-" } : { act: "클릭", loc: "", val: "-" }), ...(n ? { n } : {}) });
  const addStepTo = (n) => { setSteps(PL.sortByProc([...steps, newStep(n)], proc.length)); setCodeOpen({}); seal(n); };
  /* 🔑 절차 문장 변경 확인 (MQA 와 같은 규칙) — 절차 행의 b = 그 절차의 스텝을 마지막으로 맞춘 시점의 문장.
     지금 문장과 다르면 '확인 필요'. b 가 정해지는 때: AI 생성 반영 · 그 절차의 스텝을 고칠 때 · '확인함' · 처음 절차를 고치기 직전 */
  const seal = (n) => { if (n >= 1) setProc((ps) => ps.map((p, j) => (j === n - 1 ? { ...p, b: PL.procKey(p) } : p))); };
  const updRow = (i, patch) => setProc(proc.map((p, j) => (j === i ? { ...p, ...(p.b === undefined ? { b: PL.procKey(p) } : {}), ...patch } : p)));
  const addRow = (after) => { const at = after == null ? proc.length : after + 1; const rows = proc.slice(); rows.splice(at, 0, { t: "", e: "" }); setProc(rows); setSteps(steps.map((st) => (st.n > at ? { ...st, n: st.n + 1 } : st))); setFocusRow(at); };
  const delRow = (i) => {
    const k = i + 1; const moved = steps.filter((st) => st.n === k).length;
    if (moved && proc.length > 1 && !window.confirm("절차 " + k + "에 스텝 " + moved + "개가 연결되어 있습니다. 절차를 지우면 스텝은 " + (k > 1 ? "절차 " + (k - 1) : "다음 절차") + "로 옮겨집니다.\n\n지울까요?")) return;
    const rows = proc.filter((_, j) => j !== i); const map = {}; proc.forEach((_, j) => { map[j + 1] = j < i ? j + 1 : j === i ? Math.max(1, k - 1) : j; });
    setProc(rows); setSteps(rows.length ? PL.remapSteps(steps, map, rows.length) : steps.map(({ n: _n, ...st }) => st));
    if (!rows.length) setShowProc(false);
  };
  const moveRow = (from, to) => { const order = proc.map((_, j) => j); const [m] = order.splice(from, 1); order.splice(to, 0, m); const map = {}; order.forEach((old, ni) => { map[old + 1] = ni + 1; }); setProc(order.map((j) => proc[j])); setSteps(PL.remapSteps(steps, map, proc.length)); };
  /* 절차를 처음 열 때 — 이미 있는 스텝은 절차 1에 붙인다 (절차 미지정으로 떨어지지 않게) */
  const openProc = () => { setShowProc(true); if (!proc.length) { setProc([{ t: "", e: "" }]); setSteps(steps.map((st) => ({ ...st, n: 1 }))); setFocusRow(0); } };
  /* AI로 스텝 만들기 — 절차가 없으면 절차 카드부터 연다 */
  const runAi = () => {
    if (!proc.some((p) => String(p.t || "").trim())) { openProc(); flash("자연어 절차를 입력한 뒤 다시 'AI로 스텝 만들기'를 누르세요"); return; }
    setGen(true);
  };
  const applyGen = (ns) => {
    setProc(PL.compactProc(proc, []).proc.map((p) => ({ ...p, b: PL.procKey(p) }))); setSteps(ns); setCodeOpen({}); setGen(false);
    if (!fqaCases.some((c) => c.id === tc.id)) setOrigin("AI 생성");
    const left = stepErrors(ns).length;
    flash("스텝 " + ns.length + "개 반영 (저장 전)" + (left ? " · 미확정 " + left + "개" : ""));
  };
  /* 스위트에 넣기 — 스위트 화면에서 하던 일을 에디터에서도. 끝에 넣는다 (순서는 스위트 화면에서) */
  const addToSuite = () => {
    const su = fqaSuites.find((x) => String(x.id) === String(addSu)); if (!su) return;
    updateFqaSuite(su.id, { items: [...(su.items || []), tc.id] }); setAddSu("");
    flash(su.name + " 끝에 넣었습니다" + (status !== "승인" ? " — 승인 전에는 그 스위트가 실행되지 않습니다" : ""));
  };
  const openPick = (i) => {
    if (!dbg) { flash("이 케이스에 맞는 대상·환경이 없어 화면을 볼 수 없습니다"); return; }
    const before = [...badIdx].filter((k) => k < i + 1);
    if (before.length) { flash("앞선 스텝 " + before[0] + "번이 미확정이라 그 화면까지 갈 수 없습니다 — 앞 스텝부터 채우세요"); return; }
    const pre = preSu ? preSu.items.indexOf(tc.id) : 0;
    setPrep({ i, pre });
    timers.current.push(setTimeout(() => { setPrep(null); setPickIdx(i); }, 500 + 250 * (pre + i)));
  };
  const onPick = (el) => {
    const r = AI.recommendWebLoc(el);
    setSteps(steps.map((x, j) => (j === pickIdx ? { ...x, loc: r.loc } : x))); seal((steps[pickIdx] || {}).n);
    setPickIdx(null); flash("요소를 채웠습니다 — " + r.kind + (r.stable ? "" : " · 깨지기 쉬움"));
  };
  const applyPaste = (replace) => {
    const rows = PL.procFromText(paste.text); if (!rows.length) { flash("붙여넣은 내용에 절차가 없습니다"); return; }
    if (replace || !proc.some((p) => String(p.t || "").trim())) { setProc(rows); setSteps(PL.sortByProc(steps.map((st) => ({ ...st, n: Math.min(st.n || 1, rows.length) })), rows.length)); }
    else { const c = PL.compactProc(proc, steps); setProc([...c.proc, ...rows]); setSteps(c.steps); }
    setShowProc(true); setPaste(null); flash(rows.length + "개 절차 " + (replace ? "로 바꿈" : "추가"));
  };
  const vi = LV.indexOf(view);
  const [snap, setSnap] = useState(() => JSON.stringify({ steps: initSteps, code: initCode, committed: ei, name: (tc && tc.name) || "", tags: (tc && tc.tags) || "", dataset: tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "", prodCaution: !!(tc && tc.prodCaution), proc: initProc }));
  const snapNow = () => JSON.stringify({ steps, code, committed, name, tags, dataset, prodCaution, proc });
  const dirty = snap !== snapNow();
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const versions = (tc && tc.versions) || [];
  const curRev = (tc && tc.rev) || 1;
  /* 내가 편집을 시작한 리비전 — 저장 시 낙관적 잠금의 기준.
     그 사이 다른 사람이 저장했으면 rev가 어긋나므로 덮어쓰기를 막는다. 저장에 성공하면 갱신된다. */
  const baseRev = useRef(curRev);
  const [verSel, setVerSel] = useState(versions[1] ? versions[1].rev : (versions[0] ? versions[0].rev : null));
  const verObj = versions.find((v) => v.rev === verSel) || null;
  // 비교 대상 = 저장된 현재 리비전 (편집 중 내용이 아니라 커밋된 것끼리 비교한다)
  const headObj = versions.find((v) => v.rev === curRev) || null;
  const selDs = (datasets || []).find((d) => d.name === dataset);
  const dsCols = selDs ? selDs.columns : [];
  /* row 변수 참조 — Low-Code는 스텝에서, Full-Code는 코드에서 찾는다.
     코드가 rows를 도는데 데이터셋이 없으면 rows=[] → 테스트가 0개 생성된다(실패도 통과도 아닌 무동작). */
  const rowSrc = committed === 1 ? (code || "") : steps.map((s) => (s.val || "") + " " + (s.loc || "") + " " + (s.code || "")).join(" ");
  const usedRowVars = [...new Set((rowSrc.match(/\$\{row\.([a-zA-Z0-9_]+)\}|\brow\.([a-zA-Z0-9_]+)/g) || []).map((x) => x.replace(/^\$\{row\.|\}$|^row\./g, "")))];
  const usesRows = usedRowVars.length > 0 || /\bof\s+rows\b/.test(rowSrc);
  const missingDsCols = dataset ? usedRowVars.filter((v) => !dsCols.includes(v)) : [];
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);
  const editable = vi === committed;
  const readonly = vi < committed;
  /* 코드 생성의 입력은 '편집 중인 케이스'다 — 저장된 tc를 쓰면 미저장 이름·데이터셋이 코드에서 빠진다.
     ※ 실 구현에서는 생성기를 서버가 소유한다(프론트·서버 이중 구현은 반드시 어긋난다). */
  const asCase = () => ({ ...(tc || {}), name: name.trim() || (tc && tc.name) || "", dataset: dataset || "-" });
  const preview = () => stepsToCode(steps, asCase());
  const descend = () => {
    if (!window.confirm("Full-Code로 변환하면 스텝 편집은 읽기 전용이 되고, 되돌릴 수 없습니다.\n(변경 이력에서 이전 리비전으로 복원하는 방법만 남습니다)\n\n변환할까요?")) return;
    setCode(preview()); setCommitted(1); setView("Full-Code");
    flash("Full-Code로 변환됨 — 이제 코드가 관리 기준입니다");
  };

  /* ── 디버그 실행 ──
     케이스는 환경을 모른다. 그래서 디버그용 환경을 여기서 고른다 —
     이 선택은 케이스에 저장되지 않고 세션에만 남는다(실행 계획의 targetRef와 무관).
     편집 중인 내용을 그대로 돌리며, 실행 이력·품질 게이트에는 집계되지 않는다. */
  // 접점은 편집 중인 내용에서 파생 (Full-Code면 코드에서 추정)
  const surf = surfacesOf({ steps, code: committed === 1 ? code : "" });
  const isFull = committed === 1;
  /* 저장·실행을 막는 오류 —
       Low-Code : 스텝 자체의 결함
       공통     : 데이터셋 불일치 (없는 컬럼 참조 / rows를 쓰는데 데이터셋 없음) */
  const errs = [
    ...(isFull ? [] : stepErrors(steps)),
    ...missingDsCols.map((c) => "데이터셋 '" + dataset + "'에 '" + c + "' 컬럼이 없습니다"),
    ...(usesRows && !dataset ? ["데이터셋이 없는데 " + (isFull ? "코드가 rows를 참조합니다" : "스텝이 ${row.…}를 참조합니다") + " — 실행해도 0건이 됩니다"] : []),
  ];
  /* 🔑 미확정 — 비어 있거나 틀린 칸이 남은 스텝. 저장은 막지 않고 '초안' 으로 남긴다 (MQA 와 같은 규칙)
     디버그 실행 · 승인은 막는다. 데이터셋 불일치도 같은 취급 — 그대로 실행하면 깨진다 */
  const unresolved = isFull ? 0 : stepErrors(steps).length;
  const noBody = isFull ? !String(code || "").trim() : steps.length === 0;
  const target = errs.length || noBody ? "초안" : "검토중";
  // 케이스의 접점을 감당하는 환경만 — API 스텝이 있는데 apiUrl이 없으면 반드시 실패한다
  const dbgOpts = envOpts(fqaSystems).filter((o) => envCovers(o, surf));
  const dbg = dbgOpts.find((o) => refKey(o) === refKey(debugEnv)) || dbgOpts[0] || null;
  const dbgEnvRec = (() => { const sy = (fqaSystems || []).find((s) => s.id === (dbg || {}).systemId); return sy ? (sy.envs || []).find((e) => e.env === dbg.env) : null; })();
  const dbgAccts = (dbgEnvRec && dbgEnvRec.accts) || [];
  // 계정 — 스위트 문맥이면 그 스위트의 역할, 아니면 풀의 첫 계정
  const dbgRole = preSu ? (preSu.acctRole || "") : "";
  const acctOk = dbgRole ? dbgAccts.some((a) => a.role === dbgRole) : (!usesAcct || dbgAccts.length > 0);
  // 디버그 실행 고유 오류 — 환경·계정. 스텝/데이터셋 오류(errs)는 하단 패널이 전담하므로 여기서 문구로 반복하지 않는다.
  const envErr =
    !dbg ? "이 케이스의 접점(" + surf + ")에 맞는 대상·환경이 없습니다"
    : !acctOk ? (dbgRole ? "이 환경에 '" + dbgRole + "' 역할의 계정이 없습니다 (스위트 " + preSu.name + ")" : "이 환경의 계정 풀이 비어 있습니다")
    : (!isFull && steps.length === 0) ? "스텝이 없습니다"
    : "";
  const runBlocked = !!envErr || errs.length > 0;   // 실행 차단 = 환경 문제 또는 스텝/데이터셋 오류
  /* 🔑 Full-Code 는 테스트 단위 결과만 있다 — 러너는 줄마다 성공 · 실패를 받지 않는다(test.step 이 없으면).
     줄마다 ✓ 를 칠하면 "확인했다" 는 거짓이 된다. 줄은 '판정 없음' 으로 보여준다 (결과 상세와 같은 규칙) */
  const naLines = (r0) => ({ ...r0, steps: r0.steps.map((x) => ({ ...x, ok: true, na: true })) });
  const runOne = () => {
    if (runBlocked) return;
    setRunRes(null); setQa("run");
    const last = tc ? lastOf(fqaRuns, tc.id) : "-";
    /* 앞 단계 — 저장된 내용으로 돈다(편집 중인 것은 이 케이스뿐). 앞 단계가 실패하면 이 케이스는 돌지 않는다 */
    const preCases = preSu ? preSu.items.slice(0, preSu.items.indexOf(tc.id)).map((id) => fqaCases.find((c) => c.id === id)).filter(Boolean) : [];
    const rows = []; let preFail = null;
    preCases.forEach((c) => {
      if (preFail) return;
      const r0 = c.level === "Full-Code" ? naLines(simCode(c.code, lastOf(fqaRuns, c.id))) : simRun(c.steps, c, lastOf(fqaRuns, c.id));
      rows.push({ head: true, id: c.id, name: c.name, pre: true }, ...r0.steps);
      if (r0.verdict === "FAIL") preFail = c.id;
    });
    setTimeout(() => {
      if (preFail) { setRunRes({ verdict: "FAIL", preFail, steps: rows }); return; }
      const me = isFull ? naLines(simCode(code, last)) : simRun(steps, tc, last);
      setRunRes({ ...me, steps: preCases.length ? [...rows, { head: true, id: tc.id, name: name || tc.name }, ...me.steps] : me.steps });
    }, 900);
  };

  /* Low-Code는 스텝이 진실 — code를 저장하면 스텝과 어긋난 낡은 코드가 DB에 남는다(실행 시 서버가 스텝에서 생성한다).
     Full-Code는 code가 진실 — 스텝은 참고용으로 그대로 둔다(변환 시점의 흔적). */
  // origin(생성 경로)은 최초 생성 때 정해지고 이후 바뀌지 않는다 — 편집·변환·복제와 무관한 '출생' 정보
  const body = (pc) => ({ steps: pc ? pc.steps : steps, proc: pc ? pc.proc : proc, code: isFull ? code : "", level: LV[committed], name: name.trim(), tags, dataset: dataset || "-", prodCaution, origin });
  /* 저장 = 새 리비전 INSERT. baseRev로 낙관적 잠금 — 그 사이 남이 저장했으면 거부한다. */
  /* 충돌 후 탈출구 — 최신본을 다시 읽어 편집 상태를 갈아끼운다.
     이게 없으면 baseRev가 낡은 채로 남아 다시 저장해도 또 충돌한다(영원히 저장 불가). */
  const reload = () => {
    const c = tc || {};
    setSteps(c.steps || []); setCode(c.code || ""); setCommitted(Math.max(0, LV.indexOf(c.level)));
    setView(c.level || "Low-Code"); setName(c.name || ""); setTags(c.tags || "");
    setDataset(c.dataset && c.dataset !== "-" ? c.dataset : ""); setProdCaution(!!c.prodCaution);
    setProc(c.proc || []); setShowProc((c.proc || []).length > 0);
    setStatus(c.status || "검토중");
    baseRev.current = c.rev || 1;
    setSnap(JSON.stringify({ steps: c.steps || [], code: c.code || "", committed: Math.max(0, LV.indexOf(c.level)), name: c.name || "", tags: c.tags || "", dataset: c.dataset && c.dataset !== "-" ? c.dataset : "", prodCaution: !!c.prodCaution, proc: c.proc || [] }));
    flash("rev " + (c.rev || 1) + " 최신본을 불러왔습니다");
  };
  /* 저장 = 새 리비전. 저장하면 검토중 — 미확정이 남거나 스텝(코드)이 없으면 초안으로 남는다 (MQA 와 같은 규칙)
       승인 → 검토중/초안 (승인 해제 · 재검토 필요)
     API 임포트의 '초안'은 편집 없이 대량 생성된 골격 — 에디터에서 채워 저장할 때 비로소 검토중이 된다. */
  const save = () => {
    if (!name.trim()) { flash("TC 이름을 입력하세요"); return false; }
    const wasApproved = status === "승인";
    /* 재사용의 대가 — 승인된 케이스를 고치면 그 케이스가 든 스위트는 다시 승인할 때까지 통째로 멈춘다 */
    if (wasApproved && usedIn.length && !window.confirm("이 케이스가 포함된 스위트 " + usedIn.length + "개는 다시 승인하기 전까지 실행되지 않습니다:\n" + usedIn.map((su) => " · " + su.name).join("\n") + "\n\n저장할까요?")) return false;
    // 빈 절차 행은 걷어낸다 — 그 행에 붙은 스텝은 앞 절차로
    const pc = PL.compactProc(proc, steps);
    const done = () => {
      setProc(pc.proc); setSteps(pc.steps); setStatus(target);
      setSnap(JSON.stringify({ steps: pc.steps, code, committed, name, tags, dataset, prodCaution, proc: pc.proc }));
      flash((target === "초안" ? "초안으로 저장" : "저장 · 검토 요청됨 (검토중)") + (target === "초안" && errs.length ? " — 미확정을 채우면 검토중으로 저장됩니다" : wasApproved ? " · 승인 해제" : ""));
    };
    // 아직 목록에 없는 케이스(직접 작성)면 첫 저장 = 생성
    if (!fqaCases.some((c) => c.id === tc.id)) {
      addFqaCase({ id: tc.id, ...body(pc), status: target });
      baseRev.current = 1; done();
      return true;
    }
    const ok = commitFqaCase(tc.id, { ...body(pc), status: target }, { baseRev: baseRev.current });
    if (!ok) {
      // 내 편집을 덮어쓰지 않는다 — 최신을 불러올지(내 변경 폐기) 사용자가 정한다
      if (window.confirm("다른 사람이 이 케이스를 수정했습니다 (rev " + baseRev.current + " → rev " + curRev + ").\n\n최신본을 불러올까요?\n지금 편집 중인 내용은 사라집니다. (취소하면 변경 이력에서 차이를 확인할 수 있습니다)")) reload();
      else setQa("ver");
      return false;
    }
    baseRev.current = curRev + 1; done();
    return true;
  };
  /* 검토 — 에디터에서 바로 승인 · 반려한다 (MQA 와 같은 자리 · 같은 조건). 승인 조건: 저장된 상태 · 미확정 0 · 스텝(코드) 있음 */
  const saved = tc && fqaCases.some((c) => c.id === tc.id);
  const approveWhy = !saved ? "먼저 저장하세요" : dirty ? "저장한 뒤 승인할 수 있습니다" : errs.length ? "미확정 · 오류를 채워야 승인할 수 있습니다" : noBody ? "스텝이 없어 승인할 수 없습니다" : "";
  const setSt = (st, m) => { setFqaCaseStatus(tc.id, st); setStatus(st); flash(m); };
  const approve = () => { if (approveWhy) { flash(approveWhy); return; } if (changedN.length && !window.confirm("절차 " + changedN.join(", ") + "번 문장이 바뀌었는데 스텝은 확인되지 않았습니다.\n\n그래도 승인할까요?")) return; setSt("승인", tc.id + " 승인" + (usedIn.length ? " — 포함된 스위트 " + usedIn.length + "개에서 실행됩니다" : " — 스위트에 넣어야 실행 계획에서 돕니다")); };
  const reject = () => setSt("초안", tc.id + " 반려 — 초안으로 돌렸습니다");
  const unapprove = () => setSt("검토중", tc.id + " 검토중으로 — 실행 계획에서 빠집니다");
  /* 복제 — 사본은 '지금 편집 중인 내용'을 받는다. 원본에 미저장 변경이 있으면 먼저 저장한다. */
  const duplicate = () => {
    if (dirty) {
      if (!window.confirm("저장하지 않은 변경이 있습니다.\n원본을 저장하고 사본을 열까요?")) return;
      if (!save()) return;
    }
    const nid = nextTcId(fqaCases);
    const copy = { id: nid, ...body(), name: name + " (사본)", status: target };
    addFqaCase(copy);
    if (onOpen) { onOpen({ ...copy, rev: 1 }); flash(nid + " 사본을 열었습니다"); }
    else flash(nid + " 사본 생성 · 목록에 추가");
  };
  /* 스텝 묶음 머리 — 절차가 있으면 스텝을 절차별로 묶어 보여준다. 스텝이 없는 절차도 머리를 보여 '+ 스텝' 자리를 준다 */
  const nOf = (st) => (st && st.n >= 1 && st.n <= proc.length ? st.n : proc.length + 1);   // 절차 밖 = 맨 뒤 '절차 미지정'
  const changedN = proc.map((p, k) => (PL.procChanged(p, steps.some((x) => x.n === k + 1)) ? k + 1 : 0)).filter(Boolean);
  const ghead = (k, empty) => (
    <div key={"g" + k} className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span className="shrink-0 font-medium text-slate-600">{k > proc.length ? "절차 미지정" : "절차 " + k}</span>
      {k <= proc.length && <span className="min-w-0 flex-1 truncate text-slate-700">{proc[k - 1].t || <span className="text-slate-400">(비어 있음)</span>}{proc[k - 1].e && <span className="text-slate-500"> → {proc[k - 1].e}</span>}</span>}
      {empty && <span className="shrink-0 text-slate-400">스텝 없음</span>}
      {changedN.includes(k) && <span className="flex shrink-0 items-center gap-1 text-amber-700"><AlertTriangle size={12} />절차가 바뀌었습니다 — 아래 스텝이 맞는지 확인하세요{editable && <button onClick={() => seal(k)} className="ml-1 font-medium text-amber-800 underline">확인함</button>}</span>}
      {editable && k <= proc.length && <button onClick={() => addStepTo(k)} className="shrink-0 text-sky-600">+ 스텝</button>}
    </div>
  );
  const headsBefore = (i) => { if (!proc.length) return null; const prev = i === 0 ? 0 : nOf(steps[i - 1]); const cur = nOf(steps[i]); if (cur === prev) return null; const out = []; for (let k = prev + 1; k < cur; k++) if (k <= proc.length) out.push(ghead(k, true)); out.push(ghead(cur, false)); return out; };
  const headsAfter = () => { if (!proc.length) return null; const last = steps.length ? nOf(steps[steps.length - 1]) : 0; const out = []; for (let k = last + 1; k <= proc.length; k++) out.push(ghead(k, true)); return out; };
  const badIdx = new Set(isFull ? [] : stepErrors(steps).map((m) => +(m.match(/^(\d+)번/) || [])[1]).filter(Boolean));
  return (
    <div className="space-y-4">
      <Hdr icon={Code2} title="테스트케이스 에디터" />
      {/* 동작 줄 — 스크롤해도 위에 고정. 만들기 → 확인 → 저장 → 검토 순서로 한 줄에 둔다 (MQA 와 같은 자리) */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="min-w-0 flex-1 truncate text-xs">
          {envErr ? <span className="text-amber-700" title={envErr}>⚠ {envErr}</span>
            : dirty ? <span className="text-slate-500">저장하지 않은 변경이 있습니다</span>
            : <span className="text-slate-500">저장됨 · rev {curRev}</span>}
        </div>
        {!isFull && editable && <Btn icon={Sparkles} onClick={runAi} title="러너의 브라우저에서 화면을 조작하며 자연어 절차를 스텝으로 만듭니다">AI로 스텝 만들기</Btn>}
        <Btn icon={Play} disabled={runBlocked} title={envErr || (errs.length ? "미확정 · 오류를 먼저 채우세요" : "편집 중인 내용으로 이 환경에서 한 번 실행 — 실행 이력·품질 게이트에 집계되지 않습니다")} onClick={runOne}>디버그 실행</Btn>
        {/* 라벨이 결과를 말해준다 — 미확정이 남으면 초안 저장 */}
        <Btn kind="primary" icon={Save} disabled={!dirty} title={target === "초안" ? (errs.length ? "미확정이 남아 초안으로 저장됩니다" : "스텝이 없어 초안으로 저장됩니다") : "저장하면 검토중이 되어 검토자가 승인할 수 있습니다" + (status === "승인" ? " — 승인이 풀립니다" : "")} onClick={save}>{dirty ? (target === "초안" ? "초안 저장" : "저장 · 검토 요청") : "저장됨"}</Btn>
        {saved && status === "검토중" && <>
          <span className="mx-0.5 h-5 w-px bg-slate-200" />
          <Btn icon={XCircle} onClick={reject} title="초안으로 돌려 다시 고치게 합니다">반려</Btn>
          <Btn kind="primary" icon={CheckCircle2} disabled={!!approveWhy} title={approveWhy || "승인하면 실행 계획에 넣을 수 있습니다"} onClick={approve}>승인</Btn>
        </>}
        {saved && status === "승인" && <><span className="mx-0.5 h-5 w-px bg-slate-200" /><Btn icon={RefreshCw} onClick={unapprove} title="승인을 풀어 실행 계획에서 뺍니다">검토중으로</Btn></>}
        <div className="relative">
          <button onClick={() => setMore((v) => !v)} title="더보기" className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-600 hover:bg-slate-50"><MoreHorizontal size={16} /></button>
          {more && <>
            <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
            <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
              {!isFull && <button disabled={!!errs.length || steps.length === 0} onClick={() => { setMore(false); descend(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"><ArrowRight size={14} />Full-Code로 변환</button>}
              <button onClick={() => { setMore(false); duplicate(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"><Copy size={14} />복제</button>
              <button onClick={() => { setMore(false); setQa("ver"); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"><History size={14} />변경 이력{versions.length > 0 && <span className="text-slate-500">({versions.length})</span>}</button>
            </div>
          </>}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">태그</div>
            <TagPicker value={tags} onChange={setTags} />
            <div className="mt-1.5 text-xs text-slate-500">목록 분류 · 검색용입니다.</div>
          </Card>
          {/* 운영주의 — 태그와 별개 플래그. 운영 환경 실행 시 경고(막지 않고 알린다). */}
          <Card className="p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={prodCaution} onChange={(e) => setProdCaution(e.target.checked)} className="accent-amber-500" />
              <span className="text-sm text-slate-800">운영주의</span>
            </label>
            <div className="mt-1.5 text-xs text-slate-500">데이터 변경/삭제 — 운영 환경 테스트 시 주의</div>
          </Card>
          {/* 포함된 스위트 — 옛 '전제조건' 자리. 시작 상태(로그인)와 계정 역할은 스위트가 정한다 */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">포함된 스위트</div>
            {usedIn.length ? <div className="space-y-1">{usedIn.map((su) => { const k = (su.items || []).indexOf(tc.id); return (
              <div key={su.id} className="text-xs text-slate-700">{su.name} <span className="text-slate-500">· {k + 1}번째{k > 0 ? " · 앞: " + su.items[k - 1] : ""}{su.acctRole ? " · " + su.acctRole : ""}</span></div>
            ); })}</div> : <div className="text-xs text-slate-500">없음 — 스위트에 넣어야 실행 계획에서 돕니다</div>}
            {usesAcct && <div className="mt-2 text-xs text-slate-500">스텝이 계정 변수(<span className="font-mono text-sky-600">{"${계정 ID}"}</span>)를 씁니다 — 어느 역할의 계정인지는 스위트가 정합니다.</div>}
            {(() => { const rest = fqaSuites.filter((su) => !(su.items || []).includes(tc.id)); const isSaved = fqaCases.some((c) => c.id === tc.id); return rest.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                <div className="min-w-0 flex-1"><Select value={addSu} onChange={(e) => setAddSu(e.target.value)} disabled={!isSaved}><option value="">{isSaved ? "스위트에 넣기…" : "저장한 뒤 넣을 수 있습니다"}</option>{rest.map((su) => <option key={su.id} value={su.id}>{su.name}</option>)}</Select></div>
                <Btn disabled={!addSu} onClick={addToSuite}>넣기</Btn>
              </div>
            ); })()}
            <div className="mt-1.5 text-xs text-slate-500">먼저 수행되어야 하는 단계(로그인 등)는 스위트에서 앞 순서 케이스로 두세요.</div>
          </Card>
          {tc && tc.pre && <Card className="p-3"><div className="mb-1 text-xs font-semibold text-slate-500">사전조건 (가져온 원문)</div><div className="text-xs text-slate-600">{tc.pre}</div><div className="mt-1 text-xs text-slate-500">이 상태에서 시작해야 한다면, 이 케이스를 넣는 스위트에서 앞 순서에 그 케이스를 두세요.</div></Card>}
          {/* 케이스가 행마다 반복 실행된다 — 부하용 대량 데이터셋(NQA 몫)은 고를 수 없다 */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">데이터셋 (데이터 드리븐)</div>
            <DatasetPicker value={dataset} onChange={setDataset} noneLabel="없음 (단일 실행)" maxRows={DS_MAX_ROWS} />
            {selDs && <div className="mt-1.5 text-xs text-slate-500">컬럼 <span className="font-mono text-slate-700">{selDs.columns.join(", ")}</span> · <span className="font-mono text-sky-600">{"${row.컬럼}"}</span>로 참조 · <span className="text-amber-700">{(selDs.rowCount != null ? selDs.rowCount : selDs.rows.length).toLocaleString()}회 반복</span></div>}
          </Card>
        </div>
        <div className="col-span-9 space-y-3">
          {/* 정체 + 작업 조건 — 한곳에 모은다 (MQA 와 같은 카드)
              윗줄: 케이스 속성(저장) · 아랫줄: 작업 조건(저장 안 함) — AI 생성 · 요소 집기 · 디버그 실행이 쓰는 환경 */}
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-sm text-sky-600">{tc ? tc.id : ""}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TC 이름" className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 outline-none hover:border-slate-300 focus:border-sky-500 focus:bg-slate-100" />
              {/* 관리 수준은 현재 committed 기준 — entry(진입 시점)로 표시하면 변환 후에도 옛 값이 남는다 */}
              <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs text-slate-500">{saved ? "rev " + curRev : "새 케이스"}</span><Badge kind={isFull ? "warn" : "active"}>{LV[committed]} 관리</Badge><Badge kind={stEK[status] || "warn"}>{saved ? status : "초안"}</Badge></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-200 pt-3">
              <div className="flex items-center gap-3"><span className="w-24 shrink-0 text-xs text-slate-500">포함된 스위트</span><span className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700" title="케이스는 스위트를 모릅니다 — 스위트 화면에서 넣고 순서를 정합니다">{usedIn.length ? usedIn.map((su) => su.name).join(" · ") : "없음"}</span></div>
              <div className="flex items-center gap-3"><span className="w-24 shrink-0 text-xs text-slate-500">작업 환경</span><div className="min-w-0 flex-1">
                <Select value={refKey(dbg)} onChange={(e) => { const o = dbgOpts.find((x) => refKey(x) === e.target.value); if (o) setDebugEnv({ systemId: o.systemId, env: o.env }); }}>
                  {dbgOpts.length === 0 && <option>맞는 환경 없음</option>}
                  {dbgOpts.map((o) => <option key={refKey(o)} value={refKey(o)}>{o.label}</option>)}
                </Select></div></div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Info size={12} className="shrink-0" />작업 환경은 케이스에 저장하지 않습니다 — AI로 스텝 만들기 · 요소 집기 · 디버그 실행에 씁니다</div>
          </Card>

          {/* Full-Code 로 바꾼 케이스만 — 코드(관리 기준)와 변환 전 스텝(읽기 전용)을 오간다 */}
          {committed === 1 && steps.length > 0 && (
          <div className="flex items-center gap-1.5">
            {LV.map((l, i) => (
              <Fragment key={l}>
                <button onClick={() => setView(l)} className={"rounded-lg border px-3 py-1.5 text-xs " + (view === l ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{l === "Low-Code" ? "변환 전 스텝 (읽기 전용)" : "코드"}</button>
                {i < LV.length - 1 && <ArrowRight size={14} className="text-sky-600" />}
              </Fragment>
            ))}
          </div>
          )}

          {/* 자연어 절차 — 무엇을 검증하나. 절차가 있거나 '+ 자연어 절차' 를 누를 때만 보인다 */}
          {(showProc || proc.length > 0) && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
              <span className="text-sm font-semibold text-slate-800">자연어 절차</span><span className="text-xs text-slate-500">AI로 스텝 만들기의 입력 · 검토할 때 무엇을 검증하는지 보여줍니다</span>
              <div className="ml-auto flex items-center gap-3">
                <button onClick={() => setPaste({ text: "" })} className="text-xs text-sky-600">여러 줄 붙여넣기</button>
              </div>
            </div>
            <div className="space-y-1.5 px-4 py-3">
              {proc.map((p, i) => (
                <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (rowDrag !== null && rowDrag !== i) moveRow(rowDrag, i); setRowDrag(null); }} className="flex items-center gap-2 rounded-lg px-1 py-0.5">
                  <span draggable onDragStart={() => setRowDrag(i)} onDragEnd={() => setRowDrag(null)} className="cursor-grab" title="드래그로 순서 변경"><GripVertical size={14} className="text-slate-400" /></span>
                  <span className="w-12 shrink-0 text-xs text-slate-500">절차 {i + 1}</span>
                  <div className="min-w-0 flex-1"><Input value={p.t} autoFocus={focusRow === i} onFocus={() => setFocusRow(null)} onChange={(e) => updRow(i, { t: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addRow(i); } }} placeholder="예: 쿠폰 선택 버튼을 누른다" /></div>
                  <div className="w-72 shrink-0"><Input value={p.e} onChange={(e) => updRow(i, { e: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addRow(i); } }} placeholder="기대 결과 (선택)" /></div>
                  <button onClick={() => delRow(i)} className="shrink-0 text-slate-400 hover:text-red-600" title="절차 삭제"><X size={13} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button onClick={() => addRow(null)} className="text-xs text-sky-600">+ 절차 추가</button>
                <span className="text-xs text-slate-500">Enter로 다음 절차 · 앞 단계(로그인 등)는 절차에 쓰지 말고 <span className="text-slate-700">스위트</span>에서 앞에 두기</span>
              </div>
            </div>
          </Card>
          )}

          <Card className="overflow-hidden">
            {readonly && (
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-amber-700"><Lock size={13} />읽기 전용 — 이 케이스는 Full-Code로 관리됩니다. 되돌리려면 변경 이력에서 복원하세요.</div>
            )}

            {view === "Low-Code" && (
              <div>
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
                  <Badge kind={SURF_K[surfacesOf({ steps })] || "info"}>{surfacesOf({ steps })}</Badge>
                  {changedN.length > 0 && <Badge kind="warn">절차 변경 {changedN.length}곳 · 확인 필요</Badge>}
                  {editable && !showProc && !proc.length && <button onClick={openProc} className="text-xs text-sky-600">+ 자연어 절차</button>}
                  <span className="ml-auto text-xs text-slate-500">경로는 <span className="font-mono text-slate-500">상대경로</span> — base URL은 실행 계획의 환경에서 주입</span>
                </div>
                <div>
                  {steps.length === 0 && !proc.length && <div className="px-3 py-10 text-center text-sm text-slate-500">스텝이 없습니다. 아래 <span className="text-sky-600">+ 스텝 추가</span>로 시작하세요.</div>}
                  {steps.map((s, i) => {
                    const setStep = (patch) => { setSteps(steps.map((x, j) => (j === i ? { ...x, ...patch } : x))); seal(s.n); };
                    const isCode = s.act === "코드 스텝";
                    const isReq = s.act === "요청";
                    const isResp = s.act === "응답 검증";
                    const isAssert = s.act === "화면 검증";
                    const reqSum = s.save ? "저장 " + s.save : s.body ? "본문 있음" : "";
                    return (
                    <Fragment key={i}>
                    {headsBefore(i)}
                    <div className={"border-b border-slate-200 " + (dragIdx === i ? "opacity-40" : "")}>
                      <div
                        onDragOver={editable ? (e) => e.preventDefault() : undefined}
                        onDrop={editable ? () => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); } : undefined}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm">
                        <span draggable={editable} onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} className={editable ? "cursor-grab" : ""} title={editable ? "드래그로 순서 변경" : undefined}><GripVertical size={14} className={editable ? "text-slate-500" : "text-slate-800"} /></span>
                        <span className="w-4 text-xs text-slate-500">{i + 1}</span>
                        {editable ? (
                          <>
                            <select value={s.act} onChange={(e) => { const v = e.target.value; const init = v === "코드 스텝" ? { act: v, code: s.code || "await page.locator('').click();" } : v === "요청" ? { act: v, loc: reqJoin("GET", "") } : v === "응답 검증" ? { act: v, loc: "상태코드", val: "200" } : v === "화면 검증" ? { act: v, val: "visible = true" } : { act: v }; setStep(init); if (v === "코드 스텝") setCodeOpen((m) => ({ ...m, [i]: true })); }} className="w-32 shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500">{STEP_ACTS.map((a) => <option key={a}>{a}</option>)}</select>

                            {isCode && (
                              <button onClick={() => toggleCode(i)} className="flex flex-1 items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-left text-xs text-sky-600 hover:border-sky-500"><Code2 size={12} />{codeOpen[i] ? "코드 접기 ▲" : "코드 편집 ▼"}<span className="ml-1 truncate font-mono text-slate-500">{(s.code || "").split("\n")[0]}</span></button>
                            )}

                            {/* 요청 — 메서드는 고르고 경로만 적는다 */}
                            {isReq && (() => { const { m, path } = reqParts(s.loc); const bodyOk = hasBody(m); return (
                              <>
                                {/* 메서드를 본문 없는 것으로 바꾸면 남아 있던 본문을 버린다 — 저장돼 봐야 무시된다 */}
                                <select value={m} onChange={(e) => { const nm = e.target.value; setStep({ loc: reqJoin(nm, path), ...(hasBody(nm) ? {} : { body: "" }) }); }} className="w-20 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-sky-600 outline-none focus:border-sky-500">{REQ_METHODS.map((x) => <option key={x}>{x}</option>)}</select>
                                <input value={path} onChange={(e) => setStep({ loc: reqJoin(m, e.target.value) })} placeholder={LOC_PH["요청"]} className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                <button onClick={() => toggleCode(i)} className="flex w-36 shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-left text-xs text-sky-600 hover:border-sky-500"><Send size={12} />{(bodyOk ? "본문·헤더·저장 " : "헤더·저장 ") + (codeOpen[i] ? "▲" : "▼")}</button>
                              </>
                            ); })()}

                            {/* 응답 검증 — 대상(상태코드 | 본문 필드) × 조건(존재 | 값 일치) */}
                            {isResp && (() => { const st = isStatusTarget(s.loc); const cond = respCond(s.val); const raw = (String(s.val || "").match(/"([\s\S]*)"/) || [])[1] || ""; return (
                              <>
                                <select value={st ? "상태코드" : "본문 필드"} onChange={(e) => setStep(e.target.value === "상태코드" ? { loc: "상태코드", val: "200" } : { loc: "$.orderId", val: "존재" })} className="w-24 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>상태코드</option><option>본문 필드</option></select>
                                {st ? (
                                  <input type="number" value={s.val} onChange={(e) => setStep({ val: e.target.value })} placeholder="200" className="w-24 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
                                ) : (
                                  <>
                                    <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder="$.orderId" className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                    <select value={cond} onChange={(e) => setStep({ val: e.target.value === "존재" ? "존재" : '"' + raw + '"' })} className="w-20 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>존재</option><option>값 일치</option></select>
                                    {cond === "값 일치" && <input value={raw} onChange={(e) => setStep({ val: '"' + e.target.value + '"' })} placeholder="결제완료" className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />}
                                  </>
                                )}
                                {st && <span className="flex-1" />}
                              </>
                            ); })()}

                            {/* 화면 검증 — 검증 종류를 고른다. 값은 종류가 필요로 할 때만. */}
                            {isAssert && (() => { const pa = parseAssert(s.val); const def = assertDef(pa.k); return (
                              <>
                                <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder="[data-testid=welcome]" className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                <button onClick={() => openPick(i)} className="shrink-0 text-slate-500 hover:text-sky-600" title="화면에서 요소 집기"><MousePointerClick size={13} /></button>
                                <select value={pa.k} onChange={(e) => { const d = assertDef(e.target.value); setStep({ val: d.build(d.arg ? pa.arg : "") }); }} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-amber-700 outline-none focus:border-sky-500">{ASSERTS.map((a) => <option key={a.k}>{a.k}</option>)}</select>
                                {def.arg && <input type={def.arg === "num" ? "number" : "text"} value={pa.arg} onChange={(e) => setStep({ val: def.build(e.target.value) })} placeholder={def.ph} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />}
                              </>
                            ); })()}

                            {/* 그 밖 (이동·입력·클릭·선택·체크·키 누르기) */}
                            {!isCode && !isReq && !isResp && !isAssert && (
                              <>
                                <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder={LOC_PH[s.act] || "[data-testid=login-btn]"} className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                {s.act !== "이동" && <button onClick={() => openPick(i)} className="shrink-0 text-slate-500 hover:text-sky-600" title="화면에서 요소 집기"><MousePointerClick size={13} /></button>}
                                {s.act === "체크" ? (
                                  <select value={/해제/.test(s.val || "") ? "해제" : "체크"} onChange={(e) => setStep({ val: e.target.value })} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>체크</option><option>해제</option></select>
                                ) : (s.act === "클릭" || s.act === "이동") ? (
                                  <span className="w-28 shrink-0" />
                                ) : (
                                  <input value={s.val} onChange={(e) => setStep({ val: e.target.value })} placeholder={VAL_PH[s.act] || "값"} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />
                                )}
                              </>
                            )}
                            {!badIdx.has(i + 1) && !isCode && !isReq && !isResp && s.act !== "이동" && AI.fragileLoc(s.loc) && <span className="shrink-0 text-xs text-amber-700" title="역할 · 이름 · 글자 · 위치로 찾는 로케이터 — 문구나 화면 구성이 바뀌면 깨질 수 있습니다. data-testid 를 권장합니다">깨지기 쉬움</span>}
                            {badIdx.has(i + 1) && <span className="shrink-0" title={stepErrors([s]).map((m) => m.replace(/^1번 /, "")).join(" · ")}><Badge kind="warn">미확정</Badge></span>}
                            <button onClick={() => { setSteps(steps.filter((_, j) => j !== i)); seal(s.n); }} className="shrink-0 text-slate-500 hover:text-red-600" title="스텝 삭제"><X size={13} /></button>
                          </>
                        ) : (
                          <>
                            <span className={"w-28 font-medium " + (isCode ? "text-sky-600" : s.act.includes("검증") ? "text-amber-700" : "text-slate-800")}>{s.act}</span>
                            {isCode ? <span className="flex-1 truncate font-mono text-xs text-slate-500">{(s.code || "").split("\n")[0]}</span> : <><span className="flex-1 font-mono text-xs text-slate-500">{s.loc}</span><span className="text-xs text-slate-500">{isReq ? reqSum : s.val}</span></>}
                          </>
                        )}
                      </div>
                      {isCode && (codeOpen[i] || !editable) && (
                        <div className="px-10 pb-2.5">
                          <textarea value={s.code || ""} onChange={(e) => setStep({ code: e.target.value })} readOnly={!editable} rows={4} placeholder="await page.getByTestId('x').click();" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-sky-700 outline-none focus:border-sky-500" />
                        </div>
                      )}
                      {isReq && (codeOpen[i] || !editable) && (
                        <div className="grid grid-cols-2 gap-3 px-10 pb-3">
                          {/* 본문은 POST·PUT·PATCH만 — GET/DELETE의 body는 서버가 무시한다 */}
                          {hasBody(reqParts(s.loc).m) && (
                            <div className="col-span-2">
                              <div className="mb-1 text-xs text-slate-500">요청 본문 (JSON)</div>
                              <textarea value={s.body || ""} onChange={(e) => setStep({ body: e.target.value })} readOnly={!editable} rows={3} placeholder={'{ "payment": "card" }'} className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-sky-700 outline-none focus:border-sky-500" />
                            </div>
                          )}
                          <div>
                            <div className="mb-1 text-xs text-slate-500">추가 헤더 (선택 · 한 줄에 하나)</div>
                            <textarea value={s.headers || ""} onChange={(e) => setStep({ headers: e.target.value })} readOnly={!editable} rows={2} placeholder="Idempotency-Key: ${주문키}" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                            <div className="mt-1 text-xs text-slate-500">인증 헤더는 환경에서 주입 — 여기 적지 않습니다.</div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-500">응답 저장 (스텝 간 전달)</div>
                            <input value={s.save || ""} onChange={(e) => setStep({ save: e.target.value })} readOnly={!editable} placeholder="orderId = $.orderId" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                            <div className="mt-1 text-xs text-slate-500">이후 스텝에서 <span className="font-mono text-sky-600">{"${orderId}"}</span>로 사용 · 쉼표로 여러 개 · 이름은 영문·숫자·_</div>
                          </div>
                        </div>
                      )}
                    </div>
                    </Fragment>
                    );
                  })}
                  {headsAfter()}
                </div>
                {editable && (
                  <div className="flex items-center gap-3 border-t border-slate-200 px-3 py-2">
                    <button onClick={() => addStepTo(proc.length ? ((steps[steps.length - 1] || {}).n || proc.length) : 0)} className="shrink-0 text-xs text-sky-600">+ 스텝 추가</button>
                    <span className="truncate text-xs text-slate-500">로케이터 {LOC_HINT}</span>
                  </div>
                )}
              </div>
            )}

            {view === "Full-Code" && (
              <div className="p-3">
                <div className="mb-2 text-xs text-slate-500">Playwright · TypeScript</div>
                <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={16} className={taCls} style={{ fontFamily: "monospace" }} />
                {fullCodeWarns(code).map((w) => <div key={w} className="mt-1.5 text-xs text-amber-700">{w}</div>)}
              </div>
            )}

            {errs.length > 0 && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2">
                {errs.slice(0, 5).map((e, i) => <div key={i} className="text-xs text-amber-700">⚠ {e}</div>)}
                {errs.length > 5 && <div className="text-xs text-amber-600">외 {errs.length - 5}건</div>}
              </div>
            )}

          </Card>
        </div>
      </div>
      {qa && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQa(null)}>
          <div className={"w-full rounded-xl border border-slate-200 bg-white shadow-xl " + (qa === "ver" ? "max-w-4xl" : "max-w-md")} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{qa === "run" ? "디버그 실행" : "변경 이력"} <span className="font-mono text-xs text-sky-600">{tc ? tc.id : ""}</span>{qa === "ver" && <span className="ml-2 text-xs font-normal text-slate-500">현재 rev {curRev}</span>}</h3><button onClick={() => setQa(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 p-5 text-sm">
              {qa === "ver" && (versions.length === 0 ? (
                <div className="text-xs text-slate-500">저장 이력이 없습니다 — 저장할 때마다 직전 리비전이 여기에 쌓입니다.</div>
              ) : (
                <div className="flex gap-3" style={{ height: 420 }}>
                  {/* 리비전 목록 */}
                  <div className="w-52 shrink-0 space-y-1.5 overflow-y-auto">
                    {versions.map((v, i) => (
                      <button key={v.rev} onClick={() => setVerSel(v.rev)} className={"w-full rounded-lg border px-2.5 py-2 text-left " + (verSel === v.rev ? SEL_CARD : "border-slate-200 bg-slate-50 hover:bg-white")}>
                        <div className="flex items-center gap-1.5 text-xs"><span className="font-mono text-sky-600">rev {v.rev}</span><Badge kind={v.level === "Full-Code" ? "warn" : "active"}>{v.level}</Badge>{v.rev === curRev && <span className="ml-auto text-xs text-slate-500">현재</span>}{i === versions.length - 1 && v.rev !== curRev && <span className="ml-auto text-xs text-slate-500">최초</span>}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{v.at}</div>
                        <div className="text-xs text-slate-500">{v.by}</div>
                      </button>
                    ))}
                  </div>
                  {/* 현재본과의 차이 */}
                  <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {!verObj || !headObj ? <div className="py-16 text-center text-xs text-slate-500">리비전을 선택하세요.</div> : verObj.rev === curRev ? (
                      <div className="py-16 text-center text-xs text-slate-500">현재 리비전입니다. 이전 리비전을 선택하면 차이가 표시됩니다.</div>
                    ) : (() => {
                      const fd = fieldDiff(verObj, headObj);
                      const sd = lcsDiff(verObj.steps || [], headObj.steps || [], stepKey).filter((d) => d.t !== "same");
                      const cd = lcsDiff((verObj.code || "").split("\n"), (headObj.code || "").split("\n"), (x) => x);
                      const cdChanged = cd.some((d) => d.t !== "same");
                      const none = fd.length === 0 && sd.length === 0 && !cdChanged;
                      return (
                        <div className="space-y-3">
                          <div className="text-xs text-slate-500">rev {verObj.rev} <ArrowRight size={11} className="inline text-slate-400" /> rev {curRev} <span className="text-slate-500">(현재)</span></div>
                          {none && <div className="py-12 text-center text-xs text-slate-500">이 리비전과 현재 내용이 같습니다.</div>}
                          {fd.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">속성</div>
                              <div className="space-y-1">
                                {fd.map((d) => (
                                  <div key={d.k} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
                                    <span className="w-20 shrink-0 text-slate-500">{d.label}</span>
                                    <span className="text-red-700 line-through">{d.from}</span>
                                    <ArrowRight size={11} className="shrink-0 text-slate-400" />
                                    <span className="text-emerald-700">{d.to}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {sd.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">스텝</div>
                              <div className="overflow-hidden rounded border border-slate-200">
                                {sd.map((d, i) => (
                                  <div key={i} className={"flex gap-2 px-2 py-1 font-mono text-xs " + DIFF_CLS[d.t]}><span className="w-3 shrink-0">{DIFF_MARK[d.t]}</span><span className="min-w-0 flex-1 truncate">{stepText(d.v)}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                          {cdChanged && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">코드</div>
                              <div className="overflow-hidden rounded border border-slate-200">
                                {cd.map((d, i) => (
                                  <div key={i} className={"flex gap-2 px-2 py-0.5 font-mono text-xs " + DIFF_CLS[d.t]}><span className="w-3 shrink-0">{DIFF_MARK[d.t]}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{d.v || " "}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                          <Btn className="w-full" icon={History} onClick={() => { setSteps(verObj.steps || []); setCode(verObj.code || ""); setCommitted(Math.max(0, LV.indexOf(verObj.level))); setView(verObj.level || "Low-Code"); setName(verObj.name || name); setTags(verObj.tags || ""); setDataset(verObj.dataset && verObj.dataset !== "-" ? verObj.dataset : ""); setProc((verObj.x && verObj.x.proc) || []); setShowProc(((verObj.x && verObj.x.proc) || []).length > 0); setQa(null); flash("rev " + verObj.rev + " 내용으로 되돌림 — 저장하면 rev " + (curRev + 1) + "이 됩니다"); }}>이 리비전으로 되돌리기</Btn>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {qa === "run" && (runRes === null ? (
                <div className="flex items-center gap-2 text-slate-500"><RefreshCw size={14} className="text-sky-600" />실행 중…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2"><Badge kind={runRes.verdict === "PASS" ? "pass" : "fail"}>{runRes.verdict}</Badge><span className="text-xs text-slate-500">{dbg ? dbg.label : ""}{dbgRole ? " · " + dbgRole : ""}</span></div>
                  {/* 시작 상태 — 포함된 스위트의 앞 케이스를 자동으로 먼저 돈다. 고를 것이 둘 이상일 때만 바꿀 수 있다 */}
                  {preOpts.length === 1 && <div className="text-xs text-slate-500">시작 상태: {preOpts[0].name} 앞 {preOpts[0].items.indexOf(tc.id)}건 먼저</div>}
                  {preOpts.length > 1 && <div className="flex items-center gap-2 text-xs text-slate-600"><span className="shrink-0">시작 상태</span>
                    <div className="min-w-0 flex-1"><Select value={String(preSuId)} onChange={(e) => setPreSuId(+e.target.value)}>{preOpts.map((su) => <option key={su.id} value={String(su.id)}>{su.name} — 앞 {su.items.indexOf(tc.id)}건 먼저 ({su.items.slice(0, su.items.indexOf(tc.id)).join(", ")})</option>)}</Select></div>
                    <Btn icon={RefreshCw} onClick={runOne} disabled={runBlocked}>다시 실행</Btn></div>}
                  {runRes.preFail && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">앞 단계 {runRes.preFail} 에서 실패 — 이 케이스는 실행하지 않았습니다</div>}
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    {runRes.steps.map((s, i) => s.head ? (
                      <div key={i} className="border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"><span className="font-mono text-sky-600">{s.id}</span> {s.name}{s.pre && <span className="font-normal text-slate-500"> · 앞 단계</span>}</div>
                    ) : (
                      <div key={i} className={"flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs last:border-0 " + (s.ok ? "" : "bg-red-50")}>{s.na ? <span className="h-[13px] w-[13px] shrink-0 rounded-full border border-slate-300" /> : s.ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <XCircle size={13} className="text-red-600" />}<span className={"shrink-0 " + (s.ok ? "text-slate-700" : "text-red-700")}>{s.act}</span><span className="flex-1 truncate font-mono text-slate-500">{s.loc}</span></div>
                    ))}
                  </div>
                  {runRes.steps.some((x) => x.na) && <div className="text-xs text-slate-500">Full-Code 는 테스트 단위 결과만 있습니다 — 줄별 판정은 없습니다.</div>}
                  <div className="text-xs text-slate-500">＊ 목업 시뮬레이션</div>
                </>
              ))}
            </div>
          </div>
        </div></Portal>
      )}
      {prep && (
        <Modal title="화면 준비" onClose={() => {}}>
          <div className="space-y-2 text-sm">
            <div className="text-slate-700">스텝 {prep.i + 1}의 요소를 고르려면 그 직전 화면이 필요합니다.</div>
            <div className="flex items-center gap-2 text-xs text-slate-600"><RefreshCw size={13} className="animate-spin text-sky-600" />러너 브라우저 열기{prep.pre ? " → 앞 단계 " + prep.pre + "건 (" + preSu.name + ")" : ""}{prep.i ? " → 스텝 1" + (prep.i > 1 ? "~" + prep.i : "") + " 실행" : ""}</div>
            <div className="text-xs text-slate-500">{dbg ? dbg.label : ""}</div>
          </div>
        </Modal>
      )}
      {pickIdx !== null && steps[pickIdx] && <WebPickModal hint={(proc[(steps[pickIdx].n || 0) - 1] || {}).t || steps[pickIdx].loc} where={"스텝 " + (pickIdx + 1) + " 직전 화면"} forText={steps[pickIdx].act === "화면 검증"} onPick={onPick} onClose={() => setPickIdx(null)} />}
      {gen && <FqaGenModal tc={tc} proc={PL.compactProc(proc, []).proc} steps={steps} env={dbg ? { label: dbg.label, prod: !!(dbgEnvRec && dbgEnvRec.prod) } : null}
        pre={preSu ? { suite: preSu, cases: preSu.items.slice(0, preSu.items.indexOf(tc.id)).map((id) => fqaCases.find((c) => c.id === id)).filter(Boolean) } : null}
        prodCaution={prodCaution} onApply={applyGen} onClose={() => setGen(false)} />}
      {paste && (
        <Modal title="여러 줄 붙여넣기" onClose={() => setPaste(null)}>
          <div className="space-y-3">
            <textarea value={paste.text} onChange={(e) => setPaste({ text: e.target.value })} rows={9} autoFocus className={taCls} placeholder={"다른 문서의 절차를 그대로 붙여넣으세요.\n한 줄이 절차 하나, → 뒤는 기대 결과입니다.\n\n주문서에서 쿠폰 선택을 누른다\n신규 가입 쿠폰을 고른다 → 할인 금액이 표시된다"} />
            <div className="flex items-center justify-between text-xs">
              <button onClick={() => setPaste({ text: PL.tidyProc(paste.text) })} className="flex items-center gap-1 text-sky-600"><Sparkles size={12} />AI로 양식 정리 <span className="text-slate-500">— 문단처럼 이어 쓴 글을 한 줄 한 절차로</span></button>
              <span className="text-slate-500">{PL.procFromText(paste.text).length}개 절차</span>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">AI로 양식 정리는 붙여넣은 글을 AI에 보냅니다. 전화번호 · 이메일 · 카드번호 형태는 서버에서 가린 뒤 보내고, 결과에서 원래 값으로 되돌립니다.{PL.maskText(paste.text).count > 0 && <b className="ml-1 font-medium text-slate-800">지금 글에서 {PL.maskText(paste.text).count}건 가림</b>}</div>
            <div className="flex justify-end gap-2"><Btn onClick={() => setPaste(null)}>취소</Btn>{proc.some((p) => String(p.t || "").trim()) && <Btn onClick={() => applyPaste(true)}>모두 바꾸기</Btn>}<Btn kind="primary" onClick={() => applyPaste(false)}>{proc.some((p) => String(p.t || "").trim()) ? "뒤에 추가" : "추가"}</Btn></div>
          </div>
        </Modal>
      )}
      <Toast msg={msg} />
    </div>
  );
}