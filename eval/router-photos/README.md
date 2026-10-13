# Router photo evaluation

This folder is a template for testing how well the assistant reads **real router photos** before a pilot.

You take 30–50 photos of a real router, write down in a spreadsheet what each photo shows, and run one command. The tool sends each photo to Claude the same way the app does during a call, compares Claude's answers with yours, and writes a report that says, in plain English:

- how often it read each light and cable correctly
- how often it rightly asked for another photo, and how often it guessed instead
- whether it is right as often as it says it is sure
- which values it mixes up (for example amber and red)
- how long each answer took and what it cost

Nothing in this folder is sent anywhere except to Claude, and the photos are never added to git (see [Keeping photos private](#keeping-photos-private)).

---

## 1. Take the photos

**You need:** a broadband router (ideally the models your customers actually have), a phone, a lamp or torch for glare, and about an hour.

**Use the phone's normal camera.** No zoom, no filters, no Live Photos. On an iPhone, set *Settings → Camera → Formats → Most Compatible* so photos save as JPEG (the tool cannot read HEIC files). The size of the photos does not matter: the tool shrinks them to the size the app uses.

Aim for **30–50 photos** spread across the situations below. Vary the room, the lighting (daylight, evening lamp, ceiling light), the distance and whether you hold the phone upright or sideways. A mix of router models is better than 50 photos of one router.

| Situation | How to set it up | How many | Checkpoint |
| --- | --- | --- | --- |
| **Normal lights** | Router working. Close-up of the front so every light is clear. | 6–8 | `router_lights` |
| **Internet off** | Unplug the broadband cable at the back and wait until the internet light goes out. Photograph the front. | 4–5 | `router_lights` |
| **Internet red or amber** | Many routers show red or amber while the line is down (just after unplugging or restarting). Photograph whichever colour you see. | 4–5 | `router_lights` |
| **Loose cable** | Turn the router round. Pull the broadband cable half out of its socket. Also take a few with every cable pushed in properly. | 4–6 | `router_rear` |
| **Glare** | Shine a torch or lamp so its reflection sits over some of the lights. | 4–5 | `router_lights` |
| **Blurry** | Move the phone while you take the photo. | 3–4 | `router_lights` |
| **Too far away** | Photograph the router from across the room so the lights are tiny. | 3–4 | `router_lights` |
| **Wrong device** | Photograph a TV box, smart speaker or games console instead of the router. | 3–4 | `router_front` and `router_lights` |
| **Card in frame** | Put a card next to the router: an expired or cancelled bank card, or a sample card. **Never a live card.** | 2–3 | `router_lights` |
| **Router front** | The whole router from the front, at a normal distance. | 3–4 | `router_front` |

**Do not photograph** people, children, computer screens, letters, or anything with an address or account number on it (except the deliberate card test above).

## 2. Name the photos

Copy the photos into one folder: this folder, or any folder on your computer. Give each one a short name made of lower-case letters, numbers and hyphens that says what it shows, for example:

```
lights-normal-01.jpg
lights-internet-amber-02.jpg
lights-glare-03.jpg
rear-cable-loose-01.jpg
front-tv-box-01.jpg
```

The names only need to be unique; the tool does not read meaning from them.

## 3. Label the photos

Open `labels.csv` in Excel, Google Sheets or Numbers. There is **one row per photo**. Delete the two example rows first.

| Column | What to write |
| --- | --- |
| `file` | The photo's file name exactly, e.g. `lights-glare-03.jpg` |
| `checkpoint` | Which step of the call the photo is for (see the next table) |
| `device_identified` | `router` or `other_device` |
| `power_light` | `on`, `off` or `amber` |
| `internet_light` | `on`, `off`, `red`, `amber` or `flashing` |
| `wifi_light` | `on` or `off` |
| `broadband_cable` | `connected` or `disconnected` |
| `power_cable` | `connected` or `disconnected` |
| `expected_action` | What the assistant should do with this photo: `proceed`, `request_closer_view` or `request_another_angle` |
| `scenario` | Optional. The situation from step 1, e.g. `glare` or `too_far`. Several can be separated with `;`. The report gives an accuracy for each one. |
| `sensitive_content` | Optional. `payment_card` if a card is visible, `person` if a person is, and so on; `none` if nothing private is visible. Leave it empty to skip this check. |
| `notes` | Optional. Anything useful for whoever reads the report. |

**Which columns to fill for each checkpoint.** Leave the other light and cable columns empty.

| Checkpoint | Fill in |
| --- | --- |
| `router_front` — the whole router from the front | `device_identified` |
| `router_lights` — a close-up of the front lights | `power_light`, `internet_light`, `wifi_light` |
| `router_rear` — the cables at the back | `broadband_cable`, `power_cable` |
| `router_lights_recheck` — the lights again after a fix | `power_light`, `internet_light` |

**Label what you can see in the photo, not what you know.** If a careful person looking only at this photo could not tell whether a light is on (glare, blur, too far, the wrong device), write `cannot_tell`, even if you know the light was on when you took it. A good assistant should say it cannot tell rather than guess, and the report counts that as right.

**Choosing `expected_action`.** The assistant asks the customer to "move a little closer and hold steady" or to "try a different angle, avoiding glare".

- `proceed`: every item for the checkpoint can be read from this photo. This includes a clear photo of the wrong device at `router_front` (`device_identified` = `other_device`). The assistant can decide from that photo that it is not the router.
- `request_closer_view`: the photo is blurry or taken from too far away.
- `request_another_angle`: glare, the wrong side of the router, the wrong device when the lights were asked for, or something in the way.

When you save, keep the name `labels.csv` and the CSV format. Excel may ask whether to keep the format: choose **Keep current format**. Commas or semicolons both work.

## 4. Run the evaluation

This needs someone who has the project set up on their computer (`npm install` done) and an Anthropic API key.

**First, check the labels.** This needs no API key and costs nothing:

```
npm run eval:photos -- --dir path/to/your/photo-folder --dry-run
```

It lists any mistakes with their line numbers, such as a misspelt value, a photo with no row, or a row whose photo is missing. Fix them and run the check again until it says **Dry run OK**.

**Then run it for real:**

```
export ANTHROPIC_API_KEY=sk-ant-...
npm run eval:photos -- --dir path/to/your/photo-folder
```

It prints a line for each photo as it goes and finishes with a summary. The full report is written to `reports/` inside the photo folder as two files:

- `photo-eval-<date>.md`: the readable report. Open it in any Markdown viewer, or paste it into a document.
- `photo-eval-<date>.csv`: one row per photo and item, for filtering mistakes in a spreadsheet.

Useful options:

| Option | What it does |
| --- | --- |
| `--checkpoint router_lights` | Only test the photos labelled for one checkpoint |
| `--limit 5` | Only the first 5 photos. Good for a quick, cheap first try. |
| `--model claude-sonnet-5-5` | Test a different model (the default is the one the app uses) |
| `--effort medium` | Let the model think harder. The app uses `low`, so compare with care. |
| `--out reports/opus-run-1` | Choose where the report goes (`.md` and `.csv` are added) |
| `--concurrency 1` | Send one photo at a time, if you hit rate limits |

**Cost.** Each photo is one model call, the same as one photo during a live call. At list prices that is roughly 1–2p per photo, so a 50-photo run costs well under £1. The report shows the actual cost from the token usage Claude reports.

## 5. Read the report

Start with the **Summary** at the top. The numbers that matter most for a pilot:

1. **Carried on with a wrong reading.** The assistant accepted a wrong value and would have sent the customer down the wrong path. Aim for zero, and look at every photo listed under *Photos to review*.
2. **Asked for another photo vs went ahead anyway.** On photos that needed a retake, did it ask?
3. **Unnecessary retakes.** These are safe, but annoying for customers if they happen often.
4. **Confidence calibration.** When it says it is 85% sure or more, is it right about that often?

With 30–50 photos each percentage is a first indication, not a guarantee. The report shows a likely range for the main accuracy figure. Re-run with the same photos whenever the model, the prompts or the workflow change, and compare the reports.

## Keeping photos private

- `.gitignore` in this folder ignores everything except `README.md`, `labels.csv` and the `.gitignore` itself. Photos and reports placed here are never committed.
- Reports contain photo names and Claude's descriptions of each photo, so treat them like the photos.
- Store the photo folder in your organisation's approved shared storage, not in email or chat, and delete it when the evaluation is finished.
- Photos are sent to Anthropic's API for analysis under your organisation's API terms, as they would be in a live call.
