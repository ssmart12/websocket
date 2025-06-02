const http = require('http');
const WebSocket = require('ws');
const fetch = require('node-fetch'); // Make sure this is installed

// Create HTTP server
const server = http.createServer();
const wss = new WebSocket.Server({ server });
console.log('✅ WebSocket Server initialized');

let currentMode = 'attendance'; // Modes: 'assign' or 'attendance'
const API_URL = 'https://smartmonitoringsystem.infy.uk/check_rfid.php'; // API URL

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

async function handleRfidScan(ws, rfidTag) {
  try {
    if (currentMode === 'assign') {
      const res = await fetch(`${API_URL}?rfid=${rfidTag}`);
      const rawText = await res.text();
      console.log('📄 Raw API response:', rawText);

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error('Invalid JSON: ' + parseErr.message);
      }

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

async function handleSetMode(ws, mode) {
  if (mode === 'assign' || mode === 'attendance') {
    currentMode = mode;
    console.log(`🔁 Mode changed to '${currentMode}'`);
    broadcast({ type: 'set_mode', mode: currentMode });
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid mode value. Allowed values: "assign", "attendance"' }));
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});
