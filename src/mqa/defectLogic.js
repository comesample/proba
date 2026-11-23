// 앱 테스트 결함 등록 — 결함은 공통 '결함' 목록(app.addDefect) 하나에 넣는다 (웹 · AI 품질과 같은 목록)
//   실행 쪽 run.defects 는 '어느 결과에서 등록했나' 의 연결만 남긴다 (연결 키 → 결함 번호)
//   연결 키: 기능 = 케이스 ID · 성능 = 항목|단말|지표
/* 단건 등록 — 공통 결함 등록 창(웹 · AI 품질과 같은 창)을 연다. 등록하면 onAdd 로 실행 결과와 잇는다
   o = 창에 미리 채울 내용 (title · desc · steps · expected · actual · artifacts …) */
const SHOT = { k: "shot", label: "실패 화면", file: "screenshot.png", size: "180 KB" }, LOG = { k: "log", label: "Appium 로그", file: "appium.log", size: "40 KB" }, TRACE = { k: "trace", label: "Perfetto 트레이스", file: "trace.perfetto-trace", size: "6 MB" };
export const openMqaDefect = (app, run, linkKey, o) => app.openModal("jira", {
  domain: "MQA", sev: "Major", target: run.sysName || "", env: (run.sysName || "") + " · " + (run.env || ""), run: run.id,
  labels: o.perf ? "mqa, performance" : "mqa, functional", artifacts: o.perf ? [TRACE] : [SHOT, LOG], ...o,
  onAdd: (key) => app.updateMqaRun(run.id, { defects: { ...(run.defects || {}), [linkKey]: key } }),
});
// 일괄 등록 (회귀 비교) — 창 없이 바로. items = [[연결 키, 결함 내용], ...] — 여러 건을 한 번에 등록해도 run.defects 를 한 번만 고친다
export const regMqaDefects = (app, run, items) => {
  const links = { ...(run.defects || {}) };
  const base = 3000 + (app.defects || []).length;
  const keys = items.filter(([lk]) => !links[lk]).map(([lk, o], i) => {
    const key = "DEF-" + (base + i + 1);
    app.addDefect({ key, domain: "MQA", target: run.sysName || "", project: "", run: run.id, sev: "Major", status: "Open", assignee: "", evidence: ["실패 화면", "Appium 로그"], ...o });
    links[lk] = key;
    return key;
  });
  if (keys.length) app.updateMqaRun(run.id, { defects: links });
  return keys;
};
