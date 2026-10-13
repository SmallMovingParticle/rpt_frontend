import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDay,
  calendarDays,
  isCalendarDay,
  moveCalendarDate,
  occupiesTime,
  layoutAppointments,
  workingHours,
  type Appointment,
} from "./appointment-data.ts";

const appointment = (id: string, start: string, end: string) =>
  ({
    id,
    start_utc: start,
    end_utc: end,
    duration_minutes: 60,
    state: "scheduled",
  }) as Appointment;

test("calendar dates use clinic timezone across DST rather than the browser timezone", () => {
  assert.equal(calendarDay("2026-10-14T01:00:00Z"), "2026-10-13");
  assert.equal(calendarDay("2026-11-01T08:30:00Z"), "2026-11-01");
  assert.equal(calendarDay("2026-11-01T09:30:00Z"), "2026-11-01");
  assert.equal(
    calendarDay("2026-10-14T01:00:00Z", "Asia/Calcutta"),
    "2026-10-14",
  );
});
test("weeks start Monday and months include six padded weeks without month-end overflow", () => {
  assert.equal(isCalendarDay("2026-10-13"), true);
  assert.equal(isCalendarDay("2026-02-31"), false);
  assert.equal(isCalendarDay("0000-01-01"), false);
  assert.equal(calendarDays("2026-10-18", "Week")[0], "2026-10-12");
  assert.equal(calendarDays("2026-10-18", "Month").length, 42);
  assert.equal(moveCalendarDate("2026-01-31", "Month", 1), "2026-02-01");
});
test("cancelled and missed appointments do not inflate occupancy", () => {
  for (const state of ["cancelled", "late_cancel", "no_show", "failed"])
    assert.equal(occupiesTime({ state } as Appointment), false);
  assert.equal(occupiesTime({ state: "scheduled" } as Appointment), true);
  const hours = { "1": { open: "08:30", close: "16:30" }, "7": null };
  assert.equal(workingHours("2026-10-12", hours), 8);
  assert.equal(workingHours("2026-10-18", hours), 0);
});
test("overlapping imported appointments get lanes and adjacent bookings regain full width", () => {
  const items = [
    appointment("a", "2026-10-13T16:00Z", "2026-10-13T17:00Z"),
    appointment("b", "2026-10-13T16:30Z", "2026-10-13T17:30Z"),
    appointment("c", "2026-10-13T17:30Z", "2026-10-13T18:30Z"),
  ];
  assert.deepEqual(
    layoutAppointments(items).map((e) => [e.item.id, e.lane, e.lanes]),
    [
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ],
  );
});
