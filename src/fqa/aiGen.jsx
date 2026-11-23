// ============================================================
// FQA AI로 스텝 만들기 — 진행 창 · 화면에서 고르기 (MQA GenModal · PickModal 과 같은 흐름)
//   · 러너(서버 worker)가 브라우저를 띄워 절차 한 줄씩 스텝을 만든다 — 사용자 PC 에 설치할 것이 없다
//   · 시작 상태: 이 케이스가 든 스위트의 앞 케이스를 먼저 실행한 화면 (디버그 실행과 같은 규칙). 스위트에 없으면 빈 브라우저
//   · 운영 환경: 디버그 실행과 같은 규칙 — 막지 않고, 운영주의 케이스면 경고
//   · AI가 요소를 특정하지 못하면 '확인 필요' — 후보 중에서 고르거나 그 시점 스크린샷에서 직접 고른다
//   · API 줄은 화면에서 고를 것이 없다 — 문장에 없는 값은 바로 미확정으로 남긴다
//   · 결과는 스텝 표에 '반영' 할 뿐 저장하지 않는다 — 저장 · 검토 · 승인은 에디터의 원래 흐름
//   목업: 판단은 aiLogic.draftWebSteps 규칙으로 흉내 낸다
// ============================================================
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Globe, MousePointerClick, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Btn, Modal } from "../common/ui.jsx";
import * as AI from "./aiLogic.js";

const GEN_ICON = { "대기": "text-slate-300", "진행": "text-sky-600", "완료": "text-emerald-600", "확인 필요": "text-amber-600", "건너뜀": "text-slate-400", "미확정": "text-amber-700" };
const GEN_K = { "대기": "draft", "진행 중": "active", "완료": "pass", "확인 필요": "warn", "미확정": "warn", "건너뜀": "info" };
const isApi = (u) => u.act === "요청" || u.act === "응답 검증";
const unitText = (u) => u.act + (u.loc ? " · " + u.loc : "") + (u.val && u.val !== "-" ? " · " + u.val : "");

/* props: tc · proc(빈 행 제외) · steps(지금 스텝 — 있으면 바꿀지 묻는다) · env { label, prod } · pre { suite, cases } · prodCaution */
export function FqaGenModal({ tc, proc, steps, env, pre, prodCaution, onApply, onClose }) {
  const [phase, setPhase] = useState("setup");   // setup | run | done | stopped
  const [units, setUnits] = useState([]);
  const [prep, setPrep] = useState([]);
  const [cur, setCur] = useState(-1);
  const [ask, setAsk] = useState(null);
  const [pick, setPick] = useState(false);
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const checks = [
    { label: "자연어 절차 " + proc.length + "줄", ok: proc.length > 0, fix: "절차를 먼저 쓰세요" },
    { label: "작업 환경 " + (env ? env.label : "없음"), ok: !!env, fix: "대상·환경에 웹 주소가 있는 환경을 등록하세요" },
  ];
  const blocked = checks.find((c) => !c.ok);
  const start = () => {
    if (blocked) return;
    if (steps.length && !window.confirm("지금 스텝을 새로 만든 스텝으로 바꿉니다. 계속할까요?")) return;
    setUnits(AI.draftWebSteps(proc).map((s, i) => ({ ...s, id: i, gs: "대기" })));
    /* 시작 상태 — 브라우저를 열고, 스위트의 앞 케이스를 저장된 내용으로 먼저 실행한다 */
    const pr = [{ label: "러너에서 브라우저 열기 · " + env.label, gs: "진행" },
      ...(pre ? pre.cases.map((c) => ({ label: c.id + " " + c.name + " 실행 (앞 단계 · " + pre.suite.name + ")", gs: "대기" })) : [])];
    setPrep(pr); setPhase("run");
    let t = 600;
    pr.forEach((_, i) => { later(() => setPrep((x) => x.map((p, j) => (j === i ? { ...p, gs: "완료" } : j === i + 1 ? { ...p, gs: "진행" } : p))), t); t += 600; });
    later(() => setCur(0), t);
  };
  /* 한 스텝씩 — 화면 구조 → 판단 → 실행 (목업: 규칙으로 판단) */
  useEffect(() => {
    if (phase !== "run" || cur < 0) return;
    if (cur >= units.length) { setPhase("done"); return; }
    setUnits((x) => x.map((u, i) => (i === cur ? { ...u, gs: "진행" } : u)));
    const u = units[cur];
    later(() => {
      const set = (patch) => setUnits((x) => x.map((v, i) => (i === cur ? { ...v, ...patch } : v)));
      if (!u.why || u.soft) { set({ gs: "완료" }); setCur(cur + 1); return; }
      if (/^로그인 절차/.test(u.why)) { set({ gs: "건너뜀" }); setCur(cur + 1); return; }          // 스위트 앞 순서 케이스가 맡는다
      if (isApi(u)) { set({ gs: "미확정" }); setCur(cur + 1); return; }                            // 화면에서 고를 것이 없다
      set({ gs: "확인 필요" }); setAsk(cur);
    }, 600);
  }, [cur, phase]);
  const answer = (el) => {
    const u = units[ask];
    const r = AI.recommendWebLoc(el);
    const patch = { loc: r.loc, frag: !r.stable, ...(u.act === "화면 검증" && /^visible/.test(u.val) && el.text ? { val: 'text = "' + el.text + '"' } : {}) };
    setUnits((x) => x.map((v, i) => (i === ask ? { ...v, ...patch, gs: "완료", why: "", by: "사용자 선택" } : v)));
    const next = ask + 1; setAsk(null); setPick(false); setCur(next);
  };
  const skip = () => { const next = ask + 1; setUnits((x) => x.map((v, i) => (i === ask ? { ...v, gs: "미확정" } : v))); setAsk(null); setCur(next); };
  const halt = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setUnits((x) => x.map((v) => (["대기", "진행", "확인 필요"].includes(v.gs) ? { ...v, gs: "미확정", loc: isApi(v) || v.act === "이동" ? v.loc : "", why: "생성을 멈춰 실행으로 확인되지 않음" } : v)));
    setAsk(null); setPhase("stopped");
  };
  const stop = () => { if (window.confirm("생성을 멈출까요? 지금까지 만든 스텝은 반영할 수 있고, 나머지는 미확정으로 남습니다.")) halt(); };
  const close = () => { if (phase === "run") { if (!window.confirm("진행 중인 생성을 멈추고 닫을까요?")) return; halt(); } onClose(); };
  const kept = units.filter((u) => u.gs !== "건너뜀");
  const apply = () => onApply(kept.map(({ n, act, loc, val, body }) => ({ n, act, loc: loc || "", val: val == null ? "-" : val, ...(body ? { body } : {}) })));

  const lineState = (n) => {
    const gs = units.filter((u) => u.n === n).map((u) => u.gs);
    if (gs.includes("확인 필요")) return "확인 필요";
    if (gs.includes("진행")) return "진행 중";
    if (gs.length && gs.every((g) => g === "건너뜀")) return "건너뜀";
    if (gs.length && gs.every((g) => g === "완료" || g === "건너뜀")) return "완료";
    if (gs.includes("미확정")) return "미확정";
    return "대기";
  };
  const done = units.filter((u) => u.gs === "완료").length;
  const left = units.filter((u) => u.gs === "미확정").length;
  const askU = ask !== null ? units[ask] : null;
  const cands = askU ? AI.webCandidates(askU.src, askU.act === "화면 검증") : [];

  return (
    <Modal title={"AI로 스텝 만들기 · " + tc.id} onClose={close} wide>
      {phase === "setup" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-500">작업 환경</span><span className="text-slate-800">{env ? env.label : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">시작 상태</span><span className="text-right text-slate-800">{pre ? pre.suite.name + " 앞 " + pre.cases.length + "건 먼저" : "빈 브라우저"}</span></div>
                <div className="pt-1 text-xs text-slate-500">디버그 실행과 같은 환경 · 시작 상태를 씁니다.</div>
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">러너의 브라우저에서 화면을 <b className="font-medium">실제로 조작</b>하며 절차 한 줄씩 스텝을 만듭니다.</div>
              {env && env.prod && <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />운영 환경입니다{prodCaution ? " — 운영주의 케이스라 실제 데이터가 바뀔 수 있습니다" : ""}.</div>}
              <div className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-600"><ShieldCheck size={13} />AI에 보내는 정보</div>
                <div className="space-y-1.5">{AI.AI_SEND_WEB.map((r) => <div key={r.k} className="flex gap-2"><span className={"w-20 shrink-0 " + r.c}>{r.k}</span><span className="text-slate-700">{r.v}</span></div>)}</div>
                <div className="mt-2 border-t border-slate-100 pt-2 text-slate-500">러너 → PROBA 서버에서 가린 뒤 AI를 호출합니다. AI 키는 서버에만 있습니다.</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">사전 조건</div>
                <div className="space-y-1.5">{checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2 text-xs">{c.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />}<span><span className="text-slate-700">{c.label}</span>{!c.ok && <span className="block text-amber-700">{c.fix}</span>}</span></div>
                ))}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
                <div className="mb-1.5 font-semibold text-slate-600">로케이터는 잘 변하지 않는 값부터 고릅니다</div>
                <div>테스트 ID(data-testid) › 고유 ID › 역할 + 이름 › 글자 · CSS</div>
                <div className="mt-1 text-slate-500">역할 + 이름부터는 <span className="text-amber-700">깨지기 쉬움</span>으로 표시합니다.</div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">결과는 스텝 표에 반영만 하고 저장하지 않습니다.</span><div className="flex gap-2"><Btn onClick={onClose}>취소</Btn><Btn kind="primary" icon={Sparkles} disabled={!!blocked} title={blocked ? blocked.fix : ""} onClick={start}>시작</Btn></div></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge kind={phase === "run" ? "active" : phase === "done" ? "pass" : "warn"}>{phase === "run" ? (ask !== null ? "확인 대기" : "진행 중") : phase === "done" ? "완료" : "멈춤"}</Badge>
            <span>{env ? env.label : ""}</span>
            <span className="ml-auto flex items-center gap-1"><ShieldCheck size={12} className="text-slate-400" />화면 구조만 전송 <span className="mx-1 text-slate-300">|</span> 스텝 {done}/{units.length}{left ? " · 미확정 " + left : ""}</span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            {prep.map((p, i) => <div key={"p" + i} className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500">{p.gs === "완료" ? <CheckCircle2 size={13} className="text-emerald-600" /> : p.gs === "진행" ? <RefreshCw size={13} className="animate-spin text-sky-600" /> : <span className="w-[13px]" />}{p.label}</div>)}
            {proc.map((p, i) => { const ls = lineState(i + 1); return (
              <div key={i} className={"border-b border-slate-200 px-3 py-2 last:border-0 " + (ls === "확인 필요" ? "bg-amber-50" : "")}>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">{i + 1}</span>
                  <span className="flex-1 text-sm text-slate-800">{p.t}{p.e && <span className="text-xs text-slate-500"> → {p.e}</span>}</span>
                  <Badge kind={GEN_K[ls]}>{ls}</Badge>
                </div>
                {units.filter((u) => u.n === i + 1 && u.gs !== "대기").map((u) => (
                  <div key={u.id} className="mt-1 flex items-center gap-1.5 pl-7 text-xs">
                    {u.gs === "진행" ? <RefreshCw size={12} className="animate-spin text-sky-600" /> : <span className={GEN_ICON[u.gs]}>●</span>}
                    <span className={"truncate font-mono " + (u.gs === "건너뜀" ? "text-slate-400 line-through" : "text-slate-600")}>{unitText(u)}</span>
                    {u.by && <span className="shrink-0 rounded bg-sky-50 px-1.5 text-sky-700">사용자 선택</span>}
                    {u.frag && u.gs === "완료" && <span className="shrink-0 text-amber-700">깨지기 쉬움</span>}
                    {u.why && u.gs !== "진행" && u.gs !== "확인 필요" && <span className="shrink-0 text-slate-500">— {u.why}</span>}
                  </div>
                ))}
              </div>
            ); })}
          </div>

          {askU && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="text-sm text-amber-900"><b className="font-medium">절차 {askU.n}</b> · {askU.src} — 이 화면에서 어느 요소인지 확인해 주세요</div>
              {askU.why && <div className="text-xs text-amber-800">{askU.why}</div>}
              <div className="flex flex-wrap gap-2">
                {cands.map((el) => { const r = AI.recommendWebLoc(el); return (
                  <button key={el.key} onClick={() => answer(el)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-left text-xs hover:border-sky-500">
                    <span className="block text-slate-800">{el.text || el.label}</span>
                    <span className="block text-slate-500">{r.kind + (r.stable ? "" : " · 깨지기 쉬움")}</span>
                  </button>
                ); })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-800">응답이 없으면 10분 뒤 여기까지 반영할 수 있게 멈춥니다.</span>
                <div className="flex gap-2"><Btn icon={MousePointerClick} onClick={() => setPick(true)}>화면에서 직접 고르기</Btn><Btn onClick={skip}>건너뛰기 (미확정으로 남김)</Btn></div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-xs text-slate-500">{phase === "run" ? "러너 브라우저 사용 중" : "반영하면 스텝 표가 바뀝니다. 저장은 에디터에서 합니다."}</span>
            <div className="flex gap-2">
              {phase === "run" ? <Btn onClick={stop}>멈추기</Btn> : <><Btn onClick={onClose}>닫기</Btn><Btn kind="primary" icon={CheckCircle2} disabled={!kept.length} onClick={apply}>스텝 표에 반영 ({kept.length}개)</Btn></>}
            </div>
          </div>
        </div>
      )}
      {pick && askU && <WebPickModal title="화면에서 직접 고르기" hint={askU.src} where={"절차 " + askU.n + " 시점 화면"} forText={askU.act === "화면 검증"} onPick={answer} onClose={() => setPick(false)} />}
    </Modal>
  );
}

/* ═══════════ 화면에서 고르기 — 러너 브라우저의 그 시점 스크린샷 + 요소 위치 ═══════════
   실시간 영상이 아니라 필요한 순간의 정지 화면. 누른 위치의 요소를 러너가 찾아 로케이터를 만든다.
   목업: 샘플 화면 (요소 목록). 스크린샷은 사용자에게만 보여주고 AI에는 보내지 않는다 */
export function WebPickModal({ title, hint, where, forText, onPick, onClose }) {
  const rec0 = hint ? (AI.webCandidates(hint, forText)[0] || null) : null;
  const [sel, setSel] = useState(rec0 ? rec0.key : null);
  const el = AI.WEB_ELEMENTS.find((e) => e.key === sel);
  const rec = el ? AI.recommendWebLoc(el) : null;
  return (
    <Modal title={title || "요소 집기"} onClose={onClose} wide>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>{where || "현재 화면"} · 러너 브라우저</span><button className="flex items-center gap-1 text-sky-600"><RefreshCw size={12} />다시 캡처</button></div>
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-500"><Globe size={11} />staging.onmarket.io</div>
            <div className="space-y-1.5 overflow-y-auto p-2.5" style={{ maxHeight: 380 }}>
              {AI.WEB_ELEMENTS.filter((e) => !forText || e.text).map((e) => (
                <button key={e.key} onClick={() => setSel(e.key)} className={"block w-full rounded-md border px-2 py-1.5 text-left text-xs " + (sel === e.key ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200" : "border-slate-200 bg-white hover:border-sky-300")}><span className="text-slate-800">{e.text || e.label}</span><span className="ml-1 text-slate-400">{e.role || "요소"}</span>{rec0 && rec0.key === e.key && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-700">AI 추천</span>}</button>
              ))}
            </div>
          </div>
          <div className="mt-2 text-center text-xs text-slate-400">목업 화면 — 실제로는 러너 브라우저의 그 시점 화면이 캡처됩니다</div>
        </div>
        <div className="col-span-6 space-y-3">
          <div className="text-sm text-slate-700">{forText ? "확인할 요소를 고르세요." : "누르거나 입력할 요소를 고르세요."} 잘 변하지 않는 로케이터를 자동으로 고릅니다.</div>
          {el ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">요소</span><span className="text-slate-800">{el.label}{el.role ? " · " + el.role : ""}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">글자</span><span className="text-slate-800">{el.text || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">data-testid</span><span className="font-mono text-slate-800">{el.testid || "없음"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">id</span><span className="font-mono text-slate-800">{el.id ? el.id + (AI.isAutoId(el.id) ? " (자동 생성 — 쓰지 않음)" : "") : "없음"}</span></div>
              <div className="border-t border-slate-200 pt-2">
                <div className="mb-1 flex items-center gap-1.5 text-slate-500">추천 로케이터<Badge kind={rec.stable ? "pass" : "warn"}>{rec.kind} · {rec.stable ? "안정" : "깨지기 쉬움"}</Badge></div>
                <div className="break-all rounded bg-slate-100 px-2 py-1.5 font-mono text-slate-800">{rec.loc}</div>
                {!rec.stable && <div className="mt-1 text-amber-700">data-testid 가 없어 {rec.kind}(으)로 찾습니다. 문구나 화면 구성이 바뀌면 깨질 수 있어, 개발 측에 data-testid 추가를 요청하는 것이 좋습니다.</div>}
              </div>
            </div>
          ) : <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500">왼쪽 화면에서 요소를 누르세요</div>}
          <div className="flex justify-end gap-2"><Btn onClick={onClose}>취소</Btn><Btn kind="primary" icon={MousePointerClick} disabled={!el} onClick={() => onPick(el)}>이 요소 사용</Btn></div>
        </div>
      </div>
    </Modal>
  );
}
