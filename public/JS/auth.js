// public/js/auth.js

let currentUserStatus = "guest"; 
const adminUID = "zaq6RAandkQmPGFKwBdeZEWoArC2"; // 系統管理員 UID

// 1. 監聽使用者的登入狀態
auth.onAuthStateChanged((user) => {
    const btn = document.getElementById('mainLoginBtn');
    
    if (user) {
        if (user.uid === adminUID) {
            // 是系統管理員
            currentUserStatus = "admin";
            if(btn) {
                btn.innerText = "⭐ 進入系統後台";
                btn.classList.add("btn-boss-mode");
            }
            // 如果在首頁登入成功，直接跳轉後台
            if(window.location.pathname.includes("index.html") || window.location.pathname === "/") {
                window.location.href = "admin.html";
            }
        } else {
            // 是一般會員
            currentUserStatus = "member";
            if(btn) {
                btn.innerText = "登出會員";
                btn.classList.remove("btn-boss-mode");
            }
        }
    } else {
        // 沒登入的訪客
        currentUserStatus = "guest";
        if(btn) {
            btn.innerText = "登入 / 註冊";
            btn.classList.remove("btn-boss-mode");
        }
    }
});

// 2. 首頁右上角按鈕的點擊邏輯
function handleMainBtnClick() {
    if (currentUserStatus === "admin") {
        window.location.href = "admin.html";
    } else if (currentUserStatus === "member") {
        auth.signOut().then(() => alert("已登出會員！"));
    } else {
        openLoginModal(); 
    }
}

// 3. 執行帳號密碼登入
function loginWithAccount() {
    const acc = document.getElementById('accountInput').value;
    const pwd = document.getElementById('passwordInput').value;
    if(!acc || !pwd) { alert("請輸入帳號與密碼！"); return; }

    auth.signInWithEmailAndPassword(acc, pwd)
        .then((userCredential) => {
            if(userCredential.user.uid !== adminUID) {
                alert("登入成功！");
                closeLoginModal();
            }
        })
        .catch((error) => alert("登入失敗，請檢查帳號密碼。"));
}

// 4. 控制彈出視窗
function openLoginModal() { document.getElementById('loginModal').classList.add('active'); }
function closeLoginModal() { document.getElementById('loginModal').classList.remove('active'); }

// 點擊黑屏背景關閉視窗
window.addEventListener('click', function(e) { 
    const modal = document.getElementById('loginModal');
    if (e.target === modal) { closeLoginModal(); } 
});