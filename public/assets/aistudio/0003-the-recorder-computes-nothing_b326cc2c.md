# The recorder computes nothing but the angles

Every number in a frame is a value the game reported, except three: `yaw`, `pitch` and
`roll`. Those are derived from the car's `look` and `up` basis vectors, because the site
cannot be handed a quaternion it does not know how to draw and every reader would derive
the same three angles anyway.

Everything a comparison might want beyond the raw fields — grip, balance, braking points,
deltas, time gained — is the reader's job. The recorder has no opinion, which means it
cannot be wrong about physics and cannot force the site to recompute something because the
recorder's formula improved.

The same rule explains what is *not* in the list:

- no unit conversion (speed stays `speedKmh`, temperatures stay Celsius, times stay
  milliseconds — the game's units are the contract);
- no smoothing, no filtering, no resampling: a raw packet compared against a raw packet is
  the only comparison that does not depend on a second implementation;
- no `load` (wrong for remote cars), no `brakeBias`/DRS/KERS/live validity (physics-only);
- the tyre's left/right tread columns are written as `tyreInside`/`tyreOutside`, with no
  side swap. A swap is a second place to get it wrong, and two recordings of the same car
  are unaffected by it.

The angles are documented rather than assumed: `yaw` is 0 facing +Z and increases
clockwise seen from above, `pitch` is positive nose-up, `roll` is positive leaning right.
Their precision is limited by `look`/`up` being normalised floats, which is well below
what a trace needs.

## Consequences

- A reader that wants a derived metric must derive it, and can change the formula without
  a new recording.
- Recording a value the game only exposes as a derived field (for example the normalised
  slip) is still allowed — the value is recorded as reported, not recomputed.
- The formula for the three angles lives in exactly one function each, in
  `src/channels.lua`, and is covered by the offline checks.
