const { Client, Account, Databases, ID, Query } = Appwrite;

// --- CONFIGURATION (APKI IDs YAHAAN SET HAIN) ---
const PROJECT_ID = "69bed9e40025dfc91579";
const ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
const DATABASE_ID = "69beea7300210c16d0bc"; // ChatDB

// Table IDs (Agar Appwrite me alag ID hai toh yahan change karein)
const TABLE_USERS = "users_profile";
const TABLE_MESSAGES = "messages";
const TABLE_GROUPS = "groups";

// --- INITIALIZATION ---
const CLIENT = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

const ACCOUNT = new Account(CLIENT);
const DB = new Databases(CLIENT);

// Global Variables
let CURRENT_USER = null;
let CHAT_PARTNER_ID = null;

// --- 1. AUTHENTICATION ---

async function handleLogin() {
    const email = document.getElementById("emailInput").value;
    const pass = document.getElementById("passInput").value;
    const name = document.getElementById("nameInput").value;

    if (!email || !pass) return alert("Please fill email and password");

    try {
        // Try Login
        await ACCOUNT.createEmailSession(email, pass);
        initApp();
    } catch (e) {
        // If login fails, try Signup
        if (!name) return alert("Please enter your Name for Signup");
        
        try {
            await ACCOUNT.create(ID.unique(), email, pass, name);
            
            // Create User Profile in Database
            await DB.createDocument(DATABASE_ID, TABLE_USERS, ID.unique(), {
                username: name,
                email: email,
                role: "user",
                blocked_users: []
            });
            
            alert("Signup Successful! Please click Login again.");
        } catch (err) {
            alert("Error: " + err.message);
        }
    }
}

async function initApp() {
    try {
        const user = await ACCOUNT.get();
        CURRENT_USER = user;

        // Get Profile Data
        const profiles = await DB.listDocuments(DATABASE_ID, TABLE_USERS, [
            Query.equal("email", user.email)
        ]);
        
        if (profiles.documents.length === 0) {
            alert("User profile not found in database. Please contact admin.");
            return;
        }
        
        CURRENT_USER.profile = profiles.documents[0];

        // UI Update
        document.getElementById("authScreen").classList.add("hidden");
        document.getElementById("mainScreen").style.display = "flex";
        document.getElementById("myName").innerText = CURRENT_USER.profile.username;

        // Check Admin Role
        if (CURRENT_USER.profile.role === "admin") {
            document.getElementById("adminAccess").classList.remove("hidden");
        }

        loadContacts();
        setInterval(fetchMessages, 2000); // Auto refresh
        
    } catch (e) {
        console.log(e);
    }
}

function logout() {
    ACCOUNT.deleteSession("current");
    location.reload();
}

// --- 2. CONTACTS ---

async function loadContacts() {
    const listDiv = document.getElementById("contactsList");
    listDiv.innerHTML = "<div class='list-item' style='font-weight:bold; background:#ddd;'>USERS</div>";

    // Load Users
    try {
        const users = await DB.listDocuments(DATABASE_ID, TABLE_USERS);
        users.documents.forEach(u => {
            if (u.email !== CURRENT_USER.email) {
                const div = document.createElement("div");
                div.className = "list-item";
                div.innerText = u.username + (u.role === "support" ? " (Support)" : "");
                div.onclick = () => openChat(u.$id, u.username, "user");
                listDiv.appendChild(div);
            }
        });
    } catch (e) { console.log("Error loading users", e); }

    // Load Groups
    listDiv.innerHTML += "<div class='list-item' style='font-weight:bold; background:#ddd; margin-top:20px;'>GROUPS</div>";
    try {
        const groups = await DB.listDocuments(DATABASE_ID, TABLE_GROUPS);
        groups.documents.forEach(g => {
            const div = document.createElement("div");
            div.className = "list-item";
            div.innerText = "👥 " + g.name;
            div.onclick = () => openChat(g.$id, g.name, "group");
            listDiv.appendChild(div);
        });
    } catch (e) { console.log("Error loading groups", e); }
}

// --- 3. CHAT FUNCTIONS ---

function openChat(id, name, type) {
    CHAT_PARTNER_ID = id;
    document.getElementById("chatTitle").innerText = name;
    document.getElementById("chatMessages").innerHTML = "";
    
    // Show Block button only for users
    document.getElementById("blockBtn").classList.toggle("hidden", type === "group");
    
    fetchMessages();
}

async function sendMessage() {
    const input = document.getElementById("msgInput");
    const text = input.value;
    if (!text || !CHAT_PARTNER_ID) return;

    try {
        await DB.createDocument(DATABASE_ID, TABLE_MESSAGES, ID.unique(), {
            sender_id: CURRENT_USER.$id,
            receiver_id: CHAT_PARTNER_ID,
            message: text,
            type: "text",
            created_at: new Date().toISOString()
        });
        
        input.value = "";
        fetchMessages();
    } catch (e) {
        alert("Error sending message: " + e.message);
    }
}

async function fetchMessages() {
    if (!CHAT_PARTNER_ID) return;

    try {
        const res = await DB.listDocuments(DATABASE_ID, TABLE_MESSAGES, [
            Query.orderDesc("created_at"),
            Query.limit(100)
        ]);

        const box = document.getElementById("chatMessages");
        box.innerHTML = "";

        // Filter logic
        const relevantMsgs = res.documents.filter(m => 
            (m.sender_id === CURRENT_USER.$id && m.receiver_id === CHAT_PARTNER_ID) ||
            (m.sender_id === CHAT_PARTNER_ID && m.receiver_id === CURRENT_USER.$id)
        );

        relevantMsgs.reverse().forEach(m => {
            const div = document.createElement("div");
            div.className = "msg " + (m.sender_id === CURRENT_USER.$id ? "my-msg" : "");
            div.innerText = m.message;
            box.appendChild(div);
        });
        
        box.scrollTop = box.scrollHeight;
        
    } catch (e) {
        console.log("Error fetching messages", e);
    }
}

// --- 4. GROUP & BLOCK ---

async function createGroupPrompt() {
    const name = prompt("Enter Group Name:");
    if (name) {
        try {
            await DB.createDocument(DATABASE_ID, TABLE_GROUPS, ID.unique(), {
                name: name,
                created_by: CURRENT_USER.$id,
                members: [CURRENT_USER.$id]
            });
            alert("Group Created!");
            loadContacts();
        } catch(e) {
            alert("Error creating group: " + e.message);
        }
    }
}

async function blockUser() {
    if (!CHAT_PARTNER_ID) return;
    let blocked = CURRENT_USER.profile.blocked_users || [];
    if (!blocked.includes(CHAT_PARTNER_ID)) {
        blocked.push(CHAT_PARTNER_ID);
        try {
            await DB.updateDocument(DATABASE_ID, TABLE_USERS, CURRENT_USER.profile.$id, {
                blocked_users: blocked
            });
            alert("User Blocked!");
            CURRENT_USER.profile.blocked_users = blocked;
        } catch(e) {
            alert("Error blocking user");
        }
    } else {
        alert("Already blocked");
    }
}

// --- 5. ADMIN PANEL ---
function openAdmin() {
    const action = prompt("Admin Panel:\nType 'makeadmin USER_DOC_ID' to give admin role.\n(Note: You need the Document ID from Database)");
    if (!action) return;
    
    // Simple logic example
    if (action.startsWith("makeadmin ")) {
        const docId = action.split(" ")[1];
        DB.updateDocument(DATABASE_ID, TABLE_USERS, docId, { role: "admin" })
          .then(() => alert("Done!"))
          .catch(e => alert("Error: " + e.message));
    }
}

// Auto check login on load
window.onload = async () => {
    try {
        await ACCOUNT.get();
        initApp();
    } catch (e) {
        console.log("No active session");
    }
};