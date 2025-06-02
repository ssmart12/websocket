const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');

// SSL certs
const serverOptions = {
  cert: fs.readFileSync('/etc/letsencrypt/live/smartattendancemonitoring.duckdns.org/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/smartattendancemonitoring.duckdns.org/privkey.pem'),
};
const server = https.createServer(serverOptions);

const dbPool = mysql.createPool({
  host: '127.0.0.1',
  user: 'phpmyadmin',
  password: 'MonitoringPassword123!',
  database: 'attendance_monitoring_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test DB connection on startup (optional but good practice)
dbPool.getConnection()
  .then(conn => {
    console.log('?? Successfully connected to the database.');
    conn.release();
  })
  .catch(err => {
    console.error('?? Failed to connect to the database:', err.message);
    // process.exit(1);
  });

const wss = new WebSocket.Server({ server });
console.log('?? WSS Server running on port 8445 with SSL');

let currentMode = 'attendance'; // global mode (assign or attendance)

// Helper function to broadcast a message to all connected clients
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws, req) => {
  console.log('? Client connected');

  // Send current mode immediately to new client (bridge or web client)
  ws.send(JSON.stringify({ type: 'set_mode', mode: currentMode }));

  ws.on('message', async (message) => {
    console.log('?? Received message:', message.toString());
    try {
      const data = JSON.parse(message);

      if (data.type === 'rfid_scan') {
        const rfidTag = data.rfid;

        if (currentMode === 'assign') {
          // Check if RFID exists
          const [rows] = await dbPool.query('SELECT * FROM students WHERE rfid_tag = ?', [rfidTag]);

          if (rows.length > 0) {
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
        } else {
          // attendance mode
          broadcast({
            type: 'attendance',
            rfid: rfidTag,
          });
        }
      }
      else if (data.type === 'set_mode') {
        // This message comes from the admin web client to switch mode
        if (data.mode === 'assign' || data.mode === 'attendance') {
          currentMode = data.mode;
          console.log(`?? Mode changed to '${currentMode}' by admin`);

          // Broadcast mode change to all clients (including bridge)
          broadcast({ type: 'set_mode', mode: currentMode });
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid mode value',
          }));
          console.warn('?? Invalid mode value received:', data.mode);
        }
      }
      else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type',
        }));
        console.warn('?? Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('? Error handling message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format or server error',
      }));
    }
  });

  ws.on('close', () => {
    console.log('? Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('? WebSocket error:', err);
  });
});

server.listen(8445, () => {
  console.log('?? Secure WebSocket server listening on wss://smartattendancemonitoring.duckdns.org:8445');
});
