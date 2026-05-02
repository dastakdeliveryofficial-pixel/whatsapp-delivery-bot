# 🚀 WhatsApp AI Delivery Bot

AI-powered WhatsApp delivery management system.
Roman Urdu, Roman Sindhi aur English support ke saath.

## Features
- ✅ Customer orders automatically receive karta hai
- ✅ Roman Urdu, Sindhi, English samajhta hai
- ✅ Rider ko auto order forward karta hai
- ✅ Delivery hone par customer ko auto notify karta hai
- ✅ Claude AI se powered

## Setup Guide

### Step 1 - Railway mein Variables add karo
Railway dashboard → aapka project → Variables tab:

| Variable | Value |
|---|---|
| WHATSAPP_TOKEN | Meta se copy karo |
| PHONE_NUMBER_ID | Meta API Setup se |
| VERIFY_TOKEN | koi bhi string jaise: mySecret123 |
| CLAUDE_API_KEY | console.anthropic.com se |
| RIDER_PHONE | 923001234567 (+ ke bina) |

### Step 2 - Meta Webhook set karo
Callback URL: `https://aapki-railway-url.railway.app/webhook`
Verify Token: jo aapne VERIFY_TOKEN mein rakha

### Step 3 - Rider ka number
.env mein RIDER_PHONE mein rider ka number daalein

## Rider Commands
Rider deliver karne ke baad yeh message bheje:
```
DELIVERED ORD-1001
```
Customer ko automatically notification chali jaayegi!

## Health Check
`https://aapki-url.railway.app/` par jao - status dikhega
