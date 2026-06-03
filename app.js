import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyACFKcMgAMBp0GPtE9Qkxv5A-cf_7le7wY",
  authDomain: "blockchain-demo-dd9b6.firebaseapp.com",
  projectId: "blockchain-demo-dd9b6",
  storageBucket: "blockchain-demo-dd9b6.firebasestorage.app",
  messagingSenderId: "665072121716",
  appId: "1:665072121716:web:e5d961881a3063f6f6de21"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const BOX_EMAIL = "olguin.daniel@gmail.com";
let currentUser = null;
let currentIsCreateMode = false;

// DOM Elements
const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
const modalTitle = document.getElementById('modal-title');
const submitAuthBtn = document.getElementById('submit-auth-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const userDisplay = document.getElementById('user-display');
const boxPanel = document.getElementById('box-panel');
const transactionPanel = document.getElementById('transaction-panel');
const createAccountBtn = document.getElementById('create-account-btn');
const accountsList = document.getElementById('accounts-list');
const recipientSelect = document.getElementById('recipient-select');
const transferForm = document.getElementById('transfer-form');
const blockchainContainer = document.getElementById('blockchain-container');
const mintGenesisBtn = document.getElementById('mint-genesis-btn');
const amountInput = document.getElementById('amount-input');
// --- Helper: SHA-256 Hashing ---
async function generateHash(index, previousHash, timestamp, data) {
    const stringToHash = `${index}${previousHash}${timestamp}${JSON.stringify(data)}`;
    const msgBuffer = new TextEncoder().encode(stringToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Auth Handling ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userDisplay.textContent = user.email;
        authBtn.textContent = "Logout";
        transactionPanel.classList.remove('hidden');
        
        if (user.email === BOX_EMAIL) {
            boxPanel.classList.remove('hidden');
        } else {
            boxPanel.classList.add('hidden');
        }
    } else {
        currentUser = null;
        userDisplay.textContent = "Not logged in";
        authBtn.textContent = "Login";
        boxPanel.classList.add('hidden');
        transactionPanel.classList.add('hidden');
    }
});

authBtn.addEventListener('click', () => {
    if (currentUser) {
        signOut(auth);
    } else {
        currentIsCreateMode = false;
        modalTitle.textContent = "Login";
        authModal.classList.remove('hidden');
    }
});

createAccountBtn.addEventListener('click', () => {
    currentIsCreateMode = true;
    modalTitle.textContent = "Create New Account";
    authModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => authModal.classList.add('hidden'));

submitAuthBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) return alert("Fill out all fields.");

    try {
        if (currentIsCreateMode) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", email), { email: email, balance: 0 });
            alert("Account created successfully!");
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        authModal.classList.add('hidden');
        emailInput.value = '';
        passwordInput.value = '';
    } catch (error) {
        alert(error.message);
    }
});

// --- Blockchain Logic & Database Sync ---

// 1. Live sync network account balances
onSnapshot(collection(db, "users"), (snapshot) => {
    accountsList.innerHTML = '';
    recipientSelect.innerHTML = '<option value="">Select a user...</option>';
    
    snapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        
        // Update Account List View
        const li = document.createElement('li');
        li.innerHTML = `<strong>${userData.email}</strong> <span>${userData.balance} TOKENS</span>`;
        if(userData.email === BOX_EMAIL) li.style.color = 'var(--primary)';
        accountsList.appendChild(li);

        // Update Transfer Dropdown selections (excluding active user)
        if (currentUser && userData.email !== currentUser.email) {
            const opt = document.createElement('option');
            opt.value = userData.email;
            opt.textContent = userData.email;
            recipientSelect.appendChild(opt);
        }
    });
});

// 2. Live sync block explorer log
const blocksQuery = query(collection(db, "blocks"), orderBy("index", "desc"));
onSnapshot(blocksQuery, (snapshot) => {
    blockchainContainer.innerHTML = '';
    
    if(snapshot.empty) {
        blockchainContainer.innerHTML = '<p class="text-muted">The ledger is empty. Mint genesis block to initialize.</p>';
        mintGenesisBtn.removeAttribute('disabled');
        return;
    } else {
        mintGenesisBtn.setAttribute('disabled', 'true');
    }

    snapshot.forEach((docSnap) => {
        const block = docSnap.data();
        const card = document.createElement('div');
        card.className = 'block-card';
        card.innerHTML = `
            <div><strong>Block #${block.index}</strong></div>
            <div class="block-hash"><strong>Hash:</strong> ${block.hash}</div>
            <div class="block-hash"><strong>Prev:</strong> ${block.previousHash}</div>
            <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                <strong>Tx Data:</strong> ${JSON.stringify(block.data)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-align: right;">
                ${new Date(block.timestamp).toLocaleTimeString()}
            </div>
        `;
        blockchainContainer.appendChild(card);
    });
});

// 3. Mint Genesis Block
mintGenesisBtn.addEventListener('click', async () => {
    if (!currentUser || currentUser.email !== BOX_EMAIL) return;

    try {
        const timestamp = Date.now();
        const blockData = { type: "GENESIS", recipient: BOX_EMAIL, amount: 10000 };
        const hash = await generateHash(0, "0000000000000000000000000000000000000000000000000000000000000000", timestamp, blockData);

        await runTransaction(db, async (transaction) => {
            const boxRef = doc(db, "users", BOX_EMAIL);
            const genesisBlockRef = doc(db, "blocks", "block_0");

            transaction.set(genesisBlockRef, {
                index: 0,
                previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
                timestamp: timestamp,
                data: blockData,
                hash: hash
            });
            transaction.set(boxRef, { email: BOX_EMAIL, balance: 10000 });
        });

        alert("Genesis Block committed securely!");
    } catch (e) {
        console.error(e);
        alert("Minting failed: " + e.message);
    }
});

// 4. Atomic Transaction Transfers
transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const senderEmail = currentUser.email;
    const recipientEmail = recipientSelect.value;
    const transferAmount = parseInt(amountInput.value);

    if (!recipientEmail || isNaN(transferAmount) || transferAmount <= 0) return;

    try {
        await runTransaction(db, async (transaction) => {
            const senderRef = doc(db, "users", senderEmail);
            const recipientRef = doc(db, "users", recipientEmail);
            
            // Get latest block to establish hash lineage chain link
            const blocksRef = collection(db, "blocks");
            const q = query(blocksRef, orderBy("index", "desc"));
            
            // Temporary strategy for getting latest block snapshot inside a transaction context
            const senderSnap = await transaction.get(senderRef);
            const recipientSnap = await transaction.get(recipientRef);

            if (!senderSnap.exists() || senderSnap.data().balance < transferAmount) {
                throw new Error("Insufficient balance available.");
            }

            // Read network chain height out of transaction by querying separately or using a global count tracking doc
            const currentBal = senderSnap.data().balance;
            const targetBal = recipientSnap.exists() ? recipientSnap.data().balance : 0;

            // Generate temporary index via explicit timestamp or random token unique tracking ID mapping block lists
            const indexValue = Date.now(); 
            const txData = { sender: senderEmail, recipient: recipientEmail, amount: transferAmount };
            const pseudoPrevHash = "Simulated_Lineage_Hash_Link"; 
            const computedHash = await generateHash(indexValue, pseudoPrevHash, indexValue, txData);

            transaction.update(senderRef, { balance: currentBal - transferAmount });
            transaction.set(recipientRef, { email: recipientEmail, balance: targetBal + transferAmount }, { merge: true });
            
            const newBlockRef = doc(db, "blocks", `block_${indexValue}`);
            transaction.set(newBlockRef, {
                index: indexValue,
                previousHash: pseudoPrevHash,
                timestamp: indexValue,
                data: txData,
                hash: computedHash
            });
        });

        alert("Transfer success recorded down the ledger entries!");
        transferForm.reset();
    } catch (err) {
        alert("Transaction Aborted: " + err.message);
    }
});