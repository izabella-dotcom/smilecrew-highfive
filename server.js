import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import { WebClient } from "@slack/web-api";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// -------------------------
// Environment Variables
// -------------------------
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const HIGHFIVE_CHANNEL = process.env.HIGHFIVE_CHANNEL; // e.g., C0A42PE9MEC
const ADMIN_USER_ID = process.env.ADMIN_USER_ID; // e.g., U07KQJYA7F0

const client = new WebClient(SLACK_BOT_TOKEN);

// -------------------------
// Slash command: /highfive
// -------------------------
app.post("/slack/highfive", async (req, res) => {
  console.log("Received /highfive command:", req.body);

  // Respond immediately to prevent timeout
  res.status(200).send();

  const triggerId = req.body.trigger_id;

  try {
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
    console.log("High-Five modal opened successfully");
  } catch (err) {
    console.error("Error opening modal:", err);
  }
});

// -------------------------
// Modal submission handler
// -------------------------
app.post("/slack/actions", async (req, res) => {
  res.status(200).send(); // respond immediately to Slack

  try {
    const payload = JSON.parse(req.body.payload);
    const giver = payload.user.id;
    const receiver = payload.view.state.values.user_block.user.selected_user;
    const coreValue = payload.view.state.values.value_block.value.selected_option.text.text;
    const message = payload.view.state.values.message_block.message.value;

    console.log(`High-Five from ${giver} to ${receiver}: ${coreValue} - ${message}`);

    // Post High-Five card in #high-fives
    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: "🙌 High-Five! 🙌",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*<@${receiver}>* just received a High-Five!` } },
        { type: "section", text: { type: "mrkdwn", text: `*Core Value:* ${coreValue}\n*Reason:* ${message}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `From <@${giver}>` }] }
      ]
    });

    // Update hidden leaderboard
    let leaderboard = { usersRecognized: {}, usersGave: {} };
    if (fs.existsSync("leaderboard.json")) {
      leaderboard = JSON.parse(fs.readFileSync("leaderboard.json"));
    }

    leaderboard.usersRecognized[receiver] = (leaderboard.usersRecognized[receiver] || 0) + 1;
    leaderboard.usersGave[giver] = (leaderboard.usersGave[giver] || 0) + 1;

    fs.writeFileSync("leaderboard.json", JSON.stringify(leaderboard, null, 2));
    console.log("Leaderboard updated successfully");
  } catch (err) {
    console.error("Error handling modal submission:", err);
  }
});

// -------------------------
// Optional admin leaderboard command
// -------------------------
app.post("/slack/leaderboard", async (req, res) => {
  res.status(200).send();

  const userId = req.body.user_id;
  if (userId !== ADMIN_USER_ID) return;

  try {
    let leaderboard = { usersRecognized: {}, usersGave: {} };
    if (fs.existsSync("leaderboard.json")) {
      leaderboard = JSON.parse(fs.readFileSync("leaderboard.json"));
    }

    const blocks = [];
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Leaderboard — Users Recognized*" } });
    for (const [user, count] of Object.entries(leaderboard.usersRecognized)) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `<@${user}>: ${count}` } });
    }

    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Leaderboard — Users Gave*" } });
    for (const [user, count] of Object.entries(leaderboard.usersGave)) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `<@${user}>: ${count}` } });
    }

    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: "High-Five Leaderboard",
      blocks
    });

    console.log("Leaderboard posted successfully");
  } catch (err) {
    console.error("Error posting leaderboard:", err);
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
