import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import { WebClient } from "@slack/web-api";
import { google } from "googleapis";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- Slack Setup ---
const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const HIGHFIVE_CHANNEL = process.env.HIGHFIVE_CHANNEL;

// --- Google Sheets Setup ---
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = "Leader Board";

// Parse JSON string from environment variable
const creds = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- Slash Command: /highfive ---
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

    res.send(""); // acknowledge Slack
  } catch (err) {
    console.error("Error opening modal:", err);
    res.status(500).send("Failed to open modal");
  }
});

// --- Handle Modal Submission ---
app.post("/slack/actions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  try {
    const giver = payload.user.id;
    const receiver = payload.view.state.values.user_block.user.selected_user;
    const coreValue = payload.view.state.values.value_block.value.selected_option.text.text;
    const message = payload.view.state.values.message_block.message.value;

    // --- Post to Slack ---
    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: `🙌 High-Five! 🙌`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*<@${receiver}>* just received a High-Five!` } },
        { type: "section", text: { type: "mrkdwn", text: `*Core Value:* ${coreValue}\n*Reason:* ${message}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `From <@${giver}>` }] },
      ],
    });

    // --- Update Local Leaderboard JSON ---
    let leaderboard = { usersRecognized: {}, usersGave: {} };
    if (fs.existsSync("leaderboard.json")) {
      leaderboard = JSON.parse(fs.readFileSync("leaderboard.json"));
    }
    leaderboard.usersRecognized[receiver] = (leaderboard.usersRecognized[receiver] || 0) + 1;
    leaderboard.usersGave[giver] = (leaderboard.usersGave[giver] || 0) + 1;
    fs.writeFileSync("leaderboard.json", JSON.stringify(leaderboard, null, 2));

    // --- Update Google Sheet ---
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:E`,
        valueInputOption: "RAW",
        resource: {
          values: [[new Date().toISOString(), giver, receiver, coreValue, message]],
        },
      });
      console.log("Google Sheet updated successfully!");
    } catch (sheetErr) {
      console.error("Error updating Google Sheet:", sheetErr);
    }

    res.send(""); // acknowledge Slack
  } catch (err) {
    console.error("Error handling modal submission:", err);
    res.status(500).send("Failed to handle submission");
  }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
