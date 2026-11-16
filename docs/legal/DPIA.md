# Data protection impact assessment (DPIA): template for a client

> **Draft template.** The client, as controller, completes and owns it; we fill in the technical parts. Sections follow the ICO's DPIA structure. Text in [brackets] is for the client to complete.

## 1. The need for a DPIA

The service processes camera images and voice from inside customers' homes, uses AI to interpret them, and transfers data outside the UK. The ICO lists innovative technology combined with other criteria, and large-scale processing, as likely high risk. A DPIA is therefore recommended before launch.

## 2. Description of the processing

- **Nature:**
  - A customer opens a secure link and agrees to the notice. They share their phone camera and microphone.
  - Still frames are sent to an AI model, which reports what is visible (for example, router lights).
  - An approved workflow decides the next step.
  - Staff can join live.
  - Records are kept for the retention period.
- **Scope:**
  - Data: images of equipment (incidentally, parts of the home), voice, transcript, phone number or email for the link, session metadata, and staff actions.
  - Volume: [expected sessions per month].
  - Area: UK customers.
  - Retention: photos [30] days, transcripts [90] days, audit records [2] years. These can be set per client.
- **Context:**
  - The customers asked for help.
  - Some may be vulnerable.
  - Children or other people may appear in the camera view.
  - Camera use is optional: voice only, or a person instead.
- **Purposes:** to resolve the customer's problem, hand over to staff, keep a record of the help, and check quality.

## 3. Consultation

[Customer service lead, IT security, DPO, a sample of customers or customer panel feedback, the processor (Absolute Intelligence).]

## 4. Necessity and proportionality

- **Lawful basis:** legitimate interests (a legitimate interest assessment is attached), and contract where the person is a customer.
- **Data minimisation:**
  - Only still frames needed for each step are sent to the AI. There is no video recording.
  - A live preview is relayed only while a person is watching.
  - The camera is optional.
- **Transparency:** a privacy notice is shown before the camera starts, and the version is recorded with the consent.
- **Rights:** access, correction, deletion and objection are handled via [client contact]. Sessions are findable by their reference.
- **Processors:** a DPA with Absolute Intelligence; sub-processors are listed in `SUB-PROCESSORS.md`. International transfers are covered by the IDTA or the UK–US data bridge.

## 5. Risks and measures

| Risk | Likelihood / severity (before) | Measures in the product | Residual |
|---|---|---|---|
| Camera captures people, children, ID or bank cards | Possible / significant | Notice asks customers to keep these out of view; the AI is told to avoid and flag sensitive content; policy can require blurring or escalation; only step frames are kept | Low |
| AI misreads equipment and gives wrong guidance | Possible / minimal–significant | Confidence thresholds; the AI must say "can't read it" rather than guess; 3 tries then a person; only approved low-risk steps; risky actions are human only or denied; photo accuracy tests before each release | Low |
| Data seen by the wrong client or staff | Remote / severe | Every query scoped to the client; role-based access; private-client staff hidden from demo sign-in; client passwords; audit trail of every access and export | Low |
| Data kept too long | Possible / significant | Retention set per client and shown in the notice; automatic deletion [confirm the schedule] | Low |
| Transfer outside the UK (AI and voice providers) | Probable / significant | Provider DPAs; IDTA or UK–US data bridge; no training on API data | Low–medium |
| Vulnerable customer struggles with the AI | Possible / significant | Ask for a person at any time; voice-only and no-camera paths; staff see everything done so far | Low |
| Security breach | Remote / severe | TLS everywhere; signed session links; secrets sealed and stored only on the server; encrypted backups; failure alerts; [penetration test before scale] | Low–medium |

## 6. Sign-off

| Item | Name / date | Notes |
|---|---|---|
| Measures approved by | | |
| Residual risks approved by | | If high, consult the ICO before processing |
| DPO advice | | |
| Review date | | At least yearly, or when the AI model or flows change materially |
