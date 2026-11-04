# Router photo evaluation

|  |  |
| --- | --- |
| Run | 2026-11-04T23:22:15.453Z → 2026-11-04T23:24:41.215Z |
| Model | claude-opus-5-5 (effort low) |
| Workflow | Router Troubleshooting v3 (wf_router_v3) |
| Photos | 67 |
| Folder | /home/runner/work/aiuk-visual-assist/aiuk-visual-assist/eval/router-photos/commons |
| Image preparation | resized to fit 960×960 px, JPEG (as the app's camera capture) |

## Summary

- Claude (claude-opus-5-5) looked at **67 photos** and answered every one.
- **Reading the lights and cables:** right on 60 of 82 items (73%). Saying "I can't tell" on a photo that really can't be read counts as right. With a sample this size the true figure is probably between 63% and 82%.
- When it gave a definite reading, that reading was right 58 of 60 (97%).
- **Guessing at things it could not see:** it gave a value for 0 of 2 (0%) items that could not be read from the photo.
- On 67 good photos it asked for an unnecessary retake 23 times (annoying, but safe).
- **Most important:** on 2 photos the assistant would have carried on using a wrong reading, which could send a customer down the wrong troubleshooting path. Review these first.
- When it said it was at least 85% sure, it was right 98% of the time (49 readings).
- **Speed and cost:** 4.1 s per photo on average (slowest 9.9 s); about £0.0135 ($0.0171) per photo, £0.90 ($1.14) for this run.

## What the assistant would do next

The workflow engine (`assessEvidence`) decides from the model's readings whether to carry on or ask for a better photo. Rows are what the photo needed; columns are what the assistant would do.

| Photo needed ↓ / assistant did → | carry on | ask for a closer photo | ask for another angle | Total |
| --- | --- | --- | --- | --- |
| carry on | 44 | 4 | 19 | 67 |

| Measure | Result |
| --- | --- |
| Right next step (exact) | 44 of 67 (66%) |
| Needed a retake → asked for one | — |
| Needed a retake → went ahead (guessed) | — |
| Asked for the right kind of retake (closer vs angle) | — |
| Good photo → unnecessary retake | 23 of 67 (34%) |
| Carried on with a wrong reading | 2 of 67 (3%) |

## Accuracy by item

| Item | Labelled | Right | Wrong | Declined but readable | Not reported | Value it could not see | Rightly declined | Accuracy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| device_identified | 57 | 37 | 2 | 18 | 0 | 0 | 0 | 65% |
| power_light | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 100% |
| internet_light | 5 | 3 | 0 | 2 | 0 | 0 | 0 | 60% |
| wifi_light | 5 | 3 | 0 | 0 | 0 | 0 | 2 | 100% |
| broadband_cable | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 100% |
| power_cable | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 100% |

Overall: 73% of 82 items. Definite readings: 60, of which 97% were right. Coverage (items that could be read and were): 75%.

## By scenario

| Scenario | Items | Accuracy |
| --- | --- | --- |
| lights | 15 | 87% |
| real_router | 29 | 93% |
| rear | 10 | 100% |
| wrong_device | 28 | 36% |

## Confidence calibration

Only definite readings count here. A well-calibrated model is right about as often as it says it is sure: readings at 90% confidence should be right about 9 times in 10. A negative gap means over-confident.

| Confidence | Readings | Average confidence | Actually right | Gap |
| --- | --- | --- | --- | --- |
| < 50% | 0 | — | — | — |
| 50–74% | 5 | 64% | 100% | +36 pts |
| 75–84% | 6 | 75% | 83% | +8 pts |
| ≥ 85% | 49 | 93% | 98% | +5 pts |

Expected calibration error (10 bins): 0.084 (0 is perfect).

## Which values get confused

Rows are the label; columns are what the model reported. "(cannot tell)" is a label of cannot_tell; "(declined)" means the model said it could not read the item; "(not reported)" means it said nothing about it.

**device_identified**

| Label ↓ / model → | (declined) | other_device | router |
| --- | --- | --- | --- |
| other_device | 18 | 10 | 0 |
| router | 0 | 2 | 27 |

**power_light**

| Label ↓ / model → | off | on |
| --- | --- | --- |
| on | 0 | 3 |
| off | 2 | 0 |

**internet_light**

| Label ↓ / model → | (declined) | off | on |
| --- | --- | --- | --- |
| on | 1 | 0 | 1 |
| off | 1 | 2 | 0 |

**wifi_light**

| Label ↓ / model → | (declined) | off | on |
| --- | --- | --- | --- |
| on | 0 | 0 | 1 |
| (cannot tell) | 2 | 0 | 0 |
| off | 0 | 2 | 0 |

**broadband_cable**

| Label ↓ / model → | connected | disconnected |
| --- | --- | --- |
| connected | 1 | 0 |
| disconnected | 0 | 4 |

**power_cable**

| Label ↓ / model → | connected | disconnected |
| --- | --- | --- |
| connected | 1 | 0 |
| disconnected | 0 | 4 |

## Speed and cost

| Measure | Result |
| --- | --- |
| Average response time | 4.1 s |
| Median / 95th percentile / slowest | 3.4 s / 8.2 s / 9.9 s |
| Tokens in / out | 193,734 / 18,429 |
| Cost per photo | £0.0135 ($0.0171) |
| Cost of this run | £0.90 ($1.14) |
| Models that answered | claude-opus-5-5 |

Costs use provider-reported token usage and the list prices in `lib/domain/pricing.ts`. GBP uses the USD_TO_GBP rate.

## Photos to review

| Photo | Checkpoint | What went wrong |
| --- | --- | --- |
| c001.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c012.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c013.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c014.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c015.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c016.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c017.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c018.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c019.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c020.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c022.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 95%) |
| c023.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c060.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c061.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c062.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c063.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c064.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c065.jpg | router_front | would ask for another angle; label says carry on; device_identified: declined, but it could be read (label other_device, model not_visible at 97%) |
| c055.png | router_front | **carried on with a wrong reading** (device_identified); device_identified: wrong (label router, model other_device at 75%) |
| c057.jpg | router_front | would ask for a closer photo; label says carry on |
| c059.jpg | router_front | **carried on with a wrong reading** (device_identified); device_identified: wrong (label router, model other_device at 85%) |
| c030.jpg | router_lights | would ask for a closer photo; label says carry on |
| c057.jpg | router_lights | would ask for a closer photo; label says carry on; internet_light: declined, but it could be read (label on, model uncertain at 55%) |
| c026.jpg | router_lights | would ask for another angle; label says carry on; internet_light: declined, but it could be read (label off, model uncertain at 40%) |
| c028.jpg | router_lights | would ask for a closer photo; label says carry on |

## How to read this report

- **Right**: the model's definite reading matches the label. **Rightly declined**: the label is cannot_tell and the model did not give a value.
- **Declined but readable**: the model said it could not read something a person could read. Safe, but it costs the customer a retake.
- **Value it could not see**: the model gave a definite value for something the label says cannot be read from the photo. This is guessing.
- **Carried on with a wrong reading**: the riskiest outcome. The workflow would branch on a wrong value without asking for another photo.
- Per-photo, per-item detail is in the CSV next to this file.
