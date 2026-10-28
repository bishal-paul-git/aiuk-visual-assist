# How to train and improve the AI

Plain answer: you do **not** retrain Claude. You improve what it is told, and you measure it. Three levers, in order of effort.

## 1. Training notes (minutes, no code outside one file)

Each workflow has `aiNotes`: short plain statements about this client's equipment and customers, for example "Customers call the internet light the globe, WAN or broadband light." They are added to the AI's instructions on every photo and message and are shown to admins on Platform → AI agents and workflows → the workflow ("AI training notes").

- Source: `lib/config/workflows/<workflow>.ts`, the `aiNotes` list. Changing it is a new workflow version.
- Write facts, not orders. The AI is already told to report only what is visible, so notes never make it guess.
- Add a note when you see the same mistake twice in QA.

## 2. The approved vocabulary and reading guides (what it may report, and how to read it)

`observationVocabulary` lists what the AI may report (for example `internet_light`: on, off, red, amber, flashing). Anything outside it is rejected and the customer goes to a person. Each item has a `guide`: exactly how to read it from a photo (labels and symbols, what each value looks like, traps such as glare, LAN vs broadband ports, single-light hubs). The guide is sent with every photo. To teach it a new thing to look for, add it to the vocabulary with a guide, and a step that needs it.

## 2b. Approved answers (what it may tell the customer)

`knowledge` is a list of question-and-answer pairs (how long a restart takes, what an amber light means, is it safe, is the camera recorded…). When a customer asks a question mid-step, the AI answers only from these, in its own words, then steers back to the step. Anything not covered: "a member of the team can help with that". Shown to admins on the workflow page.

## 3. Measure it with real photos (the real "training data")

1. Collect 30–50 photos of real routers in different light, with labels in `labels.csv`.
2. Run `npm run eval:photos`. It prints accuracy per observation and the confidence-gating result.
3. Fix the notes or vocabulary where it is wrong; run it again. Keep the numbers in `docs/PROGRESS.md`.

Every live session is also reviewed on Platform → QA: a reviewer marks what the AI saw as right or wrong. Those reviews are the list of examples to turn into notes and into new labelled photos.

## What is not done

- No fine-tuning of Claude (not offered for this use, and not needed at this stage).
- Notes are edited in code, not in a screen yet.
- Reviewer corrections are not yet exported automatically as a photo set.

## The voice

British voices, set in `lib/voice/voices.ts`: assistant Georgia K, agents Ali and Craig. If the voice service refuses one for plan reasons, the stock British voices Alice and George are used. Change a voice on Render with `ELEVENLABS_VOICE_ID`, `ELEVENLABS_AGENT_VOICE_ID` or `ELEVENLABS_AGENT_VOICE_ID_MALE`. `npm run check:deployment` speaks one test line and fails if it cannot.
