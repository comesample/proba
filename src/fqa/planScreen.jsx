// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, RefreshCw, Server, X } from "lucide-react";
import { Badge, Btn, Card, Field, Input, PageToolbar, Portal, SEL_CARD, SEL_IDLE, Select, Toast, useToast } from "../common/ui.jsx";
import { ScheduleConfig } from "../common/ScheduleConfig.jsx";
import { useApp } from "../common/context.js";
import { DEFAULT_SCHED, effWorkers, envCovers, fqaEvents, outerChecks, schedKey, suiteNm, surfacesOf } from "./logic.js";
import { TG } from "./parts.jsx";
import * as SL from "./suiteLogic.js";
export function FqaPlanScreen() {
  const { fqaSuites, fqaSystems, fqaCases, fqaRuns, addFqaRun, updateFqaRun, fqaPlans, addFqaPlan, updateFqaPlan, removeFqaPlan, jiraConfig, datasets, setNavGuard, goTo } = useApp();
  const [msg, flash] = useToast();
  // 대상·환경은 ID 참조 { systemId, env } — 이름 변경에도 참조가 깨지지 않는다
  const targetOpts = (fqaSystems || []).flatMap((sy) => (sy.envs || []).map((e) => ({ systemId: sy.id, env: e.env, label: sy.name + " · " + e.env })));
  const keyOf = (ref) => (ref ? ref.systemId + "|" + ref.env : "");
  const envOf = (ref) => { const sy = (fqaSystems || []).find((s) => s.id === (ref || {}).systemId); return sy ? (sy.envs || []).find((e) => e.env === (ref || {}).env) : null; };
  const labelOf = (ref) => { const o = targetOpts.find((t) => keyOf(t) === keyOf(ref)); return o ? o.label : "미지정"; };
  const defRef = targetOpts[0] ? { systemId: targetOpts[0].systemId, env: targetOpts[0].env } : { systemId: 0, env: "" };
  const [addOpen, setAddOpen] = useState(false);
  const [nf, setNf] = useState({ name: "", targetRef: defRef, suites: [] });
  const [selId, setSelId] = useState(fqaPlans[0] ? fqaPlans[0].id : null);
  /* 🔴 계획이 0건일 때 가짜 계획(id:0)으로 폼을 렌더하면 안 된다 —
     저장을 눌러도 updateFqaPlan(0, …)이 매칭되지 않아 조용히 무동작이고, 화면은 "저장됨"이라고 말한다.
     화면이 거짓말하느니 빈 상태를 보여주는 편이 낫다. */
  const sel = fqaPlans.find((p) => p.id === selId) || fqaPlans[0] || null;
  const [name, setName] = useState((sel || {}).name || "");
  const [targetRef, setTargetRef] = useState((sel || {}).targetRef || defRef);
  const [suites, setSuites] = useState((sel || {}).suiteIds || []);
  const toggleSuite = (n) => setSuites((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const [brow, setBrow] = useState((sel || {}).brow || ["Chromium"]);
  const [res, setRes] = useState((sel || {}).res || "1920×1080");
  const [workers, setWorkers] = useState((sel || {}).workers || "4");
  const [retry, setRetry] = useState((sel || {}).retry != null ? sel.retry : 1);
  const [onfail, setOnfail] = useState((sel || {}).onfail || "계속 진행");
  const [video, setVideo] = useState((sel || {}).video || "녹화 안 함");
  const [apiTimeout, setApiTimeout] = useState((sel || {}).timeout || 30);
  const [gate, setGate] = useState((sel || {}).gate != null ? sel.gate : 95);
  const [planStatus, setPlanStatus] = useState((sel || {}).status || "초안");
  const [sched, setSched] = useState((sel || {}).schedule || DEFAULT_SCHED);
  const [jira, setJira] = useState((sel || {}).jira || { override: false });
  const jgc = jiraConfig || {};
  const enableJira = (on) => setJira(on ? { override: true, project: jira.project || jgc.project || "", issueType: jira.issueType || jgc.issueType || "Bug", assignee: jira.assignee != null ? jira.assignee : (jgc.assignee || ""), labels: jira.labels != null ? jira.labels : (jgc.labels || ""), titleTpl: jira.titleTpl || jgc.titleTpl || "" } : { override: false });
  const setJf = (patch) => setJira((j) => ({ ...j, ...patch }));
  const toggleB = (b) => setBrow(brow.includes(b) ? brow.filter((x) => x !== b) : [...brow, b]);
  /* 실행 대상 = 고른 스위트를 통째로 (태그 필터 없음 — 중간 케이스가 빠지면 흐름이 끊긴다)
     승인 전 · 삭제된 케이스가 든 스위트는 실행 불가 — 아래에 이유를 보여준다 (suiteLogic) */
  const draftPlan = { suiteIds: suites };
  const planCases = SL.casesOfPlanSuites(draftPlan, fqaCases, fqaSuites).filter((c) => !c.quarantined);
  const blockedNotes = SL.planSuiteNotes(draftPlan, fqaSuites, fqaCases).filter((n) => n.block);
  const planTargets = planCases.length;
  // 실행 옵션·접점은 이 계획이 실제로 테스트하는 케이스에서 파생 — 환경이 제공하는 접점이 아니라
  const planSurf = planCases.map((c) => surfacesOf(c));
  const surf = { web: planSurf.some((s) => s === "웹" || s === "웹+API"), api: planSurf.some((s) => s === "API" || s === "웹+API") };
  /* 대상 케이스가 이 환경에서 실제로 돌 수 있는가 —
     API 케이스인데 환경에 apiUrl이 없으면 전 건 실패한다. 조용히 빼지 않고 경고한다. */
  const uncovered = planCases.filter((c) => !envCovers(envOf(targetRef), surfacesOf(c)));
  /* 실행 요청 시점과 같은 검사를 여기서도 돌린다 — 다만 여기서는 경고일 뿐 막지 않는다.
     목적이 다르다. 여기는 피드백 속도, 실행 요청은 차단. 계획을 다 짜고 나서야 틀린 걸 알면 늦다.
     접점(planLevel)은 아래에 전용 카드가 있으므로 제외한다. */
  const planWarn = outerChecks(planCases, envOf(targetRef), datasets, SL.planSuites(draftPlan, fqaSuites)).filter((g) => !g.planLevel);
  /* 워커 슬롯이 곧 계정이다(F4) — 계정보다 워커가 많으면 같은 계정으로 동시 로그인해 세션이 밀린다.
     🔴 실행 '간' 충돌은 여기서 표현하지 못한다 — parallelIndex는 실행 내부 슬롯이라 실행 두 개가
     동시에 돌면 둘 다 슬롯 0을 집는다. 목업은 단일 러너 FIFO라 실행이 하나씩이므로 재현되지 않는다.
     실 구현에서는 '실행 중인 회차 중 같은 대상·환경 + 역할 겹침'을 경고해야 한다(차단 아님). */
  const runnableSuites = SL.planSuites(draftPlan, fqaSuites).filter((x) => !SL.suiteBlock(x, fqaCases));
  const wLimit = effWorkers(runnableSuites, envOf(targetRef), workers);
  // 운영주의 — 대상이 운영(prod) 환경인데 실데이터를 건드리는 케이스가 섞였을 때 경고(막지 않음)
  const isProdTarget = !!(envOf(targetRef) || {}).prod;
  const cautionCases = isProdTarget ? planCases.filter((c) => c.prodCaution) : [];
  const pick = (p) => { setSelId(p.id); setName(p.name); setTargetRef(p.targetRef || defRef); setSuites(p.suiteIds || []); setBrow(p.brow || ["Chromium"]); setRes(p.res || "1920×1080"); setWorkers(p.workers || "4"); setRetry(p.retry != null ? p.retry : 1); setOnfail(p.onfail || "계속 진행"); setVideo(p.video || "녹화 안 함"); setApiTimeout(p.timeout != null ? p.timeout : 30); setGate(p.gate != null ? p.gate : 95); setPlanStatus(p.status || "초안"); setSched(p.schedule || DEFAULT_SCHED); setJira(p.jira || { override: false }); };
  const saveCfg = () => { const nm = name.trim() || sel.name; updateFqaPlan(sel.id, { name: nm, targetRef, suiteIds: suites, brow, res, workers, retry, onfail, video, timeout: apiTimeout, gate, status: planStatus, jira, schedule: sched, sched: (sched && sched.summary) || "예약 없음" }); flash(nm + " 설정 저장됨"); };
  const dirty = !sel ? false : JSON.stringify({ name, targetRef, suites, brow, res, workers, retry, onfail, video, timeout: apiTimeout, gate, status: planStatus, jira }) !== JSON.stringify({ name: sel.name, targetRef: sel.targetRef || defRef, suites: sel.suiteIds || [], brow: sel.brow || ["Chromium"], res: sel.res || "1920×1080", workers: sel.workers || "4", retry: sel.retry != null ? sel.retry : 1, onfail: sel.onfail || "계속 진행", video: sel.video || "녹화 안 함", timeout: sel.timeout != null ? sel.timeout : 30, gate: sel.gate != null ? sel.gate : 95, status: sel.status || "초안", jira: sel.jira || { override: false } }) || schedKey(sched) !== schedKey((sel || {}).schedule || DEFAULT_SCHED);
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const choosePlan = (p) => { if (p.id === sel.id) return; if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; pick(p); };
  const createPlan = () => { const nm = nf.name.trim(); if (!nm) { flash("계획 이름을 입력하세요"); return; } if (!nf.suites.length) { flash("스위트를 1개 이상 선택하세요"); return; } const id = Math.max(0, ...fqaPlans.map((x) => x.id)) + 1; const np = { id, name: nm, targetRef: nf.targetRef, suiteIds: nf.suites, sched: "예약 없음", status: "초안", brow: ["Chromium"], res: "1920×1080", workers: "4", retry: 1, onfail: "계속 진행", video: "녹화 안 함", timeout: 30, gate: 95 }; addFqaPlan(np); pick(np); setAddOpen(false); setNf({ name: "", targetRef: defRef, suites: [] }); flash(nm + " 계획 생성 (초안)"); };
  const delPlan = (pl) => { if (!window.confirm(pl.name + " 계획을 삭제할까요?")) return; removeFqaPlan(pl.id); if (selId === pl.id) { const rest = fqaPlans.filter((x) => x.id !== pl.id); setSelId(rest[0] ? rest[0].id : null); } flash(pl.name + " 삭제됨"); };
  /* 빈 상태 — 계획은 대상·승인 케이스가 있어야 의미가 있다. 선행 조건까지 확인해 어디부터 해야 하는지 알린다. */
  if (!sel) {
    const okTarget = targetOpts.length > 0;
    const okCase = fqaCases.some((c) => c.status === "승인");
    return (
      <div className="space-y-4">
        <PageToolbar desc="대상·스위트·실행옵션·스케줄 정의" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-3">
            <Btn kind="primary" icon={Plus} className="w-full" onClick={() => setAddOpen(true)} disabled={!okTarget}>새 실행 계획</Btn>
            <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 계획이 없습니다.</div>
          </div>
          <div className="col-span-9">
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">실행 계획을 만드세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">계획은 <span className="text-slate-500">대상·환경</span>과 <span className="text-slate-500">스위트</span>를 묶어 무엇을 어디에 돌릴지 정합니다.</div>
              <div className="mt-4 w-64 space-y-1.5 text-left">
                {[["대상·환경 등록", okTarget], ["승인된 테스트케이스", okCase]].map(([label, ok]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    {ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-amber-600" />}
                    <span className={ok ? "text-slate-500" : "text-amber-700"}>{label}</span>
                    <span className="ml-auto text-slate-500">{ok ? "완료" : "필요"}</span>
                  </div>
                ))}
              </div>
              {!okTarget && <Btn className="mt-3" icon={Server} onClick={() => goTo("fqa-targets")}>대상·환경 등록하러 가기</Btn>}
              {okTarget && !okCase && <div className="mt-3 text-xs text-amber-600">계획은 만들 수 있지만 승인된 케이스가 없으면 실행해도 0건입니다.</div>}
            </Card>
          </div>
        </div>
        <Toast msg={msg} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageToolbar desc="대상·스위트·실행옵션·스케줄 정의" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => setAddOpen(true)}>새 실행 계획</Btn>
          {fqaPlans.map((p) => (
            <Card key={p.id} className={"cursor-pointer p-3 " + (sel.id === p.id ? SEL_CARD : SEL_IDLE)} >
              <div onClick={() => choosePlan(p)}>
                <div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-900">{p.name}</div><div className="flex items-center gap-1.5"><Badge kind={p.status === "활성" ? "pass" : "draft"}>{p.status}</Badge><button onClick={(e) => { e.stopPropagation(); delPlan(p); }} className="text-slate-500 hover:text-red-600" title="계획 삭제"><X size={13} /></button></div></div>
                <div className="mt-1 text-xs text-slate-500">{labelOf(p.targetRef)}</div>
                <div className="mt-1 text-xs text-slate-500">{(p.suiteIds || []).map((x) => suiteNm(fqaSuites, x)).join(" · ") || "스위트 없음"} · {p.sched}</div>
                <div className="mt-0.5 text-xs text-slate-500">수정 {p.updatedBy || "—"} · {p.updatedAt || "—"}</div>
              </div>
            </Card>
          ))}
        </div>
        <Card className="col-span-9 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0 max-w-sm flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="계획 이름" /></div>
            <div className="flex shrink-0 items-center gap-3"><div className="flex items-center gap-2 text-sm text-slate-700"><span>{planStatus === "활성" ? "활성" : "초안"}</span><TG on={planStatus === "활성"} onClick={() => setPlanStatus(planStatus === "활성" ? "초안" : "활성")} /></div>{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn kind="primary" icon={RefreshCw} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
          </div>
          <div className="mb-4 flex items-center gap-3 text-xs text-slate-500"><span>생성 <span className="text-slate-500">{sel.createdBy || "—"}</span> · {sel.createdAt || "—"}</span><span className="text-slate-500">·</span><span>수정 <span className="text-slate-500">{sel.updatedBy || "—"}</span> · {sel.updatedAt || "—"}</span></div>
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-3.5">
              <Field label="대상·환경" hint={"접점: " + ([surf.web ? "웹" : null, surf.api ? "API" : null].filter(Boolean).join("+") || "없음")}>
                <Select value={keyOf(targetRef)} onChange={(e) => { const o = targetOpts.find((t) => keyOf(t) === e.target.value); if (o) setTargetRef({ systemId: o.systemId, env: o.env }); }}>
                  {targetOpts.map((t) => <option key={keyOf(t)} value={keyOf(t)}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="대상 스위트 (다중 선택)" hint="스위트마다 위에서부터 순서대로 실행합니다">
                <div className="grid grid-cols-2 gap-2">
                  {fqaSuites.map((x) => (
                    <button key={x.id} onClick={() => toggleSuite(x.id)} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (suites.includes(x.id) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name} <span className="text-slate-500">· {(x.items || []).length}건</span></button>
                  ))}
                </div>
              </Field>
              {suites.length === 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">⚠ 스위트를 1개 이상 선택하세요.</div>}
              {blockedNotes.map((n) => <div key={n.s.id} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">{n.s.name} 실행 불가 — {n.block}</div>)}
              {/* 실제로 몇 건이 돌지 여기서 확인된다 */}
              <div className={"rounded-lg border px-2.5 py-1.5 text-xs " + (planTargets === 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-500")}>
                {planTargets === 0 ? "⚠ 실행할 수 있는 케이스가 없습니다 — 실행해도 0건입니다." : <>대상 케이스 <span className="font-semibold text-sky-600">{planTargets}건</span> <span className="text-slate-500">(승인 · 격리 제외)</span></>}
              </div>
              {/* 케이스의 접점 ↔ 환경의 접점 — 여기가 어긋나면 실행은 반드시 실패한다 */}
              {uncovered.length > 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                  ⚠ <span className="font-semibold">{uncovered.length}건</span>은 이 환경에서 돌 수 없습니다 — {[...new Set(uncovered.map((c) => surfacesOf(c)))].join(" · ")} 접점이 필요한데 <span className="font-semibold">{labelOf(targetRef)}</span>에 해당 URL이 없습니다.
                  <div className="mt-0.5 font-mono text-red-600">{uncovered.slice(0, 4).map((c) => c.id).join(", ")}{uncovered.length > 4 ? " 외 " + (uncovered.length - 4) + "건" : ""}</div>
                </div>
              )}
              {/* 운영주의 — 막지 않고 알린다. 운영에 실데이터 테스트를 정당하게 하는 경우도 있으므로. */}
              {/* 실행 요청 시점에 차단될 것들을 여기서 미리 알린다 — 막지는 않는다 */}
              {planWarn.map((g, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                  ⚠ <span className="font-semibold">{g.cases.length}건</span> — {g.why}
                  <div className="mt-0.5 font-mono text-amber-600">{g.cases.slice(0, 4).map((c) => c.id).join(", ")}{g.cases.length > 4 ? " 외 " + (g.cases.length - 4) + "건" : ""}</div>
                  <div className="mt-0.5 text-amber-600/80">실행 요청 시 차단됩니다 — {g.fixLabel}에서 해결하세요.</div>
                </div>
              ))}
              {cautionCases.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                  ⚠ <span className="font-semibold">운영 환경</span>에 <span className="font-semibold">운영주의 {cautionCases.length}건</span>이 포함됩니다 — 실데이터를 변경·삭제할 수 있습니다.
                  <div className="mt-0.5 font-mono text-amber-600">{cautionCases.slice(0, 4).map((c) => c.id).join(", ")}{cautionCases.length > 4 ? " 외 " + (cautionCases.length - 4) + "건" : ""}</div>
                </div>
              )}
              <Field label="품질 게이트 (PASS 기준 %)"><Input type="number" value={gate} onChange={(e) => setGate(+e.target.value || 0)} className="w-28" /></Field>
            </div>
            <div className="space-y-3.5">
              {surf.web && (
                <>
                  <Field label="브라우저 (다중) · 화면 스텝">
                    <div className="grid grid-cols-2 gap-2">
                      {["Chromium", "Firefox", "WebKit", "Mobile Chromium"].map((b) => (
                        <button key={b} onClick={() => toggleB(b)} className={"rounded-lg border px-2 py-1.5 text-xs " + (brow.includes(b) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{b}</button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="해상도"><Select value={res} onChange={(e) => setRes(e.target.value)}><option>1920×1080</option><option>1440×900</option><option>1280×720</option><option>375×812 (모바일)</option></Select></Field>
                    <Field label="영상 녹화"><Select value={video} onChange={(e) => setVideo(e.target.value)}><option>녹화 안 함</option><option>실패 시만</option><option>전체 녹화</option></Select><div className="mt-1 text-slate-500" style={{ fontSize: 11 }}>trace는 항상 기록되어 실패 시 보관됩니다 — 영상은 trace와 겹치므로 필요할 때만 켜세요.</div></Field>
                  </div>
                </>
              )}
              {surf.api && <Field label="요청 타임아웃(초) · 요청 스텝"><Input type="number" value={apiTimeout} onChange={(e) => setApiTimeout(+e.target.value || 0)} className="w-32" /></Field>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="병렬 workers" hint="스위트 단위로 동시에 돕니다 — 스위트 안은 항상 순서대로"><Select value={workers} onChange={(e) => setWorkers(e.target.value)}><option>1 (순차)</option><option>2</option><option>4</option><option>auto</option></Select>{wLimit && <div className="mt-1 text-amber-600" style={{ fontSize: 11 }}>실효 {wLimit.eff} — <span className="font-mono">{wLimit.role}</span> 역할 계정이 {wLimit.n}개라 이 역할의 스위트는 동시에 {wLimit.n}개까지만 돕니다. <span className="text-amber-600/80">대상·환경의 계정 풀에서 계정을 추가하면</span> 병렬도가 올라갑니다.</div>}</Field>
                <Field label="재시도"><Input type="number" value={retry} onChange={(e) => setRetry(+e.target.value || 0)} /></Field>
              </div>
              <div className="flex items-center gap-4">
                <Field label="종료 조건"><Select value={onfail} onChange={(e) => setOnfail(e.target.value)}><option>계속 진행</option><option>첫 에러 시 중단</option></Select></Field>
              </div>
              {surf.web && surf.api && <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">이 계획은 <span className="text-slate-700">웹·API 케이스를 모두</span> 포함합니다 — 브라우저 옵션은 화면 스텝에, 타임아웃은 요청 스텝에 적용됩니다.</div>}
            </div>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            {planStatus === "활성" ? (
              <>
                <ScheduleConfig key={sel.id} value={sched} onChange={setSched} events={fqaEvents(envOf(targetRef), labelOf(targetRef))} singleSelect manualHint="자동 실행 없음 — 수동 실행으로만 수행합니다." toast={flash} />
                <div className="mt-3 text-xs text-slate-500">스케줄·이벤트 트리거 실행은 항상 켜진 <span className="text-slate-700">공유/CI 러너</span>에서 무인 수행됩니다 — 저작용 개인 로컬 러너와 분리.</div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">이 계획은 <span className="font-semibold">초안</span>입니다 — 스케줄과 실행 모두 <span className="font-semibold">활성화</span> 후 가능합니다.</div>
            )}
          </div>
          {(jgc.connected !== false) && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">결함 트래커 (Jira)</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">이 계획 재정의 <TG on={!!jira.override} onClick={() => enableJira(!jira.override)} /></div>
            </div>
            {!jira.override ? (
              <div className="mt-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">전역 Jira 설정 사용 · 프로젝트 <span className="text-slate-700">{jgc.project || "—"}</span> · 이슈유형 {jgc.issueType || "—"} <span className="text-slate-500">(결함 화면의 Jira 연동에서 관리)</span></div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="text-xs text-slate-500">연결(URL·인증)은 전역, 이 계획의 결함 라우팅만 재정의합니다.</div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="프로젝트 키"><Input value={jira.project || ""} onChange={(e) => setJf({ project: e.target.value })} placeholder="WEBQA" /></Field>
                  <Field label="이슈 유형"><Select value={jira.issueType || "Bug"} onChange={(e) => setJf({ issueType: e.target.value })}><option>Bug</option><option>Task</option><option>Story</option></Select></Field>
                  <Field label="기본 담당자"><Input value={jira.assignee || ""} onChange={(e) => setJf({ assignee: e.target.value })} placeholder="assignee" /></Field>
                </div>
                <Field label="라벨 (쉼표 구분)"><Input value={jira.labels || ""} onChange={(e) => setJf({ labels: e.target.value })} placeholder="fqa, web" /></Field>
              </div>
            )}
          </div>
          )}
        </Card>
      </div>
      {addOpen && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">새 실행 계획</h3><button onClick={() => setAddOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              <Field label="계획 이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 로그인 회귀 (스테이징)" /></Field>
              <Field label="대상·환경">
                <Select value={keyOf(nf.targetRef)} onChange={(e) => { const o = targetOpts.find((t) => keyOf(t) === e.target.value); if (o) setNf({ ...nf, targetRef: { systemId: o.systemId, env: o.env } }); }}>
                  {targetOpts.map((t) => <option key={keyOf(t)} value={keyOf(t)}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="대상 스위트 (다중 선택)">
                <div className="grid grid-cols-2 gap-2">
                  {fqaSuites.map((x) => (
                    <button key={x.id} onClick={() => setNf({ ...nf, suites: nf.suites.includes(x.id) ? nf.suites.filter((s) => s !== x.id) : [...nf.suites, x.id] })} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (nf.suites.includes(x.id) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name}</button>
                  ))}
                </div>
              </Field>
              <div className="text-xs text-slate-500">생성 시 <span className="text-slate-700">초안</span> 상태로 추가됩니다 — 실행 옵션·스케줄은 상세 설정에서 이어서 정의합니다.</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5"><Btn onClick={() => setAddOpen(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={createPlan}>계획 생성</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
