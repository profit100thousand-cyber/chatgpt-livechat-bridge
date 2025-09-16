import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ type: "*/*" }));

// ENV vars from Render
const {
  OPENAI_API_KEY,
  LIVECHAT_CLIENT_ID,
  LIVECHAT_ORG_ID,
  LIVECHAT_BOT_ID,
  LIVECHAT_BOT_SECRET,
  LIVECHAT_PAT,
  WEBHOOK_SECRET
} = process.env;

// issue a bot token (valid 24h)
async function getBotToken() {
  const res = await fetch("https://api.livechatinc.com/v3.6/configuration/action/issue_bot_token", {
    method: "POST",
    headers: { "Authorization": `Bearer ${LIVECHAT_PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      bot_id: LIVECHAT_BOT_ID,
      client_id: LIVECHAT_CLIENT_ID,
      bot_secret: LIVECHAT_BOT_SECRET,
      organization_id: LIVECHAT_ORG_ID
    })
  });
  const data = await res.json();
  return data.token;
}

// send reply into chat
async function sendMessage(botToken, chat_id, text) {
  await fetch("https://api.livechatinc.com/v3.6/agent/action/send_event", {
    method: "POST",
    headers: { "Authorization": `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, event: { type: "message", text } })
  });
}

// call ChatGPT
async function askOpenAI(prompt) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: "You are a helpful real estate assistant." },
        { role: "user", content: prompt }
      ]
    })
  });
  const data = await res.json();
  return data.output_text?.trim() || "I'm here to help!";
}

// webhook endpoint
app.post("/webhooks/livechat", async (req, res) => {
  if (req.body.secret_key !== WEBHOOK_SECRET) return res.sendStatus(401);

  const { action, payload } = req.body;

  if (action === "incoming_event") {
    const chat_id = payload.chat_id;
    const event = payload.event;
    if (event?.type === "message" && event?.author_type === "customer") {
      const botToken = await getBotToken();
      const reply = await askOpenAI(event.text);
      await sendMessage(botToken, chat_id, reply);
    }
  }

  if (action === "incoming_chat") {
    const chat_id = payload.chat?.id;
    if (chat_id) {
      const botToken = await getBotToken();
      await sendMessage(botToken, chat_id, "Hi 👋 I’m your AI assistant. How can I help?");
    }
  }

  res.send("ok");
});

app.get("/", (req, res) => res.send("Bridge is running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
