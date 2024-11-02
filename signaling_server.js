const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

// Store clients grouped by network
const networks = new Map(); // networkId -> Map of clients

// Add at the top of the file
const NETWORK_NAME_REGEX = /^[a-zA-Z0-9-_\s]{1,32}$/;

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    console.log('Received message:', message.toString());
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'join':
        console.log('Join request:', data);
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

        console.log(`User ${data.username} joined network ${data.networkId}`);
        console.log(`Network size: ${networks.get(data.networkId).size}`);

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

        broadcastNetworkInfo(data.networkId);
        break;
        
      case 'request_network_info':
        const networkSize = networks.get(data.networkId)?.size || 0;
        ws.send(JSON.stringify({
          type: 'network-info',
          networkId: data.networkId,
          userCount: networkSize,
        }));
        break;
        
      case 'message':
        console.log('Broadcasting message from:', ws.username);
        console.log('Message:', data.message);
        console.log('To network:', ws.networkId);
        
        const networkClients = networks.get(ws.networkId);
        if (networkClients) {
          const messageData = JSON.stringify({
            type: 'message',
            username: ws.username,
            message: data.message,
            timestamp: data.timestamp,
            networkId: ws.networkId,
          });

          // Send to all clients in the network
          for (const client of networkClients.values()) {
            if (client !== ws) { // Don't send back to sender
              console.log('Sending to:', client.username);
              client.send(messageData);
            }
          }
        }
        break;

      default:
        console.log('Unknown message type:', data.type);
        break;
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${ws.username}`);
    if (ws.networkId && ws.username) {
      const networkClients = networks.get(ws.networkId);
      if (networkClients) {
        networkClients.delete(ws.username);
        
        console.log(`Network ${ws.networkId} size after leave: ${networkClients.size}`);
        
        // Remove network if empty
        if (networkClients.size === 0) {
          networks.delete(ws.networkId);
          console.log(`Network ${ws.networkId} removed`);
        } else {
          // Notify others in the same network
          broadcastToNetwork({
            type: 'user-left',
            username: ws.username,
            networkId: ws.networkId
          }, ws, ws.networkId);

          broadcastNetworkInfo(ws.networkId);
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
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

function broadcastNetworkInfo(networkId) {
  const networkClients = networks.get(networkId);
  if (!networkClients) return;

  const data = JSON.stringify({
    type: 'network-info',
    networkId: networkId,
    userCount: networkClients.size,
  });

  for (const client of networkClients.values()) {
    client.send(data);
  }
}

console.log(`Signaling server running on port ${port}`);