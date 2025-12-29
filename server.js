import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { WebClient } from "@slack/web-api";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- Slack setup ---
const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const HIGHFIVE_CHANNEL = process.env.HIGHFIVE_CHANNEL;

// --- Google Sheets webhook (Apps Script Web App URL) ---
const GOOGLE_SHEETS_WEBHOOK = process.env.GOOGLE_SHEETS_WEBHOOK;

// --- Slash command: /highfive ---
app.post("/slack/highfive", async (req, res) => {
  // 1️⃣ Respond immediately to Slack to avoid dispatch_failed
  res.status(200).send(""); // must be instant

  const triggerId = req.body.trigger_id;

  try {
    // 2️⃣ Open Slack modal
    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Send a High Five" },
        submit: { type: "plain_text", text: "Send" },
        close: { type: "plain_text", text: "Cancel" },
        callback_id: "highfive_modal",
        blocks: [
          {
            type: "input",
            block_id: "user_block",
            label: { type: "plain_text", text: "Who are you recognizing?" },
            element: { type: "users_select", action_id: "user" }
          },
          {
            type: "input",
            block_id: "value_block",
            label: { type: "plain_text", text: "Core Value" },
            element: {
              type: "static_select",
              action_id: "value",
              options: [
                { text: { type: "plain_text", text: "Positive Energy" }, value: "positive" },
                { text: { type: "plain_text", text: "Team Player" }, value: "team" },
                { text: { type: "plain_text", text: "Constant Improvement" }, value: "improve" },
                { text: { type: "plain_text", text: "Forward Thinking" }, value: "forward" },
                { text: { type: "plain_text", text: "Deliver Performance" }, value: "performance" }
              ]
            }
          },
          {
            type: "input",
            block_id: "message_block",
            label: { type: "plain_text", text: "Why are you giving this High Five?" },
            element: { type: "plain_text_input", multiline: true, action_id: "message" }
          }
        ]
      }
    });
  } catch (err) {
    console.error("Error opening modal:", err);
  }
});

// --- Handle modal submissions ---
app.post("/slack/actions", async (req, res) => {
  res.status(200).send(""); // must respond instantly to Slack
  const payload = JSON.parse(req.body.payload);

  try {
    const giver = payload.user.id;
    const receiver = payload.view.state.values.user_block.user.selected_user;
    const coreValue = payload.view.state.values.value_block.value.selected_option.text.text;
    const message = payload.view.state.values.message_block.message.value;

    // --- Post to Slack channel ---
    const coreValueEmojiMap = {
      "Positive Energy": ":zap:",
      "Team Player": ":handshake:",
      "Constant Improvement": ":arrow_up:",
      "Forward Thinking": ":compass:",
      "Deliver Performance": ":trophy:"
    };
    const coreEmoji = coreValueEmojiMap[coreValue] || "";

    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: "🙌 High-Five Alert! 🙌",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:raised_hands: *High-Five Alert!* :raised_hands:\n<@${receiver}> just received a High-Five!` } },
        { type: "section", text: { type: "mrkdwn", text: `*Core Value:* ${coreEmoji} ${coreValue}\n*Reason:* ${message}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `From <@${giver}>` }] },
        { type: "section", text: { type: "mrkdwn", text: ":tada: Keep spreading positivity and recognizing your teammates! :tada:" } }
      ]
    });

    // --- Log to Google Sheets ---
    if (GOOGLE_SHEETS_WEBHOOK) {
      await fetch(GOOGLE_SHEETS_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: giver, recipientId: receiver, coreValue, message })
      });
    }
  } catch (err) {
    console.error("Error handling modal submission:", err);
  }
});

// --- Health check ---
app.get("/", (req, res) => res.send("OK"));

// --- Start server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
