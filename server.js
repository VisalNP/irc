// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// File to store chat history
const chatHistoryFile = path.join(__dirname, 'chatHistory.json');

// Load chat history from file or initialize as empty array if file doesn't exist
let chatHistory;
try {
  chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile, 'utf8'));
} catch (err) {
  chatHistory = [];
}

const channels = {'general': {id: 'general', name: 'General', messages: []}};

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.join('general');
  socket.currentChannel = 'general';

  socket.on('register user', (username) => {
    socket.username = username;
    socket.emit('chat history', channels['general'].messages);
    io.emit('update channels', Object.values(channels));
  
    const loginMessage = {
      timestamp: new Date(),
      user: 'System',
      content: username + ' has logged in.',
    };

    chatHistory.push(loginMessage);
    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    io.emit('chat message', loginMessage);
  });

  socket.on('chat message', (msg) => {
    const chatMessage = {
      timestamp: new Date(),
      user: socket.username,
      content: msg,
    };

    chatHistory.push(chatMessage);
    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    io.emit('chat message', chatMessage);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
    const logoutMessage = {
      timestamp: new Date(),
      user: 'System',
      content: socket.username + ' has logged out.',
    };

    chatHistory.push(logoutMessage);
    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    io.emit('chat message', logoutMessage);
  });

  const chatMessage = {
    timestamp: new Date(),
    user: socket.username,
    content: msg,
    channel: socket.currentChannel,
  };

  socket.on('command', (command) => {
    let parts = command.split(' ');
    let action = parts[0].substring(1);
    let channelName = parts[1];

    if (action === 'create') {
      const channelId = Math.random().toString(36).substring(7);
      channels[channelId] = {id: channelId, name: channelName, messages: []};
      socket.emit('update channels', Object.values(channels));
    } else if (action === 'join') {
      if (channels[channelName]) {
        socket.leave(socket.currentChannel);
        socket.join(channelName);
        socket.currentChannel = channelName;
        socket.emit('chat history', channels[channelName].messages);
      }
    } else if (action === 'leave') {
      if (channels[channelName]) {
        socket.leave(channelName);
        if (channelName === socket.currentChannel) {
          socket.currentChannel = null;
        }
      }
    } else if (action === 'delete') {
      if (channels[channelName]) {
        delete channels[channelName];
        io.emit('update channels', Object.values(channels));
      }
    }
  });
});


const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server listening on port ${port}`));
