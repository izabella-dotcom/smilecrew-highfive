import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import { WebClient } from "@slack/web-api";
import { google } from "googleapis";
import cron from "node-cron";

// Initialize Express
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Slack client
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

// Environment variables
const HIGHFIVE_CHANNEL = process.env.HIGHFIVE_CHANNEL;

// Google Sheets setup
const sheetsCredentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials: sheetsCredentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheetsClient = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // add your sheet ID here

// Slash command: /highfive
app.post("/slack/highfive", async (req, res) => {
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
            element: { type: "users_select", action_id: "user" },
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
                { text: { type: "plain_text", text: "Deliver Performance" }, value: "performance" },
              ],
            },
          },
          {
            type: "input",
            block_id: "message_block",
            label: { type: "plain_text", text: "Why are you giving this High Five?" },
            element: { type: "plain_text_input", multiline: true, action_id: "message" },
          },
        ],
      },
    });

    res.send("");
  } catch (err) {
    console.error("Error opening modal:", err);
    res.status(500).send("Failed to open modal");
  }
});

// Handle modal submissions
app.post("/slack/actions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  try {
    const giver = payload.user.id;
    const receiver = payload.view.state.values.user_block.user.selected_user;
    const coreValue = payload.view.state.values.value_block.value.selected_option.text.text;
    const message = payload.view.state.values.message_block.message.value;

    // Post a pretty card to Slack
    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: `🙌 <@${giver}> sent a High-Five to <@${receiver}>!`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `🎉 *<@${receiver}>* just received a High-Five!` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Core Value:*\n${coreValue}` },
            { type: "mrkdwn", text: `*From:*\n<@${giver}>` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `💬 *Reason:*\n${message}` },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: ":trophy: Keep up the great work!" }],
        },
        { type: "divider" },
      ],
    });

    // Update hidden JSON leaderboard
    let leaderboard = { usersRecognized: {}, usersGave: {} };
    if (fs.existsSync("leaderboard.json")) {
      leaderboard = JSON.parse(fs.readFileSync("leaderboard.json"));
    }

    leaderboard.usersRecognized[receiver] = (leaderboard.usersRecognized[receiver] || 0) + 1;
    leaderboard.usersGave[giver] = (leaderboard.usersGave[giver] || 0) + 1;
    fs.writeFileSync("leaderboard.json", JSON.stringify(leaderboard, null, 2));

    // Optional: Update Google Sheet
    // This writes/updates each user in the sheet
    for (const [user, count] of Object.entries(leaderboard.usersRecognized)) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!B${parseInt(user)}:B${parseInt(user)}`, // adjust mapping
        valueInputOption: "RAW",
        requestBody: { values: [[count]] },
      });
    }

    res.send("");
  } catch (err) {
    console.error("Error handling modal submission:", err);
    res.status(500).send("Failed to handle submission");
  }
});

// Weekly leaderboard summary
cron.schedule("0 9 * * 1", async () => {
  try {
    if (!fs.existsSync("leaderboard.json")) return;
    const leaderboard = JSON.parse(fs.readFileSync("leaderboard.json"));

    const topReceivers = Object.entries(leaderboard.usersRecognized)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topGivers = Object.entries(leaderboard.usersGave)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const receiversText = topReceivers.map(([user, count], i) => `${i +1}. <@${user}> - ${count}`).join("\n");
    const giversText = topGivers.map(([user, count], i) => `${i +1}. <@${user}> - ${count}`).join("\n");

    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: "🏆 Weekly High-Five Leaders 🏆",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "🏆 Weekly High-Five Leaders 🏆" } },
        { type: "section", text: { type: "mrkdwn", text: "*Top Receivers:*\n" + receiversText } },
        { type: "section", text: { type: "mrkdwn", text: "*Top Givers:*\n" + giversText } },
        { type: "divider" }
      ]
    });
  } catch (err) {
    console.error("Error sending weekly summary:", err);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

