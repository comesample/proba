// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, ChevronLeft, Download, FileText, Pencil, RefreshCw, Sparkles, X, XCircle } from "lucide-react";
import { ShareBox } from "../common/ReportShare.jsx";
import { Badge, Btn, Card, Field, PageToolbar, Portal, SEL_CARD, SEL_ROW, Select, Toast, backTo, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { C } from "../common/theme.js";
import { CAUSE_K, CAUSE_ORDER, CAUSE_TX, causeOf, healKey, healNote, healOf, healUsable, histOf, surfacesOf } from "./logic.js";
import * as SL from "./suiteLogic.js";
import * as RL from "./runLogic.js";
/* ═══════════ 7. 결과 상세 ═══════════ */
export function FqaResultScreen({ runId, mode = "상세", back, nav, backLabel }) {
  const { fqaRuns, addFqaRun, fqaSystems, defects, addDefect, openModal, fqaPlans, fqaCases, fqaSuites, updateFqaCase, commitFqaCase, setFqaEditTc, jiraConfig, setPendingSelect, goto, healState, setHeal } = useApp();
  const [msg, flash] = useToast();
  const [filt, setFilt] = useState("전체");
  const [selId, setSelId] = useState(null);
  const [rowsAll, setRowsAll] = useState(false);   // 데이터 구동 케이스 — 기본은 실패 행만(30행 케이스가 화면을 덮지 않도록)
  const [selRow, setSelRow] = useState(null);      // 선택 행 — 스텝 타임라인·증적이 이 행을 따라간다
  const [etab, setEtab] = useState("스크린샷");
  const [aiOpen, setAiOpen] = useState(false);
  const healSt = (t) => healState[healKey(t)] || "검토 대기";
  /* 확인은 '실패한 스위트 다시 실행' 으로 한다 — 계획 안에서 실패한 스위트만 처음부터 다시 도는 부분 실행이다.
     계획 없는 단건 실행이라는 새 유형을 만들지 않는다. 부분 실행은 통과율 · 회귀 · 불안정 집계에서 빠진다(MQA 와 같은 규칙) */
  const HEAL_MSG = {
    "승인됨": "제안 로케이터가 TC 스텝에 반영되었습니다(리비전 생성). '실패한 스위트 다시 실행'으로 확인하세요.",
    "직접 수정함": "제안을 쓰지 않았습니다 — 에디터에서 직접 수정하세요.",
    "적용 실패": "제안한 로케이터가 케이스 스텝에 없어 반영되지 않았습니다. 에디터에서 직접 수정하세요.",
  };
  /* 🔑 로케이터를 바꾸면 그건 "테스트가 바뀐 것"이므로 리비전을 남긴다(F7).
     안 남기면 다음 회귀 비교에서 "제품이 깨진 건가 테스트가 바뀐 건가" 를 구분할 수 없다. */
  const approveHeal = (t) => {
    const c = fqaCases.find((x) => x.id === t.id);
    /* 🔑 적용할 스텝을 못 찾으면 '승인됨' 으로 넘기지 않는다.
       Full-Code 라 steps 가 없거나, heal.from 이 어느 스텝과도 안 맞으면 치환이 0건이다.
       그때 조용히 성공 처리하면 사용자는 고쳐진 줄 알고 그대로 다시 돌린다 — 가장 위험한 실패다. */
    const hit = c && c.steps ? c.steps.filter((st) => st.loc === t.heal.from).length : 0;
    if (!hit) {
      setHeal(healKey(t), "적용 실패");
      flash(t.id + " 보정 적용 실패 — 제안한 로케이터가 케이스에 없습니다. 에디터에서 직접 수정하세요");
      return;
    }
    if (c && c.steps) commitFqaCase(t.id, { steps: c.steps.map((st) => (st.loc === t.heal.from ? Object.assign({}, st, { loc: t.heal.to }) : st)) }, { note: "보정 제안 승인 — " + t.heal.from + " → " + t.heal.to });
    setHeal(healKey(t), "승인됨");
    flash(t.id + " 보정 승인 · 로케이터 갱신 (리비전 생성)");
  };
  /* 제안을 안 쓰기로 했다면 다음 행동은 "직접 고치기" 다 — 여기서 끊기면 사용자가 잊는다.
     아무것도 누르지 않으면 "검토 대기" 로 남는다(판단 보류). */
  const rejectHeal = (t) => {
    setHeal(healKey(t), "직접 수정함");
    flash(t.id + " 제안 미사용 — 에디터에서 " + t.heal.from + " 스텝을 직접 수정하세요");
    /* nav 를 쓰면 안 된다 — mode="상세" 로 뜨는 이 화면에는 nav 가 전달되지 않고,
       화면마다 nav 의 인자 규약도 다르다(어떤 곳은 runId, 어떤 곳은 view+tc).
       에디터 진입은 setFqaEditTc + goto 가 단일 경로다(스위트 화면도 같은 방식). */
    setFqaEditTc(t.id);
    goto("fqa-cases");
  };
  const run = fqaRuns.find((r) => r.id === runId) || fqaRuns.find((r) => r.id === "FRUN-502") || fqaRuns[0] || { id: "-", tcs: [], total: 0, pass: 0, fail: 0, warn: 0, dur: "-" };
  const jr = (() => { if (!(jiraConfig && jiraConfig.connected !== false)) return {}; const pl = (fqaPlans || []).find((p) => p.name === run.plan); return (pl && pl.jira && pl.jira.override) ? pl.jira : jiraConfig; })(); // 결함 라우팅: 미연동 시 내부 결함
  const dkey = (base) => (jr.project || "DEF") + "-" + base;
  const tcs = run.tcs || [];
  /* 같은 케이스가 두 스위트에서 돌 수 있다 — 행은 key(스위트:케이스)로 고른다. 옛 실행(스위트 정보 없음)은 id 로 */
  const kOf = (t) => t.key || t.id;
  const cur = tcs.find((t) => kOf(t) === selId) || tcs.find((t) => t.v === "FAIL") || tcs[0] || null;
  /* 선택 행 — 케이스를 바꾸면 그 케이스의 첫 실패 행으로 자연히 옮겨간다(별도 초기화 불필요) */
  const curRows = Array.isArray(cur && cur.rows) ? cur.rows : [];
  const curRow = curRows.find((r) => r.i === selRow) || curRows.find((r) => r.v === "FAIL") || curRows[0] || null;
  const passRate = run.total ? Math.round(((run.pass + (run.warn || 0)) / run.total) * 1000) / 10 : 0;
  const gval = run.gate != null ? run.gate : 95;
  const gate = run.fail > 0 || passRate < gval ? "FAIL" : "PASS";
  /* 증적 탭은 '실행'이 아니라 '케이스의 접점'을 따른다 — 웹·API 케이스가 섞인 실행에서
     API 케이스를 열었는데 스크린샷 탭이 뜨면 없는 증적을 찾게 된다.
     실 구현에서는 실행 시점의 접점이 결과에 스탬프되어야 한다(케이스는 실행 뒤에도 바뀐다). */
  const curCase = fqaCases.find((c) => c.id === ((cur || {}).id));
  const curSurf = curCase ? surfacesOf(curCase) : (run.brow ? "웹" : "API");
  /* 🔑 Full-Code는 스텝 상세가 나오지 않는다 — 스텝 경계는 test.step()으로만 생기고,
     사용자 코드에 그것이 없으면 러너는 테스트 단위 결과만 받는다. 있는 척하지 않는다.
     케이스를 못 찾으면(삭제·이름변경) Low-Code로 본다 — 타임라인을 숨기는 쪽이 더 큰 오해를 만든다. */
  const fullCode = !!(curCase && curCase.level === "Full-Code");
  /* trace가 1급이다 — 액션마다 DOM 스냅샷·네트워크·콘솔이 들어 있어 뷰어에서 타임트래블이 된다.
     영상은 trace의 필름스트립과 겹치므로 계획에서 명시적으로 켠 경우에만 탭에 나온다. */
  const hasVideo = !!run.video && run.video !== "녹화 안 함";
  const evTabs = curSurf === "API" ? ["요청", "응답", "HAR", "로그"]
    : curSurf === "웹+API" ? ["trace", "스크린샷", "콘솔 로그", "요청", "응답", "HAR"].concat(hasVideo ? ["영상"] : [])
    : ["trace", "스크린샷", "콘솔 로그"].concat(hasVideo ? ["영상"] : []);
  const evTab = evTabs.includes(etab) ? etab : evTabs[0];
  const _dur = (seed, base) => { let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973; return (base + (h % 500)).toLocaleString() + "ms"; };
  /* row가 주어지면 그 행의 실행으로 본다 — 데이터 구동 케이스는 행마다 결과가 다르므로
     케이스 단위 타임라인만 보여주면 "몇 행이 어느 스텝에서 깨졌나"를 알 수 없다. */
  const stepsFor = (t, row) => {
    if (!t) return [];
    if (t.v === "SKIP") return [{ act: "미실행", info: t.skipWhy || "건너뜀", dur: "-", ok: true, skip: true }];
    if (row && row.v === "SKIP") return [{ act: "미실행", info: "앞선 행에서 중단되어 실행되지 않았습니다", dur: "-", ok: true, skip: true }];
    const id = t.id || "TC";
    const seg = (run.suite || "app").split(" ")[0].split("/")[0];
    if (row) {
      const dv = Object.entries(row.data || {}).map(([k, v]) => k + "=" + v).join(" · ");
      const rl = row.dur || "-";
      const base = !run.brow
        ? [{ act: "요청 전송", info: dv, dur: _dur(id + row.i + "a", 300), ok: true },
           { act: "응답 수신", info: row.v === "FAIL" ? "상태/스키마 불일치" : "200 OK · 스키마 준수", dur: _dur(id + row.i + "b", 200), ok: true }]
        : [{ act: "페이지 이동", info: "goto · /" + seg.toLowerCase(), dur: _dur(id + row.i + "a", 300), ok: true },
           { act: "데이터 주입", info: dv, dur: _dur(id + row.i + "b", 120), ok: true },
           { act: t.name, info: "액션 수행 → " + id + " [" + row.i + "행]", dur: _dur(id + row.i + "c", 500), ok: true }];
      base.push(row.v === "FAIL"
        ? { act: "결과 검증 실패", info: row.err || "기대 결과 불일치", dur: rl, ok: false }
        : { act: "결과 검증", info: "통과", dur: rl, ok: true });
      return base;
    }
    const hl = healUsable(fqaCases, t);   // 뱃지·패널과 같은 판단을 쓴다
    const last = Math.round((parseFloat(t.dur) || 1) * 1000).toLocaleString() + "ms";
    const s = !run.brow
      ? [
          { act: "요청 전송", info: (t.name || id) + " · REST 요청", dur: _dur(id + "a", 300), ok: true },
          { act: "응답 수신", info: t.v === "FAIL" ? "상태/스키마 불일치" : "200 OK · 스키마 준수", dur: _dur(id + "b", 200), ok: true },
        ]
      : [
          { act: "브라우저 열기", info: (run.brow || "Chromium").toLowerCase().split("+")[0] + " · 세션 시작", dur: _dur(id + "a", 1400), ok: true },
          { act: "페이지 이동", info: "goto · /" + seg.toLowerCase(), dur: _dur(id + "b", 300), ok: true },
          /* 🔑 보정은 실행 중에 적용되지 않는다 — 로케이터를 못 찾으면 그 자리에서 실패하고,
             판정이 확정된 뒤에 같은 페이지에서 대안 후보만 찾아 기록한다(진행하지 않는다). */
          { act: t.name, info: hl ? "로케이터 " + hl.from + " 를 찾지 못함 · 대안 후보 탐색" : "액션 수행 → " + id, dur: _dur(id + "c", 500), ok: !hl },
        ];
    s.push(
      t.v === "FAIL"
        ? { act: hl ? "로케이터 없음" : "결과 검증 실패", info: hl ? hl.step + " — 대안 후보를 찾았습니다. 결과 화면에서 확인하세요" : t.name + " — 기대 결과 불일치 (재시도 2회)", dur: last, ok: false }
        : t.v === "WARN"
        ? { act: "결과 검증 (경고)", info: t.name + " — 통과, 임계 근접 경고", dur: last, ok: true, warn: true }
        : { act: "결과 검증", info: t.name + " — 통과", dur: last, ok: true }
    );
    return s;
  };
  const SUM = [["전체 TC", run.total, "text-slate-900", run.skip ? "건너뜀 " + run.skip + "건 제외" : ""], ["통과", run.pass, "text-emerald-600"], ["실패", run.fail, "text-red-600"], ["경고", run.warn, "text-amber-600"]].concat(!run.brow ? [] : [["보정 제안", tcs.filter((t) => healUsable(fqaCases, t)).length, "text-sky-600"]]);
  /* 중복 결함 판정 키 = (도메인, 대상 제품, TC).
     같은 TC라도 대상 제품이 다르면 다른 결함이다. 환경(스테이징/운영)은 발견 위치일 뿐 결함의 축이 아니다.
     '열린' 결함이 있으면 재등록 금지. Resolved만 있으면 재발이므로 재등록 허용. */
  const runTarget = String(run.target || "").split(" · ")[0]; // "온마켓 · 스테이징" → "온마켓"
  const defectsOfTc = (id) => defects.filter((d) => d.tc === id && d.domain === "FQA" && (d.target || "") === runTarget);
  const openDefectOf = (id) => defectsOfTc(id).find((d) => d.status !== "Resolved");
  const isRegression = (id) => !openDefectOf(id) && defectsOfTc(id).length > 0;
  /* 🔑 아직 결함에 안 걸린 실패 행 — 버튼 노출 조건과 등록 모달의 기본 선택이 같은 계산을 써야 한다.
     따로 계산하면 "등록할 게 없는데 버튼이 보이는" 상태가 된다. 행 식별은 스냅샷 해시가 아니라
     목업이므로 데이터 직렬화로 대신한다(실 구현은 data_hash). */
  const regKeysOf = (id) => defectsOfTc(id).flatMap((d) => (d.rows || []).map((r) => JSON.stringify(r.data || {})));
  const openFailRows = (t) => { if (!t || !Array.isArray(t.rows)) return []; const k = regKeysOf(t.id); return t.rows.filter((r) => r.v === "FAIL" && !k.includes(JSON.stringify(r.data || {}))); };
  // 등록할 것이 남았는가 — 행 케이스는 미등록 실패 행 기준, 일반 케이스는 열린 결함 유무 기준
  const canRegister = (t) => { if (!t || t.v !== "FAIL") return false; return Array.isArray(t.rows) && t.rows.length ? openFailRows(t).length > 0 : !openDefectOf(t.id); };
  const regDefect = (t) => {
    /* 데이터 구동 케이스는 실패 행마다 원인이 다를 수 있으므로 케이스당 1건으로 막지 않는다.
       어느 행을 묶을지는 사용자가 모달에서 고른다(시스템이 자동으로 분리·병합하지 않는다). */
    const failRows = Array.isArray(t.rows) ? t.rows.filter((r) => r.v === "FAIL") : [];
    if (!canRegister(t)) { flash(t.id + " 등록할 실패 행이 없습니다 — 이미 모두 결함에 연결되어 있습니다"); return; }
    openModal("jira", {
      domain: "FQA", sev: "Major", tc: t.id, target: runTarget, labels: "fqa, functional" + (t.cause ? ", cause:" + t.cause : "") + (healUsable(fqaCases, t) ? ", locator-changed" : ""),
      rows: failRows, ds: t.ds || "",
      regRows: defectsOfTc(t.id).flatMap((d) => (d.rows || []).map((r) => JSON.stringify(r.data || {}))),
      title: (isRegression(t.id) ? "[재발] " : "") + t.name + " 기능 실패",
      desc: "기능 케이스: " + t.name + " (" + t.id + ")\n대상 제품: " + runTarget + (t.cause ? "\n실패 원인(자동 분류): " + t.cause : "") + healNote(healUsable(fqaCases, t)),
      steps: "1. 케이스 '" + t.name + "' 실행\n2. 단언(assertion) 검증",
      expected: t.expected || "케이스에 정의된 기대 결과 충족",
      actual: healUsable(fqaCases, t) ? "로케이터 " + healUsable(fqaCases, t).from + " 를 찾지 못함 — 보정 제안 있음" : "단언 불일치 — 케이스 실패",
      env: runTarget,
      artifacts: [{ k: "shot", label: "스크린샷", file: "screenshot.png", size: "220 KB" }, { k: "har", label: "네트워크 HAR", file: "session.har", size: "1.2 MB" }, { k: "trace", label: "Playwright 트레이스", file: "trace.zip", size: "3 MB" }],
    });
  };
  const FLAKY = fqaCases.filter((c) => histOf(fqaRuns, c.id).length >= 1).map((c) => {
    const h = histOf(fqaRuns, c.id); const fails = h.filter((v) => v === "FAIL").length; const passes = h.filter((v) => v === "PASS").length; const warns = h.filter((v) => v === "WARN").length;
    const flips = h.slice(1).reduce((n, v, i) => n + (v !== h[i] ? 1 : 0), 0);
    let trail = 0; for (let i = h.length - 1; i >= 0; i--) { if (h[i] === "FAIL") trail++; else break; }
    const rate = Math.round((fails / h.length) * 100);
    const persistent = h.length >= 3 && fails / h.length >= 0.6 && trail >= 2;
    /* 불안정 = 재시도 통과(WARN) 또는 PASS/FAIL 교차.
       🔑 표본 수 조건은 두 경로에 똑같이 건다 — 1회 실행의 재시도 통과 하나로
          "이 케이스는 불안정하다"고 단정하면 안 된다(화면에 적어 둔 기준과도 어긋난다). */
    const flaky = !persistent && h.length >= 3 && (warns > 0 || (fails > 0 && passes > 0));
    const streak = persistent ? ("최근 " + trail + "회 연속 실패 · " + rate + "% 실패") : (warns > 0 ? ("재시도 통과(flaky) " + warns + "회" + (flips >= 1 ? " · PASS/FAIL 교차 " + flips + "회" : "")) : ("PASS/FAIL 교차 " + flips + "회 · " + rate + "% 실패"));
    return { heal: healOf(fqaRuns, fqaCases, c.id), cause: causeOf(fqaRuns, c.id), id: c.id, name: c.name, suite: SL.suiteNamesOf(fqaSuites, c.id).join(" · ") || "—", runs: h.length, fails, rate, flips, warns, unstable: fails + warns, urate: Math.round(((fails + warns) / h.length) * 100), flaky, persistent, quarantined: !!c.quarantined, streak };
  }).filter((r) => r.flaky || r.persistent);
  const flakyN = FLAKY.filter((r) => r.flaky).length;
  const persistN = FLAKY.filter((r) => r.persistent).length;
  const hasDefFQA = (id) => defects.some((d) => d.tc === id && d.domain === "FQA");
  const regFail = (r) => {
    if (hasDefFQA(r.id)) { flash(r.id + " 이미 결함 등록됨"); return; }
    /* 이 화면의 [결함 등록] 은 결과 화면을 거치지 않는다 — 보정 제안을 여기서 안 실으면
       로케이터가 낡아 생긴 지속 실패가 제품 결함으로 등록된다. */
    openModal("jira", {
      domain: "FQA", sev: "Major", tc: r.id, labels: "fqa, flaky, persistent" + (r.cause ? ", cause:" + r.cause : "") + (r.heal ? ", locator-changed" : ""),
      title: "지속 실패: " + r.name,
      desc: "케이스 '" + r.name + "' (" + r.id + ")\n최근 " + r.runs + "회 중 " + r.fails + "회 실패 (" + r.rate + "%)\n" + (r.streak || "") + healNote(r.heal),
      steps: "1. 케이스 '" + r.name + "' 반복 실행\n2. 실패 재현 확인",
      expected: "케이스 통과",
      actual: (r.heal ? "로케이터 " + r.heal.from + " 를 찾지 못함 — 보정 제안 있음 · " : "") + "지속 실패 — " + (r.streak || (r.rate + "% 실패")),
      artifacts: [{ k: "shot", label: "스크린샷", file: "screenshot.png", size: "220 KB" }, { k: "trace", label: "Playwright 트레이스", file: "trace.zip", size: "3 MB" }],
    });
  };
  const toggleQuar = (r) => { updateFqaCase(r.id, { quarantined: !r.quarantined }); flash(r.id + (r.quarantined ? " 격리 해제 — 실행 대상에 복귀" : " 격리(quarantine) — 실행 대상에서 제외")); };
  const vK = { PASS: "pass", FAIL: "fail", HEAL: "active", WARN: "warn", SKIP: "draft" };
  const vLabel = (v) => (v === "SKIP" ? "건너뜀" : v);
  /* 실패한 스위트 다시 실행 — 그 스위트를 처음부터 (앞 단계가 시작 상태를 만든다). 지금 실행할 수 없는 스위트는 뺀다 */
  const plan = (fqaPlans || []).find((p) => p.id === run.planId);
  const failSuites = [...new Set(tcs.filter((t) => t.v === "FAIL" && t.suiteId != null).map((t) => t.suiteId))];
  const rerun = (only) => {
    if (!plan) { flash("계획이 삭제되어 다시 실행할 수 없습니다"); return; }
    if (plan.status !== "활성") { flash(plan.name + " — 초안 계획은 실행할 수 없습니다"); return; }
    const ok = SL.planSuites(plan, fqaSuites).filter((s) => !SL.suiteBlock(s, fqaCases)).map((s) => s.id);
    const sids = (only || failSuites).filter((x) => ok.includes(x));
    if (!sids.length) { flash("실패한 스위트를 지금 실행할 수 없습니다 — 계획에서 빠졌거나 승인 전 케이스가 있습니다"); return; }
    const nr = RL.makeRun(plan, { cases: fqaCases, suites: fqaSuites, runs: fqaRuns, systems: fqaSystems }, { onlySuites: sids, note: run.id + " 의 실패한 스위트 다시" });
    addFqaRun(nr); flash(nr.id + " 대기열에 추가 — 스위트 " + sids.length + "개"); goto("fqa-run");
  };
  /* 데이터 구동 케이스의 행 요약 — 판정·집계는 케이스 단위(1건)이고 행은 보조 표기다.
     rows가 없는 케이스는 기존 동작 그대로다(빈 문자열 반환). */
  const rowSum = (t) => { const rs = t && t.rows; if (!Array.isArray(rs) || !rs.length) return ""; const p = rs.filter((r) => r.v === "PASS").length; const s = rs.filter((r) => r.v === "SKIP").length; return rs.length + "행 중 " + p + "행 통과" + (s ? " · " + s + "행 미실행" : ""); };
  const shown = tcs.filter((t) => filt === "전체" || (filt === "실패만" && t.v === "FAIL") || (filt === "통과만" && t.v === "PASS") || (filt === "건너뜀" && t.v === "SKIP") || (filt === "보정 제안" && healUsable(fqaCases, t)));
  // 실행은 계획을 id로 참조(planId) — 이름이 바뀌어도 이력이 안 끊긴다. 레거시 런(planId 없음)은 이름으로 매칭.
  // 회귀는 전체 실행끼리만 비교한다 — 부분 실행(실패한 스위트 다시 실행)은 빠진 스위트가 '사라진 것' 처럼 보인다
  const finishedOf = (pid) => fqaRuns.filter((r) => (r.planId != null ? r.planId === pid : r.plan === ((fqaPlans.find((p) => p.id === pid) || {}).name)) && r.status === "완료" && !r.partial).sort((x, y) => parseInt(y.id.split("-")[1] || "0", 10) - parseInt(x.id.split("-")[1] || "0", 10));
  const [regPlan, setRegPlan] = useState((fqaPlans && fqaPlans[0]) ? fqaPlans[0].id : null);
  const _ir = finishedOf(regPlan);
  const [bId, setBId] = useState(_ir[0] ? _ir[0].id : "");
  const [aId, setAId] = useState(_ir[1] ? _ir[1].id : (_ir[0] ? _ir[0].id : ""));
  useEffect(() => { const rs = finishedOf(regPlan); setBId(rs[0] ? rs[0].id : ""); setAId(rs[1] ? rs[1].id : (rs[0] ? rs[0].id : "")); }, [regPlan]);
  const planRuns = finishedOf(regPlan);
  const runA = fqaRuns.find((r) => r.id === aId);
  const runB = fqaRuns.find((r) => r.id === bId);
  const rate = (r) => (r && r.total ? Math.round((r.pass / r.total) * 1000) / 10 : 0);
  const rank = { FAIL: 0, WARN: 1, HEAL: 1, PASS: 2 };
  /* 건너뜀은 판정이 없다 — 지난번 통과 → 이번 건너뜀은 퇴행이 아니라 비교 불가 */
  const cls = (a, b) => (!a || !b ? { k: "-", c: "text-slate-500" } : a === "SKIP" || b === "SKIP" ? { k: "비교 불가", c: "text-slate-500" } : a === b ? { k: "유지", c: "text-slate-500" } : ((rank[b] == null ? 2 : rank[b]) > (rank[a] == null ? 2 : rank[a]) ? { k: "개선", c: "text-emerald-600" } : { k: "퇴행", c: "text-red-600" }));
  /* 케이스 기준으로 합쳐 비교한다 — 같은 케이스가 여러 스위트에서 돌았으면 하나라도 실패면 실패 (suiteLogic.mergedTcs) */
  const mA = runA ? SL.mergedTcs(runA) : [], mB = runB ? SL.mergedTcs(runB) : [];
  const _nameOf = (id) => { const t = [...mB, ...mA].find((x) => x.id === id); return t ? t.name : id; };
  const mapA = Object.fromEntries(mA.map((t) => [t.id, t.v]));
  const mapB = Object.fromEntries(mB.map((t) => [t.id, t.v]));
  /* 회차별 케이스 리비전 — 퇴행의 원인이 제품인지 케이스 수정인지를 가르는 유일한 단서다.
     rev가 바뀐 퇴행은 케이스를 먼저 봐야 하고, rev가 같은 퇴행이라야 제품 회귀를 의심할 수 있다. */
  const revA = Object.fromEntries(mA.map((t) => [t.id, t.rev]));
  const revB = Object.fromEntries(mB.map((t) => [t.id, t.rev]));
  /* 여러 브라우저로 돈 회차는 '어느 브라우저에서 실패했는지' 를 함께 보여준다 (대표 행의 브라우저) */
  const bwB = {}; ((runB && runB.tcs) || []).filter((t) => t.brow && (t.v === "FAIL" || t.v === "WARN")).forEach((t) => { const a = (bwB[t.id] = bwB[t.id] || []); if (!a.includes(t.brow)) a.push(t.brow); });
  Object.keys(bwB).forEach((k) => { bwB[k] = bwB[k].join(" · "); });
  const regRows = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].map((id) => ({ id, name: _nameOf(id), a: mapA[id], b: mapB[id], ra: revA[id], rb: revB[id], bw: bwB[id] }));
  /* 러너·브라우저가 바뀐 회차끼리의 비교는 제품 회귀로 단정할 수 없다 — 회차 단위 사실이므로 한 번만 계산한다.
     케이스 rev와 같은 원칙: 판정을 뒤집지 않고 사실만 덧붙인다. */
  const runDiff = (() => {
    if (!runA || !runB) return "";
    if ((runA.brow || "") !== (runB.brow || "")) return "브라우저 변경";
    if (runA.pw && runB.pw && runA.pw !== runB.pw) return "러너 변경";
    return "";
  })();
  const summ = regRows.reduce((acc, r) => { const k = cls(r.a, r.b).k; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  return (
    <div className="space-y-4">
      {mode === "상세" ? (
        <PageToolbar desc={back ? <span><button onClick={back} className="text-sky-600 hover:underline">{backLabel || "실행 이력"}</button> <span className="text-slate-500">›</span> <span className="text-slate-700 font-medium">{run.id} 결과</span></span> : "결과 상세"}>
          {back && <Btn icon={ChevronLeft} onClick={back}>{backTo(backLabel || "실행 이력")}</Btn>}
        </PageToolbar>
      ) : (
        <PageToolbar desc={mode === "회귀" ? "회귀 비교 · 실행(계획) 기준" : "불안정(Flaky) · 테스트케이스 기준"} />
      )}
      {mode === "상세" && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-sm text-sky-600">{run.id}</span><span className="text-sm font-medium text-slate-800">{(fqaPlans.find((p) => p.id === run.planId) || {}).name || run.plan}</span>{run.fail > 0 ? <Badge kind="fail">실패 {run.fail}건</Badge> : <Badge kind="pass">전체 통과</Badge>}<span className="text-xs text-slate-500">{!run.brow ? "API" : (run.brow || "Chromium")} · {run.suite}</span>{run.ver && run.ver !== "-" && <Badge kind="info">빌드 {run.ver}</Badge>}
              {/* 🔑 러너 버전 스탬프 — 없으면 "제품이 깨진 건가 브라우저가 올라간 건가"를 구분할 수 없다.
                  케이스 rev와 같은 목적이다. 브라우저 버전은 Playwright 버전에 종속이지만 매핑표를 외우게 하지 않는다. */}
              {run.pw && <span className="font-mono text-slate-500" style={{ fontSize: 11 }} title={"Playwright " + run.pw + " · Chromium " + (run.brVer || "-")}>pw {run.pw}</span>}</div>
            <div className="flex gap-2">{run.status === "완료" && failSuites.length > 0 && <Btn kind="primary" icon={RefreshCw} onClick={() => rerun()}>실패한 스위트 다시 실행 ({failSuites.length})</Btn>}<Btn icon={Download} onClick={() => flash("Excel")}>Excel</Btn><Btn icon={Download} onClick={() => flash("PDF")}>PDF</Btn></div>
          </Card>
          <div className={"grid gap-3 " + (!run.brow ? "grid-cols-5" : "grid-cols-6")}>
            {SUM.map((k) => (<Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div>{k[3] && <div className="text-slate-400" style={{ fontSize: 10 }}>{k[3]}</div>}</Card>))}
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-slate-900">{run.dur}</div><div className="mt-0.5 text-xs text-slate-500">소요</div></Card>
          </div>
          <Card className="flex flex-wrap items-center gap-3 p-3 text-sm"><span className={"font-semibold " + (gate === "FAIL" ? "text-red-700" : "text-emerald-700")}>품질 게이트: {gate}</span><span className="text-slate-500">기준 {gval}% · 실제 <span className={"font-semibold " + (gate === "FAIL" ? "text-red-700" : "text-emerald-700")}>{passRate}%</span></span>{run.brow && (<><span className="text-slate-500">·</span><span className="text-slate-500">보정 제안 {tcs.filter((t) => healUsable(fqaCases, t)).length}건</span></>)}</Card>
          {tcs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">{run.status === "실행 중" || run.status === "대기 중" ? "실행이 진행 중입니다 — 완료 후 케이스 결과가 표시됩니다." : "이 실행에는 케이스 상세 결과가 없습니다."}</Card>
          ) : (
          <div className="grid grid-cols-5 gap-4">
            <Card className="col-span-2 overflow-hidden">
              <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-3 py-2">
                {(!run.brow ? ["전체", "실패만", "통과만"] : ["전체", "실패만", "통과만", "보정 제안"]).concat(tcs.some((t) => t.v === "SKIP") ? ["건너뜀"] : []).map((t) => (<button key={t} onClick={() => setFilt(t)} className={"rounded-full px-2.5 py-1 text-xs " + (filt === t ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{t}</button>))}
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                {shown.map((t, i) => (
                  <Fragment key={kOf(t)}>
                  {t.suiteName && (i === 0 || shown[i - 1].suiteId !== t.suiteId || shown[i - 1].brow !== t.brow) && <div className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600">{t.brow ? t.brow + " · " : ""}{t.suiteName}</div>}
                  <div onClick={() => setSelId(kOf(t))} className={"flex items-center justify-between border-b border-slate-200 px-4 py-2.5 cursor-pointer hover:bg-slate-100 " + (cur && kOf(cur) === kOf(t) ? SEL_ROW : "")}>
                    <div><span className="font-mono text-xs text-sky-600">{t.id}</span>{t.rev != null && <span className="ml-1.5 font-mono text-slate-500" style={{ fontSize: 10 }}>rev {t.rev}</span>}<div className={"text-xs " + (t.v === "SKIP" ? "text-slate-400" : "text-slate-700")}>{t.name}</div>{t.skipWhy && <div className="text-slate-400" style={{ fontSize: 11 }}>{t.skipWhy}</div>}{(t.cause || rowSum(t)) && <div className="flex items-center gap-1.5" style={{ fontSize: 11 }}>{t.cause && <span className={CAUSE_TX[t.cause] || "text-slate-500"}>원인 · {t.cause}</span>}{t.cause && rowSum(t) && <span className="text-slate-300">·</span>}{rowSum(t) && <span className="text-slate-500">{rowSum(t)}</span>}</div>}</div>
                    <div className="flex items-center gap-2">{t.v === "FAIL" && openDefectOf(t.id) && <Bug size={12} className="text-red-600" />}<span className="text-xs text-slate-500">{t.dur}</span>{healUsable(fqaCases, t) && <Badge kind="active">보정</Badge>}<Badge kind={vK[t.v]}>{vLabel(t.v)}</Badge></div>
                  </div>
                  </Fragment>
                ))}
              </div>
            </Card>
            {cur && (
            <Card className="col-span-3 p-4">
              <div className="mb-3 flex items-center justify-between"><span className="font-mono text-sky-600">{cur.id}</span><div className="flex items-center gap-2"><Badge kind={vK[cur.v]}>{vLabel(cur.v)}</Badge>{healUsable(fqaCases, cur) && <Badge kind="active">보정</Badge>}<Btn icon={RefreshCw} onClick={() => flash(cur.id + " 재실행")}>재실행</Btn>{cur.v === "FAIL" && openDefectOf(cur.id) && <Btn icon={Bug} onClick={() => { setPendingSelect({ kind: "defect", key: openDefectOf(cur.id).key }); goto("defects"); }}>결함 보기 · {openDefectOf(cur.id).key}</Btn>}
                {/* 행이 있는 케이스는 열린 결함이 있어도 다른 행에 대해 추가 등록할 수 있다 */}
                {canRegister(cur) && <Btn kind="danger" icon={Bug} onClick={() => regDefect(cur)}>{isRegression(cur.id) ? "재발 결함 등록" : "결함 등록"}</Btn>}</div></div>
              <div className="mb-3 text-sm text-slate-700">{cur.name}{cur.suiteName && <span className="ml-1.5 text-xs text-slate-500">· 스위트 {cur.suiteName}{cur.brow ? " · " + cur.brow : ""}</span>}</div>
              {cur.v === "SKIP" && <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><b className="font-medium">건너뜀</b> — {cur.skipWhy}</div>}
              {/* 🔑 실행 결과의 리비전 스탬프 — 없으면 "제품이 깨진 건가 케이스가 바뀐 건가"를 구분할 수 없어 회귀 분석이 거짓말을 한다.
                  케이스가 그 뒤에 수정되었으면 이 결과를 현재 케이스로 재현할 수 없다는 뜻이므로 그렇게 알린다. */}
              {cur.rev != null && curCase && (curCase.rev || 1) !== cur.rev && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>이 결과는 <span className="font-mono">rev {cur.rev}</span> 로 실행되었고 케이스는 현재 <span className="font-mono">rev {curCase.rev || 1}</span> 입니다 — 지금 다시 돌리면 다른 결과가 나올 수 있습니다. <span className="text-amber-600/80">테스트케이스에서 변경 이력을 확인하세요.</span></span>
                </div>
              )}
              {/* 🔑 Full-Code 는 제외한다 — 아래 안내 문구와 같은 규칙이다.
                  코드의 어느 줄을 고쳐야 하는지 알 수 없으므로 스텝 치환이 성립하지 않는다. */}
              {healUsable(fqaCases, cur) && (
                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-center justify-between"><span className="text-xs font-semibold text-sky-700">자가보정 제안 (로케이터 자동 복구)</span><Badge kind={healSt(cur) === "승인됨" ? "pass" : healSt(cur) === "적용 실패" ? "fail" : "warn"}>{healSt(cur)}</Badge></div>
                  <div className="mt-2 text-xs text-slate-500">{cur.heal.step}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs"><span className="text-red-700 line-through">{cur.heal.from}</span><span className="text-slate-500">→</span><span className="text-emerald-700">{cur.heal.to}</span></div>
                  {/* 🔑 신뢰도 %를 쓰지 않는다 — 규칙 점수의 합일 뿐인데 사람은 확률로 읽는다.
                      "왜 이 후보인가" 를 문장으로 주는 편이 판단에 쓸모 있다. */}
                  {cur.heal.why && <div className="mt-1 text-xs text-slate-500">{cur.heal.why}</div>}
                  {healSt(cur) === "검토 대기" ? <div className="mt-2 flex gap-2"><Btn kind="primary" icon={CheckCircle2} onClick={() => approveHeal(cur)}>승인 · 로케이터 반영</Btn><Btn icon={Pencil} onClick={() => rejectHeal(cur)}>직접 수정</Btn></div> : <div className={"mt-2 text-xs " + (healSt(cur) === "적용 실패" ? "text-red-700" : "text-slate-500")}>{HEAL_MSG[healSt(cur)]}</div>}
                </div>
              )}
              {Array.isArray(cur.rows) && cur.rows.length > 0 && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">행 결과 <span className="font-normal text-slate-500">· 데이터셋 {cur.ds || "-"} · {rowSum(cur)}</span>{cur.stopped && <span className="ml-2 text-amber-700">· {cur.stopped}</span>}</span>
                    <button onClick={() => setRowsAll(!rowsAll)} className="text-xs text-sky-600 hover:text-sky-600">{rowsAll ? "실패 행만" : "전체 " + cur.rows.length + "행 보기"}</button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {(rowsAll ? cur.rows : cur.rows.filter((r) => r.v !== "PASS")).map((r) => (
                      <div key={r.i} onClick={() => setSelRow(r.i)} className={"cursor-pointer rounded border px-2.5 py-1.5 text-xs " + (curRow && curRow.i === r.i ? SEL_CARD : r.v === "FAIL" ? "border-red-200 bg-red-50 hover:border-red-300" : "border-slate-200 bg-slate-100 hover:border-slate-400")}>
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-slate-500">{r.i}행</span>
                          <span className="flex-1 truncate font-mono text-slate-700">{Object.entries(r.data || {}).map(([k, v]) => k + "=" + v).join(" · ")}</span>
                          <span className="text-slate-500">{r.dur || "-"}</span>
                          <Badge kind={r.v === "PASS" ? "pass" : r.v === "FAIL" ? "fail" : "draft"}>{r.v === "SKIP" ? "미실행" : r.v}</Badge>
                        </div>
                        {r.err && <div className="mt-1 text-red-700" style={{ paddingLeft: 38 }}>{r.err}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-slate-500" style={{ fontSize: 11 }}>판정은 케이스 단위 1건이다 — 한 행이라도 실패하면 FAIL. 행 데이터는 실행 시점 스냅샷이다. 행을 클릭하면 아래 스텝·증적이 그 행으로 바뀐다.</div>
                </div>
              )}
              <div className="mb-2 text-xs font-semibold text-slate-500">{fullCode ? "실행 결과" : "스텝 실행 타임라인"}{curRow && <span className="ml-1.5 font-normal text-sky-600">· {curRow.i}행</span>}</div>
              {fullCode ? (
                /* 코드가 정본인 케이스 — 스텝 경계가 없으므로 테스트 단위 판정과 에러만 준다 */
                <div className="space-y-1.5">
                  {(() => { const v = curRow ? curRow.v : cur.v, d = curRow ? curRow.dur : cur.dur, e = curRow ? curRow.err : null;
                    if (v === "SKIP") return <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><AlertTriangle size={14} className="text-slate-500" /><span className="font-medium text-slate-800">미실행</span><span className="flex-1 font-mono text-slate-500">앞선 행에서 중단되어 실행되지 않았습니다</span></div>;
                    return <div className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " + (v === "FAIL" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-100")}>
                      {v === "FAIL" ? <XCircle size={14} className="text-red-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
                      <span className={"font-medium " + (v === "FAIL" ? "text-red-700" : "text-slate-800")}>{v === "FAIL" ? "테스트 실패" : "테스트 통과"}</span>
                      <span className="flex-1 font-mono text-slate-500">{e || (v === "FAIL" ? "에러 스택은 증적에서 확인" : cur.name)}</span>
                      <span className="text-slate-500">{d || "-"}</span>
                    </div>; })()}
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500" style={{ fontSize: 11 }}>
                    Full-Code 케이스는 스텝 상세가 없습니다 — 스텝 경계는 <span className="font-mono text-slate-500">test.step()</span> 으로만 만들어집니다. 코드에 없으면 러너도 알 수 없으므로 지어내지 않습니다. 같은 이유로 <span className="text-slate-700">보정 제안은 Low-Code 케이스에만</span> 제공됩니다 — 코드의 어느 줄을 고쳐야 하는지 알 수 없기 때문입니다.
                  </div>
                </div>
              ) : (
              <div className="space-y-1.5">
                {stepsFor(cur, curRow).map((st, i) => (
                  <div key={i} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " + (!st.ok ? "border-red-200 bg-red-50" : st.skip ? "border-slate-200 bg-white" : st.warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-100")}>
                    {!st.ok ? <XCircle size={14} className="text-red-600" /> : st.skip ? <AlertTriangle size={14} className="text-slate-500" /> : st.warn ? <AlertTriangle size={14} className="text-amber-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
                    <span className={"font-medium " + (!st.ok ? "text-red-700" : st.warn ? "text-amber-800" : "text-slate-800")}>{st.act}</span>
                    <span className="flex-1 font-mono text-slate-500">{st.info}</span>
                    <span className="text-slate-500">{st.dur}</span>
                  </div>
                ))}
              </div>
              )}
              <div className="mt-3">
                <div className="flex items-center justify-between border-b border-slate-200">
                  <div className="flex gap-1.5">
                    {evTabs.map((t) => (<button key={t} onClick={() => setEtab(t)} className={"px-2.5 py-1.5 text-xs " + (evTab === t ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-500 hover:text-slate-700")}>{t}</button>))}
                  </div>
                  {/* 증적은 '한 번이라도 실패한 행'만 보관한다 — 통과·미실행 행에는 내려받을 것이 없다 */}
                  {!(curRow && curRow.v !== "FAIL") && <button onClick={() => flash((curRow ? cur.id + " " + curRow.i + "행" : cur.id) + " · " + evTab + " 다운로드")} className="flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-sky-600 hover:text-sky-600"><Download size={12} />{evTab} 다운로드</button>}
                </div>
                {curRow && curRow.v !== "FAIL" ? (
                  <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-slate-500">{curRow.i}행은 {curRow.v === "SKIP" ? "실행되지 않아" : "통과해"} 보관된 증적이 없습니다 · 증적은 한 번이라도 실패한 행만 보관합니다</div>
                ) : (
                <div className="flex h-24 items-center justify-center text-xs text-slate-500">{(() => { const nm = cur.id + (curRow ? "_row" + curRow.i : "");
                  if (evTab === "trace") return nm + "_trace.zip · 4.2MB · Playwright Trace Viewer로 열기";
                  if (evTab === "HAR") return nm + ".har · 네트워크 전체 기록 · 1.1MB";
                  if (evTab === "요청") return nm + " · 요청 원문 · 메서드·URL·헤더·바디";
                  if (evTab === "응답") return nm + " · 응답 " + (cur.v === "FAIL" ? "4xx · 불일치" : "200 OK") + " · body.json";
                  if (evTab === "로그") return nm + " · HTTP trace · 헤더 · 타이밍";
                  if (evTab === "스크린샷") return nm + (cur.v === "FAIL" ? "_fail" : "_pass") + ".png · 1.4MB";
                  if (evTab === "영상") return run.id.toLowerCase().replace("-", "_") + "_" + nm.toLowerCase() + ".webm · 12MB";
                  return nm + " · console/network 로그"; })()}</div>
                )}
                {/* 언제 사라지는지 알려준다 — 결함에 걸린 증적은 기간과 무관하게 남는다(참조 기준, 기간 기준이 아님) */}
                <div className="mt-1.5 text-slate-500" style={{ fontSize: 11 }}>증적 보존 30일{defectsOfTc(cur.id).length > 0 && <span className="text-slate-500"> · 결함에 연결되어 결함 종료 시까지 유지됩니다</span>}</div>
              </div>
            </Card>
            )}
          </div>
          )}
        </>
      )}
      {mode === "회귀" && (
        <>
          <Card className="p-3"><Field label="실행 계획 (비교 맥락)"><Select value={regPlan == null ? "" : regPlan} onChange={(e) => setRegPlan(+e.target.value)}>{fqaPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field></Card>
          {planRuns.length < 2 ? (
            <Card className="p-8 text-center text-sm text-slate-500">이 계획에는 비교할 완료된 실행이 2건 이상 필요합니다 (현재 {planRuns.length}건).</Card>
          ) : (
          <>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4"><div className="mb-1 text-xs text-slate-500">A — 기준(baseline)</div><Select value={aId} onChange={(e) => setAId(e.target.value)}>{planRuns.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.at} · {rate(r)}%</option>)}</Select><div className="mt-3 text-4xl font-bold text-slate-700">{rate(runA)}%</div></Card>
            <Card className="border-sky-300 p-4"><div className="mb-1 text-xs text-slate-500">B — 비교(target)</div><Select value={bId} onChange={(e) => setBId(e.target.value)}>{planRuns.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.at} · {rate(r)}%</option>)}</Select><div className="mt-3 text-4xl font-bold text-sky-600">{rate(runB)}%</div></Card>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center"><div className="text-2xl font-bold text-emerald-600">{summ["개선"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">개선</div></Card>
            <Card className="p-4 text-center"><div className="text-2xl font-bold text-red-600">{summ["퇴행"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">퇴행 (회귀)</div></Card>
            <Card className="p-4 text-center"><div className="text-2xl font-bold text-slate-700">{summ["유지"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">유지</div>{summ["비교 불가"] ? <div className="text-slate-400" style={{ fontSize: 10 }}>비교 불가(건너뜀) {summ["비교 불가"]}건</div> : null}</Card>
          </div>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><div className="text-sm font-semibold text-slate-800">케이스 회귀 분석 <span className="font-normal text-slate-500">· {aId} → {bId}</span>{runDiff && <span className="ml-2 font-normal text-amber-600" style={{ fontSize: 12 }}>· {runDiff} — 판정 차이를 제품 회귀로 단정할 수 없습니다</span>}<span className="ml-2 font-normal text-slate-500" style={{ fontSize: 11 }}>행을 클릭하면 {bId} 결과 상세로 이동합니다</span></div>
              <div className="flex shrink-0 gap-2"><Btn icon={Download} onClick={() => flash("Excel 내보내기 완료")}>Excel</Btn><Btn kind="primary" icon={Sparkles} onClick={() => setAiOpen(true)}>AI 분석</Btn></div></div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">ID</th><th className="font-medium">TC</th><th className="font-medium">A</th><th></th><th className="font-medium">B</th><th className="font-medium">변화</th></tr></thead>
              <tbody>
                {regRows.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">두 실행 모두 케이스 단위 결과가 없습니다.</td></tr>)}
                {regRows.map((r) => { const v = cls(r.a, r.b); const revd = r.ra != null && r.rb != null && r.ra !== r.rb; const rv = (n) => (n == null ? null : <span className="ml-1.5 font-mono text-slate-500" style={{ fontSize: 10 }}>rev {n}</span>); return (
                  <tr key={r.id} onClick={() => nav && nav("fqa-result-detail", bId)} title={bId + " 결과 상세로 이동"} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:brightness-125 " + (v.k === "퇴행" ? "bg-red-50" : "")}>
                    <td className="px-4 py-2.5 font-mono text-sky-600">{r.id}</td><td className="text-slate-700">{r.name}{r.bw && <span className="ml-1.5 text-xs text-slate-500">· {r.bw}</span>}</td><td className="whitespace-nowrap">{r.a ? <Badge kind={vK[r.a]}>{vLabel(r.a)}</Badge> : <span className="text-xs text-slate-500">없음</span>}{rv(r.ra)}</td><td className="text-slate-500">→</td><td className="whitespace-nowrap">{r.b ? <Badge kind={vK[r.b]}>{vLabel(r.b)}</Badge> : <span className="text-xs text-slate-500">없음</span>}{rv(r.rb)}</td>
                    {/* rev가 다르면 판정 변화의 원인을 제품으로 단정할 수 없다 — 그 사실만 덧붙이고 결론은 내리지 않는다 */}
                    <td className={"font-semibold whitespace-nowrap " + v.c}>{v.k}{revd && <span className="ml-1.5 font-normal text-amber-600" style={{ fontSize: 11 }}>· 케이스 변경</span>}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </Card>
          {aiOpen && runA && runB && <FqaRegAiPanel A={runA} B={runB} rows={regRows} summ={summ} cls={cls} rate={rate} runDiff={runDiff} cases={fqaCases} planName={(fqaPlans.find((p) => p.id === regPlan) || {}).name || runB.plan} flash={flash} onClose={() => setAiOpen(false)} onOpen={() => { setAiOpen(false); nav && nav("fqa-result-detail", bId); }} />}
          </>
          )}
        </>
      )}
      {mode === "불안정" && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">최근 실행 이력 기준(TC별 누적)</span>
            <span className="text-slate-500">·</span>
            <span className="text-amber-700">Flaky {flakyN}건</span>
            <span className="text-red-700">지속 실패 {persistN}건</span>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">TC</th><th className="font-medium">문제 빈도</th><th className="font-medium">유형</th><th className="font-medium">최근 추세</th><th></th></tr></thead>
              <tbody>
                {FLAKY.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">불안정·지속 실패로 분류된 TC가 없습니다.</td></tr>)}
                {FLAKY.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                    <td className="px-4 py-3"><div className="font-mono text-xs text-sky-600">{r.id}</div><div className="flex items-center gap-1.5 text-slate-800">{r.name}{r.quarantined && <Badge kind="draft">격리됨</Badge>}</div><div className="text-xs text-slate-500">{r.suite}</div></td>
                    <td className="pr-4" style={{ minWidth: 150 }}><div className="mb-0.5 text-xs text-slate-500">{r.unstable}/{r.runs}회 · {r.urate}%</div><div className="h-1.5 rounded bg-slate-100" style={{ width: 130 }}><div className="h-1.5 rounded" style={{ width: r.urate + "%", background: r.flaky ? C.warn : C.err }} /></div></td>
                    <td><div className="flex flex-wrap items-center gap-1">{r.flaky ? <Badge kind="warn">Flaky</Badge> : <Badge kind="fail">지속 실패</Badge>}{r.cause && <Badge kind={CAUSE_K[r.cause] || "draft"}>{r.cause}</Badge>}{r.heal && <Badge kind="active">보정</Badge>}</div></td>
                    <td className="text-xs text-slate-500">{r.streak}</td>
                    <td className="pr-4 text-right whitespace-nowrap">{/* 🔑 격리 여부를 먼저 본다. flaky 로만 분기하면 격리된 케이스가 지속 실패로
                        재분류되는 순간 해제 버튼이 사라져 되돌릴 방법이 없어진다(앱에 다른 해제 경로가 없다). */}
                    {r.quarantined
                      ? <button onClick={() => toggleQuar(r)} className="mr-3 text-xs text-sky-600 hover:text-sky-700">격리 해제</button>
                      : r.flaky
                        ? <button onClick={() => toggleQuar(r)} className="mr-3 text-xs text-amber-700 hover:text-amber-800">격리</button>
                        : (hasDefFQA(r.id) ? <span className="mr-3 text-xs text-slate-500">등록됨</span> : <button onClick={() => regFail(r)} className="mr-3 text-xs text-red-700 hover:text-red-800">결함 등록</button>)}<button onClick={() => (nav ? nav("fqa-cases", r.id) : flash(r.id + " 테스트케이스로 이동"))} className="text-xs text-slate-500 hover:text-sky-600">TC 보기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="text-xs text-slate-500">판정 기준: <span className="text-slate-500">최근 실행 4회</span>를 TC별 누적 · 결과 교차(PASS/FAIL 혼재)=<span className="text-amber-700">Flaky→격리</span>, 연속 실패=<span className="text-red-700">지속 실패→결함</span>. 격리된 TC는 <span className="text-slate-700">실행 대상에서 빠지며</span>, 그동안 이력이 쌓이지 않으므로 복귀는 사람이 판단해 해제해야 합니다. <span className="text-slate-500">※ 3회 이상 실행된 TC만 분류합니다.</span></div>
        </>
      )}
      <Toast msg={msg} />
    </div>
  );
}
/* AI 회귀 분석 — LQA · MQA 와 같은 구성: 계산(결정적) → AI 추정(원인 · 권고) → 리포트 공유
   원인 묶음은 러너가 붙인 실패 원인(로케이터 · 검증 · 타이밍 · 환경)을 그대로 쓴다 — AI 가 새로 분류하지 않는다 */
const CAUSE_WHO = { "로케이터": "테스트 보정 대상 (QA)", "타이밍": "테스트 보정 대상 (QA)", "검증": "제품 결함 의심 (개발)", "환경": "환경 문제 (인프라)", "기타": "원인 확인 필요", "미분류": "원인 확인 필요" };
function FqaRegAiPanel({ A, B, rows, summ, cls, rate, runDiff, cases, planName, flash, onClose, onOpen }) {
  const tcB = (id) => SL.mergedTc(B, id) || {};
  const reg = rows.filter((r) => cls(r.a, r.b).k === "퇴행").map((r) => { const t = tcB(r.id); return { ...r, cause: t.cause || "미분류", heal: healUsable(cases, t) }; });
  const groups = {}; reg.forEach((x) => { (groups[x.cause] = groups[x.cause] || { cause: x.cause, ids: [] }).ids.push(x.id); });
  const G = [...CAUSE_ORDER, "미분류"].filter((k) => groups[k]).map((k) => groups[k]);
  const revN = rows.filter((r) => r.ra != null && r.rb != null && r.ra !== r.rb).length;
  const healN = reg.filter((x) => x.heal).length;
  const snap = [["빌드", A.ver || "-", B.ver || "-"], ["브라우저", A.brow || "API", B.brow || "API"], ["러너 (Playwright)", A.pw || "-", B.pw || "-"]];
  const conclusion = !reg.length
    ? (summ["개선"] ? "퇴행 없음 — 개선 " + summ["개선"] + "건, " + B.id + "는 " + A.id + "보다 나아졌습니다" : "퇴행 없음 — 두 실행의 품질이 같습니다")
    : G.map((g) => "퇴행 " + g.ids.length + "건은 " + g.cause + " — " + CAUSE_WHO[g.cause]).join(" · ") + (runDiff ? " (" + runDiff + " — 실행 조건 영향 확인 필요)" : "");
  const recs = [];
  if (healN) recs.push("보정 제안 " + healN + "건 검토 · 승인 (결과 상세)");
  if (groups["로케이터"] && groups["로케이터"].ids.length > healN) recs.push("보정 제안이 없는 로케이터 실패는 에디터에서 직접 수정");
  if (groups["타이밍"]) recs.push("대기 조건 보정 후 다음 회차에서 재확인 (" + groups["타이밍"].ids.join(", ") + ")");
  if (groups["검증"]) recs.push("검증 실패 " + groups["검증"].ids.length + "건은 결과 상세에서 증적 확인 후 결함 등록");
  if (groups["환경"]) recs.push("대상 환경 · 서버 상태 확인 후 다시 실행");
  if (revN) recs.push("케이스가 바뀐 " + revN + "건은 케이스 변경분을 먼저 확인");
  if (runDiff) recs.push("같은 브라우저 · 러너 조건으로 다시 비교");
  if (!recs.length) recs.push(reg.length ? "실패 시점 증적으로 원인을 확인하세요" : "조치 필요 없음 — 다음 정기 실행에서 추이 확인");
  return (
    <Portal><div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><span className="flex items-center gap-2 font-semibold text-slate-900"><Sparkles size={16} className="text-sky-600" />AI 회귀 분석</span><button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={20} /></button></div>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2"><Badge kind="info">계산</Badge><span className="text-xs text-slate-500">결정적 분석 — 저장된 실행 결과 산술</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">변화 요약 · {A.id} → {B.id}</div>
            <div className="mt-1 text-slate-800">퇴행 <b className="text-red-700">{summ["퇴행"] || 0}</b> · 개선 <b className="text-emerald-700">{summ["개선"] || 0}</b> · 유지 {summ["유지"] || 0} · PASS {rate(A)}% → {rate(B)}%</div>
            {B.gate != null && <div className="mt-1 text-xs">품질 게이트 <span className={rate(B) >= B.gate ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{rate(B) >= B.gate ? "통과" : "미달"}</span> <span className="text-slate-500">· 기준 {B.gate}%</span></div>}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">무엇이 바뀌었나</div>
            <div className="space-y-1">{snap.map((r) => <div key={r[0]} className={"flex items-center justify-between rounded px-2 py-1 text-xs " + (r[1] !== r[2] ? "bg-slate-100" : "")}><span className="text-slate-500">{r[0]}</span><span className={r[1] !== r[2] ? "text-amber-700" : "text-slate-500"}>{r[1]} → {r[2]}</span></div>)}
              <div className="flex items-center justify-between px-2 py-1 text-xs"><span className="text-slate-500">케이스 변경</span><span className={revN ? "text-amber-700" : "text-slate-500"}>{revN ? revN + "건 (rev 다름)" : "없음"}</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-200 pt-3"><Badge kind="active">AI 추정</Badge><span className="text-xs text-slate-500">서버 경유 · 개인정보 가림 · 검증 필요</span></div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">한 줄 결론</div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-slate-800">{conclusion}</div>
          </div>
          {G.length > 0 && <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">원인별 묶음</div>
            <ul className="space-y-1.5">{G.map((g) => <li key={g.cause} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700"><Badge kind={CAUSE_K[g.cause] || "draft"}>{g.cause}</Badge><span className="font-medium">{g.ids.length}건</span><span className="text-slate-500">{CAUSE_WHO[g.cause]}</span><span className="font-mono text-slate-500">— {g.ids.join(", ")}</span></li>)}</ul>
          </div>}
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">권장 조치</div>
            <ul className="space-y-1.5">{recs.map((c, i) => <li key={i} className="flex gap-2 text-xs text-slate-700"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />{c}</li>)}</ul>
          </div>
          {reg.length > 0 && <Btn icon={FileText} onClick={onOpen}>{B.id} 결과 상세{healN ? " · 보정 제안 " + healN + "건" : ""}</Btn>}
          <ShareBox domain="FQA" subject={"회귀 리포트 " + A.id + " → " + B.id + " · 퇴행 " + (summ["퇴행"] || 0)}
            preview={planName + " " + A.id + " → " + B.id + " · 퇴행 " + (summ["퇴행"] || 0) + " · PASS " + rate(B) + "% — " + conclusion}
            onLeave={onClose} onDone={(chs) => flash("회귀 리포트 공유 — " + chs.join(" · ") + " (발송 이력에 기록)")} />
          <div className="text-xs text-slate-500">＊ 계산 항목은 저장된 결과의 산술이며, AI 추정 항목(결론 · 원인 · 권고)은 참고용입니다.</div>
        </div>
      </div>
    </div></Portal>
  );
}