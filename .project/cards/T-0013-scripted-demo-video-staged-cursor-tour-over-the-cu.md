---
id: T-0013
title: "Scripted demo video: staged cursor tour over the curated workspace"
status: done
type: feature
priority: medium
area: docs
created: 2026-07-30
updated: 2026-07-30
scope: [scripts/demo-video.mjs]
---
## Activity

- 2026-07-30 17:45Z claude-fable-e341b469 · claimed
- 2026-07-30 17:45Z claude-fable-e341b469 · claimed
- 2026-07-30 17:54Z claude-fable-e341b469 · doing → done
- 2026-07-30 17:54Z claude-fable-e341b469 · released
- 2026-07-30 18:10Z claude-fable-e341b469 · claimed
- 2026-07-30 18:10Z claude-fable-e341b469 · released
- 2026-07-30 18:11Z claude-fable-e341b469 · next → done

## Notes

- 2026-07-30 17:54Z claude-fable-e341b469 — scripts/demo-video.mjs records a 34s scripted tour over the curated corpus: injected pointer (recordings never capture the OS cursor), click pulses, muted-audience captions, six scenes (flow with live claims, inspector, timeline, history, palette search across collections, CTA), webm converted to H.264 mp4 via ffmpeg. Scenes verified frame by frame.
- 2026-07-30 18:10Z claude-fable-e341b469 — v2: injected browser-window frame (traffic lights + workfile.illodev.com pill) over a gradient stage, macOS-style pointer with click pulse, and CSS camera pushes on the framed window — the closest shot is the presence bar with both agent locks at 2.2x. transform-origin 0 0 was the one-line trap: the zoom math assumes it. 42s, frames verified per scene.
