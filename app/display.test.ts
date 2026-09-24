import assert from 'node:assert/strict';
import test from 'node:test';
import { activityKind, clinicWallTimeToIso, displayEnum, sourceLabel, statusTone, timezoneLabel } from './display.ts';

test('normalizes machine values without changing stored data', () => {
  for (const value of ['google_sheets', 'google-sheet', 'n8n_sheet', 'n8n_sheets', 'N8N Sheets']) assert.equal(sourceLabel(value), 'Google Sheets');
  assert.equal(displayEnum('customer_did-not-answer'), 'Customer did not answer');
  assert.equal(timezoneLabel('America/Los_Angeles'), 'America Los Angeles');
});

test('selects semantic activity icons and status tones', () => {
  assert.equal(activityKind({ to_status: 'booking_link_sent' }), 'link');
  assert.equal(activityKind({ to_status: 'transferred_human' }), 'handoff');
  assert.equal(activityKind({ to_status: 'booked' }), 'appointment');
  assert.equal(statusTone('customer-did-not-answer'), 'warning');
  assert.equal(statusTone('undelivered'), 'error');
  assert.equal(statusTone('booked'), 'success');
});

test('converts valid Pacific wall time and rejects DST edge cases', () => {
  const before = new Date('2026-01-01T00:00:00Z');
  assert.equal(clinicWallTimeToIso('2026-01-15T09:30', before), '2026-01-15T17:30:00.000Z');
  assert.throws(() => clinicWallTimeToIso('2026-03-08T02:30', before), /does not exist/);
  assert.throws(() => clinicWallTimeToIso('2026-11-01T01:30', before), /transition hour/);
  assert.throws(() => clinicWallTimeToIso('2025-01-15T09:30', before), /future/);
});
