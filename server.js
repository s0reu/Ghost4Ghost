/* =========================================================
   GHOST4GHOST — Signaling Server (Phase 2)
   Global queue · friend-code rooms · ready checks ·
   WebRTC signal relay · turn sync · honor verdicts ·
   rematch · disconnect handling
   Deploy: Render/Railway free tier. Start: node server.js
========================================================= */
"use strict";

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8090;
const CODE_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const VERDICT_TIMEOUT_MS = parseInt(process.env.VERDICT_TIMEOUT_MS, 10) || 25000;

/* ---------- state ---------- */
const clients = new Set(); // client objects
const queue = [];          // clients waiting for a global match
const rooms = new Map();   // code -> room
let idSeq = 1;

/* ---------- helpers ---------- */
function send(c, type, data) {
  if (c && c.ws.readyState === 1) {
    try { c.ws.send(JSON.stringify(Object.assign({ type }, data || {}))); } catch (e) {}
  }
}
function sanitizeTag(t) {
  return String(t || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 18) || "ghost";
}
function clampGr(g) {
  const n = parseInt(g, 10);
  return Number.isFinite(n) ? Math.max(100, Math.min(9999, n)) : 1000;
}
function pub(c) { return { tag: c.tag, gr: c.gr }; }
function genCode() {
  for (let t = 0; t < 64; t++) {
    let s = "GHST-";
    for (let i = 0; i < 4; i++) s += CODE_ALPHA[crypto.randomInt(CODE_ALPHA.length)];
    if (!rooms.has(s)) return s;
  }
  return "GHST-" + Date.now().toString(36).toUpperCase().slice(-4);
}
function normCode(v) {
  let s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("GHST")) s = s.slice(4);
  return "GHST-" + s.slice(0, 4);
}

/* ---------- rooms ---------- */
function makeRoom(code, isPrivate) {
  const room = {
    code,
    private: isPrivate,
    players: [],
    ready: new Set(),
    verdict: new Map(),
    rematch: new Set(),
    started: false,
    firstTurn: null,
    vt: null, // verdict timeout
  };
  rooms.set(code, room);
  return room;
}
function peerOf(room, c) { return room.players.find(p => p !== c); }

function joinRoom(room, c) {
  room.players.push(c);
  c.room = room;
  if (room.players.length === 2) {
    const [a, b] = room.players;
    a.role = "a"; b.role = "b";
    send(a, "matched", { code: room.code, role: "a", opp: pub(b), private: room.private });
    send(b, "matched", { code: room.code, role: "b", opp: pub(a), private: room.private });
  }
}

function clearVerdictTimer(room) {
  if (room.vt) { clearTimeout(room.vt); room.vt = null; }
}

function leaveRoom(c, notifyPeer) {
  const room = c.room;
  if (!room) return;
  const peer = peerOf(room, c);
  room.players = room.players.filter(p => p !== c);
  c.room = null;
  c.role = null;
  clearVerdictTimer(room);
  if (room.players.length === 0) {
    rooms.delete(room.code);
  } else {
    room.ready.clear();
    room.verdict.clear();
    room.rematch.clear();
    room.started = false;
    if (peer && notifyPeer) send(peer, "peer_left", {});
  }
}

function leaveQueue(c) {
  const i = queue.indexOf(c);
  if (i !== -1) queue.splice(i, 1);
}

function detachEverywhere(c, notifyPeer) {
  leaveQueue(c);
  leaveRoom(c, notifyPeer);
}

function startDuel(room) {
  room.started = true;
  room.verdict.clear();
  room.rematch.clear();
  room.ready.clear();
  clearVerdictTimer(room);
  room.firstTurn = room.firstTurn ? (room.firstTurn === "a" ? "b" : "a") : (Math.random() < 0.5 ? "a" : "b");
  room.players.forEach(p => send(p, "start", { firstTurn: room.firstTurn }));
}

function finishVerdict(room) {
  clearVerdictTimer(room);
  const a = room.verdict.get("a") || null;
  const b = room.verdict.get("b") || null;
  room.started = false;
  room.ready.clear();
  room.players.forEach(p => send(p, "verdict_result", { a, b }));
}

/* ---------- message handling ---------- */
function handle(c, msg) {
  const type = msg.type;

  switch (type) {
    case "hello": {
      c.tag = sanitizeTag(msg.tag);
      c.gr = clampGr(msg.gr);
      send(c, "hello_ok", { id: c.id, online: clients.size });
      break;
    }

    case "queue_join": {
      detachEverywhere(c, true);
      // pull the first still-alive waiter
      while (queue.length) {
        const w = queue.shift();
        if (w !== c && w.ws.readyState === 1 && !w.room) {
          const room = makeRoom(genCode(), false);
          joinRoom(room, w);
          joinRoom(room, c);
          return;
        }
      }
      queue.push(c);
      send(c, "queue_ok", { online: clients.size });
      break;
    }

    case "queue_leave": {
      leaveQueue(c);
      break;
    }

    case "room_create": {
      detachEverywhere(c, true);
      const room = makeRoom(genCode(), true);
      joinRoom(room, c);
      send(c, "room_created", { code: room.code });
      break;
    }

    case "room_join": {
      const code = normCode(msg.code);
      const room = rooms.get(code);
      if (!room) { send(c, "error", { code: "room_not_found", msg: "No room with that code." }); return; }
      if (room.players.length >= 2) { send(c, "error", { code: "room_full", msg: "That room is already full." }); return; }
      if (room.players[0] === c) return;
      detachEverywhere(c, true);
      joinRoom(room, c);
      break;
    }

    case "ready": {
      const room = c.room;
      if (!room || room.players.length !== 2 || room.started) return;
      room.ready.add(c.role);
      const peer = peerOf(room, c);
      if (peer) send(peer, "peer_ready", {});
      if (room.ready.size === 2) startDuel(room);
      break;
    }

    case "signal": {
      const room = c.room;
      const peer = room && peerOf(room, c);
      if (peer && msg.data && typeof msg.data === "object") {
        send(peer, "signal", { data: msg.data });
      }
      break;
    }

    case "turn_done": {
      const room = c.room;
      if (!room || !room.started) return;
      const peer = peerOf(room, c);
      const turn = msg.turn === 2 ? 2 : 1;
      if (peer) send(peer, "turn_done", { turn });
      break;
    }

    case "verdict": {
      const room = c.room;
      if (!room || !room.started || room.players.length !== 2) return;
      const pick = msg.pick === "me" ? c.role : (msg.pick === "them" ? (c.role === "a" ? "b" : "a") : null);
      if (!pick || room.verdict.has(c.role)) return;
      room.verdict.set(c.role, pick);
      const peer = peerOf(room, c);
      if (room.verdict.size === 2) {
        finishVerdict(room);
      } else {
        if (peer) send(peer, "verdict_wait", {});
        room.vt = setTimeout(() => finishVerdict(room), VERDICT_TIMEOUT_MS);
      }
      break;
    }

    case "rematch": {
      const room = c.room;
      if (!room || room.players.length !== 2 || room.started) return;
      room.rematch.add(c.role);
      const peer = peerOf(room, c);
      if (room.rematch.size === 2) {
        startDuel(room);
      } else if (peer) {
        send(peer, "rematch_requested", {});
      }
      break;
    }

    case "leave_room": {
      detachEverywhere(c, true);
      break;
    }

    case "report": {
      // Phase 4 gets real moderation storage; for now, log server-side.
      const room = c.room;
      const peer = room && peerOf(room, c);
      console.log("[report]", JSON.stringify({
        at: new Date().toISOString(),
        from: c.tag,
        against: peer ? peer.tag : "(no peer)",
        room: room ? room.code : null,
        reason: String(msg.reason || "").slice(0, 60),
        note: String(msg.note || "").slice(0, 500),
      }));
      send(c, "report_ok", {});
      break;
    }

    default:
      break;
  }
}

/* ---------- http + ws ---------- */
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    ok: true,
    service: "ghost4ghost-signal",
    online: clients.size,
    inQueue: queue.length,
    rooms: rooms.size,
  }));
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on("connection", (ws) => {
  const c = { ws, id: idSeq++, tag: "ghost", gr: 1000, room: null, role: null, rlStart: Date.now(), rlN: 0, alive: true };
  clients.add(c);
  ws.on("pong", () => { c.alive = true; });
  ws.on("message", (buf) => {
    // simple rate limit: 50 msgs/sec
    const now = Date.now();
    if (now - c.rlStart > 1000) { c.rlStart = now; c.rlN = 0; }
    if (++c.rlN > 50) { ws.close(1008, "rate"); return; }
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
    if (!msg || typeof msg.type !== "string") return;
    try { handle(c, msg); } catch (e) { console.error("handle error:", e.message); }
  });
  ws.on("close", () => {
    clients.delete(c);
    detachEverywhere(c, true);
  });
  ws.on("error", () => {});
});

/* heartbeat: drop dead sockets */
setInterval(() => {
  clients.forEach(c => {
    if (!c.alive) { try { c.ws.terminate(); } catch (e) {} return; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) {}
  });
}, 30000);

/* online count broadcast */
setInterval(() => {
  const n = clients.size;
  clients.forEach(c => send(c, "online", { n }));
}, 15000);

server.listen(PORT, () => {
  console.log("ghost4ghost-signal listening on :" + PORT);
});
