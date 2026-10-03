export { fmtDuration, gbp } from "./data/sessions";
export const pct = (n: number, dp = 0) => `${n.toFixed(dp)}%`;
export const conf = (n: number) => n.toFixed(2);
export const num = (n: number) => n.toLocaleString("en-GB");
