/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
// NEW: Search Input Field
const productSearchInput = document.getElementById("productSearchInput"); 
// NEW: RTL Toggle Button
const rtlToggleBtn = document.getElementById("rtl-toggle");

// --- Global State ---
let productsData = []; // To hold all loaded product data
// Load selected IDs from localStorage on startup
let selectedProductIds = new Set(
    JSON.parse(localStorage.getItem('selectedProducts')) || []
);

// Initial System Message + Placeholder for chat history
const SYSTEM_PROMPT = "You are the L'Oréal AI Routine Advisor. Your task is to analyze the user's selected products and generate a personalized daily AM/PM routine. The routine must be structured, step-by-step, and explain *why* each product is used at that time. Be encouraging, professional, concise, and do not include any links or external text unless specifically asked to search the web.";
let chatHistory = [{
    role: "system", 
    content: SYSTEM_PROMPT
}];

// --- API Configuration ---
// IMPORTANT: Replace this with your actual Cloudflare Worker Endpoint URL
const WORKER_ENDPOINT = "https://loreal-routine-builder-v2.dhunt22.workers.dev/"; 
// Note: 'secrets.js' is removed/ignored if using a Worker for security.

/* --- Product Data Management --- */

/* Load product data from JSON file */
async function loadProducts() {
    try {
        const response = await fetch("products.json");
        const data = await response.json();
        productsData = data.products.map(product => ({
            ...product,
            id: product.name.toLowerCase().replace(/[^a-z0-9]/g, '-') // Create a simple unique ID
        }));
        return productsData;
    } catch (error) {
        console.error("Error loading products:", error);
        productsContainer.innerHTML = '<div class="placeholder-message" style="color: red;">Error loading products. Check console for details.</div>';
        return [];
    }
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
    productsContainer.innerHTML = products
        .map(
            (product) => `
                <div class="product-card ${selectedProductIds.has(product.id) ? 'selected' : ''}" data-product-id="${product.id}">
                    <div class="product-img-wrapper">
                        <img src="${product.image}" alt="${product.name}">
                        <div class="product-info">
                            <h3>${product.name}</h3>
                            <p class="brand">${product.brand}</p>
                            <button class="description-toggle" data-product-id="${product.id}">Details</button>
                        </div>
                    </div>
                    <p class="product-description">${product.description}</p>
                </div>
            `
        )
        .join("");

    // Re-attach event listeners after products are displayed
    attachProductCardListeners();
}

/* --- Combined Filtering Logic --- */

/**
 * Filters the product data based on both the selected category and the search text.
 */
function filterAndDisplayProducts() {
    // Ensure data is loaded before filtering
    if (productsData.length === 0) {
        // If data isn't loaded yet, try loading it (though init should handle this)
        loadProducts().then(filterAndDisplayProducts);
        return;
    }
    
    // 1. Get current filter values
    const selectedCategory = categoryFilter.value;
    // Normalize search term for case-insensitive matching
    const searchTerm = productSearchInput.value.toLowerCase().trim();

    // 2. Start with all products
    let filteredProducts = productsData;

    // 3. Apply Category Filter
    if (selectedCategory) {
        filteredProducts = filteredProducts.filter(
            (product) => product.category === selectedCategory
        );
    }

    // 4. Apply Search Filter (by name, brand, or description)
    if (searchTerm) {
        filteredProducts = filteredProducts.filter((product) =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.brand.toLowerCase().includes(searchTerm) ||
            product.description.toLowerCase().includes(searchTerm)
        );
    }

    displayProducts(filteredProducts);
}

/* --- Attach Filter Event Listeners --- */

// Attach the unified filtering function to both the category dropdown and the new search input
categoryFilter.addEventListener("change", filterAndDisplayProducts);

// Use 'input' event for real-time filtering as the user types
productSearchInput.addEventListener("input", filterAndDisplayProducts);


/* --- Product Selection and Persistence --- */

function toggleProductSelection(productId, cardElement) {
    if (selectedProductIds.has(productId)) {
        selectedProductIds.delete(productId);
        if (cardElement) cardElement.classList.remove('selected');
    } else {
        selectedProductIds.add(productId);
        if (cardElement) cardElement.classList.add('selected');
    }

    // Save current selection to localStorage
    localStorage.setItem('selectedProducts', JSON.stringify([...selectedProductIds]));
    
    // Update the "Selected Products" list UI
    updateSelectedProductsUI();
}

/**
 * Renders the list of selected products in the dedicated section.
 */
function updateSelectedProductsUI() {
    selectedProductsList.innerHTML = ''; // Clear the current list

    if (selectedProductIds.size === 0) {
        selectedProductsList.innerHTML = '<p style="color: #666; font-style: italic;">No products selected yet. Click on products to add them!</p>';
        return;
    }

    selectedProductIds.forEach(id => {
        const product = productsData.find(p => p.id === id); 

        if (product) {
            const tag = document.createElement('div');
            tag.classList.add('selected-product-tag');
            tag.innerHTML = `
                <span>${product.name} (${product.brand})</span>
                <button class="remove-tag-btn" data-product-id="${id}" title="Remove Product">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            selectedProductsList.appendChild(tag);
        }
    });

    // Add event listeners to the new "Remove" buttons
    selectedProductsList.querySelectorAll('.remove-tag-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = e.currentTarget.dataset.productId;
            const originalCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
            // Pass the card to update its visual state if it's currently displayed
            toggleProductSelection(productId, originalCard); 
        });
    });
}

function attachProductCardListeners() {
    document.querySelectorAll('.product-card').forEach(card => {
        const productId = card.dataset.productId;

        // 1. Selection Listener (Click anywhere on the card, but exclude detail button)
        card.addEventListener('click', (e) => {
             // Prevent toggling selection if the description button was clicked
            if (!e.target.classList.contains('description-toggle')) {
                toggleProductSelection(productId, card);
            }
        });

        // 2. Description Toggle Listener
        const detailButton = card.querySelector('.description-toggle');
        detailButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card selection toggle
            card.classList.toggle('expanded');
            detailButton.textContent = card.classList.contains('expanded') ? 'Hide Details' : 'Details';
        });
    });
}

/* --- Chat Management and API Calls --- */

/**
 * Appends a message to the chat window.
 * @param {string} sender 'User' or 'AI Advisor'
 * @param {string} content The message text
 * @param {boolean} isLoading True if this is a temporary loading message
 */
function appendMessageToChat(sender, content, isLoading = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(sender === 'User' ? 'message-user' : 'message-ai');
    
    let displayContent = content.replace(/\n/g, '<br>');

    // NEW: Logic to find URLs and format them as clickable citations
    // This expects the AI to output URLs based on the mock search data.
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    displayContent = displayContent.replace(urlRegex, (url) => {
        return ` <a href="${url}" target="_blank" class="citation">[Source]</a>`;
    });

    if (isLoading) {
        messageDiv.id = 'loading-message';
        messageDiv.classList.add('loading-indicator');
        messageDiv.innerHTML = `<strong>${sender}</strong>: ${displayContent} <i class="fa-solid fa-ellipsis fa-beat-fade"></i>`;
    } else {
        messageDiv.innerHTML = `<strong>${sender}</strong>: ${displayContent}`;
    }

    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to bottom
}

function removeLoadingMessage() {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}


/* --- Routine Generation --- */

generateRoutineBtn.addEventListener('click', generateRoutine);

async function generateRoutine() {
    if (selectedProductIds.size === 0) {
        appendMessageToChat('AI Advisor', "Please select at least one product before generating a routine.", false);
        return;
    }
    
    // Clear previous chat history while keeping the system prompt
    chatHistory = [chatHistory[0]]; 
    
    // 1. Collect Data for API
    const selectedProductsData = [];
    selectedProductIds.forEach(id => {
        const product = productsData.find(p => p.id === id); 
        if (product) {
            selectedProductsData.push({
                name: product.name,
                brand: product.brand,
                category: product.category,
                description: product.description 
            });
        }
    });

    // 2. Create User Prompt
    const routinePrompt = `Generate a comprehensive AM/PM routine tailored to my needs using *only* the following L'Oréal product data. Structure your response clearly with AM and PM sections. Product JSON: ${JSON.stringify(selectedProductsData)}`;
    
    // Add prompt to history and display to user
    chatHistory.push({ role: "user", content: routinePrompt });
    appendMessageToChat('User', "Please generate a personalized routine for me.");
    
    // Add a temporary 'loading' message to the chat UI
    appendMessageToChat('AI Advisor', 'Generating your personalized routine...', true); 

    try {
        // 3. API Call to Cloudflare Worker (sending full history)
        const response = await fetch(WORKER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: chatHistory }), 
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.response; 

        // Remove loading message and display AI response
        removeLoadingMessage();
        appendMessageToChat('AI Advisor', aiResponse);
        
        // 4. Update Chat History with AI Response
        chatHistory.push({ role: "assistant", content: aiResponse });

    } catch (error) {
        removeLoadingMessage();
        appendMessageToChat('AI Advisor', 'Error generating routine. Please check your worker endpoint/API key.', false);
        console.error("API Error:", error);
    }
}


/* --- Follow-up Chat --- */

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userMessage = userInput.value.trim();
    if (!userMessage) return;

    // 1. Display User Message and clear input
    appendMessageToChat('User', userMessage);
    userInput.value = '';

    // 2. Add user message to history
    chatHistory.push({ role: "user", content: userMessage });
    
    // 3. Add a temporary 'loading' message
    appendMessageToChat('AI Advisor', 'Thinking...', true); 

    try {
        // 4. API Call to Cloudflare Worker (sending full history)
        const response = await fetch(WORKER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: chatHistory }), 
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.response; 

        // 5. Display AI response and update history
        removeLoadingMessage();
        appendMessageToChat('AI Advisor', aiResponse);
        chatHistory.push({ role: "assistant", content: aiResponse });

    } catch (error) {
        removeLoadingMessage();
        appendMessageToChat('AI Advisor', 'Error continuing conversation. Please try again.', false);
        console.error("Chat API Error:", error);
        // Remove the user's last message from history if the request failed
        chatHistory.pop(); 
    }
});


/* --- RTL Language Support --- */
rtlToggleBtn.addEventListener('click', () => {
    const html = document.documentElement;
    const isRtl = html.getAttribute('dir') === 'rtl';
    // Toggle the dir attribute
    html.setAttribute('dir', isRtl ? 'ltr' : 'rtl');
    
    // Optional: Visually indicate current mode on the button
    rtlToggleBtn.textContent = isRtl ? 'Toggle RTL/LTR' : 'Toggle LTR/RTL';
});

/* --- Initialization --- */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load data
    await loadProducts();
    
    // 2. Display all products on startup (now handled by the unified filter function)
    filterAndDisplayProducts();
    
    // 3. Update the Selected Products UI from localStorage
    updateSelectedProductsUI();
    
    // Set initial toggle button text
    if (!document.documentElement.getAttribute('dir')) {
        document.documentElement.setAttribute('dir', 'ltr'); // Default to LTR
    }
    rtlToggleBtn.textContent = document.documentElement.getAttribute('dir') === 'rtl' ? 'Toggle LTR/RTL' : 'Toggle RTL/LTR';

});