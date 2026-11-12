# The recording is what the game reported

For a car that is not yours, Assetto Corsa's client does not run physics. CSP marks the
car `physicsAvailable = false`, `ac.getCarPhysics` returns nothing, and fields such as
`brakeBias`, `drsActive`, `kersCharge`, `isLapValid` and `lapCutsCount` are absent. What
the client has is the other driver's position packet and whatever the netcode extrapolates
from it. Some tyre fields (`tyreWear`, `tyrePressure`, `slipRatio`, `loadK`, …) *are*
present for remote cars — the game sends them — but nothing in the SDK promises they are
measurements rather than estimates derived from the packet.

So the archive records every field the client has and labels the wheel block
`provenance: "netcode"` in the manifest. It does not filter them out, and it does not
present them as physics.

## Why not filter

A channel that is wrong today may be right in a later build, and the only way to find out
is to have recorded both and compared. Dropping the tyre block would make that comparison
impossible and would also throw away the fields that are genuine (pressures and wear come
from the car's own setup and are sent). The label tells the reader to distrust the block
until a session proves otherwise; the `dump_car.json` entry shows what the build really
exposed.

## Why not record the physics-only fields as null

They *are* recorded as null in `dump_car.json`, deliberately: the dump asks for them so
the absence is evidence. In the stream they are not part of the channel list, because a
channel that is always `null` in every recording of every remote car costs a key per frame
and teaches the reader nothing. The dump is where "is it really not there?" is answered.

## Consequences

- The site must not draw another driver's tyre temperatures as if they were measured. The
  manifest says which block is netcode; the site is expected to read it.
- If CSP starts exposing physics for remote cars, the same channel names become better
  data with no format change — the provenance note is the only thing to revisit.
- `ac.StateWheel.load` is documented as wrong for remote cars and is never recorded;
  `loadK` is (`docs/adr/0003`).
