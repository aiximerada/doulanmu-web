const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// 🔑 LINE 金鑰設定
const LINE_CHANNEL_ID = "2009522496";
const LINE_CHANNEL_SECRET = "06f8a9ae273517d78f845975ebe8eb62";
const CALLBACK_URL = "https://us-central1-duolanmu.cloudfunctions.net/lineCallback";

const LINE_ACCESS_TOKEN = "p6ugh27GDssmbdkmySR4Z/6QykwBCwpxyQzRvpjJqJAR8zGbTUH0MbhlsMYKAZFrcEWozoAXRflXW+z5P0+EWNPPgVXfjkeYAcFrRleCM3Spwdjsy43Af2S3yNwEoY+G8Us2LtzKXcMpjVQ8DnOovAdB04t89/1O/w1cDnyilFU="; 
const ADMIN_LINE_ID = "U438eb7cb22b7077937c59815811eee40"; 

// 🌐 LINE 登入系統
exports.lineLogin = functions.https.onRequest((req, res) => {
    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=12345abcde&scope=profile%20openid%20email`;
    res.redirect(url);
});

exports.lineCallback = functions.https.onRequest(async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("授權失敗");

    try {
        const tokenParams = new URLSearchParams();
        tokenParams.append('grant_type', 'authorization_code');
        tokenParams.append('code', code);
        tokenParams.append('redirect_uri', CALLBACK_URL);
        tokenParams.append('client_id', LINE_CHANNEL_ID);
        tokenParams.append('client_secret', LINE_CHANNEL_SECRET);

        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenParams });
        const tokenData = await tokenRes.json();

        const profileRes = await fetch('https://api.line.me/v2/profile', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        const profile = await profileRes.json();

        const firebaseUid = `line:${profile.userId}`;
        try {
            await admin.auth().getUser(firebaseUid);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                await admin.auth().createUser({ uid: firebaseUid, displayName: profile.displayName, photoURL: profile.pictureUrl });
            }
        }
        const customToken = await admin.auth().createCustomToken(firebaseUid);
        res.redirect(`https://duolanmu.com/login.html?token=${customToken}`);
    } catch (error) {
        console.error(error); res.status(500).send("登入發生錯誤");
    }
});

// 🤖 LINE 智慧客服機器人 (Webhook)
exports.lineWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") return res.status(200).send("OK");
    const events = req.body.events;
    
    for (let event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const text = event.message.text;
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            if (/(訂單|進度|查詢|物流|出貨|買了什麼)/.test(text)) {
                await handleOrderQuery(userId, replyToken);
            } else if (/(商品|買|推薦|商城|購物|手作|皂|能量|天使)/.test(text)) {
                await handleProductQuery(replyToken);
            } else {
                await replyLineMessage(replyToken, fallbackCard());
            }
        }
    }
    res.status(200).send("OK");
});

async function handleOrderQuery(userId, replyToken) {
    try {
        const userDoc = await db.collection("users").doc(`line:${userId}`).get();
        if (!userDoc.exists || !userDoc.data().name) {
            return await replyLineMessage(replyToken, simpleTextCard("⚠️ 尚未綁定姓名", "請先至官網「設定」中填寫您的真實姓名，系統才能為您找回專屬訂單喔！", "前往設定", "https://duolanmu.com/admin.html"));
        }
        
        const userName = userDoc.data().name;
        const ordersSnap = await db.collection("orders").where("customerName", "==", userName).get();
        
        if (ordersSnap.empty) {
            return await replyLineMessage(replyToken, simpleTextCard("查無訂單", `目前沒有查到屬於「${userName}」的訂單喔！快去商城逛逛吧 ✨`, "前往商城", "https://duolanmu.com/shop.html"));
        }

        let orders = [];
        ordersSnap.forEach(doc => orders.push(doc.data()));
        orders.sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        const latestOrder = orders[0]; 
        
        await replyLineMessage(replyToken, orderStatusCard(latestOrder, "📦 您的最新訂單狀態"));
    } catch (e) {
        await replyLineMessage(replyToken, simpleTextCard("查詢錯誤", "宇宙頻率暫時受到干擾，請稍後再試。"));
    }
}

async function handleProductQuery(replyToken) {
    try {
        const productsSnap = await db.collection("products").orderBy("createdAt", "desc").limit(5).get();
        if (productsSnap.empty) {
            return await replyLineMessage(replyToken, simpleTextCard("準備中", "店長正在為您準備高頻能量好物，請稍後再來逛逛喔 ✨", "前往商城", "https://duolanmu.com/shop.html"));
        }
        
        let carouselBubbles = [];
        productsSnap.forEach(doc => {
            const p = doc.data();
            carouselBubbles.push(productBubble(p));
        });
        
        const flexMsg = {
            type: "flex", altText: "✨ 最新熱賣能量商品",
            contents: { type: "carousel", contents: carouselBubbles }
        };
        await replyLineMessage(replyToken, [flexMsg]);
    } catch (e) {
        console.log(e);
    }
}

// 📤 訂單自動推播系統
exports.notifyNewOrder = functions.firestore.document('orders/{orderId}').onCreate(async (snap, context) => {
    const order = snap.data();
    if (ADMIN_LINE_ID) await pushLineMessage(ADMIN_LINE_ID, orderStatusCard(order, "🔔 新訂單通知 (店長專屬)"));
    try {
        const usersSnap = await db.collection('users').where('name', '==', order.customerName).get();
        if (!usersSnap.empty) {
            const userDoc = usersSnap.docs[0];
            const uid = userDoc.id; 
            if (uid.startsWith('line:')) await pushLineMessage(uid.replace('line:', ''), orderStatusCard(order, "🎉 訂單成立通知"));
        }
    } catch (e) { console.error("通知客人失敗", e); }
});

// 🎨 LINE 卡片設計庫
async function replyLineMessage(replyToken, messages) {
    await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
        body: JSON.stringify({ replyToken: replyToken, messages: Array.isArray(messages) ? messages : [messages] })
    });
}
async function pushLineMessage(userId, messages) {
    await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
        body: JSON.stringify({ to: userId, messages: Array.isArray(messages) ? messages : [messages] })
    });
}
function orderStatusCard(order, titleText) {
    return { type: "flex", altText: titleText, contents: { type: "bubble", header: { type: "box", layout: "vertical", backgroundColor: "#1a0b2e", contents: [ { type: "text", text: titleText, weight: "bold", color: "#d4af37", size: "md" } ]}, body: { type: "box", layout: "vertical", spacing: "md", contents: [ { type: "box", layout: "horizontal", contents: [ { type: "text", text: "訂購人", color: "#888888", size: "sm", flex: 2 }, { type: "text", text: order.customerName, color: "#111111", size: "sm", flex: 5, wrap: true } ] }, { type: "box", layout: "horizontal", contents: [ { type: "text", text: "目前狀態", color: "#888888", size: "sm", flex: 2 }, { type: "text", text: order.status, color: "#e74c3c", weight: "bold", size: "sm", flex: 5 } ] }, { type: "box", layout: "horizontal", contents: [ { type: "text", text: "商品明細", color: "#888888", size: "sm", flex: 2 }, { type: "text", text: order.itemName, color: "#111111", size: "sm", flex: 5, wrap: true } ] }, { type: "separator", margin: "md", color: "#d4af37" }, { type: "box", layout: "horizontal", margin: "md", contents: [ { type: "text", text: "總計金額", color: "#888888", size: "sm", flex: 2 }, { type: "text", text: `NT$ ${order.price}`, color: "#d4af37", weight: "bold", size: "md", flex: 5 } ] } ]}, footer: { type: "box", layout: "vertical", contents: [ { type: "button", style: "primary", color: "#d4af37", action: { type: "uri", label: "查看訂單詳情", uri: "https://duolanmu.com/admin.html" } } ]} } };
}
function productBubble(p) {
    const imgUrl = p.photoBase64 && p.photoBase64.startsWith('http') ? p.photoBase64 : "https://via.placeholder.com/300x300/1a0b2e/d4af37?text=DouLanMu";
    return { type: "bubble", size: "micro", hero: { type: "image", url: imgUrl, size: "full", aspectRatio: "1:1", aspectMode: "cover" }, body: { type: "box", layout: "vertical", paddingAll: "15px", contents: [ { type: "text", text: p.name, weight: "bold", size: "md", wrap: true }, { type: "text", text: `NT$ ${p.price}`, color: "#d4af37", weight: "bold", size: "sm", margin: "md" } ]}, footer: { type: "box", layout: "vertical", spacing: "sm", contents: [ { type: "button", style: "primary", color: "#1a0b2e", action: { type: "uri", label: "前往選購", uri: `https://duolanmu.com/shop.html?category=${p.category || 'product'}` } } ]} };
}
function fallbackCard() {
    return { type: "flex", altText: "朵藍姆光商城 - 服務選單", contents: { type: "bubble", header: { type: "box", layout: "vertical", backgroundColor: "#0f051a", contents: [ { type: "text", text: "朵藍姆光工作室", weight: "bold", color: "#d4af37", align: "center" } ]}, body: { type: "box", layout: "vertical", contents: [ { type: "text", text: "您好！目前我還在學習您的宇宙語 💫\n請問您需要什麼協助呢？", wrap: true, color: "#666666", size: "sm", align: "center" } ]}, footer: { type: "box", layout: "vertical", spacing: "sm", contents: [ { type: "button", style: "primary", color: "#d4af37", action: { type: "message", label: "📦 查詢我的訂單", text: "我想查詢訂單進度" } }, { type: "button", style: "primary", color: "#d4af37", action: { type: "message", label: "🌿 熱賣商品推薦", text: "有什麼推薦的商品嗎？" } }, { type: "button", style: "secondary", action: { type: "uri", label: "✨ 前往官方商城", uri: "https://duolanmu.com" } } ]} } };
}
function simpleTextCard(title, text, btnLabel, btnUri) {
    return { type: "flex", altText: title, contents: { type: "bubble", body: { type: "box", layout: "vertical", spacing: "md", contents: [ { type: "text", text: title, weight: "bold", color: "#d4af37", size: "lg" }, { type: "text", text: text, wrap: true, color: "#666666", size: "sm" } ]}, footer: { type: "box", layout: "vertical", contents: [ { type: "button", style: "primary", color: "#1a0b2e", action: { type: "uri", label: btnLabel, uri: btnUri } } ]} } };
}