
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');

const server = http.createServer();

const wss = new WebSocket.Server({ server });
console.log('✅ WebSocket Server initialized');

let currentMode = 'attendance'; // Modes: 'assign' or 'attendance'


// Broadcast helper function
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('🟢 Client connected');

  ws.send(JSON.stringify({ type: 'set_mode', mode: currentMode }));

  ws.on('message', async (message) => {
    console.log('📥 Received message:', message.toString());
    try {
      const data = JSON.parse(message);

      if (data.type === 'rfid_scan') {
        const rfidTag = data.rfid;

        if (currentMode === 'assign') {
          try {
            // Call your external API on Render that checks if RFID is assigned
            const response = await axios.get('https://smartmonitoringsystem.infy.uk/api/check_rfid.php', {
              params: { rfid: rfidTag },
              timeout: 5000,
            });

            // Assuming your API returns { exists: true/false }
            if (response.data.exists) {
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
          } catch (apiError) {
            console.error('❌ Error calling external check_rfid API:', apiError.message);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to verify RFID with external API',
            }));
          }
        } else {
          // Attendance mode: just broadcast the RFID scan
          broadcast({
            type: 'attendance',
            rfid: rfidTag,
          });
        }
      }
      else if (data.type === 'set_mode') {
        if (data.mode === 'assign' || data.mode === 'attendance') {
          currentMode = data.mode;
          console.log(`🔄 Mode changed to '${currentMode}' by admin`);

          broadcast({ type: 'set_mode', mode: currentMode });
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid mode value',
          }));
          console.warn('⚠️ Invalid mode value received:', data.mode);
        }
      }
      else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type',
        }));
        console.warn('⚠️ Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('❗ Error handling message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format or server error',
      }));
    }
  });

  ws.on('close', () => {
    console.log('🔴 Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('⚠️ WebSocket error:', err);
  });
});

const PORT = process.env.PORT || 8445;
server.listen(PORT, () => {
  console.log(`🚀 WebSocket server listening on port ${PORT}`);
});