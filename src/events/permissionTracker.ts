import { PermissionEvent, PermissionResolutionEvent, AgentType } from './permissionEvent';

export interface TrackedRequest {
  event: PermissionEvent;
  firstSeenAt: number;
  lastSeenAt: number;
  alerted: boolean;
  resolved: boolean;
  resolutionState?: 'approved' | 'rejected' | 'dismissed';
}

export interface ProcessEventResult {
  isNewAlert: boolean;
  request: TrackedRequest;
  reason: 'new_request' | 'already_alerted' | 'already_resolved' | 'state_updated' | 'rearmed_request';
}

export class PermissionTracker {
  private requests = new Map<string, TrackedRequest>();
  private readonly ttlMs: number;

  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = options?.ttlMs ?? 60 * 60 * 1000; // 1 hour default TTL
  }

  /**
   * Processes an incoming permission event.
   * Determines if a new alert should be triggered and updates request lifecycle.
   */
  public processEvent(event: PermissionEvent): ProcessEventResult {
    this.cleanupStaleRequests();

    const existing = this.requests.get(event.id);

    if (!existing) {
      // Brand new request detected
      const isPending = event.state === 'pending';
      const tracked: TrackedRequest = {
        event,
        firstSeenAt: event.timestamp || Date.now(),
        lastSeenAt: Date.now(),
        alerted: isPending,
        resolved: !isPending,
        resolutionState: isPending ? undefined : (event.state as any)
      };

      this.requests.set(event.id, tracked);

      return {
        isNewAlert: isPending,
        request: tracked,
        reason: 'new_request'
      };
    }

    // Existing request already known
    const timeSinceLastSeen = Date.now() - existing.lastSeenAt;
    existing.lastSeenAt = Date.now();

    // Check if resolution changed
    if (event.state !== 'pending') {
      existing.resolved = true;
      existing.resolutionState = event.state as any;
      existing.event = event;
      return {
        isNewAlert: false,
        request: existing,
        reason: 'state_updated'
      };
    }

    // If it was previously marked resolved (e.g. approved/rejected) and completed,
    // a subsequent pending event is a new request. Re-arm and trigger alert!
    if (existing.resolved) {
      if (existing.resolutionState === 'dismissed') {
        return {
          isNewAlert: false,
          request: existing,
          reason: 'already_resolved'
        };
      }
      existing.resolved = false;
      existing.alerted = true;
      existing.event = event;
      existing.firstSeenAt = Date.now();
      return {
        isNewAlert: true,
        request: existing,
        reason: 'rearmed_request'
      };
    }

    // If already alerted recently (within 10 seconds), avoid duplicate spam
    if (existing.alerted) {
      // If more than 20 seconds have passed since last seen and the event is still firing,
      // allow a reminder if it was re-prompted, otherwise suppress duplicate
      return {
        isNewAlert: false,
        request: existing,
        reason: 'already_alerted'
      };
    }

    // Not yet alerted
    existing.alerted = true;
    return {
      isNewAlert: true,
      request: existing,
      reason: 'new_request'
    };
  }

  /**
   * Resolves a permission request (e.g. user approved, rejected, or canceled).
   */
  public resolveRequest(resolution: PermissionResolutionEvent): boolean {
    const existing = this.requests.get(resolution.id);
    if (existing) {
      existing.resolved = true;
      existing.resolutionState = resolution.state;
      existing.lastSeenAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Resolves all active pending requests for a specific agent.
   */
  public resolveAllForAgent(agent: AgentType, state: 'approved' | 'rejected' | 'dismissed' = 'approved'): number {
    let count = 0;
    const now = Date.now();
    for (const req of this.requests.values()) {
      if (req.event.agent === agent && !req.resolved) {
        req.resolved = true;
        req.resolutionState = state;
        req.lastSeenAt = now;
        count++;
      }
    }
    return count;
  }

  /**
   * Marks a request as dismissed or manually acknowledged.
   */
  public dismissRequest(id: string): boolean {
    const existing = this.requests.get(id);
    if (existing) {
      existing.resolved = true;
      existing.resolutionState = 'dismissed';
      return true;
    }
    return false;
  }

  /**
   * Returns all active pending requests.
   */
  public getPendingRequests(): TrackedRequest[] {
    this.cleanupStaleRequests();
    return Array.from(this.requests.values()).filter(r => !r.resolved && r.event.state === 'pending');
  }

  /**
   * Checks if an ID has already been alerted.
   */
  public hasAlerted(id: string): boolean {
    return this.requests.get(id)?.alerted === true;
  }

  /**
   * Resets all tracked requests.
   */
  public reset(): void {
    this.requests.clear();
  }

  private cleanupStaleRequests(): void {
    const now = Date.now();
    for (const [id, req] of this.requests.entries()) {
      if (now - req.lastSeenAt > this.ttlMs) {
        this.requests.delete(id);
      }
    }
  }
}
