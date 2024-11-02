const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

// Store clients grouped by network
const networks = new Map(); // networkId -> Map of clients

// Add at the top of the file
const NETWORK_NAME_REGEX = /^[a-zA-Z0-9-_\s]{1,32}$/;

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'join':
        // Validate network name
        if (!NETWORK_NAME_REGEX.test(data.networkId)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid network name',
          }));
          return;
        }

        // Store network ID with the connection
        ws.networkId = data.networkId;
        ws.username = data.username;

        // Create network group if it doesn't exist
        if (!networks.has(data.networkId)) {
          networks.set(data.networkId, new Map());
        }
        
        // Add user to their network group
        networks.get(data.networkId).set(data.username, ws);

        // Send network info to the user
        ws.send(JSON.stringify({
          type: 'network-info',
          networkId: data.networkId,
          userCount: networks.get(data.networkId).size,
        }));

        // Notify others in the same network
        broadcastToNetwork({
          type: 'user-joined',
          username: data.username,
          networkId: data.networkId
        }, ws, data.networkId);
        break;
        
      default:
        // Only forward messages to peers on the same network
        if (data.to) {
          const networkClients = networks.get(ws.networkId);
          const targetClient = networkClients?.get(data.to);
          if (targetClient) {
            targetClient.send(JSON.stringify(data));
          }
        }
    }
  });

  ws.on('close', () => {
    if (ws.networkId && ws.username) {
      const networkClients = networks.get(ws.networkId);
      if (networkClients) {
        networkClients.delete(ws.username);
        
        // Remove network if empty
        if (networkClients.size === 0) {
          networks.delete(ws.networkId);
        } else {
          // Notify others in the same network
          broadcastToNetwork({
            type: 'user-left',
            username: ws.username,
            networkId: ws.networkId
          }, ws, ws.networkId);
        }
      }
    }
  });
});

function broadcastToNetwork(message, exclude, networkId) {
  const networkClients = networks.get(networkId);
  if (!networkClients) return;

  const data = JSON.stringify(message);
  for (const client of networkClients.values()) {
    if (client !== exclude) {
      client.send(data);
    }
  }
}

console.log(`Signaling server running on port ${port}`); 