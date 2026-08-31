/** Report styling. Inlined so a report is a single portable file. */
export const REPORT_CSS = `
:root {
  --ink:#101828; --muted:#5b6472; --line:#e4e7ec; --bg:#ffffff; --panel:#f8fafc;
  --critical:#b42318; --high:#c4320a; --medium:#b54708; --low:#475467; --ok:#067647; --brand:#0f3d3e;
}
* { box-sizing:border-box; }
body { margin:0; font:16px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:var(--ink); background:var(--bg); }
.wrap { max-width:880px; margin:0 auto; padding:48px 32px 96px; }
header.masthead { border-bottom:3px solid var(--brand); padding-bottom:20px; margin-bottom:32px; }
.eyebrow { text-transform:uppercase; letter-spacing:.09em; font-size:12px; font-weight:700; color:var(--brand); margin:0 0 8px; }
h1 { font-size:32px; line-height:1.25; margin:0 0 8px; }
h2 { font-size:22px; margin:40px 0 12px; }
h3 { font-size:17px; margin:0 0 6px; }
p { margin:0 0 12px; }
.lede { font-size:18px; color:var(--muted); }
.meta { display:flex; flex-wrap:wrap; gap:8px 24px; font-size:14px; color:var(--muted); margin-top:12px; }
.summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin:24px 0; }
.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
.stat .n { font-size:26px; font-weight:700; display:block; line-height:1.1; }
.stat .l { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
.finding { border:1px solid var(--line); border-radius:10px; padding:22px; margin:0 0 22px; page-break-inside:avoid; }
.finding.critical { border-left:6px solid var(--critical); }
.finding.high { border-left:6px solid var(--high); }
.finding.medium { border-left:6px solid var(--medium); }
.finding.low { border-left:6px solid var(--low); }
.badges { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 10px; }
.badge { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:3px 9px; border-radius:999px; border:1px solid var(--line); color:var(--muted); background:#fff; }
.badge.critical { color:#fff; background:var(--critical); border-color:var(--critical); }
.badge.high { color:#fff; background:var(--high); border-color:var(--high); }
.badge.medium { color:#fff; background:var(--medium); border-color:var(--medium); }
.badge.low { color:#fff; background:var(--low); border-color:var(--low); }
.badge.review { color:#7a2e0e; background:#fef6ee; border-color:#f9dbaf; }
.badge.systemic { color:#0f3d3e; background:#e6f4f1; border-color:#a9d6cf; }
.block { margin:14px 0 0; }
.block h4 { margin:0 0 4px; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
ol.steps, ul.steps { margin:0; padding-left:20px; }
ol.steps li, ul.steps li { margin:3px 0; }
code, pre { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:13px; }
pre { background:#0f172a; color:#e2e8f0; padding:14px; border-radius:8px; overflow-x:auto; white-space:pre-wrap; word-break:break-word; }
.shot { margin:14px 0 0; }
.shot img { width:100%; border:1px solid var(--line); border-radius:8px; display:block; }
.shot figcaption { font-size:12px; color:var(--muted); margin-top:6px; }
table { width:100%; border-collapse:collapse; font-size:14px; margin:12px 0; }
th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
.tested-yes { color:var(--ok); font-weight:600; }
.tested-no { color:var(--muted); }
.callout { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--brand); border-radius:6px; padding:16px 18px; margin:24px 0; }
.callout h3 { margin-top:0; }
.disclaimer { font-size:13px; color:var(--muted); border-top:1px solid var(--line); margin-top:48px; padding-top:16px; }
.next-step { background:var(--brand); color:#fff; border-radius:10px; padding:22px 24px; margin:32px 0 0; }
.next-step h2 { margin:0 0 8px; color:#fff; font-size:20px; }
.next-step p { color:#d7e6e4; margin:0 0 8px; }
@media print { .wrap { padding:0 12px; } .finding { break-inside:avoid; } }
`;
