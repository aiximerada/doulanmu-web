// public/js/firebase-config.js

// 1. Firebase 專屬金鑰
const firebaseConfig = {
    apiKey: "AIzaSyAwbENzVJ0-SWFv7DwU-I0IrIGTg1uOGKs",
    authDomain: "duolanmu.firebaseapp.com",
    projectId: "duolanmu",
    storageBucket: "duolanmu.firebasestorage.app",
    messagingSenderId: "11171522617",
    appId: "1:11171522617:web:5d4cad219e3f903fba05e8",
    measurementId: "G-5BJGQYRF3E"
};

// 2. 確保 Firebase 只初始化一次 (避免重複啟動報錯)
if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
}

// 3. 匯出常用的功能常數，方便其他檔案呼叫
const auth = firebase.auth();
const db = firebase.firestore();

console.log("🔥 Firebase 模組載入成功！");