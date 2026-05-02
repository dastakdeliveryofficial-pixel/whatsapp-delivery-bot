const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ============================================
// IN-MEMORY ORDER STORE
// ============================================
const orders = {}; // { orderId: { customer, phone, item, status, rider } }
const customerState = {}; // { phone: { step, orderData } }

let orderCounter = 1000;

// ============================================
// WEBHOOK VERIFY (Meta se verification)
// ============================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================
// WEBHOOK RECEIVE (Customer messages)
// ============================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Meta ko turant 200 do

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) return;

    const message = value.messages[0];
    const customerPhone = message.from;
    const customerName = value.contacts?.[0]?.profile?.name || "Customer";

    let messageText = "";

    // Text message
    if (message.type === "text") {
      messageText = message.text.body;
    }
    // Voice note
    else if (message.type === "audio") {
      messageText = "[Voice Note - Text mein likhen please]";
      await sendWhatsAppMessage(
        customerPhone,
        "Aapki voice note mili! Abhi voice support limited hai. Kripya text mein order likhein 🙏"
      );
      return;
    } else {
      return;
    }

    console.log(`📩 Message from ${customerName} (${customerPhone}): ${messageText}`);

    // AI se reply generate karo
    const aiReply = await processWithAI(customerPhone, customerName, messageText);

    // Customer ko reply bhejo
    await sendWhatsAppMessage(customerPhone, aiReply.customerReply);

    // Agar order confirm hua to rider ko bhejo
    if (aiReply.orderConfirmed && aiReply.orderData) {
      const orderId = "ORD-" + (++orderCounter);
      orders[orderId] = {
        id: orderId,
        customer: customerName,
        phone: customerPhone,
        item: aiReply.orderData.item,
        address: aiReply.orderData.address,
        status: "pending",
        time: new Date().toLocaleTimeString("en-PK"),
      };

      // Rider ko order bhejo
      if (process.env.RIDER_PHONE) {
        await sendWhatsAppMessage(
          process.env.RIDER_PHONE,
          `🔔 *NAYA ORDER!*\n\n` +
          `Order ID: ${orderId}\n` +
          `Customer: ${customerName}\n` +
          `Phone: ${customerPhone}\n` +
          `Item: ${aiReply.orderData.item}\n` +
          `Address: ${aiReply.orderData.address}\n` +
          `Time: ${orders[orderId].time}\n\n` +
          `Deliver karne ke baad "DELIVERED ${orderId}" likhein ✅`
        );
        console.log(`🚴 Order ${orderId} rider ko bheja gaya!`);
      }
    }

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ============================================
// RIDER MESSAGE HANDLE (Delivery confirmation)
// ============================================
app.post("/rider", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const riderMessage = message.text.body.toUpperCase();

    if (riderMessage.startsWith("DELIVERED")) {
      const orderId = riderMessage.split(" ")[1];
      if (orders[orderId]) {
        const order = orders[orderId];
        order.status = "delivered";

        // Customer ko notification bhejo
        await sendWhatsAppMessage(
          order.phone,
          `✅ *Aapka order deliver ho gaya!*\n\n` +
          `Order ID: ${orderId}\n` +
          `Item: ${order.item}\n\n` +
          `Shukriya aapka! Dobara order karne ke liye message karein 🙏⭐`
        );

        console.log(`✅ Order ${orderId} delivered!`);
      }
    }
  } catch (err) {
    console.error("❌ Rider webhook error:", err.message);
  }
});

// ============================================
// CLAUDE AI - Language & Order Processing
// ============================================
async function processWithAI(phone, name, message) {
  try {
    const systemPrompt = `Tu ek smart delivery service ka AI assistant hai.
Tu Roman Urdu, Roman Sindhi, aur English samajhta hai aur usi language mein reply karta hai.

Tera kaam:
1. Customer ka order lena (kya chahiye aur address)
2. Order confirm karna
3. Order track karna

Rules:
- Hamesha friendly raho
- Agar order mein item aur address dono hain to orderConfirmed: true karo
- Reply short rakho (2-3 lines)
- JSON format mein respond karo

Response format (SIRF JSON, kuch aur nahi):
{
  "customerReply": "customer ko bhejne wala message",
  "orderConfirmed": true/false,
  "orderData": {
    "item": "order item",
    "address": "delivery address"
  }
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Customer name: ${name}\nMessage: ${message}`,
        },
      ],
    });

    const text = response.content[0].text.trim();
    const json = JSON.parse(text);
    return json;

  } catch (err) {
    console.error("AI error:", err.message);
    return {
      customerReply: "Shukriya! Aapka message mila. Thodi der mein reply karenge.",
      orderConfirmed: false,
      orderData: null,
    };
  }
}

// ============================================
// WHATSAPP MESSAGE SEND FUNCTION
// ============================================
async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`✅ Message sent to ${to}`);
  } catch (err) {
    console.error("❌ Message send error:", err.response?.data || err.message);
  }
}

// ============================================
// HEALTH CHECK
// ============================================
app.get("/", (req, res) => {
  res.json({
    status: "✅ WhatsApp Delivery Bot Running!",
    orders: Object.keys(orders).length,
    time: new Date().toLocaleString("en-PK"),
  });
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WhatsApp Bot ready!`);
});
