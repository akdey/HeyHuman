import * as assert from 'assert';
import { PermissionTracker } from '../src/events/permissionTracker';
import { PermissionEvent } from '../src/events/permissionEvent';

describe('PermissionTracker', () => {
  let tracker: PermissionTracker;

  beforeEach(() => {
    tracker = new PermissionTracker({ ttlMs: 10000 });
  });

  it('triggers an alert for a new permission request', () => {
    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run npm test',
      timestamp: Date.now()
    };

    const res = tracker.processEvent(event);
    assert.strictEqual(res.isNewAlert, true);
    assert.strictEqual(res.reason, 'new_request');
    assert.strictEqual(tracker.hasAlerted('req-1'), true);
  });

  it('does not trigger a duplicate alert for the same pending request', () => {
    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run npm test',
      timestamp: Date.now()
    };

    const first = tracker.processEvent(event);
    assert.strictEqual(first.isNewAlert, true);

    const second = tracker.processEvent(event);
    assert.strictEqual(second.isNewAlert, false);
    assert.strictEqual(second.reason, 'already_alerted');
  });

  it('allows a new alert for distinct request IDs', () => {
    const event1: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run npm test',
      timestamp: Date.now()
    };
    const event2: PermissionEvent = {
      id: 'req-2',
      agent: 'antigravity',
      type: 'question_input',
      state: 'pending',
      summary: 'Clarification question',
      timestamp: Date.now()
    };

    const res1 = tracker.processEvent(event1);
    const res2 = tracker.processEvent(event2);

    assert.strictEqual(res1.isNewAlert, true);
    assert.strictEqual(res2.isNewAlert, true);
  });

  it('handles request resolution and does not re-alert resolved request', () => {
    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run npm test',
      timestamp: Date.now()
    };

    tracker.processEvent(event);
    const resolved = tracker.resolveRequest({
      id: 'req-1',
      agent: 'copilot',
      state: 'approved',
      timestamp: Date.now()
    });

    assert.strictEqual(resolved, true);

    // Processing the resolved event
    const eventDone: PermissionEvent = {
      ...event,
      state: 'approved'
    };
    const check = tracker.processEvent(eventDone);
    assert.strictEqual(check.isNewAlert, false);
  });

  it('handles request dismissal', () => {
    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run npm test',
      timestamp: Date.now()
    };

    tracker.processEvent(event);
    const dismissed = tracker.dismissRequest('req-1');
    assert.strictEqual(dismissed, true);

    const res = tracker.processEvent(event);
    assert.strictEqual(res.isNewAlert, false);
  });

  it('correctly reports pending requests', () => {
    tracker.processEvent({
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run npm test',
      timestamp: Date.now()
    });
    tracker.processEvent({
      id: 'req-2',
      agent: 'antigravity',
      type: 'tool_execution',
      state: 'pending',
      summary: 'Run build',
      timestamp: Date.now()
    });

    assert.strictEqual(tracker.getPendingRequests().length, 2);

    tracker.resolveRequest({
      id: 'req-1',
      agent: 'copilot',
      state: 'approved',
      timestamp: Date.now()
    });

    assert.strictEqual(tracker.getPendingRequests().length, 1);
    assert.strictEqual(tracker.getPendingRequests()[0].event.id, 'req-2');
  });
});
