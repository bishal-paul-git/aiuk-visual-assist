import type { CalibrationBin } from "@/lib/qa/calibration";
import { pct } from "@/lib/format";
import { Table, Td, Th, cx } from "@/components/ui/primitives";

/** Plain-English reading of an ECE value. */
export function eceVerdict(ece: number | undefined): { label: string; tone: "ok" | "warn" | "danger" | undefined } {
  if (ece === undefined) return { label: "Not enough data", tone: undefined };
  if (ece <= 0.05) return { label: "Well calibrated", tone: "ok" };
  if (ece <= 0.15) return { label: "Somewhat miscalibrated", tone: "warn" };
  return { label: "Poorly calibrated", tone: "danger" };
}

/**
 * Reported confidence against measured accuracy, per confidence bin. Bins with
 * no readings are shown as empty so the shape of the data is visible.
 */
export function CalibrationTable({ bins, accuracyLabel = "Accuracy", hideEmpty = false }: { bins: CalibrationBin[]; accuracyLabel?: string; hideEmpty?: boolean }) {
  const rows = hideEmpty ? bins.filter((b) => b.count > 0) : bins;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Reported confidence</Th>
          <Th align="right">Readings</Th>
          <Th align="right">Mean confidence</Th>
          <Th align="right">{accuracyLabel}</Th>
          <Th align="right">Gap</Th>
          <Th>Reading</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const gap = b.gap;
          const big = gap !== undefined && Math.abs(gap) > 0.1;
          return (
            <tr key={b.label}>
              <Td className="whitespace-nowrap font-medium text-ink">{b.label}</Td>
              <Td align="right" className={b.count === 0 ? "text-muted" : undefined}>
                {b.count}
              </Td>
              <Td align="right">{b.meanConfidence === undefined ? "—" : pct(b.meanConfidence)}</Td>
              <Td align="right">{b.accuracy === undefined ? "—" : pct(b.accuracy)}</Td>
              <Td align="right" className={cx(big && "font-semibold text-warn")}>
                {gap === undefined ? "—" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${pct(Math.abs(gap))}`}
              </Td>
              <Td className="text-xs text-muted">
                {gap === undefined ? "No readings" : Math.abs(gap) <= 0.05 ? "In line" : gap < 0 ? "Over-confident" : "Under-confident"}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
