import { VercelRequest, VercelResponse } from '@vercel/node';

// In-memory alert store for serverless environment
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

// Global cache across warm serverless invocations
const roomAlerts = new Map<string, AlertItem[]>();

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

  // POST /api/alert: Trigger an alert or resolve an alert
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    
    // Check if it's a resolve action from mobile
    if (body.action === 'resolve') {
      const existing = roomAlerts.get(roomId) || [];
      const updated = existing.map(a => (!body.id || a.id === body.id) ? { ...a, resolved: true } : a);
      roomAlerts.set(roomId, updated);
      return res.status(200).json({ ok: true, message: 'Alert resolved' });
    }

    if (body.action === 'clear') {
      roomAlerts.set(roomId, []);
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
    // Keep last 50 alerts
    const trimmed = [newAlert, ...existing].slice(0, 50);
    roomAlerts.set(roomId, trimmed);

    return res.status(201).json({
      ok: true,
      alert: newAlert,
      message: 'Alert broadcasted successfully'
    });
  }

  // GET /api/alert: Poll for alerts
  if (req.method === 'GET') {
    const list = roomAlerts.get(roomId) || [];
    const sinceTimestamp = since ? Number(since) : 0;
    
    // Filter alerts newer than `since` if provided
    const filtered = sinceTimestamp > 0 
      ? list.filter(a => a.timestamp > sinceTimestamp)
      : list;

    return res.status(200).json({
      ok: true,
      room: roomId,
      alerts: filtered,
      serverTime: Date.now()
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
