import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = sys.argv[1]
wb = Workbook()
NAVY = "0B1B33"; BLUE = "1D5BD8"; SOFT = "E9F0FD"; YEL = "FFF4CC"; GRN = "E6F5ED"
hdr_font = Font(bold=True, color="FFFFFF"); hdr_fill = PatternFill("solid", fgColor=NAVY)
thin = Side(style="thin", color="CFD6DF")

def sheet(title, headers, rows, widths, first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(headers)
    for c in ws[1]:
        c.font = hdr_font; c.fill = hdr_fill; c.alignment = Alignment(vertical="center", wrap_text=True)
    for r in rows: ws.append(r)
    for i, w in enumerate(widths): ws.column_dimensions[chr(65+i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(vertical="top", wrap_text=True); c.border = Border(bottom=thin)
    ws.freeze_panes = "A2"
    return ws

# 1 Overview
ov = [
 ["Product", "Absolute Intelligence Visual Assist"],
 ["One line", "An AI support assistant that sees the customer's equipment through their phone camera, talks them through the fix in a British voice, and hands over to a human agent with full context when needed."],
 ["Problem", "Support agents can't see the customer's equipment. Calls are long, customers misdescribe lights and cables, and companies send engineers who find no fault (17–25% of visits). Customers wait on hold and take days off for visits."],
 ["Solution", "Customer opens a secure link (text, QR or website) → AI looks through the camera, reads lights/labels/cables, guides step by step, runs the line test → fixed, or handed to a human agent who sees everything the AI saw."],
 ["Who pays", "Companies with home equipment: broadband/telecom (first), energy (boilers, smart meters, EV chargers), home insurers, appliance makers, housing associations."],
 ["Business model", "Managed SaaS: one platform, each client company has its own space, brand, rules and staff. Setup fee + monthly platform fee + per-session usage. Start with a paid 60–90 day pilot."],
 ["First pilot", "Home Telecom (UK broadband, TAL group). Then the other TAL brands, then UK mid-size ISPs."],
 ["Goal: 3 months", "Home Telecom pilot live with real customers; measured % of calls fixed without an engineer; signed yearly contract."],
 ["Goal: 12 months", "5–10 paying clients across broadband and energy; £150k+ yearly recurring revenue; Cyber Essentials; case study published."],
 ["Company", "UK Ltd, ICO registered."],
 ["Status (14 Nov 2026)", "Render suspended the server on 13 Nov (billing) — must be resumed. Home Telecom pilot space, client staff sign-in, rating, pilot report, failure alerts and backups built and tested. Product: real AI, British voice, live voice/video handover to an agent, admin portal, audit, monitoring. Photo accuracy test: 57/57 definite readings correct."],
 ["Live server", "https://visual-assist-7viw.onrender.com"],
 ["Code", "GitHub: bishal-paul-git/aiuk-visual-assist"],
 ["Detailed docs", "docs/LAUNCH-PLAN.md, docs/MARKET-RESEARCH.md, docs/02-SYSTEM-ARCHITECTURE.md (in GitHub)"],
]
ws = sheet("Overview", ["Item", "Details"], ov, [22, 120], first=True)
for r in range(2, ws.max_row+1): ws.cell(r,1).font = Font(bold=True)

# 2 Architecture
arch = [
 ["Customer", "Customer web app (/assist)", "Camera, microphone, AI voice, step guidance, 'I saw…' feedback, consent screen, handover call", "Next.js 16 / React 19 in the phone browser, no app install", "Customer's phone", "Built"],
 ["Customer", "Entry: secure link", "Text message link, QR code, or button on client website/app", "Twilio SMS, signed links", "Server + Twilio", "Built (SMS number needed)"],
 ["Agent", "Agent console (/console)", "Queue of customers needing help, live voice/video call, full transcript, photos the AI saw, AI suggestions after takeover", "Next.js + WebRTC", "Agent's browser", "Built"],
 ["Client", "Client portal (/client)", "Client's managers: sessions, outcomes, notes, trial checklist", "Next.js", "Browser", "Built"],
 ["Platform", "Admin portal (/platform)", "Clients, brand, workflows, policies, agents, teams, integrations, QA, audit, costs, health, reset test data", "Next.js", "Browser", "Built (incl. 'Add a client', 16 Nov)"],
 ["Brain", "Session orchestrator", "Runs each conversation: steps, decisions, escalations, handover, return to AI", "TypeScript state machine (lib/session)", "Server", "Built"],
 ["Brain", "Workflow engine", "Step-by-step troubleshooting flows per client and product (router, boiler, home damage)", "lib/workflow, versioned flows", "Server", "Built"],
 ["Brain", "Policy engine", "What the AI may do alone, what needs a human, what is forbidden (e.g. engineer booking = human only)", "lib/policy", "Server", "Built"],
 ["AI", "Vision + reasoning", "Reads the photo (lights, cables, device), understands what the customer said, answers approved questions", "Claude AI (Anthropic API), strict JSON answers", "Anthropic (US)", "Built, tested 57/57"],
 ["AI", "Voice out", "One British voice for every assistant line", "ElevenLabs text-to-speech", "ElevenLabs", "Built"],
 ["AI", "Voice in", "Customer speech to text (iPhone needs server-side)", "Browser speech + ElevenLabs Scribe / Deepgram", "Browser / ElevenLabs", "Built"],
 ["Calls", "Live call relay", "Connects customer and agent when networks block direct calls", "WebRTC + TURN relay", "Relay service", "Built"],
 ["Data", "Database", "Sessions, frames (photos), config, QA results, audit", "PostgreSQL (Supabase), schema visual_assist", "Supabase, Frankfurt (EU)", "Built"],
 ["Data", "Retention", "Deletes photos and transcripts after each client's set days", "lib/privacy/retention", "Server", "Built"],
 ["Security", "Sign-in and roles", "5 roles, staff password, Microsoft/Google sign-in ready, per-client access", "OIDC, RBAC, signed sessions", "Server", "Built (client staff password for live clients)"],
 ["Security", "Audit log", "Every action recorded, exportable CSV/JSON", "lib/audit", "Database", "Built"],
 ["Integrations", "Client systems", "Line test, tickets, SMS summary, engineer booking via the client's API or n8n", "Signed HTTPS, docs/INTEGRATION-CONTRACT.md", "Client / n8n", "Built (stand-in until client API)"],
 ["Ops", "Hosting", "Runs the web app and API", "Docker on Render, Starter plan", "Render, Oregon US (move to Frankfurt)", "SUSPENDED by Render billing (13 Nov)"],
 ["Ops", "Monitoring", "Uptime every 15 min; full real-AI conversation every morning; device report per session", "GitHub Actions", "GitHub", "Built (incl. customer-failure alerts)"],
 ["Ops", "Backups", "Copy of the database every night", "GitHub Actions + pg_dump, encrypted", "GitHub", "Built (needs 2 GitHub secrets)"],
 ["Ops", "Tests", "482 unit tests, 31 browser tests, photo accuracy test against the live AI", "Vitest, Playwright", "GitHub", "Built"],
]
sheet("Architecture", ["Layer", "Component", "What it does", "Technology", "Where it runs", "Status"], arch, [12, 26, 60, 34, 26, 26])

# 3 End to end
e2e = [
 [1, "Customer", "Calls/chats the company: 'my internet is down'", "Client's phone line / chat", "—"],
 [2, "Agent or website", "Sends the secure link by text, or customer taps 'Show us the problem' on the website/app", "Entry link, Twilio SMS", "Session created (VA-reference)"],
 [3, "Customer", "Opens link, reads privacy notice, allows camera and microphone", "Customer app, consent screen", "Consent record"],
 [4, "AI", "Greets in British voice with the client's brand ('Hi, I'm the Home Telecom assistant')", "Orchestrator, ElevenLabs", "Transcript"],
 [5, "AI", "Asks to see the router; reads device, lights, cables from the camera", "Claude vision, workflow step", "Selected photos + readings"],
 [6, "AI", "Runs the line test on the network", "Integration: client API / n8n", "Tool call result"],
 [7, "AI", "Guides the fix step by step (restart, cable, socket), checks the lights again", "Workflow engine, policy engine", "Steps + outcome"],
 [8, "AI", "If fixed: confirms, sends SMS summary, asks for a rating", "Orchestrator, Twilio", "Outcome = resolved, rating"],
 [9, "AI", "If not fixed, unsafe, customer asks, or AI unsure: hands over to a person", "Policy: mandatory human reasons", "Escalation reason"],
 [10, "Agent", "Gets an alert, opens the session: sees transcript, photos, readings, line test", "Agent console", "—"],
 [11, "Agent", "Joins with live voice (and video if camera on), fixes or books an engineer", "WebRTC call, human-only tools", "Agent actions"],
 [12, "Company", "Supervisors and managers see outcomes, ratings, cost and the pilot report", "Client portal, pilot report", "Reports, CSV"],
 [13, "Platform", "Retention deletes photos/transcripts after the set days; audit stays", "Retention job", "Purge audit event"],
]
sheet("End-to-end flow", ["#", "Who", "What happens", "System part", "Data stored"], e2e, [5, 16, 70, 34, 28])

# 4 Services and costs
svc = [
 ["Render", "Web server hosting", "Starter, Oregon US", 7, "", "Free plan (Frankfurt): sleeps after 15 min idle, first visit ~1 min; fine while building", "Free plan while building; Starter ($7) when real customers start"],
 ["Supabase", "Database (EU Frankfurt)", "Current project", 0, "", "Free nightly backup via GitHub (built)", "Pro ($25) when clients pay: daily backups + restore"],
 ["Anthropic (Claude)", "AI vision and reasoning", "Pay as you go", "", 0.03, "None of equal quality", "Keep; ~1.3p per photo checked"],
 ["ElevenLabs", "British voice + speech-to-text", "Your subscription", "", 0.02, "Browser voice (robotic, not on all phones)", "Keep"],
 ["Twilio", "Text message with link", "Pay as you go", "", 0.04, "Client sends the link from their own systems", "Own UK number (~£1/month) when ready"],
 ["TURN relay", "Connects calls through strict networks", "Free tier", 0, "", "—", "Keep"],
 ["GitHub", "Code, tests, monitoring, backups", "Free", 0, "", "—", "Keep"],
 ["Domain", "Own web address", "Not yet", 1, "", "Use onrender.com address", "assist.yourcompany.co.uk (~£10/year)"],
 ["Cyber Essentials", "Security certificate buyers ask for", "Not yet", 25, "", "—", "~£300/year, before 2nd client"],
 ["TOTAL", "", "", "=SUM(D2:D10)", "=SUM(E2:E10)", "", "Monthly fixed ($/£ approx) and AI+voice+SMS per session (£)"],
]
ws = sheet("Services & costs", ["Service", "Used for", "Plan now", "Fixed per month (approx)", "Per session (£ approx)", "Free / cheaper option", "Recommendation"], svc, [18, 32, 22, 16, 16, 42, 46])
for c in ws[ws.max_row]: c.font = Font(bold=True)

# 5 Roles
roles = [
 ["aiuk_admin", "You (platform owner)", "Everything across all clients: clients, brand, workflows, policies, reset data, audit", "Staff password / company sign-in"],
 ["qa_reviewer", "Your quality reviewer", "Review sessions and AI accuracy, run photo checks", "Sign-in"],
 ["client_admin", "Client's manager (e.g. Home Telecom ops lead)", "Their own client only: brand, staff, reports, settings", "Client password / company sign-in"],
 ["supervisor", "Client's team leader", "Live queue, join any session, reports for their team", "Client password / company sign-in"],
 ["agent", "Client's support agent", "Take handovers, live call, see transcript and photos", "Client password / company sign-in"],
 ["customer", "End customer", "Only their own session through the secure link", "No account: one-time link"],
]
sheet("Roles & access", ["Role", "Who", "Can do", "How they sign in"], roles, [16, 34, 70, 34])

# 6 AI & workflows
wf = [
 ["Router / broadband troubleshooting", "Broadband / telecom", "Live, trained, tested", "Show router → read lights → cables → line test → restart → re-check lights → resolved or handover. Works without camera (describe lights, cables by touch).", "57/57 definite photo readings correct; retakes when unsure"],
 ["New router setup", "Broadband / telecom", "Built (v1, 16 Nov)", "Unbox → which socket → cables → lights → Wi-Fi name/password", "—"],
 ["Boiler fault code check", "Energy / boiler cover", "Draft flow exists", "Show boiler → read fault code and pressure → safe checks only → engineer if needed (gas safety: AI never repairs)", "Needs photo test"],
 ["Smart meter / EV charger", "Energy", "Planned", "Read display / error light → signal checks → book", "—"],
 ["Home damage evidence", "Home insurance", "Draft flow exists", "Guided photos of damage in a set order for a claim", "Needs photo test"],
 ["Appliance error codes", "Appliances / warranty", "Planned", "Read error code → safe resets → repair booking", "—"],
 ["Approved answers (knowledge)", "All", "Live", "9 approved Q&As for broadband; AI only answers from approved text", "—"],
 ["Safety rules (policy)", "All", "Live", "Engineer booking, credits, replacements = human only; factory reset = never; bystanders/children/cards avoided", "Tested in unit tests"],
]
sheet("AI & workflows", ["Workflow", "Industry", "Status", "What it does", "Accuracy / testing"], wf, [34, 22, 22, 80, 34])

# 7 Market
mk = [
 ["PROBLEM DATA", "", "", ""],
 ["UK inbound call cost", "£5.58–£6.26 per call", "ContactBabel (UK benchmark)", "callcentrehelper.com/2024-contactbabel-report-232966.htm"],
 ["UK average call length", "7.8 minutes (all sectors)", "Survey of 300 UK contact centres", "itbrief.co.uk"],
 ["Engineer visit cost", "$150–$600 direct; >$1,000 fully loaded", "Industry/vendor estimates", "fieldnation.com, blitzz.co"],
 ["Visits finding no fault", "17–25%", "Industry estimates", "dpstele.com, asentria.com"],
 ["No-fault charge to UK customers", "Often £65+", "Consumer reports", "community.plus.net"],
 ["Wi-Fi/equipment share of ISP tech calls", "30–60%", "Vendor surveys", "routethis.com, circleid.com"],
 ["Ofcom broadband complaints from faults/service", "~40%", "Ofcom quarterly 2025", "ofcom.org.uk"],
 ["Proof: Australian telecom", "Engineer visits saved up to 23%", "Wipro case study", "wipro.com"],
 ["Proof: Canadian telecom", "30% fewer visits", "Blitzz (vendor)", "blitzz.co"],
 ["Market size (remote visual support)", "$0.5bn–$3.8bn in 2025, growing 8–18%/year", "Analyst reports (definitions vary)", "360iresearch, wiseguyreports, dataintelo"],
 ["", "", "", ""],
 ["COMPETITORS", "What they do", "Price", "How we differ"],
 ["TechSee", "Visual AI assistant + video for telecom, utilities", "Enterprise, on request", "We are UK-built, faster setup, priced for mid-size"],
 ["SightCall", "Live video + AR for field service, insurance", "On request", "We lead with AI that solves it first"],
 ["Streem (Frontdoor)", "Video support for US home services", "On request", "UK focus, AI-first"],
 ["Blitzz", "Simple live video support", "~$35/user/month", "Theirs needs a human on every call"],
 ["RouteThis", "Wi-Fi/network self-help app (no camera)", "On request", "Possible partner"],
 ["Tractable, Verisk", "Photo AI for insurance claims", "Enterprise", "Strong in insurance: enter later"],
 ["Genesys, NICE, Salesforce", "Contact-centre platforms with bots", "Enterprise", "Their AI doesn't see equipment: integrate, don't compete"],
 ["", "", "", ""],
 ["INDUSTRIES (ranked)", "Use cases", "Saves", "Fit today"],
 ["1. Broadband / telecom", "Router lights, cables, new router setup, Wi-Fi, TV box, SIM", "Calls, call time, wasted engineer visits", "Ready"],
 ["2. Energy / utilities", "Smart meter, boiler codes, EV charger, solar inverter, prepay meter", "Engineer visits, disputes", "Next"],
 ["3. Home insurance", "Guided damage photos for claims", "Assessor visits, claim time", "Later"],
 ["4. Appliances / warranty", "Error codes, install checks, warranty evidence", "Repairs, returns", "Good fit"],
 ["5. Housing associations", "Tenant repairs: leaks, mould, boiler", "Wasted repair visits", "Good fit"],
 ["6. Water, cars/EV, retail", "Stopcock, dashboard lights, delivery damage", "Call-outs, returns", "Medium"],
]
ws = sheet("Market", ["Topic", "Figure / detail", "Source / price", "Link / note"], mk, [40, 52, 34, 50])
for r in range(2, ws.max_row+1):
    v = ws.cell(r,1).value or ""
    if v.isupper() or v in ("COMPETITORS", "INDUSTRIES (ranked)"):
        for c in ws[r]: c.font = Font(bold=True); c.fill = PatternFill("solid", fgColor=SOFT)

# 8 ROI calculator
ws = wb.create_sheet("ROI calculator")
ws.column_dimensions["A"].width = 52; ws.column_dimensions["B"].width = 18; ws.column_dimensions["C"].width = 60
rows = [
 ("INPUTS (change the yellow cells: Home Telecom's real numbers)", None, None),
 ("Broadband customers", 100000, "Ask Home Telecom"),
 ("Fault contacts per customer per year", 0.3, "e.g. 0.3 = 30 contacts per 100 customers"),
 ("Share of contacts suitable for visual help", 0.5, "Router/Wi-Fi/cable/no-internet issues"),
 ("Share of those customers who use the link", 0.4, "Adoption; start low"),
 ("Cost per support call (£)", 6, "UK average £5.58–£6.26"),
 ("Share of visual sessions fixed by the AI alone", 0.35, "Pilot will measure"),
 ("Engineer visits booked per year", 3000, "Ask Home Telecom"),
 ("Share of visits finding no fault", 0.2, "Industry 17–25%"),
 ("Share of no-fault visits we can avoid", 0.5, "Conservative"),
 ("Cost per engineer visit to them (£)", 90, "Ask Home Telecom (network charge + admin)"),
 ("Our platform fee per month (£)", 1500, "Pricing tab"),
 ("Our price per session (£)", 1, "Pricing tab"),
 ("", None, None),
 ("RESULTS (per year)", None, None),
 ("Visual sessions", "=B2*B3*B4*B5", ""),
 ("Calls avoided (fixed by AI)", "=B16*B7", ""),
 ("Saving from calls avoided (£)", "=B17*B6", ""),
 ("Engineer visits avoided", "=B8*B9*B10", ""),
 ("Saving from visits avoided (£)", "=B19*B11", ""),
 ("Total saving to client (£)", "=B18+B20", ""),
 ("Client pays us (£)", "=B12*12+B16*B13", "Our yearly revenue from this client"),
 ("Client net saving (£)", "=B21-B22", ""),
 ("Return on investment (x)", "=IF(B22=0,0,B21/B22)", "Above 2x is an easy sale"),
 ("Our running cost (£, ~5p/session + hosting)", "=B16*0.05+12*10", ""),
 ("Our gross margin (£)", "=B22-B25", ""),
]
for i, (a, b, c) in enumerate(rows, start=1):
    ws.cell(i,1,a); 
    if b is not None: ws.cell(i,2,b)
    if c: ws.cell(i,3,c)
    if a.isupper() or a.startswith("INPUTS") or a.startswith("RESULTS"):
        for col in range(1,4): ws.cell(i,col).font = hdr_font; ws.cell(i,col).fill = hdr_fill
    elif 2 <= i <= 13:
        ws.cell(i,2).fill = PatternFill("solid", fgColor=YEL)
    elif i >= 16:
        ws.cell(i,2).fill = PatternFill("solid", fgColor=GRN); ws.cell(i,2).font = Font(bold=True)
for i in (3,4,5,7,9,10): ws.cell(i,2).number_format = "0%"
for i in (6,11,12,13,18,20,21,22,23,25,26): ws.cell(i,2).number_format = "£#,##0"
for i in (16,17,19): ws.cell(i,2).number_format = "#,##0"
ws.cell(24,2).number_format = "0.0\"x\""

# 9 Pricing
pr = [
 ["Pilot (60–90 days)", "£1,500", "£750", "Up to 1,000 sessions included", "One flow (router), brand, staff, pilot report, weekly review"],
 ["Standard (yearly)", "£5,000–£10,000", "£1,500–£3,000", "£0.75–£1.50 per session above allowance", "Flows, AI training on their kit, integrations, reports, support"],
 ["Enterprise", "On request", "On request", "Volume pricing", "Company sign-in, dedicated server/region, SLA 99.9%, security reviews"],
 ["Our cost per session", "", "", "~3–5p AI + voice + SMS", "Plus hosting ~£10–£50/month"],
]
sheet("Pricing", ["Package", "Setup", "Monthly", "Usage", "Includes"], pr, [24, 18, 18, 36, 70])

# 10 Plan & checklist
plan = [
 ["P0", "Discovery", "Get Home Telecom's numbers (contacts, call cost, engineer visits, no-fault rate) into the ROI calculator", "You", "To do", "Email them the ROI tab questions; no meeting needed"],
 ["P0", "Discovery", "Router models per network (Openreach, CityFibre, Virgin Media) and top 10 faults", "You", "To do", "Photos of their routers' lights help most"],
 ["P0", "Discovery", "Agree success measures and pilot price in writing", "Both", "To do", "Pilot agreement"],
 ["P1", "Ops", "FIX RENDER BILLING: server suspended by Render Billing on 13 Nov; nothing is live until fixed", "You", "Blocked", "Render dashboard → Billing → update card / pay invoice → Resume service"],
 ["P1", "Platform", "Home Telecom client space: brand, router flow, safety rules, team, 5 staff accounts", "Claude", "Done", "Rename staff when you have real names"],
 ["P1", "Security", "Client staff need a client password (real customer data); hidden from demo testers", "Claude", "Done", "Password set once Render is resumed"],
 ["P1", "Product", "Customer rating at the end of each session", "Claude", "Done", ""],
 ["P1", "Product", "Pilot report page with KPIs + CSV export", "Claude", "Done", "Client portal → Results → Download report"],
 ["P1", "Product", "Live-service home page for Home Telecom staff + 'Send a customer link'", "Claude", "Done", ""],
 ["P1", "Ops", "Error alerts when real sessions fail (AI, voice, database)", "Claude", "Done", "Uses the 15-minute uptime check: emails you"],
 ["P1", "Ops", "Free nightly encrypted database backup", "Both", "Built: you add 2 GitHub secrets", "GitHub → Settings → Secrets → Actions: BACKUP_DATABASE_URL, BACKUP_PASSPHRASE"],
 ["P1", "Ops", "Move server to Frankfurt", "Both", "Skipped for now", "Not needed while building; free plan in Frankfurt is the cheap option"],
 ["P1", "Ops", "Own web address", "You", "To do", "Pick the name"],
 ["P1", "Platform", "'Add a client' screen in the admin portal", "Claude", "Done", "Platform → Clients → Add a client"],
 ["P1", "Platform", "Separate public demo address for sales (no client data)", "Claude", "Done", "Free static demo on GitHub Pages, rebuilt on every push"],
 ["P1", "AI", "Train AI on Home Telecom's routers + re-run photo test", "Claude", "Blocked", "Needs router models/photos"],
 ["P1", "Integration", "Line test via Home Telecom's API (stand-in until then)", "Both", "Blocked", "Needs their API details"],
 ["P1", "Entry", "How customers get the link (agent text / website / app)", "Both", "To decide", ""],
 ["P1", "Legal", "Privacy notice for end customers", "Claude drafts, you check", "Done", "In the product + docs/legal/PRIVACY-NOTICE.md: you check"],
 ["P1", "Legal", "DPA with Home Telecom; sub-processor list; UK data transfer addendum (Anthropic US)", "You", "To do", "Claude can draft"],
 ["P1", "Legal", "DPIA template", "Claude drafts, you check", "Done", "docs/legal/DPIA.md + SUB-PROCESSORS.md: you check"],
 ["P1", "Test", "Real iPhone + Android test", "You", "To do", "Send VA reference"],
 ["P1", "Test", "Clear test data before go-live", "You", "To do", "Admin → Settings → Reset test data"],
 ["P2", "Pilot", "Run pilot 60–90 days; weekly review; monthly AI re-training", "Both", "To do", ""],
 ["P2", "Product", "New router setup flow", "Claude", "Done", "Agents pick it in the send-link dialog"],
 ["P3", "Sales", "Website page, demo video, pitch deck, pricing sheet", "Claude", "To do", ""],
 ["P3", "Sales", "Case study from pilot", "You", "To do", ""],
 ["P3", "Security", "Cyber Essentials certificate", "You", "To do", "~£300"],
 ["P3", "Markets", "Energy flows (boiler, smart meter, EV charger) + photo tests", "Claude", "To do", ""],
 ["P3", "Platform", "Flow editor (no code) for new flows", "Claude", "To do", ""],
 ["P3", "Billing", "Monthly usage report per client for invoicing", "Claude", "To do", ""],
 ["P3", "Sign-in", "Microsoft/Google company sign-in", "Both", "Skipped for now", "Before 2nd client"],
]
ws = sheet("Plan & checklist", ["Phase", "Area", "Task", "Owner", "Status", "Notes"], plan, [8, 14, 80, 22, 16, 44])
dv = DataValidation(type="list", formula1='"To do,In progress,Done,Blocked,To decide,Skipped for now"', allow_blank=True)
ws.add_data_validation(dv); dv.add(f"E2:E{ws.max_row+50}")

# 11 Risks
risks = [
 ["AI misreads equipment and gives wrong advice", "High", "Low", "Only acts on confident readings; asks for retake; policy blocks risky actions; human handover; photo accuracy tests", "Claude"],
 ["Customer data / privacy breach", "High", "Low", "EU database, encryption, per-client isolation, retention deletes, audit log, passwords; DPA + DPIA", "Both"],
 ["AI provider outside UK (US)", "Medium", "Certain", "UK international data transfer addendum; minimise data sent; only selected frames", "You"],
 ["Pilot shows low adoption (customers don't open link)", "High", "Medium", "Agent sends link during the call; simple no-install link; measure and adjust", "Both"],
 ["Server down during a customer call", "High", "Low", "Uptime checks every 15 min, error alerts, backups; upgrade server when busy", "Claude"],
 ["One-person company (key-person risk)", "Medium", "Medium", "Docs, tests, monitoring automated; code in GitHub", "You"],
 ["Big competitor (TechSee) undercuts", "Medium", "Low", "Focus on UK mid-size, fast setup, lower price", "You"],
 ["Costs of AI/voice rise", "Low", "Medium", "Per-session price covers 10x current cost", "You"],
]
sheet("Risks", ["Risk", "Impact", "Likelihood", "How we handle it", "Owner"], risks, [50, 10, 12, 80, 10])

# 12 Decisions
dec = [
 ["13 Nov 2026", "Managed SaaS, start with paid pilots", "Platform is already multi-client; telecoms don't self-serve"],
 ["13 Nov 2026", "First pilot: Home Telecom", "Named company; multi-network ISP; group has sister brands"],
 ["13 Nov 2026", "Markets: broadband → energy → appliances/insurers", "AI trained on broadband; flows exist for others"],
 ["14 Nov 2026", "No discovery meeting first: build the pilot now, gather numbers by email", "Speed"],
 ["14 Nov 2026", "Stay on $7 Render plan in Frankfurt; free nightly backup", "No paying client yet"],
 ["14 Nov 2026", "Company sign-in (Microsoft/Google) skipped for the pilot", "Client password instead"],
 ["Earlier", "One British voice (Georgia K) for all assistant lines", "Consistency"],
 ["Earlier", "Default demo company 'X Telecom'", "Testers understand it"],
]
sheet("Decisions", ["Date", "Decision", "Why"], dec, [14, 60, 70])

# 13 Questions
qs = [
 ["0", "Render billing: can you fix it today so I can deploy? (Render → Billing → Resume service)", ""],
 ["0b", "Add the 2 backup secrets in GitHub (values are in the private file I sent)", ""],
 ["1", "Home Telecom contact: who is our champion there, and do they know about the pilot?", ""],
 ["2", "Pilot price: OK with £1,500 setup + £750/month?", ""],
 ["3", "How should customers get the link: agent texts it during the call, website button, or app?", ""],
 ["4", "Web address name (e.g. assist.<yourdomain>.co.uk)?", ""],
 ["5", "Move server to Frankfurt now (you copy the secret settings, 10 minutes)?", ""],
 ["6", "Home Telecom brand colour, logo and support phone number (I used their public details where I could)", ""],
 ["7", "Names and emails of Home Telecom staff for the pilot (agents, supervisor, manager)", ""],
]
sheet("Questions for you", ["#", "Question", "Your answer"], qs, [5, 90, 60])
wb.save(OUT)
print("ok")
