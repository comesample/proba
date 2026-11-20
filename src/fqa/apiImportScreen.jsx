// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useState } from "react";
import { CheckCircle2, FileText, Plus, RefreshCw, Upload } from "lucide-react";
import { Badge, Btn, Card, Field, Input, Seg, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { M_K, SAMPLE_CURL, SAMPLE_HAR, SAMPLE_OPENAPI, apiSteps, detectSpec, parseCurl, parseHar, parseOpenApi } from "./apiImport.js";
import { nextTcId } from "./logic.js";
import { Hdr, TagPicker } from "./parts.jsx";

export function FqaApiImportScreen({ onDone }) {
  const { addFqaCase, fqaSuites, updateFqaSuite, fqaCases } = useApp();
  const [msg, flash] = useToast();
  const apiSuites = fqaSuites || [];
  const [suite, setSuite] = useState(0);   // 0 = 스위트에 넣지 않음. 고르면 그 스위트 끝에 순서대로 붙인다
  /* 임포트 단위로 공통인 태그(대개 regression)를 여기서 한 번에 건다.
     엔드포인트마다 갈리는 태그(smoke·critical)는 목록의 일괄 태그 지정에서 조정한다 —
     이 화면이 케이스 에디터를 흉내내기 시작하면 끝이 없다. */
  const [tags, setTags] = useState("");
  const [src, setSrc] = useState("OpenAPI 파일"); // OpenAPI 파일 | OpenAPI URL | cURL | HAR
  const [curlText, setCurlText] = useState("");
  const [specUrl, setSpecUrl] = useState("");   // 비워 둔다 — 예시는 placeholder로
  const [phase, setPhase] = useState("idle");
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const secretTotal = rows.reduce((n, r) => n + (r.secrets || 0), 0);
  // 소스 전환 시 결과 초기화
  const switchSrc = (v) => { setSrc(v); setRows([]); setPicked(new Set()); setErr(""); setFileName(""); setPhase("idle"); };
  const setResult = (parsed, name) => {
    const keyed = parsed.map((r, i) => ({ ...r, _k: i }));
    setErr(keyed.length ? "" : "요청을 찾지 못했습니다 — 내용을 확인하세요."); setRows(keyed); setPicked(new Set()); if (name != null) setFileName(name); setPhase("done");
  };
  const onFile = (file) => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      let obj;
      try { obj = JSON.parse(rd.result); }
      catch (e) { setErr("JSON 파싱 실패 — " + (src === "HAR" ? ".har 파일" : "openapi.json") + "을 올리세요."); setRows([]); setFileName(file.name); setPhase("done"); return; }
      // 파일 소스: HAR 또는 OpenAPI 파일
      if (src === "HAR") {
        if (!(obj.log && obj.log.entries)) { setErr("HAR 형식이 아닙니다 (log.entries 없음)."); setRows([]); setFileName(file.name); setPhase("done"); return; }
        setResult(parseHar(obj), file.name);
      } else {
        if (!detectSpec(obj)) { setErr("OpenAPI 형식이 아닙니다 (openapi/swagger 키 없음)."); setRows([]); setFileName(file.name); setPhase("done"); return; }
        setResult(parseOpenApi(obj), file.name);
      }
    };
    rd.readAsText(file);
  };
  // 샘플로 시연 — 소스별 샘플 데이터로 결과를 채운다(모든 탭 공통 보조 링크)
  const loadSample = () => { setPhase("running"); setErr(""); setFileName("샘플"); setTimeout(() => { setResult(src === "cURL" ? parseCurl(SAMPLE_CURL) : src === "HAR" ? parseHar(SAMPLE_HAR) : parseOpenApi(SAMPLE_OPENAPI), "샘플"); }, 400); };
  // OpenAPI URL — 실제로는 서버가 가져온다(브라우저 직접 fetch는 CORS 제한). 여기선 URL 검증만.
  const loadUrl = () => { if (!specUrl.trim()) { setErr("스펙 URL을 입력하세요 (또는 아래 '샘플로 시연')"); return; } setPhase("running"); setErr(""); setTimeout(() => setResult(parseOpenApi(SAMPLE_OPENAPI), specUrl), 500); };
  const runCurl = () => { if (!curlText.trim()) { setErr("cURL을 붙여넣으세요 (또는 아래 '샘플로 시연')"); return; } const r = parseCurl(curlText); if (!r.length) { setErr("cURL을 인식하지 못했습니다 — 'curl '로 시작해야 합니다."); setRows([]); setPhase("done"); return; } setResult(r); };
  const toggle = (k) => setPicked((pv) => { const n = new Set(pv); n.has(k) ? n.delete(k) : n.add(k); return n; });
  // 다건 임포트 → 목록에 '초안'으로 쌓는다. 각 케이스는 목록에서 에디터로 열어 보강한다.
  const commit = () => { if (!picked.size) { flash("요청을 선택하세요"); return; } const sel = rows.filter((r) => picked.has(r._k)); const ids = sel.map((ep, i) => nextTcId(fqaCases, i)); sel.forEach((ep, i) => addFqaCase({ id: ids[i], origin: "API 임포트", name: ep.name, tags, status: "초안", level: "Low-Code", dataset: "-", steps: apiSteps(ep) })); const su = apiSuites.find((x) => x.id === suite); if (su) updateFqaSuite(su.id, { items: [...(su.items || []), ...ids] }); if (onDone) onDone(sel.length + "건 API 케이스 초안 등록" + (su ? " · " + su.name + " 끝에 추가 (승인 전이라 그 스위트는 승인할 때까지 실행되지 않습니다)" : "") + " · 목록에서 에디터로 보강하세요"); };
  return (
    <>
      <Hdr icon={FileText} title="API 임포트" badge="API" desc="OpenAPI · cURL · HAR → 요청·검증 케이스 골격" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-4">
          <Card className="p-4 space-y-3">
            {/* 각 탭은 '실제 액션 하나' + 공통 '샘플로 시연' 링크. 실 개발 시 링크만 지우면 된다. */}
            <Seg options={["OpenAPI 파일", "OpenAPI URL", "cURL", "HAR"]} value={src} onChange={switchSrc} />
            {src === "cURL" ? (
              <>
                <Field label="cURL 붙여넣기" hint="개발자도구 · Postman에서 'Copy as cURL'"><textarea value={curlText} onChange={(e) => setCurlText(e.target.value)} rows={6} placeholder={SAMPLE_CURL} className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" /></Field>
                <Btn kind="primary" icon={RefreshCw} className="w-full" onClick={runCurl}>요청 분석</Btn>
              </>
            ) : src === "OpenAPI URL" ? (
              <>
                <Field label="스펙 URL" hint="대개 /openapi.json · /swagger.json 로 노출"><Input value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} placeholder="https://api.example.com/openapi.json" /></Field>
                <Btn kind="primary" icon={RefreshCw} className="w-full" onClick={loadUrl}>{phase === "running" ? "불러오는 중…" : "스펙 불러오기"}</Btn>
                <div className="text-xs text-slate-500">서버가 URL을 가져와 파싱합니다.</div>
              </>
            ) : (
              <>
                <label className={"flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center hover:bg-slate-100 " + (err ? "border-red-300 bg-red-50 hover:border-red-400" : "border-slate-300 bg-white hover:border-sky-600")}>
                  <Upload size={20} className={err ? "text-red-600" : "text-sky-600"} />
                  <span className="text-sm text-slate-700">{err ? "다른 파일 선택" : (src === "HAR" ? "HAR 파일 선택" : "스펙 파일 선택")}</span>
                  <span className="text-xs text-slate-500">{src === "HAR" ? "network export · .har" : "openapi.json · swagger.json"}</span>
                  <input type="file" accept={src === "HAR" ? ".har,.json" : ".json,.yaml,.yml"} className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; onFile(f); }} />
                </label>
                {fileName && fileName !== "샘플" && !err && phase === "done" && <div className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 size={13} />{fileName} · {rows.length}개 감지</div>}
              </>
            )}
            {/* 모든 탭 공통 보조 링크 — 입력 없이 동작을 확인. 실 개발 시 이 줄만 제거. */}
            <div className="text-center"><button type="button" onClick={loadSample} className="text-xs text-slate-500 underline decoration-dotted hover:text-sky-600">샘플 {src.replace("OpenAPI ", "")}로 시연</button></div>
            <Field label="스위트에 추가 (선택)"><Select value={String(suite)} onChange={(e) => setSuite(+e.target.value)}><option value="0">추가 안 함</option>{apiSuites.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}</Select></Field>
            <Field label="태그" hint="선택한 요청 전부에 동일하게 붙습니다. 케이스별 조정은 목록에서 합니다."><TagPicker value={tags} onChange={setTags} /></Field>
            {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div>}
            <div className="text-xs text-slate-500">요청+상태 검증 골격을 만듭니다. 본문·검증은 에디터에서 보강합니다.{(src === "cURL" || src === "HAR") && <span className="text-amber-700"> 인증·비밀번호는 <span className="font-mono">${"{…}"}</span>로 마스킹됩니다.</span>}</div>
          </Card>
        </div>
        <div className="col-span-7">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800">감지된 요청{rows.length > 0 && <Badge kind="info">{src.startsWith("OpenAPI") ? "OpenAPI" : src}</Badge>}{fileName === "샘플" && rows.length > 0 && <Badge kind="draft">샘플</Badge>}{secretTotal > 0 && <Badge kind="warn">🔒 시크릿 {secretTotal} 마스킹</Badge>}</div>{phase === "done" && rows.length > 0 && <span className="text-xs text-slate-500">{rows.length}개 · 선택 {picked.size}</span>}</div>
            {phase !== "done" || rows.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-slate-500">{phase === "running" ? "분석하는 중…" : src === "cURL" ? "cURL을 붙여넣고 \"요청 분석\"을 누르세요" : src === "OpenAPI URL" ? "스펙 URL을 확인하고 \"스펙 불러오기\"를 누르세요" : src === "HAR" ? "HAR 파일을 선택하세요" : "스펙 파일을 선택하세요"}</div>
            ) : (
              <>
                <div className="border-b border-slate-200 bg-white px-4 py-2"><button onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r._k)))} className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">{picked.size === rows.length ? "전체 해제" : "전체 선택"}</button></div>
                <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                  {rows.map((r) => { const k = r._k; return (
                    <div key={k} onClick={() => toggle(k)} className="flex cursor-pointer items-center gap-3 border-b border-slate-200 px-4 py-2.5 hover:bg-slate-100">
                      <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} className="accent-sky-600" />
                      <Badge kind={M_K[r.m] || "info"}>{r.m}</Badge>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{r.path}</span>
                      {/* OpenAPI는 summary가 유용, cURL/HAR은 이름이 'M path'라 중복 → 생략 */}
                      {r.name && r.name !== r.m + " " + r.path && <span className="truncate text-sm text-slate-700" style={{ maxWidth: 140 }}>{r.name}</span>}
                      <span className="shrink-0 text-xs text-slate-500">{r.asrt}</span>
                    </div>
                  ); })}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3"><Btn kind="primary" icon={Plus} disabled={!picked.size} onClick={commit}>초안으로 등록</Btn></div>
              </>
            )}
          </Card>
          <div className="mt-2 text-xs text-slate-500">선택한 엔드포인트가 <span className="text-slate-700">초안</span> 케이스로 등록됩니다. 목록에서 에디터로 열어 요청 본문·검증을 채운 뒤 검토·승인합니다.</div>
        </div>
      </div>
      <Toast msg={msg} />
    </>
  );
}