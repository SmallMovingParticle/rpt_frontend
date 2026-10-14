import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDay,
  calendarDays,
  isCalendarDay,
  moveCalendarDate,
  occupiesTime,
  layoutAppointments,
  appointmentSummary,
  bookedByLabel,
  callMoment,
  filterAppointments,
  stateLabel,
  statusBucket,
  tagLabel,
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

const booking = (over: Partial<Appointment>) =>
  ({
    id: Math.random().toString(),
    start_utc: "2026-10-27T16:00:00Z",
    end_utc: null,
    duration_minutes: 60,
    state: "scheduled",
    location: "Laguna Niguel",
    case_title: "Physical Therapy",
    practitioner_id: "5980",
    practitioner_name: "Joe Smith",
    tag: "elliot",
    ...over,
  }) as Appointment;

test("Stride states fall into the four buckets staff count", () => {
  assert.equal(statusBucket("scheduled"), "booked");
  assert.equal(statusBucket("unknown"), "booked");
  assert.equal(statusBucket("completed"), "completed");
  assert.equal(statusBucket("late_cancel"), "cancelled");
  assert.equal(statusBucket("cancelled"), "cancelled");
  assert.equal(statusBucket("no_show"), "no_show");
  assert.equal(statusBucket("rescheduled"), "other");
  assert.equal(stateLabel("scheduled"), "Booked");
  assert.equal(stateLabel("late_cancel"), "Late cancel");
  assert.equal(stateLabel("checked out"), "Checked out");
});
test("tags, who booked and the call moment read in plain words", () => {
  assert.equal(tagLabel("elliot"), "Elliot");
  assert.equal(tagLabel("stride_only"), "Stride only");
  assert.equal(bookedByLabel("voice_agent"), "by Elliot on a call");
  assert.equal(bookedByLabel("stride"), "in Stride (front desk or text link)");
  assert.equal(callMoment(84), "1:24");
  assert.equal(callMoment(5), "0:05");
  assert.equal(callMoment(null), "");
});
test("filters combine and the summary counts what the filters show", () => {
  const items = [
    booking({ tag: "elliot" }),
    booking({ tag: "elliot", state: "late_cancel" }),
    booking({ tag: "sheet_lead", location: "Dana Point", practitioner_id: "5981", practitioner_name: "Thao Nguyen" }),
    booking({ tag: "stride_only", state: "completed", case_title: "Physical Therapy - Pelvic" }),
    booking({ tag: "stride_only", state: "no_show" }),
  ];
  assert.equal(filterAppointments(items, { tag: "elliot" }).length, 2);
  assert.equal(filterAppointments(items, { status: "cancelled" }).length, 1);
  assert.equal(filterAppointments(items, { location: "Laguna Niguel", tag: "stride_only" }).length, 2);
  assert.equal(filterAppointments(items, { location: "All Locations", status: "all", tag: "all" }).length, 5);
  assert.equal(filterAppointments(items, { practitioner: "5981" }).length, 1);
  const summary = appointmentSummary(items);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.status, { booked: 2, completed: 1, cancelled: 1, no_show: 1, other: 0 });
  assert.deepEqual(summary.tags, { elliot: 2, sheet_lead: 1, stride_only: 2 });
  assert.deepEqual(summary.byLocation[0], { label: "Laguna Niguel", count: 4 });
  assert.deepEqual(summary.byPractitioner.map((r) => r.label), ["Joe Smith", "Thao Nguyen"]);
  assert.equal(summary.byCase.length, 2);
});
