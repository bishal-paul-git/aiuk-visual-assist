import { parseSyntheticRef, renderRouterSvg } from "./router-svg";

/** Inline image for synthetic (simulated) frames; undefined for real captured frames. */
export function syntheticFrameSrc(ref: string): string | undefined {
  const scene = parseSyntheticRef(ref);
  return scene ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderRouterSvg(scene))}` : undefined;
}

/** Image source for a selected-evidence frame on server-rendered pages. */
export function frameSrc(sessionId: string, frame: { id: string; frameReference: string }): string {
  return syntheticFrameSrc(frame.frameReference) ?? `/api/sessions/${sessionId}/frames/${frame.id}`;
}
