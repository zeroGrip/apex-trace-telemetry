--[[
    The channel list: one table that drives sampling, coverage and the frame line.

    Why one list and not three. The frame writer needs an order, the coverage counters
    need an identity per channel, and the debug dump needs to know what was asked for.
    Written three times those drift: a channel gets added to the frame and not to the
    coverage, and the one question the app exists to answer -- "what is the game not
    telling me?" -- silently lies. So a channel is declared once, here, and everything
    else walks this list (docs/adr/0006).

    A channel is a `key` (the JSON name), a `kind` (how the value becomes text) and,
    when the field is not just `car[key]`, a `read`. The plain case carries no reader:
    src/channels.lua fills in `object[key]`, which is one closure per channel built once
    at load, not per frame. A reader returns the raw field, or nil when the build does
    not report it. No fallbacks, no zeroes: a missing field becomes `null` in the file
    and stops counting in the coverage (docs/adr/0005).

    `source` says where the number came from. `reported` is the game's own state for
    the local car. `netcode` is a field the client received or extrapolated for a
    remote car -- the SDK does not promise those are measurements, so the site is told
    which ones to distrust until a real session proves them.

    Pitfall, kept visible on purpose: `ac.StateWheel.load` is documented as wrong for
    remote cars ("use .loadK if you want a rough but stable estimation instead"), so
    `load` is deliberately absent from this list. `tyreInside/OutsideTemperature` are
    the tyre's left and right tread columns, not the car's sides; they are written as
    the API reports them, no swap (a comparison between two recordings of the same car
    is unaffected, and a swap here would be a second place to get it wrong).
]]

local platform = require('src.platform.ac')

local M = {}

local RAD_TO_DEG = 57.29577951308232

local function finite(value)
    return type(value) == 'number' and value == value and value ~= math.huge and value ~= -math.huge
end

-- Lua 5.1 has no two-argument math.atan; this is the only place it is needed.
local function atan2(y, x)
    if x > 0.0 then return math.atan(y / x) end
    if x < 0.0 then
        if y >= 0.0 then return math.atan(y / x) + math.pi end
        return math.atan(y / x) - math.pi
    end
    if y > 0.0 then return math.pi * 0.5 end
    if y < 0.0 then return -math.pi * 0.5 end
    return 0.0
end

local function clamp(value, low, high)
    if value < low then return low end
    if value > high then return high end
    return value
end

--[[ ------------------------------------------------------------- orientation --]]

-- The game reports two basis vectors (`look` forward, `up` upwards) and the site
-- wants an angle it can plot. Yaw and pitch are exact readouts of those vectors; roll
-- is the up vector's lean towards the car's right, which is exact when the car is
-- level and a good approximation on a gradient. No other state feeds them, and no
-- smoothing happens here -- the recording is the raw packet (docs/adr/0003).

---@param car ac.StateCar
---@return number|nil degrees, 0 facing +Z, increasing clockwise seen from above
local function yawOf(car)
    local look = car.look
    if look == nil or not finite(look.x) or not finite(look.z) then return nil end
    return atan2(look.x, look.z) * RAD_TO_DEG
end

---@param car ac.StateCar
---@return number|nil degrees, positive nose-up
local function pitchOf(car)
    local look = car.look
    if look == nil or not finite(look.y) then return nil end
    return math.asin(clamp(look.y, -1.0, 1.0)) * RAD_TO_DEG
end

---@param car ac.StateCar
---@return number|nil degrees, positive leaning right
local function rollOf(car)
    local look, up = car.look, car.up
    if look == nil or up == nil then return nil end
    if not finite(look.x) or not finite(look.z) or not finite(up.x) or not finite(up.y) or not finite(up.z) then
        return nil
    end
    local yaw = atan2(look.x, look.z)
    -- The car's right axis in the horizontal plane, perpendicular to `look`.
    local rightX, rightZ = math.cos(yaw), -math.sin(yaw)
    return atan2(up.x * rightX + up.z * rightZ, up.y) * RAD_TO_DEG
end

-- The game's own conversion from the world position, recorded rather than recomputed:
-- X is the normalised lateral offset, Y the height above the track, Z the progress.
---@param car ac.StateCar
---@return vec3|nil
local function trackCoordinatesOf(car)
    return platform.worldToTrack(car.position)
end

-- `car.tyresName` is a method, not a field: a build that does not implement it raises,
-- and the frame is worth more than the compound name.
---@param car ac.StateCar
---@return string|nil
local function compoundOf(car)
    if type(car.tyresName) ~= 'function' then return nil end
    local ok, value = pcall(car.tyresName, car)
    if not ok then return nil end
    return value
end

--[[ ------------------------------------------------------------------ frame --]]

-- Order is the order of the keys in the line. It follows the driver's reading order:
-- where the car is, how fast, what it is doing, what the session says about it.
---@type { key: string, kind: string, read: fun(car: ac.StateCar): any }[]
M.FRAME = {
    { key = 'position', kind = 'vec3' },
    { key = 'velocity', kind = 'vec3' },
    { key = 'speedKmh', kind = 'num' },
    { key = 'splinePosition', kind = 'num' },
    { key = 'trackCoordinates', kind = 'vec3', read = trackCoordinatesOf },
    { key = 'yaw', kind = 'num', read = yawOf },
    { key = 'pitch', kind = 'num', read = pitchOf },
    { key = 'roll', kind = 'num', read = rollOf },

    { key = 'gas', kind = 'num' },
    { key = 'brake', kind = 'num' },
    { key = 'clutch', kind = 'num' },
    { key = 'steer', kind = 'num' },
    { key = 'handbrake', kind = 'num' },
    { key = 'gear', kind = 'num' },
    { key = 'engagedGear', kind = 'num' },
    { key = 'rpm', kind = 'num' },

    { key = 'lapTimeMs', kind = 'num' },
    { key = 'bestLapTimeMs', kind = 'num' },
    { key = 'previousLapTimeMs', kind = 'num' },
    { key = 'lapCount', kind = 'num' },
    { key = 'sessionLapCount', kind = 'num' },
    { key = 'currentSector', kind = 'num' },
    { key = 'previousSectorTime', kind = 'num' },
    { key = 'racePosition', kind = 'num' },
    { key = 'currentSplits', kind = 'ints' },
    { key = 'lastSplits', kind = 'ints' },
    { key = 'bestSplits', kind = 'ints' },
    { key = 'bestLapSplits', kind = 'ints' },

    { key = 'fuel', kind = 'num' },
    { key = 'wheelsOutside', kind = 'num' },
    { key = 'resetCounter', kind = 'num' },

    { key = 'isInPit', kind = 'bool' },
    { key = 'isInPitlane', kind = 'bool' },
    { key = 'isRequestingPitStop', kind = 'bool' },
    { key = 'isConnected', kind = 'bool' },
    { key = 'isActive', kind = 'bool' },
    { key = 'isRemote', kind = 'bool' },

    { key = 'tyresName', kind = 'str', read = compoundOf },
    { key = 'oilTemperature', kind = 'num' },
    { key = 'exhaustTemperature', kind = 'num' },
}

--[[ ------------------------------------------------------------------ wheels --]]

-- Everything here is marked `netcode`: for a remote car the client receives a position
-- packet and extrapolates the rest. The fields exist and are worth recording -- that
-- is how anyone finds out whether they track reality -- but the site must not treat
-- them as measured telemetry (docs/adr/0001).
---@type { key: string, kind: string, read: fun(wheel: ac.StateWheel): any }[]
M.WHEELS = {
    { key = 'tyreInsideTemperature', kind = 'num' },
    { key = 'tyreMiddleTemperature', kind = 'num' },
    { key = 'tyreOutsideTemperature', kind = 'num' },
    { key = 'tyreCoreTemperature', kind = 'num' },
    { key = 'tyrePressure', kind = 'num' },
    { key = 'tyreWear', kind = 'num' },
    { key = 'tyreGrain', kind = 'num' },
    { key = 'tyreBlister', kind = 'num' },
    { key = 'tyreFlatSpot', kind = 'num' },
    { key = 'tyreVirtualKM', kind = 'num' },
    { key = 'slipRatio', kind = 'num' },
    { key = 'slipAngle', kind = 'num' },
    { key = 'ndSlip', kind = 'num' },
    { key = 'angularSpeed', kind = 'num' },
    { key = 'loadK', kind = 'num' },
    { key = 'camber', kind = 'num' },
    { key = 'toeIn', kind = 'num' },
    { key = 'suspensionTravel', kind = 'num' },
    { key = 'brakeTemperature', kind = 'num' },
    { key = 'discTemperature', kind = 'num' },
    { key = 'surfaceValidTrack', kind = 'bool' },
    { key = 'surfacePitlane', kind = 'bool' },
}

--[[ ------------------------------------------------------------------ index --]]

-- Fills in the plain reader and indexes the lists by key. One closure per field
-- channel, built here at load; `object[key]` is what every non-orientation channel
-- does, and spelling that out forty times hid the list it belongs to.
local function prepare(list)
    local index = {}
    for position = 1, #list do
        local channel = list[position]
        if channel.read == nil then
            local field = channel.key
            channel.read = function(object)
                return object[field]
            end
        end
        index[channel.key] = position
    end
    return index
end

---@type table<string, integer>
M.FRAME_INDEX = prepare(M.FRAME)
---@type table<string, integer>
M.WHEEL_INDEX = prepare(M.WHEELS)

-- The coverage identity of a wheel channel: one counter for four wheels, so "present
-- 4/4" means the build reported it on every wheel of every frame.
---@param key string
---@return string
function M.wheelID(key)
    return 'w.' .. key
end

return M
