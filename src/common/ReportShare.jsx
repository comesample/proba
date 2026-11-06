// ============================================================
// 리포트 공유 · 자동 알림 — 공통 (AI 품질 · 기능 QA · 기능 QA(앱) 공용)
//   채널(Slack · Teams · Email)과 발송 조건은 공통 '리포트 · 알림' 설정(reportCfg)을 그대로 쓴다 — 도메인에 따로 두지 않는다
//   발송한 것은 모두 공통 발송 이력(reportHist)에 남는다
//   메시지 앞머리로 도메인을 구분한다 — 한 채널에 여러 도메인 알림이 섞여도 알아볼 수 있게
// ============================================================
import { useState } from "react";
import { Share2 } from "lucide-react";
import { Btn } from "./ui.jsx";
import { useApp } from "./context.js";

export const DOMAIN_TAG = { LQA: "[AI 품질]", FQA: "[기능 QA]", MQA: "[기능 QA(앱)]" };
const CH = [["slack", "Slack"], ["teams", "Teams"], ["email", "Email"]];
const hhmm = () => new Date().toTimeString().slice(0, 5);

/* 회귀 리포트 공유 — 담당자 의견 · 켜진 채널 선택 · 미리보기 · 발송(이력 기록)
   domain: LQA | FQA | MQA · subject: 이력에 남길 제목 · preview: 요약 메시지 본문 · onDone(채널 목록) */
export function ShareBox({ domain, subject, preview, onDone, onLeave }) {
  const { reportCfg = { ch: {} }, addReportHist, goTo, goto } = useApp();
  const [memo, setMemo] = useState("");
  const enabled = (k) => !!(reportCfg.ch || {})[k];
  const [pick, setPick] = useState(() => Object.fromEntries(CH.map(([k]) => [k, enabled(k)])));
  const chosen = CH.filter(([k]) => pick[k] && enabled(k));
  const tag = DOMAIN_TAG[domain] || "";
  const toReport = () => { if (onLeave) onLeave(); (goTo || goto)("report"); };
  const send = () => {
    const t = hhmm();
    if (addReportHist) addReportHist(chosen.map(([k, lab]) => ({ t, ch: lab, txt: tag + " " + subject + (k === "email" ? " · 전체 리포트" : " · 요약") + (memo ? " · 의견 포함" : ""), ok: true })));
    if (onDone) onDone(chosen.map((c) => c[1]));
  };
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="text-xs font-semibold text-slate-500">리포트 공유</div>
      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="담당자 의견 (선택) — 확인한 내용이나 다음 조치를 덧붙이세요" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500" />
      <div className="flex flex-wrap items-center gap-3 text-xs">{CH.map(([k, lab]) => (enabled(k)
        ? <label key={k} className="flex cursor-pointer items-center gap-1.5 text-slate-700"><input type="checkbox" checked={!!pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} className="accent-sky-600" />{lab}</label>
        : <span key={k} className="text-slate-400" title="리포트 · 알림에서 채널을 켜면 쓸 수 있습니다">{lab} <button onClick={toReport} className="text-sky-600">켜기</button></span>))}</div>
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><div className="mb-0.5 font-medium text-slate-500">미리보기 · Slack · Teams 는 요약, Email 은 전체 리포트(HTML)</div>{tag} {preview}{memo ? " · 의견: " + memo : ""}</div>
      <Btn kind="primary" icon={Share2} disabled={!chosen.length} onClick={send}>리포트 공유</Btn>
    </div>
  );
}

/* 실행 완료 자동 알림 — 공통 발송 조건을 따른다
   always 항상 / fail 실패가 있을 때 / drop 회귀(직전 실행 대비 하락 · 퇴행)가 있을 때 */
export function autoAlert({ reportCfg, addReportHist, domain, text, hasFail, hasReg }) {
  if (!reportCfg || !addReportHist) return false;
  const chs = CH.filter(([k]) => (reportCfg.ch || {})[k]);
  if (!chs.length) return false;
  const go = reportCfg.cond === "always" || (reportCfg.cond === "fail" && hasFail) || (reportCfg.cond === "drop" && hasReg);
  if (!go) return false;
  const t = hhmm();
  addReportHist(chs.map(([, lab]) => ({ t, ch: lab, txt: (DOMAIN_TAG[domain] || "") + " " + text + " · 자동 알림", ok: true })));
  return true;
}
