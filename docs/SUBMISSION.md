# AstroCare - submission

## One-line summary

AstroCare learns every astronaut's personal baseline. It flags what is unusual *for them*, catches slow drifts before they become problems, and has a flight-surgeon handover ready before the 20-minute Earth link is.

## Description (for the project page)

On a Mars mission, a flight surgeon is up to 22 minutes away, one way. Crew need software that turns raw measurements into clear, explainable signals, and that works offline.

AstroCare monitors with four transparent layers:
1. **Reference ranges** from AHA, MedlinePlus and CDC.
2. **A personal baseline** for each astronaut: the robust median ± MAD of their first 10 check-ins. Fit astronauts aren't average patients.
3. **Trend detection** using Theil-Sen slopes, which catches sleep eroding during isolation before any single night looks abnormal.
4. **Live model bands.** Gradient-boosted models trained on 8,000 real PhysioNet ICU stays run in the browser. They predict each next wearable reading with a split-conformal 90% expected range, verified at about 90% coverage on 4,000 held-out stays.

Every alert says which rule fired and cites its source.

Real NASA data drives the design. The Inspiration4 (OSD-575) explorer shows four civilian astronauts' blood chemistry before and after flight. Each started from a different baseline and changed differently, which is exactly why AstroCare compares people to themselves.

NASA's five hazards map directly to features:
- **Isolation:** sleep and mood trends.
- **Distance:** an offline-first app and a delay-aware SBAR handover.
- **Gravity:** blood-pressure baselines and orthostatic detection.
- **Hostile environment:** fever detection.
- **Radiation:** a mission dose planner using measured MSL RAD and Chang'e 4 rates against NASA's 600 mSv limit, which also states plainly that vital signs cannot measure radiation.

## Challenge resources used

| Resource | Where |
|---|---|
| NASA - 5 Hazards of Human Spaceflight | Space environment page: each hazard mapped to an AstroCare feature |
| NASA - Risks of Human Spaceflight | Trend and symptom findings, emergency context |
| NASA - Ongoing HRP Research (ARCHeR, Standard Measures) | Sleep and wellbeing monitoring, consistent check-ins, personal baselines |
| CSA - Monitoring radiation for astronaut health | Radiation planner; "vitals don't measure radiation" design boundary |
| CSA - Why do we conduct science in space? | Offline and delay design; Space-to-Earth application |
| NASA OSDR OSD-575 (Inspiration4) | Spaceflight biomarker explorer |

## 3-minute demo script

| Time | Action and talking points |
|---|---|
| 0:00-0:20 | **Problem.** On the way to Mars, the flight surgeon is up to 22 minutes away, one way. Point at the top bar: mission elapsed time and the countdown to the next ground contact. |
| 0:20-0:50 | **Mission control.** Nobody typed anything: the daily brief and action queue were generated automatically. Three of four crew need attention. Point at the live crew telemetry: Mei's 38.8 °C is the only red on screen. The interface is greyscale on purpose (control-room HMI practice), so colour always means something. |
| 0:50-1:15 | **Mei Sakamoto.** Her heart rate of 82 is normal for most people but 7 SD above her own baseline. Personal baselines catch what population thresholds miss. Her SBAR handover is already queued for the next contact window. |
| 1:15-1:40 | **Telemetry.** Inject orthostatic stress: heart rate jumps outside the model's 90% expected range and an alarm appears in the bell. The model was trained on 8,000 real ICU stays, runs in the browser, and the range holds about 90% coverage on held-out data. Scheduled workouts are detected from heart rate and logged without anyone touching the app. |
| 1:40-2:05 | **Tomas Ilunga.** His sleep is eroding (trend detection) and his reaction-time test is 26% slower than his own baseline: isolation and fatigue, measured objectively. Invite a judge to take the 1-minute test. |
| 2:05-2:25 | **Check-in and supplies.** The check-in opens pre-filled from the wearable. The medical kit projects that painkillers run out on day 119 of 210, with no resupply on Mars. |
| 2:25-2:45 | **Inspiration4 data.** Real NASA data: four astronauts, four different baselines; glucose up 24% the day after landing. That is why AstroCare compares people to themselves. |
| 2:45-3:00 | **Close.** Automatic, explainable, offline-first and evidence-cited. Next step: recalibrate on analog missions (HERA, Antarctica) with flight medicine. |

## 60-second pitch

Far from Earth, a number alone isn't enough. A heart rate of 82 is fine for most people, but for an astronaut who rests at 60 it's a signal. AstroCare learns each crew member's own baseline. It flags what's unusual for them, catches slow drifts like sleep eroding during isolation, and streams live vitals against an expected range predicted by models trained on 8,000 real ICU stays, with verified 90% coverage. Every alert explains itself and cites its source. Real NASA Inspiration4 data shows why this matters: four astronauts, four different baselines, four different responses to flight. And when something goes wrong 20 light-minutes from help, AstroCare has the flight-surgeon handover ready before the link is. It's offline-first, open, and honest about its limits. Next step: recalibrate on analog-mission crews with NASA flight medicine.

## What we claim and what we don't

**We claim:**
- explainable monitoring logic, with the demo stories verified by tests;
- real-data model training with a held-out test set;
- browser-exported models whose predictions match scikit-learn;
- conformal coverage measured on held-out data;
- real NASA spaceflight data visualised.

**We don't claim:**
- diagnosis;
- clinical validation;
- astronaut-calibrated thresholds;
- NASA endorsement;
- treatment guidance.
