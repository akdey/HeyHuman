import { PermissionEvent, PermissionResolutionEvent } from './permissionEvent';

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
  reason: 'new_request' | 'already_alerted' | 'already_resolved' | 'state_updated';
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
      // New request detected
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

    if (existing.resolved) {
      return {
        isNewAlert: false,
        request: existing,
        reason: 'already_resolved'
      };
    }

    if (existing.alerted) {
      return {
        isNewAlert: false,
        request: existing,
        reason: 'already_alerted'
      };
    }

    // If it was somehow recorded without alert (e.g. initial sync)
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
   * Resets all tracked requests (for testing or restart).
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
