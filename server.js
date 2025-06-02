const http = require('http');
const WebSocket = require('ws');
const fetch = require('node-fetch');  // Changed here

// Create HTTP server
const server = http.createServer();
const wss = new WebSocket.Server({ server });
console.log('✅ WebSocket Server initialized');

let currentMode = 'attendance'; // Modes: 'assign' or 'attendance'
const API_URL = 'https://smartmonitoringsystem.infy.uk/check_rfid.php'; // Separate API URL

// Broadcast message to all connected WebSocket clients
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('📡 Client connected');
  ws.send(JSON.stringify({ type: 'set_mode', mode: currentMode }));

  ws.on('message', async (message) => {
    console.log('📥 Received:', message.toString());

    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'rfid_scan':
          await handleRfidScan(ws, data.rfid);
          break;
        
        case 'set_mode':
          await handleSetMode(ws, data.mode);
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }

    } catch (err) {
      console.error('💥 Error handling message:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format or internal error' }));
    }
  });

  ws.on('close', () => console.log('❌ Client disconnected'));
  ws.on('error', (err) => console.error('⚠️ WebSocket error:', err));
});

// Handle RFID Scan
async function handleRfidScan(ws, rfidTag) {
  try {
    if (currentMode === 'assign') {
      const response = await fetch(`${API_URL}?rfid=${rfidTag}`);
      const data = await response.json();

      if (data.exists) {
        broadcast({
          type: 'rfid_exists',
          message: 'RFID already assigned',
          rfid: rfidTag,
        });
      } else {
        broadcast({
          type: 'assign_rfid',
          rfid: rfidTag,
        });
      }
    } else if (currentMode === 'attendance') {
      broadcast({
        type: 'attendance',
        rfid: rfidTag,
      });
    }
  } catch (error) {
    console.error('❌ Error calling check_rfid API:', error.message);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to verify RFID' }));
  }
}

// Handle Mode Change
async function handleSetMode(ws, mode) {
  if (mode === 'assign' || mode === 'attendance') {
    currentMode = mode;
    console.log(`🔁 Mode changed to '${currentMode}'`);
    broadcast({ type: 'set_mode', mode: currentMode });
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid mode value. Allowed values: "assign", "attendance"' }));
  }
}

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});
