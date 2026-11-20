/** @type {import('tailwindcss').Config} */
/* 🔑 디자인 톤은 실서비스(proba-fe · app/globals.css)를 따른다 (2026-11-20).
   목업 화면은 sky · slate 를 직접 적은 곳이 많아, 두 팔레트를 실서비스 색으로 바꿔 끼워
   공통 부품을 거치지 않는 곳까지 한 번에 같은 톤이 되게 한다.
     sky   = 강조. 옅은 단계는 청록(#00C3D0 brand), 진한 단계(700~)는 남색(#263360 navy — 주 버튼)
     slate = 중립. 본문 #333 · 보조 #777 · 흐린 #AAA · 선 #DDD · 바탕 #F6F8FA */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["'Wanted Sans'", "'Malgun Gothic'", "system-ui", "sans-serif"] },
      colors: {
        sky: { 50: "#e6f9fa", 100: "#ccf3f6", 200: "#99e7ed", 300: "#66dbe3", 400: "#33cfda", 500: "#00c3d0", 600: "#0093a0", 700: "#263360", 800: "#1e2850", 900: "#161d3b", 950: "#0e1328" },
        slate: { 50: "#f6f8fa", 100: "#f2f2f2", 200: "#e8e8e8", 300: "#dddddd", 400: "#aaaaaa", 500: "#777777", 600: "#5e5e5e", 700: "#444444", 800: "#333333", 900: "#222222", 950: "#111111" },
        navy: "#263360", brand: "#00c3d0", canvas: "#f6f8fa", ink: "#333333", subtle: "#777777", faint: "#aaaaaa",
        line: "#dddddd", thead: "#eaeef0", edge: "#eae9ed", hairline: "#ececec", "row-hover": "#f3f3f3",
        abyss: { from: "#0f2027", to: "#2c5364" },
        /* 상태 배지 팔레트 (badge 공용) — 채움은 /20 투명도, -line 은 테두리 */
        st: { red: "#ff383c", "red-line": "#c93030", amber: "#ff8d28", "amber-line": "#ffb700", blue: "#0088ff", "blue-line": "#0056a1", gray: "#f1f1f1", "gray-line": "#a8a8a8", "teal-line": "#7bc6c8", "teal-soft": "#eef9f9", "teal-ink": "#287b7d" },
      },
    },
  },
  plugins: [],
};
