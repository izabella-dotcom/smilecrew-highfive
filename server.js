import express from "express";
import bodyParser from "body-parser";
import { WebClient } from "@slack/web-api";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

app.post("/slack/highfive", async (req, res) => {
  console.log("Received /highfive command:", req.body);

  // respond immediately
  res.status(200).send();

  const triggerId = req.body.trigger_id;

  try {
    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Test High-Five Modal" },
        submit: { type: "plain_text", text: "Send" },
        close: { type: "plain_text", text: "Cancel" },
        callback_id: "test_modal",
        blocks: [
          { type: "section", text: { type: "plain_text", text: "This is a test modal!" } }
        ]
      }
    });
    console.log("Modal opened successfully");
  } catch (err) {
    console.error("Error opening modal:", err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
