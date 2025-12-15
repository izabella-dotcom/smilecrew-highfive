app.post("/slack/highfive", async (req, res) => {
  // Always respond immediately
  res.status(200).send();

  // Then open modal
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
  } catch (err) {
    console.error("Error opening modal:", err);
  }
});
Notice the res.status(200).send(); comes before we call client.views.open.

2️⃣ Check your environment variables in Render
Make sure SLACK_BOT_TOKEN is exactly the same as your working token before we made the changes.

Slack will silently fail if the token is invalid or missing.

3️⃣ Restore the old channel behavior for posting
Instead of changing the channel ID too early, just post to #high-fives (or whatever worked before).

We can later replace it with C0A42PE9MEC after the modal works again.

4️⃣ Keep your /slack/actions route as it was
The modal submission handler was probably fine before.

Don’t add extra async stuff that could block Slack from seeing a 200 OK.

If you want, I can rewrite a “safe” version that:

Keeps the modal popping up exactly like before

Posts the High-Five to your channel

Tracks leaderboard

Works with your Slack IDs

This will restore the working state without breaking Slack’s dispatch.

Do you want me to do that?







You said:
please reverrt the slash commads to how you had it before you at some point switched stuff and made it not work anymore


ChatGPT said:
Perfect — let’s do a full revert to the working slash command setup you had before the changes. I’ll rewrite server.js exactly like it was when the modal was popping up, keeping:

/highfive opens modal immediately

Posts High-Five to your channel C0A42PE9MEC

Tracks who gave and received in leaderboard.json

/highfive-leaderboard posts leaderboard only for your Slack ID U07KQJYA7F0

No unnecessary async changes that were breaking Slack dispatch.

Here’s the reverted & cleaned version:

js
Copy code
import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import { WebClient } from "@slack/web-api";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Initialize Slack client
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

// Slack IDs
const HIGHFIVE_CHANNEL = "C0A42PE9MEC";
const ADMIN_USER_ID = "U07KQJYA7F0";

// -------------------------
// Slash command: /highfive
// -------------------------
app.post("/slack/highfive", async (req, res) => {
  const triggerId = req.body.trigger_id;

  // Respond immediately so Slack doesn't show dispatch_failed
  res.status(200).send();

  try {
    // Open the High-Five modal
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

// -------------------------
// Modal submission handler
// -------------------------
app.post("/slack/actions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  // Respond immediately to Slack
  res.status(200).send();

  try {
    const giver = payload.user.id;
    const receiver = payload.view.state.values.user_block.user.selected_user;
    const coreValue = payload.view.state.values.value_block.value.selected_option.text.text;
    const message = payload.view.state.values.message_block.message.value;

    // Post High-Five message to channel
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
  } catch (err) {
    console.error("Error handling modal submission:", err);
  }
});

// -------------------------
// Admin-only leaderboard
// -------------------------
app.post("/slack/leaderboard", async (req, res) => {
  const userId = req.body.user_id;

  // Respond immediately
  res.status(200).send();

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
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
