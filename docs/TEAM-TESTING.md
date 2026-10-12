# Team testing guide
## Absolute Intelligence Visual Assist

**Live version:** https://bishal-paul-git.github.io/aiuk-visual-assist/
**Report findings:** [New test feedback issue](https://github.com/bishal-paul-git/aiuk-visual-assist/issues/new?template=test-feedback.yml)

The live version runs entirely in your browser with sample data and a simulated AI. It works on desktop and phone (Chrome, Edge, Safari, Firefox). Everything you do is saved in your own browser only, so testers don't see each other's sessions. Don't enter real customer details.

---

## What we have

| Experience | Who it's for | What it does |
|---|---|---|
| **Customer Visual Assistance** | The broadband customer, on their phone | Opens from a link (no app). Privacy notice, camera, voice with captions, one instruction at a time, and a "talk to a person" button that always works. |
| **Human Agent Console** | Support agents and supervisors | Queue with wait timers. Each session shows the camera, transcript, AI summary, router-light evidence with confidence scores, workflow progress and policy-checked actions. |
| **AIUK Management Platform** | AIUK operations and client admins | Dashboard, session history with full audit, clients, teams, versioned workflows, policies, QA review, analytics, costs, integrations and system health. |

## What you can test now, and what comes with hosting

**Testable now on the live version**
- Every screen of all three experiences, on desktop and phone.
- The full router flow: consent, problem, photo checks, guided steps, line test, escalation, human takeover, close.
- Eight scripted scenarios with a simulated AI, including blurry photos and the wrong device.
- The British voice for the assistant and agents.
- Roles and permissions for admin, supervisor, agent, QA reviewer and client admin.
- Platform reports: sample session history with audit trails, workflows, policies, QA, analytics and costs (view only).

**Built, switched on once the product is hosted on a server**
- Real AI reading real photos and real speech.
- Customer on one phone, agent on another computer (online today both sides must be tabs in the same browser).
- Live video and two-way audio between customer and agent.
- Session links by SMS and email; editing and publishing workflows and policies.
- Company sign-in with Microsoft, Okta or Auth0.
- Speech recognition that works on iPhones, and connections to each client's own systems.

---

## Test plan (about 30 to 40 minutes)

### 1. Watch the guided demo
1. Open the [power cycle scenario](https://bishal-paul-git.github.io/aiuk-visual-assist/demo/?play=power_cycle_fix). The AI solves it alone.
2. Then the [line fault scenario](https://bishal-paul-git.github.io/aiuk-visual-assist/demo/?play=wan_down). The AI hands over to a human who books an engineer.
3. Repeat one on your phone and use the Customer / Agent switch.

*Look for:* narration out of step with the screens, voice cutting off, text clipped on small phones.

### 2. Be the customer
1. Open the [Agent Console](https://bishal-paul-git.github.io/aiuk-visual-assist/console/) and press **Start test session**. Pick a scenario and open the customer link in a new tab of the same browser.
2. Accept the privacy notice and choose **Use demo camera**, or allow your real camera.
3. Follow the instructions. Say or type your replies. Try **Talk to a person** part way through.

*Look for:* unclear instructions, buttons that are hard to reach one-handed, anything that would confuse a non-technical customer.

### 3. Be the agent
1. Back in the Console tab, find the session in the queue once it escalates.
2. Join, read the AI summary and evidence, then **Take over**.
3. Run an action (raise a ticket or book an engineer) and end the session.

*Look for:* whether you could help without asking the customer to repeat anything; missing information in the handover.

### 4. Look round the platform
- **Sessions:** open a sample session and read its audit trail from start to finish.
- **Workflows and Policies:** read how the router workflow and its rules are set out. Editing is switched off online.
- **QA, Analytics, Costs, Health:** check that the numbers and labels make sense.

*Look for:* wording a client admin wouldn't understand, figures that don't add up, slow pages.

### 5. Check roles and permissions
Use [Switch user](https://bishal-paul-git.github.io/aiuk-visual-assist/sign-in/) to sign in as each role below and confirm each sees only what they should.

| Role | Who it's for | Should be able to |
|---|---|---|
| AIUK admin | Our operations team | Everything, across all clients |
| QA reviewer | Our quality team | Review and score sessions; not take over live sessions |
| Client admin | A broadband client's manager | Their own company's sessions, workflows, policies and costs only |
| Supervisor | A client's team lead | Watch the live queue and help agents in their team |
| Agent | A client's support agent | Join, take over and resolve sessions |

*Look for:* a role that sees another client's data, or a button that works when it shouldn't.

---

## Reporting what you find

Use the [test feedback form](https://github.com/bishal-paul-git/aiuk-visual-assist/issues/new?template=test-feedback.yml) (a GitHub account is needed). One finding per issue, with the device and browser you used, and a screenshot if you can.
