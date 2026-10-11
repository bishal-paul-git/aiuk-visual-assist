import { connection } from "next/server";
import { getRuntime } from "./runtime";

/** Entry point for platform pages: always render per request from the live runtime. */
export async function platformRuntime() {
  await connection();
  return getRuntime();
}
