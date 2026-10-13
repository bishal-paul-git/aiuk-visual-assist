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

1. Open the **[Agent Console](https://bishal-paul-git.github.io/aiuk-visual-assist/console/)** press **Start test session**, then **Create session**.
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
