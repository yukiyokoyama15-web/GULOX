import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import axios from "axios";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

// Inicializar Banco de Dados
let dbPath = "roblox.db";
if (process.env.NODE_ENV === "production") {
  dbPath = "/tmp/roblox.db";
} else {
  try {
    fs.accessSync(".", fs.constants.W_OK);
  } catch (e) {
    dbPath = "/tmp/roblox.db";
  }
}
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    birthday TEXT,
    gender TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;
  
  // Rota de teste para verificar se o servidor está online
  app.get("/ping", (req, res) => {
    res.send("pong");
  });

  // Rota explícita para o manifest.json (para o PWABuilder)
  app.get("/manifest.json", (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "manifest.json"));
  });

  // --- API de Cadastro e Login ---

  app.post("/api/register", async (req, res) => {
    const { username, password, birthday, gender } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare("INSERT INTO users (username, password, birthday, gender) VALUES (?, ?, ?, ?)");
      const info = stmt.run(username, hashedPassword, birthday, gender);
      res.json({ success: true, userId: info.lastInsertRowid, username });
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint failed")) {
        res.status(400).json({ error: "Este nome de usuário já existe" });
      } else {
        res.status(500).json({ error: "Erro ao cadastrar usuário" });
      }
    }
  });

  // --- API de Pagamento ---
  app.post("/api/create-payment", async (req, res) => {
    const { amount, paymentMethod } = req.body;
    const apiKey = process.env.PAGARME_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Configuração de pagamento ausente" });
    }

    try {
      const response = await axios.post(
        "https://api.pagar.me/core/v5/orders",
        {
          items: [{ amount: amount * 100, description: "Gubux", quantity: 1 }],
          customer: { name: "Cliente", email: "cliente@email.com" },
          payments: [{ payment_method: paymentMethod }]
        },
        {
          headers: {
            Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
            "Content-Type": "application/json"
          }
        }
      );
      res.json(response.data);
    } catch (error: any) {
      console.error("Erro no Pagar.me:", error.response?.data || error.message);
      res.status(500).json({ error: "Erro ao processar pagamento" });
    }
  });

  // Tentar adicionar as colunas last_coupon_date, gubux e banned_until
  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_coupon_date TEXT`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN gubux INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN banned_until TEXT`);
  } catch (e) {}

  app.post("/api/claim-coupon", (req, res) => {
    const { userId } = req.body;
    const user = db.prepare("SELECT last_coupon_date, gubux FROM users WHERE id = ?").get(userId) as any;
    
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const now = new Date();
    const lastCouponDate = user.last_coupon_date ? new Date(user.last_coupon_date) : null;

    if (lastCouponDate && (now.getTime() - lastCouponDate.getTime()) < 10 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "Você já resgatou um cupom nos últimos 10 dias" });
    }

    const newGubux = (user.gubux || 0) + 100;
    db.prepare("UPDATE users SET last_coupon_date = ?, gubux = ? WHERE id = ?").run(now.toISOString(), newGubux, userId);
    res.json({ success: true, message: "Cupom resgatado com sucesso!", gubux: newGubux });
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
    const user = stmt.get(username) as any;

    if (user && await bcrypt.compare(password, user.password)) {
      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return res.status(403).json({ error: `Você está banido até ${user.banned_until}` });
      }
      res.json({ success: true, userId: user.id, username: user.username, gubux: user.gubux || 0 });
    } else {
      res.status(401).json({ error: "Usuário ou senha incorretos" });
    }
  });

  app.post("/api/ban", (req, res) => {
    const { adminUsername, targetUsername } = req.body;

    if (adminUsername !== "Gustavo_japa30") {
      return res.status(403).json({ error: "Apenas o criador pode banir jogadores" });
    }

    const banDuration = 24 * 60 * 60 * 1000; // 1 dia
    const bannedUntil = new Date(Date.now() + banDuration).toISOString();

    try {
      db.prepare("UPDATE users SET banned_until = ? WHERE username = ?").run(bannedUntil, targetUsername);
      res.json({ success: true, message: `Usuário ${targetUsername} banido até ${bannedUntil}` });
    } catch (e) {
      res.status(500).json({ error: "Erro ao banir usuário" });
    }
  });

  // Gerenciamento de Jogadores (Multiplayer)
  const players: Record<string, { id: string; x: number; y: number; jumpHeight: number; color: string; name: string; avatarConfig: any; isDancing: boolean }> = {};

  io.on("connection", (socket) => {
    console.log("Novo jogador conectado:", socket.id);

    // Adicionar novo jogador
    players[socket.id] = {
      id: socket.id,
      x: Math.random() * 500,
      y: Math.random() * 500,
      jumpHeight: 0,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      name: `Player_${socket.id.substring(0, 4)}`,
      avatarConfig: {
        headColor: '#f5cd30',
        torsoColor: '#005eb8',
        armColor: '#f5cd30',
        legColor: '#4b974b',
        hat: null,
        accessory: null,
        shirt: null,
        pants: null
      },
      isDancing: false
    };

    // Enviar estado atual para o novo jogador
    socket.emit("currentPlayers", players);

    // Notificar outros jogadores
    socket.broadcast.emit("newPlayer", players[socket.id]);

    // Atualizar nome do jogador
    socket.on("setPlayerName", (name: string) => {
      if (players[socket.id]) {
        players[socket.id].name = name;
        io.emit("playerMoved", players[socket.id]);
      }
    });

    // Atualizar Avatar
    socket.on("updateAvatar", (avatarConfig: any) => {
      if (players[socket.id]) {
        players[socket.id].avatarConfig = avatarConfig;
        io.emit("playerMoved", players[socket.id]);
      }
    });

    // Atualizar posição
    socket.on("playerMovement", (movementData) => {
      if (players[socket.id]) {
        players[socket.id].x = movementData.x;
        players[socket.id].y = movementData.y;
        players[socket.id].jumpHeight = movementData.jumpHeight || 0;
        players[socket.id].isDancing = false; // Stop dancing on move
        socket.broadcast.emit("playerMoved", players[socket.id]);
      }
    });

    // Player Dance
    socket.on("playerDance", (isDancing: boolean) => {
      if (players[socket.id]) {
        players[socket.id].isDancing = isDancing;
        io.emit("playerMoved", players[socket.id]);
      }
    });

    // Chat
    socket.on("chatMessage", (message: string) => {
      if (players[socket.id]) {
        io.emit("chatMessage", {
          id: Date.now().toString(),
          sender: players[socket.id].name,
          text: message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    // Friend Request System
    socket.on("sendFriendRequest", (targetPlayerId: string) => {
      const sender = players[socket.id];
      const target = players[targetPlayerId];

      if (sender && target) {
        // Send request to the target player
        io.to(targetPlayerId).emit("friendRequestReceived", {
          fromId: socket.id,
          fromName: sender.name
        });
      }
    });

    socket.on("friendRequestResponse", (data: { fromId: string, accepted: boolean }) => {
      const responder = players[socket.id];
      const requester = players[data.fromId];

      if (responder && requester) {
        // Notify the original requester about the response
        io.to(data.fromId).emit("friendRequestResult", {
          responderId: socket.id,
          responderName: responder.name,
          accepted: data.accepted
        });
      }
    });

    // WebRTC Signaling for Voice Chat
    socket.on("webrtc-offer", (data: { to: string, offer: any }) => {
      io.to(data.to).emit("webrtc-offer", { from: socket.id, offer: data.offer });
    });

    socket.on("webrtc-answer", (data: { to: string, answer: any }) => {
      io.to(data.to).emit("webrtc-answer", { from: socket.id, answer: data.answer });
    });

    socket.on("webrtc-ice-candidate", (data: { to: string, candidate: any }) => {
      io.to(data.to).emit("webrtc-ice-candidate", { from: socket.id, candidate: data.candidate });
    });

    // Desconexão
    socket.on("disconnect", () => {
      console.log("Jogador desconectado:", socket.id);
      delete players[socket.id];
      io.emit("playerDisconnected", socket.id);
    });
  });

  // Vite middleware para desenvolvimento
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), "dist", "index.html"));
  
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(express.static(path.join(process.cwd(), "public")));
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.use(express.static(path.join(process.cwd(), "public")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
