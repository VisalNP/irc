const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const chatHistoryFile = path.join(__dirname, 'chatHistory.json');
const channelsFile = path.join(__dirname, 'channels.json');
const channelNamesFile = path.join(__dirname, 'channelNames.json');

let chatHistory;
let channels;
let channelNames;

try {
  chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile, 'utf8'));
  channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
  channelNames = JSON.parse(fs.readFileSync(channelNamesFile, 'utf8'));
} catch (err) {
  chatHistory = [];
  channels = {'general': {id: 'general', name: 'General', messages: []}};
  channelNames = {'General': 'general'};
}

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
      channelName: channels[socket.currentChannel].name,
    };

    chatHistory.push(loginMessage);
    channels['general'].messages.push(loginMessage);

    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
    fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));

    io.to(socket.currentChannel).emit('chat message', loginMessage);
  });

  socket.on('chat message', (msg) => {
    const chatMessage = {
      timestamp: new Date(),
      user: socket.username,
      content: msg,
      channelName: channels[socket.currentChannel].name,
    };

    chatHistory.push(chatMessage);
    channels[socket.currentChannel].messages.push(chatMessage);

    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
    fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));

    io.to(socket.currentChannel).emit('chat message', chatMessage);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
    const logoutMessage = {
      timestamp: new Date(),
      user: 'System',
      content: socket.username + ' has logged out.',
      channelName: channels[socket.currentChannel].name,
    };

    chatHistory.push(logoutMessage);
    channels[socket.currentChannel].messages.push(logoutMessage);

    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
    fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));

    io.to(socket.currentChannel).emit('chat message', logoutMessage);
  });

  socket.on('command', (command) => {
    let parts = command.split(' ');
    let action = parts[0].substring(1);
    let channelName = parts[1];
    let parameter = parts.slice(1).join(' ');

    if (action === 'create') {
      const channelId = Math.random().toString(36).substring(7);
      channels[channelId] = {id: channelId, name: channelName, messages: []};
      channelNames[channelName] = channelId;
      fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));
      socket.emit('update channels', Object.values(channels));

    } else if (action === 'join') {

      if (channels[channelNames[channelName]]) {
        socket.leave(socket.currentChannel);
        socket.join(channelNames[channelName]);
        socket.currentChannel = channelNames[channelName];
        socket.emit('chat history', channels[socket.currentChannel].messages);
      }

      
    } else if (action === 'leave') {
      if (socket.currentChannel !== 'general') { 
        const leaveMessage = {
          timestamp: new Date(),
          user: 'System',
          content: `${socket.username} has left the channel.`,
          channelName: channels[socket.currentChannel].name,
        };
    
        channels[socket.currentChannel].messages.push(leaveMessage);
        io.to(socket.currentChannel).emit('chat message', leaveMessage);
        
        socket.leave(socket.currentChannel);
        socket.join('general');
        socket.currentChannel = 'general';
        socket.emit('chat history', channels[socket.currentChannel].messages);
    
        const joinMessage = {
          timestamp: new Date(),
          user: 'System',
          content: `${socket.username} has joined the channel.`,
          channelName: channels[socket.currentChannel].name,
        };
    
        channels[socket.currentChannel].messages.push(joinMessage);
        io.to(socket.currentChannel).emit('chat message', joinMessage);
    
        fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
        fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
        fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));
      }
    } 
    else if (action === 'nick') {

      const oldUsername = socket.username;
      socket.username = parameter;
      const nickChangeMessage = {
        timestamp: new Date(),
        user: 'System',
        content: `${oldUsername} has changed their username to ${socket.username}.`,
        channelName: channels[socket.currentChannel].name,
      };
      channels[socket.currentChannel].messages.push(nickChangeMessage);
      io.to(socket.currentChannel).emit('chat message', nickChangeMessage);
      fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
      fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
      fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));

    } else if (action === 'delete') {

    const channelNameToDelete = parameter;
    const channelIdToDelete = channelNames[channelNameToDelete];

    if (channelIdToDelete && channelIdToDelete !== 'general') { 
      const deleteChannelMessage = {
        timestamp: new Date(),
        user: 'System',
        content: `Channel ${channelNameToDelete} has been deleted. You have been moved to the General channel.`,
        channelName: channelIdToDelete,
      };


      const socketsInChannel = io.sockets.adapter.rooms.get(channelIdToDelete);
      if (socketsInChannel) {
        socketsInChannel.forEach((socketId) => {
          const socketInChannel = io.sockets.sockets.get(socketId);
          socketInChannel.leave(channelIdToDelete);
          socketInChannel.join('general');
          socketInChannel.currentChannel = 'general';
          socketInChannel.emit('chat message', deleteChannelMessage);
        });
      }

      delete channels[channelIdToDelete];
      delete channelNames[channelNameToDelete];

      fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
      fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
      fs.writeFileSync(channelNamesFile, JSON.stringify(channelNames, null, 2));

      io.emit('update channels', Object.values(channels));
    }
  } else if (action === 'list') {
    let searchString = parameter.toLowerCase();
    let matchingChannels = Object.values(channels)
      .filter(channel => channel.name.toLowerCase().includes(searchString))
      .map(channel => channel.name);
    let message = matchingChannels.length ? 
      `Channels containing '${searchString}': ${matchingChannels.join(', ')}` : 
      `No channels found containing '${searchString}'`;
    
    const listMessage = {
      timestamp: new Date(),
      user: 'System',
      content: message,
      channelName: channels[socket.currentChannel].name,
    };
    socket.emit('chat message', listMessage);
  }
  });
    });

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server listening on port ${port}`));
