#!/usr/bin/env node
const clipboardy = require('clipboardy')
const scanner = require("local-network-scanner")

let clipboard
let monitor = new (require('events')).EventEmitter()
setInterval(async _ => {
  let current = await clipboardy.read()
  if (clipboard !== current) {
    clipboard = current
    monitor.emit('copy', current)
  }
}, 500)

const listenServer = _ => {
  console.log("RUNNING AS SERVER\nWARNING: THE PANDAS ARE COMING")
  const app = require("express")()
  const server = require("http").createServer(app)
  const io = require("socket.io")(server)

  server.listen(process.env.PORT || 55500, _ => {
    let port = process.env.PORT || server.address().port
    console.log(`Listening on port ${port}`)
    console.log(`Run "shareclip http://${require('ip').address()}:${port}" on a different device`)
  })

  io.on('connection', socket => {
    console.log(`Connected to ${socket.id}`)
    socket.on('data', async data => {
      console.log(`Got data: ${data}`)
      socket.broadcast.emit(data)
      clipboard = data
      await clipboardy.write(data)
    })
  })

  monitor.on('copy', data => {
    console.log(`Copied: ${data}`)
    io.emit('data', data)
  })
}

const connectClient = (address) => {
  console.log("RUNNING AS CLIENT\nWARNING: THE PANDAS ARE COMING")
  let socket
  try {
    socket = require('socket.io-client')(process.argv[2])
  } catch {
    throw "Invalid server address"
  }

  socket.on('connect', _ => {
    console.log(`Connected to ${address}`)
    monitor.on('copy', data => {
      console.log(`Copied: ${data}`)
      socket.emit('data', data)
    })
  })

  socket.on('data', async data => {
    console.log(`Got data: ${data}`)
    clipboard = data
    await clipboardy.write(data)
  })
}

try {
  if (process.argv.includes("-p")) {
    if (!process.argv[process.argv.indexOf("-p") + 1]) {
      console.error("Invalid port")
      process.exit(1)
    }
    process.env.PORT = process.argv[process.argv.indexOf("-p") + 1]
    if (process.env.PORT < 1024 || process.env.PORT > 65535 || isNaN(+process.env.PORT)) {
      console.log("Invalid port")
      process.exit(1)
    }
    process.argv.splice(process.argv.indexOf("-p"), 2)
  }

  if (process.argv.includes("-a")) {
    const scanner = require('local-network-scanner')
    const tcpPortUsed = require('tcp-port-used')

    scanner.scan({arguments: ["-I", "en0"]}, devices => {
      if (!devices) {
        console.error('No devices found')
        return;
      }
      console.log(`Found ${devices.length} devices on the network`)
      for (const device of devices) {
        tcpPortUsed.check(+process.env.PORT || 55500, device.ip)
            .then(function (inUse) {
              if (inUse) {
                console.log(`Connecting to ${device.ip}:${process.env.PORT}`)
                connectClient(`http://${device.ip}:${process.env.PORT}`)
              }
            }, function (err) {
              console.error('Error on check:', err.message)
            });
      }
    });
  }

  if (process.argv.length === 2) { // Server
    listenServer()
  } else if (process.argv.length === 3) { // Client
    connectClient(process.argv[2])
  } else {
    throw "Invalid arguments"
  }
} catch (e) {
  console.log(e)
  console.log(`Usage: shareclip [server-address if running as client] [-p port] [-a]`)
  process.exit(1)
}
