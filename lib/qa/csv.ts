/**
 * Minimal RFC 4180 CSV reading and writing for files people edit in a
 * spreadsheet (photo labels, evaluation reports). Handles quoted fields,
 * doubled quotes, line breaks inside quotes, CRLF line endings and the byte
 * order mark Excel adds. Spreadsheets in some locales save with semicolons, so
 * the delimiter is detected from the header line.
 */

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const counts = { ",": count(","), ";": count(";"), "\t": count("\t") } as const;
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/** Parse CSV text into rows of cells. Blank lines are kept as `[""]` so callers can report line numbers. */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
      i += 1;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
    } else {
      cell += ch;
      i += 1;
    }
  }
  if (quoted) throw new Error("The CSV file has a quotation mark that is never closed.");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Spreadsheet apps run cells that start with = + - @ as formulas. Text from a
 * model or a file name is prefixed with an apostrophe so it is shown, not run.
 * Plain numbers (including negative ones) are left alone.
 */
function neutralise(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = neutralise(typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
