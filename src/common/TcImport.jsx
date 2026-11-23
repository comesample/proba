// ============================================================
// TC 임포트 — Excel · CSV → 자연어 절차 (MQA · FQA 공용 화면 · 원래 mqa/cases.jsx 에 있던 것을 옮김)
//   양식을 강제하지 않는다 — 어느 열이 제목 · 절차 · 기대 결과인지 고르기만 한다
//   도메인마다 다른 것: 샘플 행(sample) · 가져올 곳 영역(target)
// ============================================================
import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Badge, Btn, Card, Field, Select, Toast, useToast } from "./ui.jsx";
import * as PL from "./procLogic.js";

export const readText = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => res(""); r.readAsText(f); });
const Hdr = ({ icon: Icon, title, desc, badge }) => (
  <div className="mb-1 flex items-center gap-2"><Icon size={16} className="text-sky-600" /><span className="text-sm font-semibold text-slate-900">{title}</span>{badge && <Badge kind="active">{badge}</Badge>}{desc && <span className="text-xs text-slate-500">{desc}</span>}</div>
);
export function FilePick({ accept, multiple, onFiles, onSample, hint }) {
  const ref = useRef(null);
  return (
    <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) onFiles(fs); }} />
      <Upload size={22} className="mx-auto text-slate-400" />
      <div className="mt-2 text-sm text-slate-700">{hint}</div>
      <div className="mt-3 flex justify-center gap-2"><Btn kind="primary" icon={Upload} onClick={() => ref.current && ref.current.click()}>파일 고르기</Btn><Btn onClick={onSample}>샘플 파일로 해보기</Btn></div>
    </div>
  );
}

/* ═══════════ 엑셀 가져오기 ═══════════
   양식을 강제하지 않는다 — 올린 뒤 어느 열이 제목·절차·기대 결과인지 고르기만 한다.
   목업: .csv 는 실제로 읽고, .xlsx 는 샘플 행을 보여준다 (실 구현은 서버에서 엑셀을 읽는다) */
const COL_KEYS = [["name", "제목", true], ["pre", "사전조건", false], ["proc", "절차", true], ["exp", "기대 결과", false], ["suite", "스위트", false]];
const COL_GUESS = { name: /시나리오|제목|케이스명|테스트명|이름|항목/, pre: /사전|전제/, proc: /절차|스텝|단계|수행/, exp: /기대|예상/, suite: /분류|스위트|모듈|카테고리|구분/ };
export function ExcelImport({ onImport, onCancel, sample, target }) {
  const [msg, flash] = useToast();
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState("");
  const [note, setNote] = useState("");
  const [map, setMap] = useState({});
  const [off, setOff] = useState({});
  const load = (r, name, n) => {
    const hdr = r[0] || [];
    const m = {}; COL_KEYS.forEach(([k]) => { const i = hdr.findIndex((h) => COL_GUESS[k].test(String(h))); m[k] = i >= 0 ? String(i) : ""; });
    setRows(r); setFile(name); setNote(n || ""); setMap(m); setOff({});
  };
  const onFiles = async ([f]) => {
    const low = f.name.toLowerCase();
    if (low.endsWith(".csv")) { const r = PL.parseCsv(await readText(f)); if (r.length < 2) { flash("읽을 행이 없습니다"); return; } load(r, f.name); }
    else if (/\.xlsx?$/.test(low)) load(sample, f.name, "목업: 엑셀 파일 내용 대신 샘플 행을 보여줍니다 (실 구현은 서버에서 읽습니다)");
    else flash("엑셀(.xlsx) 또는 CSV 파일을 올려 주세요");
  };
  const body = rows ? rows.slice(1) : [];
  const items = body.map((r, i) => ({ i, ...PL.rowToCase(r, map) })).filter((x) => x.name || x.proc.length);
  const chosen = items.filter((x) => !off[x.i]);
  const missing = COL_KEYS.filter(([k, , req]) => req && map[k] === "").map(([, t]) => t);
  const go = () => {
    if (missing.length) { flash(missing.join("·") + " 열을 골라 주세요"); return; }
    if (!chosen.length) { flash("가져올 행을 골라 주세요"); return; }
    onImport(chosen.map((x) => ({ name: x.name || "이름 없음", pre: x.pre, suite: x.suite, proc: x.proc, origin: "TC 임포트" })));
  };
  return (
    <div className="space-y-3">
      <Hdr icon={FileText} title="TC 임포트" desc="Excel · CSV → 자연어 절차 · 양식은 자유, 열만 고르면 됩니다" />
      <Card className="space-y-3 p-4">
        {!rows ? <FilePick accept=".xlsx,.xls,.csv" onFiles={onFiles} onSample={() => load(sample, "sample_tc.xlsx")} hint="수동 TC 엑셀(.xlsx) 또는 CSV — 테스트 관리 도구(Jira Xray · Zephyr, TestRail 등)에서 내보낸 CSV도 됩니다" /> : (<>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-600"><FileText size={13} className="mr-1 inline" />{file} · {body.length}행</span><button onClick={() => setRows(null)} className="text-sky-600">다른 파일</button></div>
          {note && <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">{note}</div>}
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-700">열 고르기 <span className="font-normal text-slate-500">· 이름이 비슷한 열은 자동으로 골랐습니다</span></div>
            <div className="grid grid-cols-5 gap-2">{COL_KEYS.map(([k, t, req]) => <Field key={k} label={t + (req ? " *" : "")}><Select value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}><option value="">{req ? "선택" : "없음"}</option>{(rows[0] || []).map((h, i) => <option key={i} value={String(i)}>{h || "열 " + (i + 1)}</option>)}</Select></Field>)}</div>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="sticky top-0 bg-slate-50 text-left text-slate-500"><th className="w-8 px-2 py-2"></th><th className="font-medium">제목</th><th className="font-medium">절차</th><th className="font-medium">기대 결과</th><th className="font-medium">스위트</th></tr></thead>
              <tbody>{items.map((x) => (
                <tr key={x.i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2"><input type="checkbox" checked={!off[x.i]} onChange={(e) => setOff({ ...off, [x.i]: !e.target.checked })} className="accent-sky-600" /></td>
                  <td className="py-2 text-slate-800">{x.name || <span className="text-red-600">제목 없음</span>}</td>
                  <td className="py-2 text-slate-600">{x.proc.length}단계 <span className="text-slate-400">{x.proc[0] ? "· " + x.proc[0].t : ""}</span></td>
                  <td className="py-2 text-slate-600">{x.proc.some((p) => p.e) ? "있음" : "—"}</td>
                  <td className="py-2 text-slate-600">{x.suite || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {target}
          <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">가져온 케이스는 모두 <span className="text-slate-700">초안</span>으로 들어옵니다.</span><div className="flex gap-2"><Btn onClick={onCancel}>취소</Btn><Btn kind="primary" icon={Upload} onClick={go}>{chosen.length}건 가져오기</Btn></div></div>
        </>)}
      </Card>
      <Toast msg={msg} />
    </div>
  );
}

