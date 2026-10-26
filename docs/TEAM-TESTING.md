# Visual Assist: working product prototype test (simulated AI), 15 minutes

**Open:** https://bishal-paul-git.github.io/aiuk-visual-assist/test/ (this guide, as a page on the live site)
**Report anything odd:** [Send feedback](https://github.com/bishal-paul-git/aiuk-visual-assist/issues/new?template=test-feedback.yml)

Works on any phone or computer. Nothing to install, no login.

The AI's replies and what it "sees" are scripted for each test scenario. It does not analyse your camera image yet. This test checks the journey, screens and handover, not the AI's accuracy. All data is sample data; please don't enter real customer details.

---

## 1. Watch it (5 min)

Open **[the demo](https://bishal-paul-git.github.io/aiuk-visual-assist/demo/)** and pick a scenario. It plays the customer's phone and the agent's screen side by side.

- **Power cycle:** the AI fixes the problem on its own.
- **Line fault:** the AI hands over to a human agent.

Try one on your phone as well.

## 2. Try it yourself (5 min)

1. Open the **[Agent Console](https://bishal-paul-git.github.io/aiuk-visual-assist/console/)**, press **Start test session**, then **Create session**.
2. Press **Open customer view**. It opens in a new tab: you are now the customer.
3. Press **Agree and continue**, then **Use demo camera**, and follow the instructions. Press **Human help** at any point to ask for a person.
4. In the first tab, press **Open in agent console** (it opens another tab). Press **Join session** (**Join** on a phone), then **Take over**. You are now the agent. Try a message, an action and **End**.

## 3. Look around (5 min)

Open the **[Platform](https://bishal-paul-git.github.io/aiuk-visual-assist/platform/)** and click through the menu. Use **[Switch user](https://bishal-paul-git.github.io/aiuk-visual-assist/sign-in/)** to see different roles: agents and supervisors work in the console, administrators and QA reviewers in the platform. In this demo every role sees sample data from all clients; real per-client separation is in the full version.

---

## What to tell us

Anything that is **broken**, **confusing** or **slow**, plus any ideas. Say which device you used. A screenshot helps.

## Good to know

- The customer and agent must be **tabs in the same browser** for now. Phone-to-laptop, real AI, live video and SMS links come once the product is on a server.
- Platform reports show sample sessions and won't include the sessions you create. Only Live Sessions and the Agent Console show yours.
- To start a test session, use an agent or the platform administrator. Client admins and QA reviewers don't see the **Start test session** button.
- Editing workflows and policies is switched off in this online version.
- Feedback needs a free GitHub account. No account? Email or message your feedback instead.
- Your test sessions are saved in your browser only.


---

## Trying it as a client (client portal)

This is what a client tester sees. It is separate from the admin portal that Absolute Intelligence staff use.

1. Open the server's address. The front page describes the product. Press **Try it now**.
2. The login already has the email and password filled in. Press **Log in**.
3. Choose how the AI sees the problem, then press **Start the conversation**:
   - **Real AI with a real camera** (when switched on): use your phone, and show your own router.
   - **Guided example**: no camera needed; the AI's answers are pre-written so you can see every outcome.
4. You now play both sides. A banner always says whose turn it is and what to do next.
   - **Be the customer**: press **Open customer view**, ideally on your phone (or copy the link to it). Tap **Agree and continue**, allow the camera and microphone, then talk or type, and show the problem.
   - **Be the human agent**: press **Open agent screen**. When the customer taps **Human help**, press **Join session**, then **Take over**. You see their camera live, can message them, and press **End**, then **Resolved**, to finish.
5. Open **Sessions** to see the conversation, what the AI saw and how sure it was, and any business actions. **Results** shows the numbers.

Things worth trying: type instead of speaking; show something blurry and see the AI ask for a better view; ask for a person; step in as the agent without being asked, then press **Return to AI**. If the customer asked for a person, a person finishes it, so Return to AI is greyed out with the reason.

Only Northline has a published workflow today, so only Northline can start conversations. Other clients see their portal and are told there is nothing to try yet.

**Settings for the owner** (Render, Environment). All optional:

| Setting | Default | What it does |
|---|---|---|
| `TRIAL_LOGIN_EMAIL` | `demo@northline.example` | The trial email |
| `TRIAL_LOGIN_PASSWORD` | `VisualAssist-Trial` | The trial password |
| `TRIAL_PREFILL` | on | Set `0` to stop filling the login in. Testers must then be told the password |
| `TRIAL_MAX_SESSIONS_PER_DAY` | `40` | How many conversations the trial account may start per day. Guards AI and text-message spend |
| `STAFF_SIGNIN_PASSWORD` | not set | When set (8+ characters), the staff and team person-pickers on the sign-in pages ask for it. Recommended before the address is shared widely |
