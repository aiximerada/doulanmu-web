const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// 你的 LINE 專屬鑰匙
const LINE_CHANNEL_ID = "2009522496";
const LINE_CHANNEL_SECRET = "06f8a9ae273517d78f845975ebe8eb62";

// ⚠️ 這裡要填寫你部署後的網址 (我們等一下會拿到)
// 預設通常長這樣，請先把 duolanmu 換成你的 Firebase 專案 ID
const CALLBACK_URL = "https://us-central1-duolanmu.cloudfunctions.net/lineCallback";

exports.lineLogin = functions.https.onRequest((req, res) => {
    // 1. 引導客人去 LINE 的授權畫面
    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=12345abcde&scope=profile%20openid%20email`;
    res.redirect(url);
});

exports.lineCallback = functions.https.onRequest(async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("授權失敗，沒有取得代碼");

    try {
        // 2. 拿著客人的代碼，去跟 LINE 換取 Token
        const tokenParams = new URLSearchParams();
        tokenParams.append('grant_type', 'authorization_code');
        tokenParams.append('code', code);
        tokenParams.append('redirect_uri', CALLBACK_URL);
        tokenParams.append('client_id', LINE_CHANNEL_ID);
        tokenParams.append('client_secret', LINE_CHANNEL_SECRET);

        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams
        });
        const tokenData = await tokenRes.json();

        // 3. 拿 Token 去跟 LINE 要客人的大頭貼跟名字
        const profileRes = await fetch('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profile = await profileRes.json();

        // 4. 在 Firebase 建立這個客人的專屬檔案
        const firebaseUid = `line:${profile.userId}`;
        try {
            await admin.auth().getUser(firebaseUid);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                await admin.auth().createUser({
                    uid: firebaseUid,
                    displayName: profile.displayName,
                    photoURL: profile.pictureUrl,
                });
            }
        }

        // 5. 產生 Firebase 專屬通行證 (Custom Token)
        const customToken = await admin.auth().createCustomToken(firebaseUid);

        // 6. 把通行證帶回你的登入網頁 (請確認你的網址是不是 duolanmu.com)
        res.redirect(`https://duolanmu.com/login.html?token=${customToken}`);

    } catch (error) {
        console.error(error);
        res.status(500).send("LINE 登入處理發生錯誤，請聯絡店長。");
    }
});