// =============================================
// WhatsApp AI Delivery Bot - Cloudflare Worker
// Roman Urdu, Roman Sindhi, English Support
// =============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({ status: "✅ WhatsApp Delivery Bot Running!", time: new Date().toISOString() }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Webhook endpoint
    if (url.pathname === "/webhook") {
      // GET - Meta verification
      if (request.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      }

      // POST - Incoming messages
      if (request.method === "POST") {
        const body = await request.json();

        // Background mein process karo
        const ctx = { waitUntil: (p) => p };
        handleMessage(body, env).catch(console.error);

        return new Response("OK", { status: 200 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

// =============================================
// MESSAGE HANDLER
// =============================================
async function handleMessage(body, env) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) return;

    const message = value.messages[0];
    const customerPhone = message.from;
    const customerName = value.contacts?.[0]?.profile?.name || "Customer";

    // Sirf text messages handle karo
    if (message.type !== "text") {
      await sendMessage(
        customerPhone,
        "🙏 Abhi sirf text messages support hain. Apna order text mein likhein!",
        env
      );
      return;
    }

    const messageText = message.text.body;
    console.log(`📩 ${customerName}: ${messageText}`);

    // AI se process karo
    const aiReply = await processWithGemini(customerName, messageText, env);

    // Customer ko reply
    await sendMessage(customerPhone, aiReply.customerReply, env);

    // Order confirm hua to rider ko bhejo
    if (aiReply.orderConfirmed && aiReply.orderData && env.RIDER_PHONE) {
      const orderId = "ORD-" + Date.now().toString().slice(-4);
      const riderMsg =
        `🔔 *NAYA ORDER!*\n\n` +
        `Order ID: ${orderId}\n` +
        `Customer: ${customerName}\n` +
        `Phone: ${customerPhone}\n` +
        `Item: ${aiReply.orderData.item}\n` +
        `Address: ${aiReply.orderData.address}\n` +
        `Time: ${new Date().toLocaleTimeString("en-PK")}\n\n` +
        `✅ Deliver karne k baad likho:\nDELIVERED ${orderId} ${customerPhone}`;

      await sendMessage(env.RIDER_PHONE, riderMsg, env);
    }

    // Rider ne DELIVERED likha
    if (messageText.toUpperCase().startsWith("DELIVERED")) {
      const parts = messageText.split(" ");
      const orderId = parts[1] || "";
      const custPhone = parts[2] || "";

      if (custPhone) {
        await sendMessage(
          custPhone,
          `✅ *Aapka order deliver ho gaya!*\n\n` +
          `Order ID: ${orderId}\n\n` +
          `Shukriya! Dobara order k liye message karein 🙏⭐`
        , env);

        await sendMessage(
          customerPhone,
          `✅ Order ${orderId} delivered confirm ho gaya!`,
          env
        );
      }
    }

  } catch (err) {
    console.error("Handler error:", err);
  }
}

// =============================================
// GOOGLE GEMINI AI
// =============================================
async function processWithGemini(name, message, env) {
  try {
    const prompt = `Tu ek delivery service ka AI assistant hai.
Tu Roman Urdu, Roman Sindhi aur English samajhta hai aur usi language mein reply karta hai.

Tera kaam:
- Customer ka order lena (item aur address dono chahiye)
- Order confirm karna jab dono mil jayein
- Friendly aur short reply karna (2-3 lines)

IMPORTANT: Sirf JSON return karo, kuch aur nahi:
{
  "customerReply": "customer ko message",
  "orderConfirmed": true ya false,
  "orderData": {
    "item": "order item name",
    "address": "delivery address"
  }
}

orderConfirmed sirf tab true karo jab item AUR address dono hon.
Agar sirf item hai address nahi to address manga karo.

Customer name: ${name}
Customer message: ${message}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        }),
      }
    );

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // JSON clean karo
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const json = JSON.parse(text);
    return json;

  } catch (err) {
    console.error("Gemini error:", err);
    return {
      customerReply: "Shukriya! Aapka message mila. Apna order aur address likhein please 🙏",
      orderConfirmed: false,
      orderData: null,
    };
  }
}

// =============================================
// WHATSAPP MESSAGE SEND
// =============================================
async function sendMessage(to, text, env) {
  try {
    await fetch(
      `https://graph.facebook.com/v18.0/${env.PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: text },
        }),
      }
    );
    console.log(`✅ Message sent to ${to}`);
  } catch (err) {
    console.error("Send error:", err);
  }
}
