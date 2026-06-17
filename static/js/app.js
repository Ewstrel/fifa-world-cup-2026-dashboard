// --- State Management ---
let state = {
    rawReleases: [],      // Raw feed entries from Flask API
    parsedUpdates: [],    // Individual release items (parsed from entries)
    selectedIds: new Set(), // Set of selected update IDs
    filteredUpdates: [],  // Currently filtered updates
    filters: {
        search: '',
        type: 'all'
    },
    sortBy: 'newest'      // 'newest' or 'oldest'
};

// --- DOM Element References ---
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    retryBtn: document.getElementById('retry-btn'),
    cacheStatus: document.getElementById('cache-status'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statChanges: document.getElementById('stat-changes'),
    statIssues: document.getElementById('stat-issues'),
    
    // Filtering
    searchInput: document.getElementById('search-input'),
    typeFilters: document.getElementById('type-filters'),
    sortSelect: document.getElementById('sort-select'),
    
    // States & Grid
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    emptyState: document.getElementById('empty-state'),
    errorMessage: document.getElementById('error-message'),
    feedGrid: document.getElementById('feed-grid'),
    
    // Floating Bar
    floatingBar: document.getElementById('floating-select-bar'),
    selectedCount: document.getElementById('selected-count'),
    clearSelectionBtn: document.getElementById('clear-selection-btn'),
    tweetSelectedBtn: document.getElementById('tweet-selected-btn'),
    
    // Modal Composer
    tweetModal: document.getElementById('tweet-modal'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    warningMsg: document.querySelector('.warning-msg'),
    tweetPreviewList: document.getElementById('tweet-preview-list'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    publishTweetBtn: document.getElementById('publish-tweet-btn'),
    publishLinkedinBtn: document.getElementById('publish-linkedin-btn'),
    publishTelegramBtn: document.getElementById('publish-telegram-btn')
};

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    loadReleases();
});

// --- Event Listeners Setup ---
function initEventListeners() {
    // Refresh button
    elements.refreshBtn.addEventListener('click', () => loadReleases(true));
    elements.retryBtn.addEventListener('click', () => loadReleases(true));
    
    // Theme toggle button
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Export CSV button
    elements.exportCsvBtn.addEventListener('click', exportToCSV);
    
    // Realtime search
    elements.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase();
        renderFeed();
    });
    
    // Type badge filters
    elements.typeFilters.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-badge')) {
            // Update active state of badges
            document.querySelectorAll('.filter-badge').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            state.filters.type = e.target.dataset.type;
            renderFeed();
        }
    });
    
    // Sort dropdown
    elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderFeed();
    });
    
    // Floating Bar: Clear selection
    elements.clearSelectionBtn.addEventListener('click', clearSelection);
    
    // Floating Bar: Tweet selected
    elements.tweetSelectedBtn.addEventListener('click', () => {
        const selectedUpdates = state.parsedUpdates.filter(up => state.selectedIds.has(up.id));
        if (selectedUpdates.length > 0) {
            openTweetModal(selectedUpdates);
        }
    });
    
    // Modal: Close
    elements.closeModalBtn.addEventListener('click', closeTweetModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeTweetModal();
    });
    
    // Modal: Char count listener
    elements.tweetTextarea.addEventListener('input', updateCharCount);
    
    // Modal: Copy Tweet Text
    elements.copyTweetBtn.addEventListener('click', copyTweetText);
    
    // Modal: Publish sharing intents
    elements.publishTweetBtn.addEventListener('click', publishTweet);
    elements.publishLinkedinBtn.addEventListener('click', publishLinkedin);
    elements.publishTelegramBtn.addEventListener('click', publishTelegram);
}

// --- API Methods ---
async function loadReleases(forceRefresh = false) {
    showState('loading');
    
    // Spin refresh button
    const refreshIcon = elements.refreshBtn.querySelector('svg');
    if (refreshIcon) refreshIcon.classList.add('spinning');
    elements.refreshBtn.disabled = true;
    
    try {
        const url = forceRefresh ? '/api/releases?refresh=true' : '/api/releases';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Server failed to process feed');
        }
        
        state.rawReleases = result.releases;
        state.parsedUpdates = processReleases(result.releases);
        
        // Reset selections
        state.selectedIds.clear();
        updateFloatingBar();
        
        // Render stats & feed
        calculateStats();
        renderFeed();
        
        // Update cache label
        updateCacheStatus(result.cached_at, result.from_cache);
        
        showState('grid');
    } catch (err) {
        console.error(err);
        elements.errorMessage.textContent = err.message || 'Could not reach server API.';
        showState('error');
    } finally {
        if (refreshIcon) refreshIcon.classList.remove('spinning');
        elements.refreshBtn.disabled = false;
    }
}

// --- Feed Parsing (HTML Sub-item extraction) ---
function processReleases(rawReleases) {
    const parsed = [];
    let idCounter = 0;
    
    rawReleases.forEach((entry) => {
        const dateStr = entry.title; // e.g., "June 15, 2026"
        const entryLink = entry.link;
        
        // Parse the HTML content
        const parser = new DOMParser();
        const doc = parser.parseFromString(entry.content, 'text/html');
        const children = Array.from(doc.body.children);
        
        let currentType = 'Announcement'; // Default type if H3 is not first
        let currentHtml = '';
        
        children.forEach((child) => {
            if (child.tagName === 'H3') {
                // If we accumulated html, push the previous item
                if (currentHtml.trim()) {
                    parsed.push({
                        id: `item_${idCounter++}`,
                        type: currentType,
                        content: currentHtml.trim(),
                        date: dateStr,
                        link: entryLink
                    });
                }
                currentType = child.textContent.trim();
                currentHtml = '';
            } else {
                currentHtml += child.outerHTML;
            }
        });
        
        // Push the final item
        if (currentHtml.trim()) {
            parsed.push({
                id: `item_${idCounter++}`,
                type: currentType,
                content: currentHtml.trim(),
                date: dateStr,
                link: entryLink
            });
        }
    });
    
    return parsed;
}

// --- UI Rendering ---
function renderFeed() {
    const grid = elements.feedGrid;
    grid.innerHTML = '';
    
    // 1. Filter
    let filtered = state.parsedUpdates.filter(update => {
        // Type filter
        if (state.filters.type !== 'all') {
            const matchesType = update.type.toLowerCase() === state.filters.type.toLowerCase();
            // Issue filter covers both Issue and Breaking when type filter is clicked
            if (state.filters.type === 'issue') {
                return update.type.toLowerCase() === 'issue' || update.type.toLowerCase() === 'breaking';
            }
            if (!matchesType) return false;
        }
        
        // Search filter
        if (state.filters.search) {
            const plainText = getPlainText(update.content).toLowerCase();
            const dateText = update.date.toLowerCase();
            const typeText = update.type.toLowerCase();
            const search = state.filters.search;
            return plainText.includes(search) || dateText.includes(search) || typeText.includes(search);
        }
        
        return true;
    });
    
    // 2. Sort
    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return state.sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    // Save filtered list for CSV export
    state.filteredUpdates = filtered;
    
    // Calculate the newest date in the feed to determine the "NEW" badge threshold (within 48 hours of newest)
    let maxDateTime = 0;
    state.parsedUpdates.forEach(up => {
        const d = new Date(up.date);
        if (d > maxDateTime) maxDateTime = d.getTime();
    });
    
    // 3. Render State
    if (filtered.length === 0) {
        showState('empty');
        return;
    }
    
    showState('grid');
    
    // 4. Generate Cards
    filtered.forEach((update) => {
        const card = document.createElement('div');
        card.className = `update-card ${state.selectedIds.has(update.id) ? 'selected' : ''}`;
        card.dataset.id = update.id;
        
        // Get badge class
        const badgeClass = getTypeBadgeClass(update.type);
        
        // Check if update is within 48 hours of the newest release date in the feed
        const updateDate = new Date(update.date);
        const isNew = maxDateTime > 0 && (maxDateTime - updateDate.getTime()) <= (48 * 60 * 60 * 1000);
        
        card.innerHTML = `
            <div class="card-select-indicator"></div>
            <div class="card-header">
                <span class="badge ${badgeClass}">${update.type}</span>
                ${isNew ? '<span class="badge badge-new">NEW</span>' : ''}
                <span class="card-date">${update.date}</span>
            </div>
            <div class="card-body">
                ${update.content}
            </div>
            <div class="card-footer" style="gap: 0.5rem;">
                <button class="copy-card-btn" data-id="${update.id}" title="Copy to clipboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
                </button>
                <button class="tweet-card-btn" data-id="${update.id}">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Tweet
                </button>
            </div>
        `;
        
        // Card Click (Toggle Selection)
        card.addEventListener('click', (e) => {
            // Prevent toggling selection if clicking a link, copy button, or the Tweet button
            if (e.target.tagName === 'A' || e.target.closest('.tweet-card-btn') || e.target.closest('.copy-card-btn') || e.target.closest('a')) {
                return;
            }
            toggleCardSelection(update.id);
        });
        
        // Copy Card Button Click
        const copyBtn = card.querySelector('.copy-card-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyCardText(update, copyBtn);
        });
        
        // Tweet Card Button Click
        const tweetBtn = card.querySelector('.tweet-card-btn');
        tweetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTweetModal([update]);
        });
        
        grid.appendChild(card);
    });
}

// --- Selection Handlers ---
function toggleCardSelection(id) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    
    // Update card styling directly to avoid full re-render
    const cardEl = document.querySelector(`.update-card[data-id="${id}"]`);
    if (cardEl) {
        cardEl.classList.toggle('selected', state.selectedIds.has(id));
    }
    
    updateFloatingBar();
}

function clearSelection() {
    state.selectedIds.clear();
    document.querySelectorAll('.update-card').forEach(card => card.classList.remove('selected'));
    updateFloatingBar();
}

function updateFloatingBar() {
    const count = state.selectedIds.size;
    elements.selectedCount.textContent = count;
    
    if (count > 0) {
        elements.floatingBar.classList.add('active');
    } else {
        elements.floatingBar.classList.remove('active');
    }
}

// --- Stats Counter ---
function calculateStats() {
    let total = state.parsedUpdates.length;
    let features = 0;
    let changes = 0;
    let issues = 0;
    
    state.parsedUpdates.forEach(up => {
        const type = up.type.toLowerCase();
        if (type === 'feature') features++;
        else if (type === 'change') changes++;
        else if (type === 'issue' || type === 'breaking') issues++;
    });
    
    elements.statTotal.textContent = total;
    elements.statFeatures.textContent = features;
    elements.statChanges.textContent = changes;
    elements.statIssues.textContent = issues;
}

// --- Helper Utilities ---
function getTypeBadgeClass(type) {
    switch (type.toLowerCase()) {
        case 'feature': return 'badge-feature';
        case 'change': return 'badge-change';
        case 'issue': return 'badge-issue';
        case 'breaking': return 'badge-breaking';
        case 'announcement': return 'badge-announcement';
        default: return 'badge-default';
    }
}

function getPlainText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

function updateCacheStatus(epochSeconds, fromCache) {
    if (!epochSeconds) return;
    const fetchDate = new Date(epochSeconds * 1000);
    const dateStr = fetchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    elements.cacheStatus.textContent = fromCache 
        ? `Cached (fetched at ${dateStr})` 
        : `Updated Live at ${dateStr}`;
}

function showState(mode) {
    elements.loadingState.classList.toggle('hidden', mode !== 'loading');
    elements.errorState.classList.toggle('hidden', mode !== 'error');
    elements.emptyState.classList.toggle('hidden', mode !== 'empty');
    elements.feedGrid.classList.toggle('hidden', mode !== 'grid');
}

// --- Tweet Composer Modal Methods ---
let activeTweetUpdates = [];

function openTweetModal(updates) {
    activeTweetUpdates = updates;
    
    // Generate prefilled text
    const tweetText = generateTweetText(updates);
    elements.tweetTextarea.value = tweetText;
    
    // Render previews
    elements.tweetPreviewList.innerHTML = '';
    updates.forEach(up => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.innerHTML = `
            <strong>[${up.type}] ${up.date}</strong>
            <p>${getPlainText(up.content).substring(0, 100)}...</p>
        `;
        elements.tweetPreviewList.appendChild(previewItem);
    });
    
    updateCharCount();
    
    elements.tweetModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scrolling
}

function closeTweetModal() {
    elements.tweetModal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scroll
}

function generateTweetText(updates) {
    if (updates.length === 1) {
        // Single Update Format
        const up = updates[0];
        const emojiMap = {
            'feature': '🚀',
            'change': '⚙️',
            'issue': '⚠️',
            'breaking': '💥',
            'announcement': '📢'
        };
        const emoji = emojiMap[up.type.toLowerCase()] || '📝';
        const rawContent = getPlainText(up.content).replace(/\s+/g, ' ').trim();
        
        const header = `${emoji} BigQuery ${up.type} (${up.date}):\n`;
        const link = `\n\nDocs: ${up.link}`;
        
        const maxLen = 280 - header.length - link.length;
        let body = rawContent;
        if (body.length > maxLen) {
            body = body.substring(0, maxLen - 3) + '...';
        }
        
        return `${header}${body}${link}`;
    } else {
        // Multi Update Format
        const header = `📢 Selected BigQuery Release Notes (${updates.length} updates):\n\n`;
        const footer = `\n\nFull notes: https://docs.cloud.google.com/bigquery/docs/release-notes`;
        
        let body = '';
        for (let i = 0; i < updates.length; i++) {
            const up = updates[i];
            const emojiMap = {
                'feature': '🚀',
                'change': '⚙️',
                'issue': '⚠️',
                'breaking': '💥',
                'announcement': '📢'
            };
            const emoji = emojiMap[up.type.toLowerCase()] || '📝';
            const cleanContent = getPlainText(up.content).replace(/\s+/g, ' ').trim();
            const item = `${emoji} [${up.type}] ${cleanContent}`;
            
            // Preview how much space we have
            const testText = `${header}${body}${item}\n${footer}`;
            if (testText.length > 275) {
                // If it overflows, truncate this one or add indicator
                const spaceRemaining = 280 - `${header}${body}${footer}`.length - 25;
                if (spaceRemaining > 10) {
                    body += `${emoji} [${up.type}] ${cleanContent.substring(0, spaceRemaining)}...\n`;
                }
                body += `+ more updates!`;
                break;
            } else {
                body += `${item}\n`;
            }
        }
        
        return `${header}${body}${footer}`;
    }
}

function updateCharCount() {
    const len = elements.tweetTextarea.value.length;
    elements.charCounter.textContent = `${len} / 280`;
    
    // SVG Progress Ring calculations
    const ringCircle = document.querySelector('.progress-ring__circle');
    const ring = document.querySelector('.progress-ring');
    
    if (ringCircle && ring) {
        const radius = 9;
        const circumference = 2 * Math.PI * radius; // ~56.5
        const percent = Math.min((len / 280) * 100, 100);
        const offset = circumference - (percent / 100) * circumference;
        ringCircle.style.strokeDashoffset = Math.max(0, offset);
        
        ring.classList.remove('warn', 'error');
        if (len > 280) {
            ring.classList.add('error');
        } else if (len > 250) {
            ring.classList.add('warn');
        }
    }
    
    // Manage class styling for indicator
    elements.charCounter.classList.remove('near-limit', 'over-limit');
    elements.warningMsg.classList.add('hidden');
    
    if (len > 280) {
        elements.charCounter.classList.add('over-limit');
        elements.warningMsg.classList.remove('hidden');
    } else if (len > 250) {
        elements.charCounter.classList.add('near-limit');
    }
}

function copyTweetText() {
    const text = elements.tweetTextarea.value;
    navigator.clipboard.writeText(text).then(() => {
        const origText = elements.copyTweetBtn.textContent;
        elements.copyTweetBtn.textContent = 'Copied!';
        elements.copyTweetBtn.classList.add('btn-success');
        elements.copyTweetBtn.classList.remove('btn-secondary');
        
        setTimeout(() => {
            elements.copyTweetBtn.textContent = origText;
            elements.copyTweetBtn.classList.remove('btn-success');
            elements.copyTweetBtn.classList.add('btn-secondary');
        }, 2000);
    }).catch(err => {
        console.error('Clipboard copy failed: ', err);
    });
}

function publishTweet() {
    const text = elements.tweetTextarea.value;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}

function publishTelegram() {
    const text = elements.tweetTextarea.value;
    const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}

function publishLinkedin() {
    const text = elements.tweetTextarea.value;
    const firstLink = activeTweetUpdates.length > 0 ? activeTweetUpdates[0].link : 'https://docs.cloud.google.com/bigquery/docs/release-notes';
    
    // Copy full text to clipboard for convenient pasting into the LinkedIn post creator
    navigator.clipboard.writeText(text);
    
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(firstLink)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}

// --- Copy Card & Export CSV Helpers ---
function copyCardText(update, btnElement) {
    const plainText = getPlainText(update.content).replace(/\s+/g, ' ').trim();
    const formattedText = `📝 BigQuery ${update.type} (${update.date}):\n${plainText}\n\nLink: ${update.link}`;
    
    navigator.clipboard.writeText(formattedText).then(() => {
        const origText = btnElement.querySelector('span').textContent;
        btnElement.querySelector('span').textContent = 'Copied!';
        btnElement.classList.add('success');
        
        setTimeout(() => {
            btnElement.querySelector('span').textContent = origText;
            btnElement.classList.remove('success');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy card text: ', err);
    });
}

function exportToCSV() {
    const updates = state.filteredUpdates || state.parsedUpdates;
    if (updates.length === 0) {
        alert("No updates to export!");
        return;
    }
    
    // Build CSV content
    let csv = "Date,Type,Description,Link\n";
    updates.forEach(up => {
        const date = up.date.replace(/"/g, '""');
        const type = up.type.replace(/"/g, '""');
        const plainText = getPlainText(up.content).replace(/"/g, '""').replace(/\s+/g, ' ');
        const link = up.link.replace(/"/g, '""');
        csv += `"${date}","${type}","${plainText}","${link}"\n`;
    });
    
    // Create blob download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bigquery_release_notes_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Theme Management Helpers ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}
