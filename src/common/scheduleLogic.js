// 예약 계산 — 웹 · 앱 실행 계획 공통 (schedule = 공통 스케줄 설정의 값)
export const isTimed = (s) => !!(s && s.mode === "schedule" && s.active !== false);
export const isOnNewBuild = (s) => !!(s && s.mode === "event" && s.ev && s.ev.newBuild);
/* 다음 실행 시각 — 정기 스케줄만. Cron 은 식 그대로 보여준다 */
export const nextRun = (s) => {
  if (!isTimed(s)) return "";
  if (s.freq === "cron") return "Cron " + s.cron;
  const now = new Date(); const [h, m] = String(s.time || "02:00").split(":").map(Number);
  const z = (n) => String(n).padStart(2, "0");
  const fmt = (d) => d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  if (s.freq === "hourly") { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return fmt(d); }
  const d = new Date(now); d.setHours(h, m, 0, 0);
  const ok = (x) => (s.freq === "weekdays" ? x.getDay() >= 1 && x.getDay() <= 5 : s.freq === "weekly" ? x.getDay() === +s.dow : s.freq === "monthly" ? x.getDate() === +s.dom : true);
  for (let i = 0; i < 400 && (d <= now || !ok(d)); i++) d.setDate(d.getDate() + 1);
  return fmt(d);
};
