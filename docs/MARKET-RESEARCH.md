# Market research: is this a real problem, who else solves it, where else it fits

Written 13 Nov 2026 from public sources (listed at the end). Many numbers come from vendors that sell remote support, so they lean optimistic. Each figure says where it comes from. **The only numbers that should drive pricing are the pilot company's own.** Section 8 lists what to ask them for.

---

## 1. Our first pilot: Home Telecom

- **Who they are:** a UK broadband, phone and mobile provider. It is part of the Telecom Acquisitions (TAL) group, where TalkTalk is reported to hold a controlling stake.
- **Sister brands in the group:** Fleur Telecom, Eclipse Broadband, Weekly Broadband, Hive Telecom, Bloomtel and OpenFibre. It also runs Earth Broadband.
- **Growth by buying customer bases:** most recently 3,000 customers from Origin Group (April 2026), plus Homeshift.
- **Several networks at once:** Openreach, CityFibre (full fibre), Virgin Media wholesale (since Oct 2024) and F&W Networks.
  - This means many router models and different fault processes per network. That is exactly where a guided "show me your router" assistant helps agents most.
- **Also sells:** SIM-only mobile, Sky TV and home energy.
- **Reputation:**
  - They claim a high Trustpilot score.
  - Independent reviews are mixed. A typical complaint is "don't use them if you want to get through on the phone".
  - Phone waiting time is a pain point we can address directly.
- **Why this pilot matters beyond one company:** if it works at Home Telecom, the same setup can be offered to the other TAL brands. Each one is the same kind of business, with the same routers and networks.

---

## 2. The problem, explained from the start

### What happens today when your broadband stops working (UK)
1. **Customer:** "My internet is down." They call, use chat, or check the app. They often wait in a queue.
2. **First-line agent (scripted):**
   - Checks for a known outage in the area.
   - Runs a remote **line test** on the network (Openreach or CityFibre).
   - Asks "what lights are on your router?", then "turn it off and on", then "check the cable is in the right socket".
3. **The hard part:** the agent **can't see** anything. The customer describes the lights wrongly ("the orange one… or red?"), plugs into the wrong port, or isn't sure which box is the router. Calls get long, and get repeated.
4. **If it isn't fixed:** the ISP books an **engineer visit** through the network company (Openreach, CityFibre, etc.).
5. **The costly bit:** if the engineer finds **no fault on the network**, the network charges the ISP. Common causes are a router problem, Wi-Fi, a cable, or the wrong socket. The ISP then either absorbs the charge or passes a fee to the customer, which leads to complaints.

### Why companies feel the pain (cost)
| Cost | Typical figure | Source quality |
|---|---|---|
| One inbound call to a UK contact centre | **£5.58–£6.26** on average (tech support calls are longer than average) | ContactBabel, independent UK benchmark |
| Average call length, UK | **7.8 min** (all sectors) | UK survey of 300 contact-centre leaders |
| One engineer visit ("truck roll") | **$150–$600** direct, over **$1,000** fully loaded | Industry/vendor estimates, no single benchmark |
| Visits where the engineer finds **no fault** | **17–25%** of visits | Industry estimates (DPS Telecom, Asentria) |
| UK "no fault found" charge passed to customers | Often **£65+** in UK ISP terms (forums show this exact fee) | Consumer reports |
| Share of ISP tech calls that are really home **Wi-Fi/equipment** | **30–60%** | Vendor surveys (RouteThis, router makers) |

### Why customers feel the pain
- Waiting on hold, then having to explain the problem again.
- Being asked to describe lights and cables they don't understand.
- Waiting days for an engineer, often having to take time off work.
- Being charged when the engineer "found nothing".
- Complaints to Ofcom: **faults, service quality and getting connected make up about 40%** of broadband complaints (Ofcom quarterly data, 2025). These are only the complaints that reach the regulator; far more go to the provider directly.

**What a customer wants:** fix it now, on the first contact, without waiting, explaining twice or taking a day off for an engineer.

**What a company wants:**
- Fewer calls, and shorter calls.
- Fewer engineer visits, especially wasted ones.
- Fewer complaints and fewer customers leaving.
- Proof of what was checked (for disputes with the network company).

### Is it a proven problem?
**Yes. Other companies already sell a solution to it, and big telecoms buy it.**
- **MEO (Portugal):** won a 2026 award for a visual AI phone line built with TechSee.
- **An Australian telecom (Wipro case study):** engineer visits saved rose from 9% to 15% on FTTC and from 11% to 23% on cable lines.
- **A large Canadian telecom:** 30% fewer engineer visits (Blitzz, vendor claim).
- **TechSee's own claims:** one telecom saved $67m a year, and another had 80% fewer repeat dispatches. These are vendor claims, so treat them as optimistic.

**Our evidence so far:** on 63 real router photos, the AI's definite readings were right 57 of 57 times. It asks for a retake when unsure rather than guessing.

---

## 3. Competitors

| Company | What they do | How we compare |
|---|---|---|
| **TechSee** (Israel/US) | The closest direct competitor. Visual AI assistant ("Sophie") plus live video for telecoms, utilities and appliances. Est. revenue $10–15m, about 60 customers (3rd-party estimates). | Enterprise-priced and US/EU-focused. We're UK-built, faster to set up, and suited to mid-size providers. |
| **SightCall** | Live video plus AR remote support for field service, insurance and telecoms. Price on request. | Mainly a human video call tool. We lead with AI that solves it first, then hand over to a person. |
| **Streem** (owned by Frontdoor) | Video support for home services, with 3D measurements. | US home-services focus. |
| **Blitzz** | Simple live video support, from about **$35 per user per month** (5-user minimum). | Cheap, but a human always has to be on the call. No AI that does the work. |
| **XMReality, VSight, Help Lightning, Zoho Lens, TeamViewer Frontline** | AR remote help, mostly for engineers and factories. | Built for technicians, not for consumers at home. |
| **RouteThis** | App that checks Wi-Fi and the home network (no camera). ISPs use it for self-help, e.g. Trustpower turned away 47% of calls (vendor claim). | Possible partner: it checks the network, we check the physical kit. |
| **Insurance:** Tractable, Verisk XactGen Capture, Opal AI, Restb.ai | Photo/video AI to assess damage for claims. | Strong in insurance claims. Our home-damage flow would compete here. Better to start where we're strongest. |
| **Contact-centre giants:** Genesys, NICE, Salesforce, Zendesk | Have chat and voice bots, and some offer video add-ons. | Their AI doesn't look at the customer's equipment. We can plug into them rather than compete. |

**Our gap in the market:**
- UK-based.
- AI that sees, speaks British English and solves the problem first.
- Hands over to a person with full context when needed.
- Branded per client.
- Set up in days.
- Priced for mid-size providers that TechSee and the big platforms don't serve well.

**Weaknesses to be honest about:**
- No track record yet.
- One-person team.
- The AI provider is in the US, which brings data transfer paperwork.
- Not yet connected to contact-centre systems.

---

## 4. Market size

- **Remote visual support software, worldwide, 2025:** analyst estimates range from **$0.5bn to $3.8bn**, growing **8–18% a year**. The range is wide because each report defines the market differently.
- **UK telecoms alone:** about 28–29 million UK broadband lines. Even small ISPs take thousands of support calls a month.
- **Rough example of what one client is worth to us:**
  - Take an ISP with 100,000 customers, and assume 1 in 10 contact support about a fault each year. That is about 10,000 contacts.
  - If half are suitable for visual help, and we charge £1 each plus a platform fee, that is about **£20–40k a year per client**.
  - Bigger ISPs (1m+ customers) are worth 10×.
  - These are illustrative only; replace them with Home Telecom's real numbers.

---

## 5. Industries and use cases

Ranked by fit: how often customers have a problem they can **show** and **fix themselves**, and what a wasted visit costs.

| # | Industry | Use cases | What it saves | Fit today |
|---|---|---|---|---|
| 1 | **Broadband / telecom** | Router lights, cables in the wrong socket, setting up a new router (installation), Wi-Fi extenders, TV box and mobile SIM setup | Calls, call time, wasted engineer visits and no-fault charges, new-customer setup calls | **Ready.** Trained and tested. |
| 2 | **Energy / utilities** | Smart meter display reading and "no signal", boiler fault codes and pressure (boiler cover), EV charger and solar inverter error lights, prepay meter top-up problems | Engineer visits for boilers, meters and chargers, meter-read disputes | **Next.** Boiler flow exists, needs testing. Gas safety rules: the AI only guides safe checks, never repairs. |
| 3 | **Home insurance** | First notice of a claim: guided photos and video of a leak or damage, with evidence captured in a set order | Assessor visits, claim time, fraud checks | **Later.** Flow exists, but strong competitors (Tractable, Verisk). |
| 4 | **Home appliances / retailers / warranty** | Washing machine and dishwasher error codes, "is it installed right", warranty claims (serial number plus damage photo) | Repair visits, returns, warranty fraud | Good fit. Needs new flows and photos. |
| 5 | **Housing associations / social housing** | Tenant repair reports ("show me the leak, the mould, the boiler") | Wasted repair visits. UK housing associations already use video calls for this. | Good fit, UK-specific, public-sector buying. |
| 6 | **Water companies** | Stopcock, leaks, meter reads | Visits | Medium. |
| 7 | **Car / EV / roadside** | Dashboard warning lights, charging cable problems | Rescue call-outs | Medium. |
| 8 | **Retail / furniture** | Damaged-on-delivery evidence, self-assembly help | Returns, refunds | Medium. |

**Where it beats a human agent:**
- It answers instantly, 24/7.
- It reads lights and labels the same way every time.
- It never forgets a step, and records proof of every check.
- It costs pence, not pounds, per conversation.
- A person is still better for unhappy, vulnerable or complex customers. That's why the handover to a person is built in.

---

## 6. Recommended focus

1. **Broadband first** (Home Telecom pilot, then the other TAL brands, then other UK mid-size ISPs).
2. **Energy second:** boiler cover and smart meters. This builds on the Home Telecom pilot, which also sells energy.
3. **Housing associations or appliances third.** Insurance only once we have a track record.

**Start with one clear use case: "My internet is down."** Add "setting up a new router" as the second, because new-customer setup calls are high-volume and easy to prove.

---

## 7. Hosting: what we use now, why upgrade, free options

| Item | Now | Why it matters | Free / cheap option | Recommendation |
|---|---|---|---|---|
| **Server** | Render Starter, $7/month, 512 MB, in **Oregon, USA** | Customer video and voice travel to the US and back. That's slower, and UK data protection prefers the UK or EU. | Moving to **Frankfurt costs nothing extra** (same Starter price). Render's free tier sleeps after 15 minutes idle, so the first customer would wait about 1 minute. Not usable. | **Move to Frankfurt on Starter ($7).** Upgrade to Standard ($25) only if the pilot gets busy (the monitoring will show it). |
| **Database backups** | Supabase (EU, Frankfurt) | If the database is lost or wrongly deleted, all conversations and settings go. Clients will ask "do you have backups?" | **Free:** a nightly GitHub job copies the database to a private, encrypted backup (I can build this). Supabase Pro ($25/month) adds automatic daily backups and one-click restore. | **Build the free nightly backup now.** Pay for Pro once there are paying clients. |

So the pilot can run for **$7/month in hosting**, plus AI and voice usage (about 3–5p per conversation).

---

## 8. What to ask Home Telecom (discovery)

Their own numbers decide the price and prove the value:
1. Customers and support contacts per month, and how many are "no internet / slow / Wi-Fi".
2. Average call length, and the cost per call (or agent cost per hour).
3. Engineer visits booked per month, how many find no fault, and what each costs them (the Openreach/CityFibre charge).
4. Router models in use per network, and their top 10 fault types.
5. How customers contact them today (phone, chat, app, text), and the contact-centre system they use.
6. Who must approve: IT security, data protection, customer service head.
7. What success looks like to them in 90 days.

---

## Sources
- Home Telecom: [ISPreview – acquires Bloomtel and OpenFibre](https://www.ispreview.co.uk/index.php/2023/09/broadband-isp-home-telecom-acquires-bloomtel-and-openfibre.html) · [joins F&W Networks](https://www.ispreview.co.uk/index.php/2023/06/isp-home-telecom-joins-fw-networks-uk-fttp-broadband-network.html) · [Virgin Media packages](https://www.ispreview.co.uk/index.php/2024/10/isp-home-telecom-uk-spotted-selling-virgin-media-fttp-broadband-packages.html) · [acquires Homeshift](https://www.ispreview.co.uk/index.php/2023/11/broadband-isp-home-telecom-acquires-homeshift.html) · [Origin Group customers](https://pressat.co.uk/releases/home-telecom-welcomes-3000-new-customers-following-acquisition-from-origin-group-66e88aefc0f33352af830d55efc0ed81/) · [ISPreview reviews](https://www.ispreview.co.uk/review/isp/home-telecom)
- Complaints: [Ofcom Q2 2025 complaints](https://www.ofcom.org.uk/phones-and-broadband/service-quality/latest-telecoms-and-pay-tv-complaints-revealed-q2-2025) · [The Register Q3 2025](https://www.theregister.com/2026/02/21/ofcom_q3_2025_complaints/)
- Call costs: [ContactBabel 2024 report](https://callcentrehelper.com/2024-contactbabel-report-232966.htm) · [Call Centre Helper](https://callcentrehelper.com/mishearing-costing-contact-centres-223887.htm) · [IT Brief UK KPIs](https://itbrief.co.uk/story/stable-call-centre-kpis-mask-growing-customer-anger)
- Engineer visits: [Blitzz – real cost of a truck roll](https://blitzz.co/blog/the-real-cost-of-a-truck-roll-and-how-to-avoid-it) · [DPS Telecom](https://snmp.dpstele.com/blog/how-to-choose-monitoring-solution-reduce-truck-rolls.php) · [Asentria](https://www.asentria.com/reduce-telecom-truck-roll-operation-costs-using-automation/) · [Field Nation](https://fieldnation.com/resources/telecom-truck-roll-costs) · [Wipro Australian telecom case](https://www.wipro.com/business-process/case-study/leading-australian-telecom-service-provider-saves-huge-costs-by-reducing-technician-truck-rolls/) · [Plusnet community – £65 charge](https://community.plus.net/t5/Broadband/65-Charge-if-my-3rd-party-router-is-faulty/m-p/1817498) · [Ofcom TRC/SFI determination](https://www.ofcom.org.uk/__data/assets/pdf_file/0019/94132/CW-01182-TRC-SFI-Final-Determination-non-confidential.pdf)
- Wi-Fi share of calls: [RouteThis – 5 ISPs](https://blog.routethis.com/how-5-isps-transformed-support-and-operational-efficiency-with-routethis) · [CircleID](https://circleid.com/posts/why-wifi-is-the-real-pain-point-for-isps-and-customers) · [Hitron](https://us.hitrontech.com/learn/how-to-reduce-wifi-support-calls/)
- Competitors: [CB Insights – TechSee alternatives](https://www.cbinsights.com/company/techsee/alternatives-competitors) · [Similarweb – TechSee](https://www.similarweb.com/company/techsee.me) · [6sense – TechSee](https://6sense.com/tech/customer-engagement/techsee-market-share) · [TechSee for Telco](https://techsee.com/resources/brochures/techsee-for-telco/) · [Blitzz pricing (Software Advice)](https://www.softwareadvice.com/contact-center/blitzz-profile/) · [Blitzz on HubSpot](https://ecosystem.hubspot.com/marketplace/listing/blitzz) · [SightCall on Capterra](https://www.capterra.com/p/170703/Sightcall/)
- Market size: [360iResearch](https://www.360iresearch.com/library/intelligence/remote-visual-support-software) · [WiseGuy Reports](https://www.wiseguyreports.com/reports/remote-visual-support-software-market) · [Market Intelo](https://marketintelo.com/report/remote-visual-support-platform-market) · [Dataintelo](https://dataintelo.com/report/remote-visual-support-platform-market) · [TechSci AR field service](https://www.techsciresearch.com/report/global-ar-remote-assistance-for-field-service-market/31011.html)
- Other industries: [Tractable property claims](https://tractable.ai/en/industries/property-claims) · [Verisk XactGen Capture](https://www.verisk.com/products/claimxperience/xactgen-capture/) · [Riverside housing video calling](https://www.riverside.org.uk/you-your-home/improvement-repairs/video-calling/) · [Sovereign repairs video tool](https://sovereign.org.uk/press-release/new-repairs-video-tool-proves-successful-for-customers) · [Centrica boiler support](https://www.centrica.com/media-centre/news/2019/ok-google-talk-to-boiler-support/) · [Financial Ombudsman boiler misdiagnosis case](https://www.financial-ombudsman.org.uk/decisions-case-studies/case-studies/couple-complain-after-wrongly-diagnosed-boiler-issue-leaves-them-without-hot-water)
