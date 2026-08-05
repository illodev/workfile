---
id: LRN-0022
title: A timing budget can be widened; the behaviour under test cannot
status: active
created: 2026-08-05
updated: 2026-08-05
---
[[LRN-0021]] says to set a clock-bound threshold from the tail of the slowest
configuration. This is the question that comes first: does the threshold need
to exist at all?

`the watcher covers the corpus, coalesces bursts and ignores the cache` wrote
forty files and asserted the watcher reported them as one batch. Nothing in
that sentence is about a clock, and yet the test failed on Windows twice in six
days on diffs that touched no code. It was asking the operating system to
deliver forty notifications inside the quiet period — a thing no platform
promises, and which [[T-0179]] measured spreading past 4842 ms on a loaded
runner.

[[T-0006]] answered it by widening the quiet period from 250 ms to a second.
That is the trap: the number being widened *was the behaviour under test*.
Widening it does not loosen the tolerance around the property, it changes the
property. A budget can be widened; a definition cannot.

**When the property is "these events group", place the events.** The stand-in
for `fs.watch` already existed, for delivering a dead handle on purpose. Given
a `deliver()` the same stand-in settles the grouping, because a loop calling it
never yields — no timer can fire between two events however loaded the machine
is. The burst is a burst by construction, the quiet period goes back to the
value the product ships, and the assertion describes the coalescer and nothing
else.

What the real filesystem is still needed for is delivery, which no stand-in can
answer for. So that became its own test, asserting what the platform is actually
responsible for — every write reported, no noise ever — and asserting nothing
about batch counts.

**The payoff is in the failures.** Two questions that used to produce the same
red line now fail different tests: grouping fails the scripted one, a lost write
fails the filesystem one. Nothing has to guess which happened.

The same reasoning kills fixed waits in negative assertions. `write the noise,
sleep 1400 ms, assert nothing arrived` passes while the event is still in
flight. Writing a real file *after* the noise, in the same directory, and
waiting for that one anchors the assertion to an event that must arrive: once
it is reported, whatever the platform had to say about the noise has already
been said. The old test spent 8.1 s on sleeps of that kind; the pair that
replaced it runs in 1.56 s.
