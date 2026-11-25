
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser
} = require("@whiskeysockets/baileys");

const express = require("express");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("SPOPO ANTI-LINK BOT is running 🚫");
});

app.listen(PORT, () => {
  console.log("Website running on port " + PORT);
});

const SESSION_DIR = process.env.SESSION_DIR || "./session";

const LINK_REGEX =
  /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|discord\.gg\/|instagram\.com\/|tiktok\.com\/|youtube\.com\/|youtu\.be\/)/i;

async function startBot() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } =
    await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["SPOPO ANTI-LINK", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("SPOPO ANTI-LINK connected successfully!");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Connection closed. Reconnecting...");
        setTimeout(startBot, 5000);
      } else {
        console.log("Logged out. Please reconnect.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

        const chatId = msg.key.remoteJid;

        if (!chatId || !chatId.endsWith("@g.us")) continue;

        const sender = msg.key.participant;
        if (!sender) continue;

        const content = msg.message;
        const text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          content.imageMessage?.caption ||
          content.videoMessage?.caption ||
          content.documentMessage?.caption ||
          "";

        if (!LINK_REGEX.test(text)) continue;

        const groupMetadata =
          await sock.groupMetadata(chatId);

        const senderId = jidNormalizedUser(sender);

        const senderIsAdmin = groupMetadata.participants.some(
          (participant) =>
            jidNormalizedUser(participant.id) === senderId &&
            (participant.admin === "admin" ||
             participant.admin === "superadmin")
        );

        if (senderIsAdmin) continue;

        const botId = jidNormalizedUser(sock.user.id);

        const botIsAdmin = groupMetadata.participants.some(
          (participant) =>
            jidNormalizedUser(participant.id) === botId &&
            (participant.admin === "admin" ||
             participant.admin === "superadmin")
        );

        if (!botIsAdmin) {
          console.log("Bot is not an admin in this group.");
          continue;
        }

        await sock.sendMessage(chatId, {
          delete: msg.key
        });

        await sock.groupParticipantsUpdate(
          chatId,
          [sender],
          "remove"
        );

        await sock.sendMessage(chatId, {
          text:
            "🚫 تم طرد العضو بسبب نشر رابط!\n\n" +
            "🔒 هذا الجروب ممنوع فيه نشر الروابط."
        });

        console.log("Link sender removed:", sender);
      } catch (error) {
        console.log("Anti-link error:", error.message);
      }
    }
  });
}

startBot().catch(console.error);
