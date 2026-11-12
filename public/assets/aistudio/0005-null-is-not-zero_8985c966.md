# Null is not zero

The game reports a field, or it does not. `ac.StateWheel.toeIn` on a remote car may be
`nil`; `ac.StateCar.resetCounter` may legitimately be `0`; `tyreWear` may be `0` for a new
tyre or `nil` because the build does not send it. A recorder that falls back to zero turns
all four cases into "0" and destroys the one distinction the app exists to measure.

So: a value the game did not report stays `nil` through the sampler, becomes `null` in the
JSON, and is counted as absent in the coverage. A measured zero stays `0`. In Lua, `nil`
does not survive in a table, so the encoder has a sentinel — `json.absent` — for the cases
where the key must appear and the value must be null (`json.nil` is a syntax error, which
is how the sentinel got its name).

The same rule applies to derived verdicts. A remote car does not send `isLapValid`, so a
live lap's validity in the stream is unknown, not "valid". The one pair it does send at the
lap boundary, `isLastLapValid` and `lastLapCutsCount`, is written into the `lap` event; if
the build omits them too, the event carries `null` rather than dropping the keys.

## Consequences

- Every reader must decide what `null` means for each channel. The schema allows `null` on
  optional fields, and `docs/schema.md` says what absence means.
- The coverage table is the map of absence: `0/120` is a channel the game never sent,
  `119/120` is one reading missing. Without the null rule the table would be meaningless.
- A consumer that wants "0 if missing" can say so; a consumer that needs to know which
  fields were real cannot recover that from zeros.
- The car dump writes `null` for physics-only fields it explicitly probed, so "the field
  does not exist" is visible instead of looking like a key that was never asked for.
