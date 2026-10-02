import test from "node:test";
import assert from "node:assert/strict";
import {
    createPrecipitationDetailGrid,
    isForecastMonthSupported
} from "../server/services/temperatureMapService.js";

function monthOffset(offset) {
    const now = new Date();
    const date = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() + offset,
        1
    ));

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("seasonal forecast accepts the current month", () => {
    assert.equal(isForecastMonthSupported(monthOffset(0)), true);
});

test("seasonal forecast accepts the seventh visible month (+6)", () => {
    assert.equal(isForecastMonthSupported(monthOffset(6)), true);
});

test("seasonal forecast rejects months outside the supported horizon", () => {
    assert.equal(isForecastMonthSupported(monthOffset(7)), false);
    assert.equal(isForecastMonthSupported(monthOffset(-1)), false);
});

test("seasonal forecast rejects malformed months", () => {
    assert.equal(isForecastMonthSupported("2026-13"), false);
    assert.equal(isForecastMonthSupported("not-a-month"), false);
    assert.equal(isForecastMonthSupported(null), false);
});

test("precipitation detail becomes denser as zoom increases", () => {
    const world = createPrecipitationDetailGrid(42.8, 74.6, 1);
    const close = createPrecipitationDetailGrid(42.8, 74.6, 4);

    assert.equal(world.step, 5);
    assert.equal(close.step, 2.5);
    assert.ok(world.points.length > 0);
    assert.ok(close.points.length > 0);
    assert.ok(world.points.length < 160);
    assert.ok(close.points.length < 160);
});

test("precipitation detail wraps longitudes at the dateline", () => {
    const result = createPrecipitationDetailGrid(10, 179, 2);

    assert.ok(result.points.every((point) =>
        point.longitude >= -180 && point.longitude < 180
    ));
});
