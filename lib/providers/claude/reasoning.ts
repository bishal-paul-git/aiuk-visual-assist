import Anthropic from "@anthropic-ai/sdk";
import type { ModelUsage, ModelUsageParts, ObservationStatus, WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
import { OBSERVATION_STATUSES } from "@/lib/domain/types";
import type { ObservationInput } from "@/lib/session/orchestrator";
import type {
  EvidenceInput,
  EvidenceInterpretation,
  ProviderCallRecord,
  ReasoningProvider,
  UtteranceInput,
  UtteranceInterpretation,
} from "@/lib/providers/types";

/**
 * Multimodal reasoning on Claude (docs/02 §3.6, docs/05 §2).
 *
 * The model receives only the selected frame and the current workflow step,
 * and must answer in a strict JSON schema. Its output is then validated
 * against the workflow's observation vocabulary: unknown observation types are
 * dropped, values outside the vocabulary become "uncertain", and confidence is
 * clamped — so the model can describe what it sees but can never invent a
 * workflow branch. Refusals and malformed output throw, which the orchestrator
 * turns into a human escalation.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
const SUPPORTED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const NEXT_ACTIONS = ["none", "request_closer_view", "request_another_angle", "escalate"] as const;
export const SENSITIVE_TYPES = ["none", "person", "child", "payment_card", "identity_document", "computer_screen", "confidential_document", "vehicle_plate"] as const;

type MessagesClient = Pick<Anthropic, "beta">;

export interface ClaudeProviderOptions {
  model?: string;
  /** Live sessions are latency-sensitive; lower effort keeps turns conversational. */
  effort?: "low" | "medium" | "high";
  /** Called after every model call (success or failure) — feeds latency and usage metrics. */
  observe?: (record: ProviderCallRecord) => void;
}

export class ClaudeReasoningProvider implements ReasoningProvider {
  readonly id = "claude";
  readonly simulated = false;
  readonly model: string;
  private readonly effort: "low" | "medium" | "high";
  private readonly observe?: (record: ProviderCallRecord) => void;

  constructor(
    private readonly client: MessagesClient,
    opts: ClaudeProviderOptions = {},
  ) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.effort = opts.effort ?? "low";
    this.observe = opts.observe;
  }

  get modelVersion(): string {
    return this.model;
  }

  async interpretUtterance(input: UtteranceInput): Promise<UtteranceInterpretation> {
    const intents = [...new Set([...input.expectedIntents, "wait", "human_request", "unknown"])];
    const recent = input.state.transcript
      .slice(-10)
      .map((t) => `${t.speaker === "customer" ? "Customer" : t.speaker === "ai" ? "Assistant" : t.speakerName}: ${t.text}`)
      .join("\n");
    const step = input.step;
    const text = [
      `Current workflow step: "${step?.title ?? "none"}" (${step?.type ?? "n/a"}).`,
      step ? `The assistant just said: "${step.instruction}"` : "",
      `Classify the customer's latest message into exactly one intent from: ${intents.join(", ")}.`,
      describeIntents(intents),
      `Recent conversation:\n${recent}`,
      `Customer's latest message: "${input.utterance.text}"`,
      'If the intent is "broadband_issue" or the customer describes their problem, set customer_issue to a short neutral summary of the problem in their words; otherwise null.',
      'Only if the intent is "unknown" or "wait", write a short, friendly spoken reply (max 2 sentences) that steers back to the current step. Otherwise reply is null.',
    ]
      .filter(Boolean)
      .join("\n\n");

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["intent", "customer_issue", "reply"],
      properties: {
        intent: { type: "string", enum: intents },
        customer_issue: { type: ["string", "null"] },
        reply: { type: ["string", "null"] },
      },
    };
    const { parsed: raw, usage } = await this.call("utterance", systemPrompt(input.workflow), [{ type: "text", text }], schema, 1024);
    const intent = typeof raw.intent === "string" && intents.includes(raw.intent) ? raw.intent : "unknown";
    return {
      intent,
      customerIssue: typeof raw.customer_issue === "string" && raw.customer_issue.trim() ? raw.customer_issue.trim().slice(0, 200) : undefined,
      reply: typeof raw.reply === "string" && raw.reply.trim() ? raw.reply.trim().slice(0, 400) : undefined,
      usage,
    };
  }

  async interpretEvidence(input: EvidenceInput): Promise<EvidenceInterpretation> {
    const started = Date.now();
    const frame = input.frame;
    if (!frame || !SUPPORTED_MEDIA.has(frame.mime)) throw new Error("No analysable frame for this visual event");
    const vocab = vocabularyFor(input.workflow, input.step);
    const types = Object.keys(vocab);
    if (types.length === 0) throw new Error("Step has no observable evidence types");
    const step = input.step;

    const text = [
      step
        ? `Checkpoint: "${step.evidence?.checkpoint}" — ${step.evidence?.description}. Expected view: ${step.evidence?.view}.`
        : `An agent asked the customer: "${input.state.evidenceRequest?.prompt ?? "show the item"}".`,
      "Report one observation for each of these items, using only the allowed values:",
      types.map((t) => `- ${t}: ${vocab[t].description}. Allowed values: ${vocab[t].values.join(", ")}`).join("\n"),
      [
        "Rules:",
        "- Describe only what is actually visible in this image. Never guess or infer from context.",
        "- If an item is not in frame, use status not_visible and value null.",
        "- If an item is in frame but you cannot read it (glare, blur, distance, angle), use status unreadable or uncertain, value null, and recommend a closer view or another angle.",
        "- Use confirmed_visible only when you are certain; likely_visible when fairly sure; set requires_confirmation true for anything a human should double-check.",
        "- confidence is your calibrated probability (0-1) that the value is correct.",
        "- Set sensitive_content if a person, child, payment card, ID document, screen, confidential document or vehicle plate is visible; otherwise none.",
        "- reply: one short spoken sentence acknowledging what you could or could not see. Do not give instructions.",
      ].join("\n"),
    ].join("\n\n");

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["observations", "sensitive_content", "reply"],
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["observation_type", "value", "observation_text", "status", "confidence", "requires_confirmation", "recommended_next_action"],
            properties: {
              observation_type: { type: "string", enum: types },
              value: { type: ["string", "null"] },
              observation_text: { type: "string" },
              status: { type: "string", enum: [...OBSERVATION_STATUSES] },
              confidence: { type: "number" },
              requires_confirmation: { type: "boolean" },
              recommended_next_action: { type: "string", enum: [...NEXT_ACTIONS] },
            },
          },
        },
        sensitive_content: { type: "string", enum: [...SENSITIVE_TYPES] },
        reply: { type: ["string", "null"] },
      },
    };

    const { parsed: raw, usage } = await this.call(
      "evidence",
      systemPrompt(input.workflow),
      [
        { type: "image", source: { type: "base64", media_type: frame.mime as "image/jpeg", data: Buffer.from(frame.data).toString("base64") } },
        { type: "text", text },
      ],
      schema,
      2048,
    );
    const observations = validateObservations(raw.observations, vocab);
    const sensitive = typeof raw.sensitive_content === "string" ? raw.sensitive_content : "none";
    if (sensitive !== "none" && (SENSITIVE_TYPES as readonly string[]).includes(sensitive)) {
      observations.push({
        observationType: "sensitive_content",
        value: sensitive,
        observationText: `Sensitive content may be visible: ${sensitive.replace(/_/g, " ")}`,
        confidence: 0.7,
        status: "likely_visible",
        requiresConfirmation: true,
      });
    }
    return {
      observations,
      modelVersion: this.model,
      latencyMs: Date.now() - started,
      reply: typeof raw.reply === "string" && raw.reply.trim() ? raw.reply.trim().slice(0, 300) : undefined,
      usage,
    };
  }

  private async call(
    operation: ProviderCallRecord["operation"],
    system: string,
    content: Anthropic.Beta.BetaContentBlockParam[],
    schema: Record<string, unknown>,
    maxTokens: number,
  ): Promise<{ parsed: Record<string, unknown>; usage?: ModelUsage }> {
    const started = Date.now();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content }],
        output_config: { effort: this.effort, format: { type: "json_schema", schema } },
      });
    } catch (e) {
      this.observe?.({ provider: this.id, model: this.model, operation, latencyMs: Date.now() - started, ok: false });
      throw e;
    }
    const latencyMs = Date.now() - started;
    // Tokens are billed whether or not the output is usable, so usage is captured first.
    const usage = extractUsage(response, this.model, latencyMs);
    const ok = response.stop_reason !== "refusal" && response.stop_reason !== "max_tokens";
    this.observe?.({ provider: this.id, model: usage?.model ?? this.model, operation, latencyMs, ok, usage });
    if (response.stop_reason === "refusal") throw new Error("Model declined the request (refusal)");
    if (response.stop_reason === "max_tokens") throw new Error("Model output truncated");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Model returned no structured output");
    try {
      const parsed = JSON.parse(text.text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") throw new Error("not an object");
      return { parsed, usage };
    } catch {
      throw new Error("Model returned invalid JSON");
    }
  }
}

function systemPrompt(workflow: WorkflowDefinition): string {
  return [
    "You are the perception and language layer of a visual support assistant. A customer is showing a problem through their phone camera.",
    "You never decide what happens next: an approved workflow and policy engine does that, using your structured output.",
    `Workflow: ${workflow.name} v${workflow.version}. Objective: ${workflow.objective}`,
    `Never suggest any of the following: ${workflow.prohibitedGuidance.join("; ")}.`,
    "Be honest about uncertainty. Saying something cannot be read is always better than guessing.",
  ].join("\n");
}

function describeIntents(intents: string[]): string {
  const meaning: Record<string, string> = {
    broadband_issue: "the customer describes a broadband, internet, Wi-Fi or router problem",
    out_of_scope: "a request this workflow does not cover (billing, contracts, moving home, other products)",
    done: "the customer has completed the requested step",
    affirm: "yes / it works / confirmation",
    negate: "no / still not working",
    cannot: "the customer is unable to do the requested step",
    wait: "the customer needs more time",
    human_request: "the customer asks for a person",
    unknown: "none of the above",
  };
  return intents.map((i) => `- ${i}: ${meaning[i] ?? i.replace(/_/g, " ")}`).join("\n");
}

/** Vocabulary for the step's required evidence, falling back to values used in its rules. */
export function vocabularyFor(workflow: WorkflowDefinition, step: WorkflowStep | undefined): Record<string, { description: string; values: string[] }> {
  const types = step?.evidence?.observationTypes ?? Object.keys(workflow.observationVocabulary ?? {});
  const out: Record<string, { description: string; values: string[] }> = {};
  for (const t of types) {
    const v = workflow.observationVocabulary?.[t];
    if (v) {
      out[t] = v;
      continue;
    }
    const values = new Set<string>();
    for (const s of workflow.steps) for (const r of s.next) if (r.when.kind === "observation" && r.when.observationType === t) r.when.values.forEach((x) => values.add(x));
    out[t] = { description: t.replace(/_/g, " "), values: [...values] };
  }
  return out;
}

export function validateObservations(raw: unknown, vocab: Record<string, { values: string[] }>): ObservationInput[] {
  if (!Array.isArray(raw)) throw new Error("Model output missing observations");
  const out: ObservationInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = typeof o.observation_type === "string" ? o.observation_type : "";
    if (!vocab[type]) continue;
    let status = (OBSERVATION_STATUSES as readonly string[]).includes(String(o.status)) ? (o.status as ObservationStatus) : "uncertain";
    let value = typeof o.value === "string" ? o.value : undefined;
    if (value !== undefined && !vocab[type].values.includes(value)) {
      value = undefined;
      status = "uncertain";
    }
    if (value === undefined && (status === "confirmed_visible" || status === "likely_visible")) status = "uncertain";
    const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : 0;
    const next = typeof o.recommended_next_action === "string" && o.recommended_next_action !== "none" ? o.recommended_next_action : undefined;
    out.push({
      observationType: type,
      value,
      observationText: (typeof o.observation_text === "string" && o.observation_text.trim() ? o.observation_text.trim() : type.replace(/_/g, " ")).slice(0, 200),
      confidence,
      status,
      requiresConfirmation: o.requires_confirmation === true || status !== "confirmed_visible",
      recommendedNextAction: next,
    });
  }
  return out;
}

/**
 * Read provider-reported token usage from a Messages API response. When a
 * server-side fallback ran, `usage.iterations` carries one entry per model
 * attempt (each billed at its own model's price), so the breakdown is kept.
 */
export function extractUsage(response: { model?: string | null; usage?: unknown }, requestedModel: string, latencyMs?: number): ModelUsage | undefined {
  const u = response.usage as Record<string, unknown> | undefined | null;
  if (!u || typeof u !== "object") return undefined;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const served = typeof response.model === "string" && response.model ? response.model : requestedModel;
  const parts: ModelUsageParts[] = [];
  if (Array.isArray(u.iterations)) {
    for (const it of u.iterations as Record<string, unknown>[]) {
      if (!it || typeof it !== "object" || (it.type !== "message" && it.type !== "fallback_message")) continue;
      parts.push({
        model: typeof it.model === "string" && it.model ? it.model : served,
        inputTokens: n(it.input_tokens),
        outputTokens: n(it.output_tokens),
        cacheCreationInputTokens: n(it.cache_creation_input_tokens),
        cacheReadInputTokens: n(it.cache_read_input_tokens),
      });
    }
  }
  const total: ModelUsage = {
    model: served,
    inputTokens: n(u.input_tokens),
    outputTokens: n(u.output_tokens),
    cacheCreationInputTokens: n(u.cache_creation_input_tokens),
    cacheReadInputTokens: n(u.cache_read_input_tokens),
    ...(latencyMs !== undefined ? { latencyMs } : {}),
  };
  // A breakdown is only needed when more than one model ran.
  if (parts.length > 0 && new Set(parts.map((p) => p.model)).size > 1) total.parts = parts;
  return total;
}
