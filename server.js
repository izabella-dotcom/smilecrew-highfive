app.get("/test-post", async (req, res) => {
  try {
    await client.chat.postMessage({
      channel: HIGHFIVE_CHANNEL,
      text: "Test message from High-Five bot ✅"
    });
    res.send("Test message sent!");
  } catch (err) {
    console.error("Error sending test message:", err);
    res.status(500).send("Failed to send test message");
  }
});
