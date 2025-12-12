import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("High Five Bot is running!");
});

// Slack interaction endpoint
app.post("/slack/actions", async (req, res) => {
  console.log("Incoming Slack action:", req.body);
  res.status(200).send(); 
});

// Slack slash command endpoint
app.post("/slack/highfive", async (req, res) => {
  res.send("Your high-five is being processed!");
});

app.listen(3000, () => console.log("Server running on port 3000"));
