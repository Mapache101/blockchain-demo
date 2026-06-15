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
let currentPanel = 'ledger';

// ---- Particle Background ----
function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let particles = [];
    const particleCount = 60;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.size = Math.random() * 2 + 0.5;
            this.alpha = Math.random() * 0.3 + 0.1;
            this.color = Math.random() > 0.5 ? '0, 240, 255' : '176, 38, 255';
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.alpha})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0, 240, 255, ${0.05 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();
        requestAnimationFrame(animate);
    }
    animate();
}

// ---- Navigation ----
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.panel');
    const currentPage = document.getElementById('current-page');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPanel = item.dataset.panel;
            if (!targetPanel) return;

            // Update nav active state
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Switch panels
            panels.forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`${targetPanel}-panel`);
            if (panel) panel.classList.add('active');

            // Update breadcrumb
            const titles = {
                ledger: 'LEDGER',
                network: 'NETWORK',
                transfer: 'TRANSFER',
                admin: 'GENESIS CONTROL'
            };
            if (currentPage) currentPage.textContent = titles[targetPanel] || targetPanel.toUpperCase();
            currentPanel = targetPanel;
        });
    });
}

// ---- DOM Elements ----
const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
const modalTitle = document.getElementById('modal-title');
const submitAuthBtn = document.getElementById('submit-auth-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const userDisplay = document.getElementById('user-display');
const createAccountBtn = document.getElementById('create-account-btn');
const accountsList = document.getElementById('accounts-list');
const recipientSelect = document.getElementById('recipient-select');
const transferForm = document.getElementById('transfer-form');
const blockchainContainer = document.getElementById('blockchain-container');
const mintGenesisBtn = document.getElementById('mint-genesis-btn');
const adminMintBtn = document.getElementById('admin-mint-btn');
const amountInput = document.getElementById('amount-input');
const adminNavItem = document.getElementById('admin-nav-item');
const sidebarBlockCount = document.getElementById('sidebar-block-count');
const adminBlockCount = document.getElementById('admin-block-count');
const adminTxCount = document.getElementById('admin-tx-count');
const adminNodeCount = document.getElementById('admin-node-count');
const senderLabel = document.getElementById('sender-label');
const recipientLabel = document.getElementById('recipient-label');

// ---- Helper: SHA-256 Hashing ----
async function generateHash(index, previousHash, timestamp, data) {
    const stringToHash = `${index}${previousHash}${timestamp}${JSON.stringify(data)}`;
    const msgBuffer = new TextEncoder().encode(stringToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- Auth Handling ----
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userDisplay.textContent = user.email;
        authBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
        authBtn.title = "Disconnect";

        // Show transfer nav
        document.querySelector('[data-panel="transfer"]')?.classList.remove('hidden');

        // Update transfer panel sender
        if (senderLabel) senderLabel.textContent = user.email.split('@')[0].toUpperCase();
        document.querySelector('.sender-node')?.classList.add('active');

        // Admin check
        if (user.email === BOX_EMAIL) {
            adminNavItem?.classList.remove('hidden');
            if (currentPanel === 'ledger') {
                mintGenesisBtn?.removeAttribute('disabled');
            }
        } else {
            adminNavItem?.classList.add('hidden');
        }
    } else {
        currentUser = null;
        userDisplay.textContent = "OFFLINE";
        authBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>`;
        authBtn.title = "Authenticate";

        document.querySelector('[data-panel="transfer"]')?.classList.add('hidden');
        adminNavItem?.classList.add('hidden');

        if (senderLabel) senderLabel.textContent = "ORIGIN";
        document.querySelector('.sender-node')?.classList.remove('active');

        // Switch to ledger if on restricted panels
        if (currentPanel === 'transfer' || currentPanel === 'admin') {
            document.querySelector('[data-panel="ledger"]')?.click();
        }
    }
});

authBtn.addEventListener('click', () => {
    if (currentUser) {
        signOut(auth);
    } else {
        currentIsCreateMode = false;
        if (modalTitle) modalTitle.textContent = "AUTHENTICATE";
        authModal?.classList.remove('hidden');
    }
});

createAccountBtn.addEventListener('click', () => {
    currentIsCreateMode = true;
    if (modalTitle) modalTitle.textContent = "NEW IDENTITY";
    authModal?.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => authModal?.classList.add('hidden'));

// Close modal on backdrop click
authModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    authModal.classList.add('hidden');
});

submitAuthBtn.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showToast("Fill out all fields.", "error");
        return;
    }

    try {
        if (currentIsCreateMode) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", email), { email: email, balance: 0 });
            showToast("Identity established successfully.", "success");
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Neural link established.", "success");
        }
        authModal?.classList.add('hidden');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
    } catch (error) {
        showToast(error.message, "error");
    }
});

// ---- Toast Notifications ----
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
        success: 'var(--neon-green)',
        error: 'var(--neon-pink)',
        info: 'var(--neon-cyan)'
    };
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--bg-panel);
        border: 1px solid ${colors[type]};
        border-radius: 8px;
        padding: 16px 24px;
        color: var(--text-primary);
        font-family: var(--font-mono);
        font-size: 0.8rem;
        z-index: 10000;
        box-shadow: 0 0 20px ${colors[type]}20;
        animation: toastSlideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add toast animations to document
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes toastSlideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toastSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
    }
`;
document.head.appendChild(toastStyles);

// ---- Blockchain Logic & Database Sync ----

// 1. Live sync network account balances
onSnapshot(collection(db, "users"), (snapshot) => {
    if (accountsList) accountsList.innerHTML = '';
    if (recipientSelect) recipientSelect.innerHTML = '<option value="">Select target...</option>';

    const nodeCount = snapshot.size;
    if (adminNodeCount) adminNodeCount.textContent = nodeCount;

    // Update network ring visualization
    const networkRing = document.getElementById('network-ring');
    if (networkRing) {
        networkRing.innerHTML = '';
        const count = snapshot.size;
        const radius = 80;
        let i = 0;
        snapshot.forEach(() => {
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius + 100 - 6;
            const y = Math.sin(angle) * radius + 100 - 6;
            const node = document.createElement('div');
            node.className = 'network-node-visual';
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            node.style.animationDelay = (i * 0.2) + 's';
            networkRing.appendChild(node);
            i++;
        });
    }

    snapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        const isAdmin = userData.email === BOX_EMAIL;

        // Account cards in network panel
        if (accountsList) {
            const card = document.createElement('div');
            card.className = `account-card ${isAdmin ? 'admin' : ''}`;
            card.innerHTML = `
                <div class="account-header">
                    <span class="account-email">${userData.email}</span>
                    <span class="account-badge ${isAdmin ? 'admin' : ''}">${isAdmin ? 'ADMIN' : 'NODE'}</span>
                </div>
                <div class="account-balance">
                    <span class="balance-value">${userData.balance.toLocaleString()}</span>
                    <span class="balance-label">TOKENS</span>
                </div>
            `;
            accountsList.appendChild(card);
        }

        // Transfer dropdown
        if (recipientSelect && currentUser && userData.email !== currentUser.email) {
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
    if (blockchainContainer) blockchainContainer.innerHTML = '';

    const blockCount = snapshot.size;
    if (sidebarBlockCount) sidebarBlockCount.textContent = blockCount;
    if (adminBlockCount) adminBlockCount.textContent = blockCount;
    if (adminTxCount) adminTxCount.textContent = Math.max(0, blockCount - 1);

    if (snapshot.empty) {
        if (blockchainContainer) {
            blockchainContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                    </div>
                    <h4>GENESIS REQUIRED</h4>
                    <p>The distributed ledger awaits initialization. Mint the genesis block to establish the chain.</p>
                    <button id="mint-genesis-btn" class="btn-glow btn-primary btn-large">
                        <span class="btn-text">INITIALIZE GENESIS</span>
                    </button>
                </div>
            `;
            // Re-attach listener
            const newMintBtn = document.getElementById('mint-genesis-btn');
            if (newMintBtn) newMintBtn.addEventListener('click', handleMintGenesis);
        }
        return;
    }

    snapshot.forEach((docSnap) => {
        const block = docSnap.data();
        const isGenesis = block.data?.type === "GENESIS";

        if (blockchainContainer) {
            const card = document.createElement('div');
            card.className = `block-card ${isGenesis ? 'genesis' : ''}`;

            const txData = block.data || {};
            let dataDisplay = '';
            if (isGenesis) {
                dataDisplay = `<span style="color: var(--neon-purple)">GENESIS → ${txData.recipient} +${txData.amount.toLocaleString()} TOKENS</span>`;
            } else {
                dataDisplay = `<span style="color: var(--neon-cyan)">${txData.sender} → ${txData.recipient} ${txData.amount.toLocaleString()} TOKENS</span>`;
            }

            card.innerHTML = `
                <div class="block-header">
                    <span class="block-number">BLOCK #${block.index}</span>
                    <span class="block-type ${isGenesis ? 'genesis' : ''}">${isGenesis ? 'GENESIS' : 'TRANSFER'}</span>
                </div>
                <div class="block-details">
                    <div class="block-field">
                        <span class="block-field-label">HASH</span>
                        <span class="block-field-value hash">${block.hash}</span>
                    </div>
                    <div class="block-field">
                        <span class="block-field-label">PREVIOUS HASH</span>
                        <span class="block-field-value">${block.previousHash}</span>
                    </div>
                    <div class="block-field">
                        <span class="block-field-label">TRANSACTION DATA</span>
                        <span class="block-field-value">${dataDisplay}</span>
                    </div>
                </div>
                <div class="block-timestamp">
                    ${new Date(block.timestamp).toLocaleString()} UTC
                </div>
            `;
            blockchainContainer.appendChild(card);
        }
    });
});

// 3. Mint Genesis Block
async function handleMintGenesis() {
    if (!currentUser || currentUser.email !== BOX_EMAIL) {
        showToast("Root access required.", "error");
        return;
    }

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

        showToast("Genesis Block committed to the distributed ledger.", "success");
    } catch (e) {
        console.error(e);
        showToast("Minting failed: " + e.message, "error");
    }
}

mintGenesisBtn?.addEventListener('click', handleMintGenesis);
adminMintBtn?.addEventListener('click', handleMintGenesis);

// 4. Atomic Transaction Transfers
transferForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
        showToast("Authentication required.", "error");
        return;
    }

    const senderEmail = currentUser.email;
    const recipientEmail = recipientSelect?.value;
    const transferAmount = parseInt(amountInput?.value);

    if (!recipientEmail || isNaN(transferAmount) || transferAmount <= 0) {
        showToast("Invalid transfer parameters.", "error");
        return;
    }

    try {
        await runTransaction(db, async (transaction) => {
            const senderRef = doc(db, "users", senderEmail);
            const recipientRef = doc(db, "users", recipientEmail);

            const senderSnap = await transaction.get(senderRef);
            const recipientSnap = await transaction.get(recipientRef);

            if (!senderSnap.exists() || senderSnap.data().balance < transferAmount) {
                throw new Error("Insufficient balance available.");
            }

            const currentBal = senderSnap.data().balance;
            const targetBal = recipientSnap.exists() ? recipientSnap.data().balance : 0;

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

        showToast("Transfer executed and recorded on the ledger.", "success");
        transferForm?.reset();
        if (recipientLabel) recipientLabel.textContent = "TARGET";
        document.querySelector('.recipient-node')?.classList.remove('active');
    } catch (err) {
        showToast("Transaction Aborted: " + err.message, "error");
    }
});

// Update recipient node visualization
recipientSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val && recipientLabel) {
        recipientLabel.textContent = val.split('@')[0].toUpperCase();
        document.querySelector('.recipient-node')?.classList.add('active');
    } else if (recipientLabel) {
        recipientLabel.textContent = "TARGET";
        document.querySelector('.recipient-node')?.classList.remove('active');
    }
});

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initNavigation();

    // Hide admin nav by default
    adminNavItem?.classList.add('hidden');

    // Hide transfer nav by default
    document.querySelector('[data-panel="transfer"]')?.classList.add('hidden');
});

// Handle Enter key in modal
emailInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') passwordInput?.focus();
});
passwordInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitAuthBtn?.click();
});
