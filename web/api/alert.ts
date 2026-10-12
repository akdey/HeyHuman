import { VercelRequest, VercelResponse } from '@vercel/node';

export interface AlertItem {
  id: string;
  agent: string;
  type: string;
  tool?: string;
  command?: string;
  description?: string;
  timestamp: number;
  resolved?: boolean;
}

export interface RemoteAction {
  id: string;
  action: 'approve' | 'reject' | 'focus';
  input?: string;
  timestamp: number;
}

// Global caches across warm serverless invocations
const roomAlerts = new Map<string, AlertItem[]>();
const roomActions = new Map<string, RemoteAction[]>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { room = 'default', since } = req.query;
  const roomId = String(room).toLowerCase().trim();

  // POST /api/alert: Trigger an alert, submit an action (approve/reject), or clear
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    
    // Remote command approval / action from Phone!
    if (body.action === 'approve' || body.action === 'reject' || body.action === 'focus') {
      const actionItem: RemoteAction = {
        id: body.id || `act_${Date.now()}`,
        action: body.action,
        input: body.input || (body.action === 'approve' ? 'y' : 'n'),
        timestamp: Date.now()
      };

      const existingActions = roomActions.get(roomId) || [];
      roomActions.set(roomId, [actionItem, ...existingActions].slice(0, 20));

      // Mark matching alert as resolved
      const existingAlerts = roomAlerts.get(roomId) || [];
      const updatedAlerts = existingAlerts.map(a => (!body.id || a.id === body.id) ? { ...a, resolved: true } : a);
      roomAlerts.set(roomId, updatedAlerts);

      return res.status(200).json({ ok: true, message: `Remote action '${body.action}' queued for desktop` });
    }

    if (body.action === 'resolve') {
      const existing = roomAlerts.get(roomId) || [];
      const updated = existing.map(a => (!body.id || a.id === body.id) ? { ...a, resolved: true } : a);
      roomAlerts.set(roomId, updated);
      return res.status(200).json({ ok: true, message: 'Alert resolved' });
    }

    if (body.action === 'clear') {
      roomAlerts.set(roomId, []);
      roomActions.set(roomId, []);
      return res.status(200).json({ ok: true, message: 'All alerts cleared' });
    }

    const commandValue = body.command || body.details || body.tool || '';
    const descriptionValue = body.description || body.summary || body.message || 'AI agent is waiting for your permission!';

    const newAlert: AlertItem = {
      id: body.id || `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agent: body.agent || 'AI Agent',
      type: body.type || 'Permission Request',
      tool: body.tool || body.type || 'Action Approval',
      command: commandValue,
      description: descriptionValue,
      timestamp: Date.now(),
      resolved: false
    };

    const existing = roomAlerts.get(roomId) || [];
    const trimmed = [newAlert, ...existing].slice(0, 50);
    roomAlerts.set(roomId, trimmed);

    return res.status(201).json({
      ok: true,
      alert: newAlert,
      message: 'Alert broadcasted successfully'
    });
  }

  // GET /api/alert: Poll for alerts and pending remote desktop actions
  if (req.method === 'GET') {
    const list = roomAlerts.get(roomId) || [];
    const pendingActions = roomActions.get(roomId) || [];
    
    const sinceTimestamp = since ? Number(since) : 0;
    const filteredAlerts = sinceTimestamp > 0 
      ? list.filter(a => a.timestamp > sinceTimestamp)
      : list;

    // Filter actions newer than `since`
    const filteredActions = sinceTimestamp > 0
      ? pendingActions.filter(act => act.timestamp > sinceTimestamp)
      : pendingActions;

    return res.status(200).json({
      ok: true,
      room: roomId,
      alerts: filteredAlerts,
      actions: filteredActions,
      serverTime: Date.now()
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
