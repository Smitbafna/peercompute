import express from 'express'

const app = express()
const port = 3001

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

const server = app.listen(port, () => {
  console.log(`Signaling server listening on http://localhost:${port}`)
})

// Minimal WebSocket server for signaling (Milestone 01)
const { Server: WSServer } = require('ws')
const wss = new WSServer({ server })

wss.on('connection', (ws: any) => {
  console.log('Client connected via WebSocket')
  ws.on('close', () => {
    console.log('Client disconnected')
  })
  ws.on('error', (err: any) => {
    console.error('WebSocket error:', err)
  })
})
