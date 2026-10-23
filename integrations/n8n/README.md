# n8n receiver for business actions

`business-actions.code.js` is the Code node of the live n8n workflow **Visual Assist · Business Actions (Northline)**. That workflow receives the policy-checked business actions for `tnt_northline` and answers in the shape set by `docs/INTEGRATION-CONTRACT.md`.

- Webhook: `POST https://n8n.automationworkflows.io/webhook/visual-assist/actions`, one URL for every tool. The tool is read from the body.
- Auth: the Code node hashes the `X-VA-Secret` header with SHA-256 and compares it with the hash it stores. The secret itself is never kept in n8n. Wrong secret → `401`; any tenant other than `tnt_northline` → `403`.
- Idempotency: a repeated `Idempotency-Key` returns the stored result. The same key with a different body returns `409`. Keys are kept for 48 hours in the workflow's static data.
- Tools and the results they return:

  | Tool | Result | Notes |
  |---|---|---|
  | `line_test` | `no_fault` | Returns `fault_detected` when `params.simulate` is `fault`. |
  | `update_case` | `CS-…` | |
  | `create_ticket` | `TK-…` | Queue `network_l2`. |
  | `book_engineer` | `JOB-…` | Slot: next weekday, 08:00–13:00. |
  | `order_replacement_router` | `ORD-…` | |
  | `issue_account_credit` | `CR-…` | |
  | Any other tool | `failed` | Code `unsupported_tool`. |

- Every call appears under the workflow's **Executions** in n8n.

The file in this repository has the placeholder `__SECRET_SHA256__` where the live node holds the real hash, which is `sha256(INTEGRATION_SECRET_NORTHLINE)`. `tests/n8n-business-actions.test.ts` runs the node against the server's real HTTP connector, so a contract change that breaks n8n fails CI.

## Connecting it

The easy way is **Platform → Integrations**:

1. Select the tools.
2. Choose *Client API or n8n*.
3. Paste the webhook URL and the secret, and tick *Send the secret as X-VA-Secret*.
4. Press **Save**, then **Test**.

The secret is stored encrypted. Nothing has to be added in Render.

The alternative is server settings (Render → Environment). They override the page:

```
INTEGRATION_SECRET_NORTHLINE = <the secret whose SHA-256 is in the n8n Code node>
INTEGRATIONS_CONFIG = [{"tenantId":"tnt_northline","tool":"line_test","mode":"http","endpoint":"https://n8n.automationworkflows.io/webhook/visual-assist/actions","secretHeader":true,"system":"n8n"},{"tenantId":"tnt_northline","tool":"update_case","mode":"http","endpoint":"https://n8n.automationworkflows.io/webhook/visual-assist/actions","secretHeader":true,"system":"n8n"},{"tenantId":"tnt_northline","tool":"create_ticket","mode":"http","endpoint":"https://n8n.automationworkflows.io/webhook/visual-assist/actions","secretHeader":true,"system":"n8n"},{"tenantId":"tnt_northline","tool":"book_engineer","mode":"http","endpoint":"https://n8n.automationworkflows.io/webhook/visual-assist/actions","secretHeader":true,"system":"n8n"},{"tenantId":"tnt_northline","tool":"order_replacement_router","mode":"http","endpoint":"https://n8n.automationworkflows.io/webhook/visual-assist/actions","secretHeader":true,"system":"n8n"},{"tenantId":"tnt_northline","tool":"issue_account_credit","mode":"http","endpoint":"https://n8n.automationworkflows.io/webhook/visual-assist/actions","secretHeader":true,"system":"n8n"}]
```

To rotate the secret:

1. Make a new secret with `openssl rand -hex 32`.
2. Put its SHA-256 hash in the Code node and publish the workflow.
3. Update `INTEGRATION_SECRET_NORTHLINE` in Render.

Calls are refused between steps 2 and 3, so do the two steps back to back.
