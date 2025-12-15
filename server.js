import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import { WebClient } from "@slack/web-api";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const HIGHFIVE_CHANNEL = process.env.HIGHFIVE_CHANNEL;

// Google Sheets setup
const sheets = google.sheets("v4");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  SCOPES
);
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = "Leader Board"; // exact tab name

// Slash command: /highfive
app.post("/slack/highfive", async (req, res) => {
  const triggerId = req.body.trigger_id;

  try {
    await slack.views.open({
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

    res.send(""); // acknowledge
  } catch (err) {
    console.error("Error opening modal:", err);
    res.status(500).send("Failed to open modal");
  }
});

// Handle modal submissions
app.post("/slack/actions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  try {
    const giverId = payload.user.id;
    const receiverId = payload.view.state.values.user_block.user.selected_user;
    const coreValue = payload.view.state.values.value_block.value.selected_option.text.text;
    const message = payload.view.state.values.message_block.message.value;

    // Post pretty card to Slack
    await slack.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: "🙌 High-Five! 🙌",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*<@${receiverId}>* just received a High-Five!` } },
        { type: "section", text: { type: "mrkdwn", text: `*Core Value:* ${coreValue}\n*Reason:* ${message}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `From <@${giverId}>` }] }
      ]
    });

    // Append to Google Sheets
    const timestamp = new Date().toISOString();
    const sheetsValues = [
      [timestamp, giverId, `<@${giverId}>`, receiverId, `<@${receiverId}>`, coreValue, message]
    ];
    await sheets.spreadsheets.values.append({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: "RAW",
      resource: { values: sheetsValues }
    });

    res.send(""); // acknowledge Slack
  } catch (err) {
    console.error("Error handling modal submission:", err);
    res.status(500).send("Failed to handle submission");
  }
});

// Slash command: /highfive-leaderboard
app.post("/slack/highfive-leaderboard", async (req, res) => {
  try {
    // Read all rows
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return res.send("No High-Fives recorded yet.");
    }

    // Compute top receivers & givers
    const receivers = {};
    const givers = {};
    for (let i = 1; i < rows.length; i++) {
      const [ , giverId, giverName, receiverId, receiverName, coreValue ] = rows[i];
      receivers[receiverName] = (receivers[receiverName] || 0) + 1;
      givers[giverName] = (givers[giverName] || 0) + 1;
    }

    const sortTop = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const topReceivers = sortTop(receivers);
    const topGivers = sortTop(givers);

    // Build Slack message
    const blocks = [
      { type: "header", text: { type: "plain_text", text: "🏆 High-Five Leaderboard" } },
      { type: "section", text: { type: "mrkdwn", text: "*Top Receivers:*" } },
      ...topReceivers.map(([name,count],i)=>({
        type: "section",
        text: { type: "mrkdwn", text: `${i+1}. ${name} — ${count}` }
      })),
      { type: "section", text: { type: "mrkdwn", text: "*Top Givers:*" } },
      ...topGivers.map(([name,count],i)=>({
        type: "section",
        text: { type: "mrkdwn", text: `${i+1}. ${name} — ${count}` }
      }))
    ];

    // Post to Slack
    await slack.chat.postMessage({ channel: HIGHFIVE_CHANNEL, blocks });

    res.send(""); // acknowledge
  } catch (err) {
    console.error("Error posting leaderboard:", err);
    res.status(500).send("Failed to post leaderboard");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
