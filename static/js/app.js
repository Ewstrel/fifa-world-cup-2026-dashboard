// --- State Management ---
let state = {
    rawMatches: [],       // Raw match fixtures from Flask API
    newsList: [],         // Live soccer news from Flask API
    selectedIds: new Set(), // Set of selected match IDs
    filteredMatches: [],  // Currently filtered matches
    filters: {
        search: '',
        status: 'all',    // 'all', 'played' (completed), 'upcoming' (scheduled)
        group: 'all'      // 'all', 'Group A' ... 'Group L'
    },
    sortBy: 'oldest'      // 'oldest' or 'newest'
};

// --- DOM Element References (Lazy Getters for Cache Resilience) ---
const elements = {
    get refreshBtn() { return document.getElementById('refresh-btn'); },
    get retryBtn() { return document.getElementById('retry-btn'); },
    get cacheStatus() { return document.getElementById('cache-status'); },
    get exportCsvBtn() { return document.getElementById('export-csv-btn'); },
    get themeToggleBtn() { return document.getElementById('theme-toggle-btn'); },
    
    // Stats
    get statTotal() { return document.getElementById('stat-total'); },
    get statPlayed() { return document.getElementById('stat-played'); },
    get statUpcoming() { return document.getElementById('stat-upcoming'); },
    get statGoals() { return document.getElementById('stat-goals'); },
    
    // Filtering
    get searchInput() { return document.getElementById('search-input'); },
    get typeFilters() { return document.getElementById('type-filters'); },
    get groupSelect() { return document.getElementById('group-select'); },
    get sortSelect() { return document.getElementById('sort-select'); },
    
    // States & Grid
    get loadingState() { return document.getElementById('loading-state'); },
    get errorState() { return document.getElementById('error-state'); },
    get emptyState() { return document.getElementById('empty-state'); },
    get errorMessage() { return document.getElementById('error-message'); },
    get feedGrid() { return document.getElementById('feed-grid'); },
    
    // News Sidebar
    get newsLoadingState() { return document.getElementById('news-loading-state'); },
    get newsList() { return document.getElementById('news-list'); },
    
    // Floating Bar
    get floatingBar() { return document.getElementById('floating-select-bar'); },
    get selectedCount() { return document.getElementById('selected-count'); },
    get clearSelectionBtn() { return document.getElementById('clear-selection-btn'); },
    get tweetSelectedBtn() { return document.getElementById('tweet-selected-btn'); },
    
    // Modal Composer
    get tweetModal() { return document.getElementById('tweet-modal'); },
    get tweetTextarea() { return document.getElementById('tweet-textarea'); },
    get charCounter() { return document.getElementById('char-counter'); },
    get warningMsg() { return document.querySelector('.warning-msg'); },
    get tweetPreviewList() { return document.getElementById('tweet-preview-list'); },
    get closeModalBtn() { return document.getElementById('close-modal-btn'); },
    get copyTweetBtn() { return document.getElementById('copy-tweet-btn'); },
    get publishTweetBtn() { return document.getElementById('publish-tweet-btn'); },
    get publishLinkedinBtn() { return document.getElementById('publish-linkedin-btn'); },
    get publishTelegramBtn() { return document.getElementById('publish-telegram-btn'); },
    
    // Standings
    get standingsGroupSelect() { return document.getElementById('standings-group-select'); },
    get standingsTbody() { return document.getElementById('standings-tbody'); },

    // View Switching & Bracket elements
    get viewFeedBtn() { return document.getElementById('view-feed-btn'); },
    get viewBracketBtn() { return document.getElementById('view-bracket-btn'); },
    get bracketView() { return document.getElementById('bracket-view'); },
    get bracketScrollContainer() { return document.getElementById('bracket-scroll-container'); },
    get mainLayoutWrapper() { return document.getElementById('main-layout-wrapper'); }
};

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    loadDashboardData();
});

// --- Event Listeners Setup ---
function initEventListeners() {
    // Refresh button
    elements.refreshBtn?.addEventListener('click', () => loadDashboardData(true));
    elements.retryBtn?.addEventListener('click', () => loadDashboardData(true));
    
    // Theme toggle button
    elements.themeToggleBtn?.addEventListener('click', toggleTheme);
    
    // Export CSV button
    elements.exportCsvBtn?.addEventListener('click', exportToCSV);
    
    // Realtime search
    elements.searchInput?.addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase();
        renderMatches();
    });
    
    // Type badge filters (status: Completed / Scheduled / All / Playoffs)
    elements.typeFilters?.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-badge')) {
            document.querySelectorAll('.filter-badge').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            state.filters.status = e.target.dataset.type;
            if (state.filters.status === 'playoffs') {
                state.filters.group = 'all';
                if (elements.groupSelect) elements.groupSelect.value = 'all';
            }
            renderMatches();
        }
    });
    
    // Group filter dropdown
    elements.groupSelect?.addEventListener('change', (e) => {
        state.filters.group = e.target.value;
        renderMatches();
    });
    
    // Sort dropdown
    elements.sortSelect?.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderMatches();
    });
    
    // Floating Bar: Clear selection
    elements.clearSelectionBtn?.addEventListener('click', clearSelection);
    
    // Floating Bar: Tweet selected
    elements.tweetSelectedBtn?.addEventListener('click', () => {
        const selectedMatches = state.rawMatches.filter(m => state.selectedIds.has(m.id));
        if (selectedMatches.length > 0) {
            openTweetModal(selectedMatches);
        }
    });
    
    // Modal: Close
    elements.closeModalBtn?.addEventListener('click', closeTweetModal);
    elements.tweetModal?.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeTweetModal();
    });
    
    // Modal: Char count listener
    elements.tweetTextarea?.addEventListener('input', updateCharCount);
    
    // Modal: Copy Tweet Text
    elements.copyTweetBtn?.addEventListener('click', copyTweetText);
    
    // Modal: Publish sharing intents
    elements.publishTweetBtn?.addEventListener('click', publishTweet);
    elements.publishLinkedinBtn?.addEventListener('click', publishLinkedin);
    elements.publishTelegramBtn?.addEventListener('click', publishTelegram);
    
    // Standings Widget: Group change
    elements.standingsGroupSelect?.addEventListener('change', (e) => {
        renderStandings(e.target.value);
    });

    // View Switcher: List vs Bracket
    elements.viewFeedBtn?.addEventListener('click', () => switchView('feed'));
    elements.viewBracketBtn?.addEventListener('click', () => switchView('bracket'));
}

// --- API Methods ---
async function loadDashboardData(forceRefresh = false) {
    showState('loading');
    if (elements.newsLoadingState) elements.newsLoadingState.classList.remove('hidden');
    if (elements.newsList) elements.newsList.innerHTML = '';
    
    // Spin refresh button
    const refreshIcon = elements.refreshBtn?.querySelector('svg');
    if (refreshIcon) refreshIcon.classList.add('spinning');
    if (elements.refreshBtn) elements.refreshBtn.disabled = true;
    
    try {
        const refreshQueryParam = forceRefresh ? '?refresh=true' : '';
        
        // Fetch matches and news concurrently
        const [wcRes, newsRes] = await Promise.all([
            fetch(`/api/worldcup${refreshQueryParam}`),
            fetch(`/api/news${refreshQueryParam}`)
        ]);
        
        if (!wcRes.ok || !newsRes.ok) {
            throw new Error('Failed to fetch data from backend API');
        }
        
        const wcData = await wcRes.json();
        const newsData = await newsRes.json();
        
        if (!wcData.success) throw new Error(wcData.error || 'Server failed to fetch World Cup data');
        if (!newsData.success) throw new Error(newsData.error || 'Server failed to fetch soccer news');
        
        // 1. Process matches
        // Add artificial ID for mapping
        state.rawMatches = wcData.data.matches.map((m, index) => ({
            id: `match_${index}`,
            ...m
        }));
        
        // Reset selections
        state.selectedIds.clear();
        updateFloatingBar();
        
        // Render stats & matches
        calculateStats();
        renderMatches();
        
        // Render standings table
        const currentGroup = elements.standingsGroupSelect ? elements.standingsGroupSelect.value : 'Group A';
        renderStandings(currentGroup);
        
        // Update cache label
        updateCacheStatus(wcData.cached_at, wcData.from_cache);
        showState('grid');
        
        // 2. Process News
        state.newsList = newsData.news;
        renderNews();
        
    } catch (err) {
        console.error(err);
        if (elements.errorMessage) {
            elements.errorMessage.textContent = err.message || 'Could not reach server API.';
        }
        showState('error');
    } finally {
        if (refreshIcon) refreshIcon.classList.remove('spinning');
        if (elements.refreshBtn) elements.refreshBtn.disabled = false;
        if (elements.newsLoadingState) elements.newsLoadingState.classList.add('hidden');
    }
}

// --- Team Flag Mapping Helper ---
function getFlagUrl(teamName) {
    const countryCodes = {
        "Mexico": "mx", "South Africa": "za", "South Korea": "kr", "Czech Republic": "cz",
        "Canada": "ca", "Bosnia & Herzegovina": "ba", "Qatar": "qa", "Switzerland": "ch",
        "Germany": "de", "France": "fr", "Argentina": "ar", "Brazil": "br", "England": "gb-eng",
        "Spain": "es", "Italy": "it", "Portugal": "pt", "Netherlands": "nl", "Croatia": "hr",
        "Belgium": "be", "Uruguay": "uy", "USA": "us", "United States": "us", "Japan": "jp",
        "Australia": "au", "Morocco": "ma", "Senegal": "sn", "Poland": "pl", "Serbia": "rs",
        "Saudi Arabia": "sa", "Ecuador": "ec", "Iran": "ir", "Wales": "gb-wls", "Denmark": "dk",
        "Tunisia": "tn", "Costa Rica": "cr", "Cameroon": "cm", "Ghana": "gh", "Ukraine": "ua",
        "Georgia": "ge", "Turkey": "tr", "Slovakia": "sk", "Romania": "ro", "Slovenia": "si",
        "Albania": "al", "Hungary": "hu", "Scotland": "gb-sct", "Austria": "at", "Sweden": "se",
        "Algeria": "dz", "Cape Verde": "cv", "Colombia": "co", "Curaçao": "cw", "DR Congo": "cd",
        "Egypt": "eg", "Haiti": "ht", "Iraq": "iq", "Ivory Coast": "ci", "Jordan": "jo",
        "New Zealand": "nz", "Norway": "no", "Panama": "pa", "Paraguay": "py", "Uzbekistan": "uz"
    };
    const code = countryCodes[teamName];
    if (code) {
        return `https://flagcdn.com/w40/${code}.png`;
    }
    return `https://flagcdn.com/w40/un.png`;
}

// --- Matches Rendering ---
function renderMatches() {
    const grid = elements.feedGrid;
    if (!grid) return;
    grid.innerHTML = '';
    
    const formatDate = (dateStr) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    };
    
    // 1. Filter
    let filtered = state.rawMatches.filter(m => {
        // Status filter (Completed / Scheduled / Playoffs)
        const hasScore = 'score' in m;
        if (state.filters.status === 'played' && !hasScore) return false;
        if (state.filters.status === 'upcoming' && hasScore) return false;
        if (state.filters.status === 'playoffs' && m.group) return false;
        
        // Group filter
        if (state.filters.group !== 'all') {
            if (m.group !== state.filters.group) return false;
        }
        
        // Search filter (Team names, stadium, round)
        if (state.filters.search) {
            const search = state.filters.search;
            const matchesSearch = m.team1.toLowerCase().includes(search) || 
                                  m.team2.toLowerCase().includes(search) || 
                                  m.ground.toLowerCase().includes(search) || 
                                  m.round.toLowerCase().includes(search) || 
                                  (m.group && m.group.toLowerCase().includes(search));
            if (!matchesSearch) return false;
        }
        
        return true;
    });
    
    // 2. Sort
    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return state.sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    state.filteredMatches = filtered;
    
    // 3. Render State
    if (filtered.length === 0) {
        showState('empty');
        return;
    }
    
    showState('grid');
    
    // 4. Generate Cards
    filtered.forEach((match) => {
        const card = document.createElement('div');
        card.className = `update-card ${state.selectedIds.has(match.id) ? 'selected' : ''}`;
        card.dataset.id = match.id;
        
        const isPlayed = 'score' in match;
        const score1 = isPlayed ? match.score.ft[0] : '-';
        const score2 = isPlayed ? match.score.ft[1] : '-';
        const flag1 = getFlagUrl(match.team1);
        const flag2 = getFlagUrl(match.team2);
        
        // Goals scoring list HTML
        let goalsHtml = '';
        if (isPlayed && ((match.goals1 && match.goals1.length > 0) || (match.goals2 && match.goals2.length > 0))) {
            goalsHtml = `<div class="goals-list">
                <div class="goals-list-title">Match Events</div>`;
            if (match.goals1) {
                match.goals1.forEach(g => {
                    goalsHtml += `<div class="goal-item">${match.team1}: ${g.name} (${g.minute}')</div>`;
                });
            }
            if (match.goals2) {
                match.goals2.forEach(g => {
                    goalsHtml += `<div class="goal-item">${match.team2}: ${g.name} (${g.minute}')</div>`;
                });
            }
            goalsHtml += `</div>`;
        }
        
        card.innerHTML = `
            <div class="card-select-indicator"></div>
            <div class="card-header">
                <span class="badge ${isPlayed ? 'badge-feature' : 'badge-change'}">${isPlayed ? 'FT Result' : 'Upcoming'}</span>
                <span class="badge badge-announcement">${match.group || 'Playoffs'}</span>
                <span class="card-date">${formatDate(match.date)}</span>
            </div>
            <div class="card-body">
                <div class="team-row">
                    <div class="team-info">
                        <img class="team-flag" src="${flag1}" alt="${match.team1} flag">
                        <span class="team-name">${match.team1}</span>
                    </div>
                    <span class="team-score">${score1}</span>
                </div>
                <div class="team-row">
                    <div class="team-info">
                        <img class="team-flag" src="${flag2}" alt="${match.team2} flag">
                        <span class="team-name">${match.team2}</span>
                    </div>
                    <span class="team-score">${score2}</span>
                </div>
                ${goalsHtml}
            </div>
            <div class="card-footer">
                <div class="match-venue" title="${match.ground} (${match.round})">📍 ${match.ground} (${match.round})</div>
                <div class="card-actions">
                    <button class="copy-card-btn" data-id="${match.id}" title="Copy scorecard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy</span>
                    </button>
                    <button class="tweet-card-btn" data-id="${match.id}">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        Share
                    </button>
                </div>
            </div>
        `;
        
        // Card Click (Toggle Selection)
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' || e.target.closest('.tweet-card-btn') || e.target.closest('.copy-card-btn') || e.target.closest('a')) {
                return;
            }
            toggleCardSelection(match.id);
        });
        
        // Copy Button Click
        const copyBtn = card.querySelector('.copy-card-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyCardText(match, copyBtn);
        });
        
        // Tweet Button Click
        const tweetBtn = card.querySelector('.tweet-card-btn');
        tweetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTweetModal([match]);
        });
        
        grid.appendChild(card);
    });
}

// --- News Rendering ---
function renderNews() {
    const newsContainer = elements.newsList;
    if (!newsContainer) return;
    newsContainer.innerHTML = '';
    
    if (state.newsList.length === 0) {
        newsContainer.innerHTML = '<div class="news-item" style="color: var(--text-muted);">No soccer news highlights available right now.</div>';
        return;
    }
    
    state.newsList.forEach(item => {
        const newsEl = document.createElement('div');
        newsEl.className = 'news-item';
        
        // Format pubDate nicely
        let formattedDate = item.pubDate;
        try {
            const dateObj = new Date(item.pubDate);
            formattedDate = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch(e) {}
        
        newsEl.innerHTML = `
            <h3 class="news-title">
                <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
            </h3>
            <p class="news-desc">${item.description || 'Click title to read full report.'}</p>
            <div class="news-meta">🕒 ${formattedDate}</div>
        `;
        newsContainer.appendChild(newsEl);
    });
}

// --- Selection Handlers ---
function toggleCardSelection(id) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    
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
    if (elements.selectedCount) elements.selectedCount.textContent = count;
    
    if (count > 0) {
        elements.floatingBar?.classList.add('active');
    } else {
        elements.floatingBar?.classList.remove('active');
    }
}

// --- Stats Counter ---
function calculateStats() {
    let total = state.rawMatches.length;
    let played = 0;
    let upcoming = 0;
    let goals = 0;
    
    state.rawMatches.forEach(m => {
        const isPlayed = 'score' in m;
        if (isPlayed) {
            played++;
            goals += m.score.ft[0] + m.score.ft[1];
        } else {
            upcoming++;
        }
    });
    
    if (elements.statTotal) elements.statTotal.textContent = total;
    if (elements.statPlayed) elements.statPlayed.textContent = played;
    if (elements.statUpcoming) elements.statUpcoming.textContent = upcoming;
    if (elements.statGoals) elements.statGoals.textContent = goals;
}

// --- Cache Status Label Helper ---
function updateCacheStatus(epochSeconds, fromCache) {
    if (!epochSeconds || !elements.cacheStatus) return;
    const fetchDate = new Date(epochSeconds * 1000);
    const dateStr = fetchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    elements.cacheStatus.textContent = fromCache 
        ? `Cached (fetched at ${dateStr})` 
        : `Updated Live at ${dateStr}`;
}

// --- Visibility states ---
function showState(mode) {
    elements.loadingState?.classList.toggle('hidden', mode !== 'loading');
    elements.errorState?.classList.toggle('hidden', mode !== 'error');
    elements.emptyState?.classList.toggle('hidden', mode !== 'empty');
    elements.feedGrid?.classList.toggle('hidden', mode !== 'grid');
}

// --- Share Composer Modal Methods ---
let activeShareMatches = [];

function openTweetModal(matches) {
    activeShareMatches = matches;
    
    // Generate prefilled text
    const shareText = generateShareText(matches);
    if (elements.tweetTextarea) elements.tweetTextarea.value = shareText;
    
    // Render previews
    if (elements.tweetPreviewList) {
        elements.tweetPreviewList.innerHTML = '';
        matches.forEach(m => {
            const isPlayed = 'score' in m;
            const scoreStr = isPlayed ? `${m.score.ft[0]} - ${m.score.ft[1]}` : 'vs';
            
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <strong>[${m.group || 'Playoffs'}] ${m.team1} ${scoreStr} ${m.team2}</strong>
                <p>📍 ${m.ground} | Round: ${m.round}</p>
            `;
            elements.tweetPreviewList.appendChild(previewItem);
        });
    }
    
    updateCharCount();
    
    elements.tweetModal?.classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scrolling
}

// Close Modal
function closeTweetModal() {
    elements.tweetModal?.classList.remove('active');
    document.body.style.overflow = ''; // Restore scroll
}

function generateShareText(matches) {
    if (matches.length === 1) {
        // Single Match Format
        const m = matches[0];
        const isPlayed = 'score' in m;
        
        let scoreStr = 'vs';
        let goalsStr = '';
        if (isPlayed) {
            scoreStr = `${m.score.ft[0]} - ${m.score.ft[1]}`;
            const events = [];
            if (m.goals1) m.goals1.forEach(g => events.push(`${m.team1}: ${g.name} (${g.minute}')`));
            if (m.goals2) m.goals2.forEach(g => events.push(`${m.team2}: ${g.name} (${g.minute}')`));
            
            if (events.length > 0) {
                goalsStr = `\n⚽ Events: ${events.join(', ')}`;
            }
        }
        
        const emoji = isPlayed ? '🏆' : '📅';
        const header = `${emoji} World Cup 2026 (${m.group || 'Playoffs'}):\n`;
        const body = `${m.team1} ${scoreStr} ${m.team2}${goalsStr}\n📍 Stadium: ${m.ground}\nDate: ${m.date}`;
        const footer = `\n\nFollow WC 2026 updates!`;
        
        const text = `${header}${body}${footer}`;
        return text;
    } else {
        // Multi Match Format
        const header = `🏆 FIFA World Cup 2026 Scorecard (${matches.length} matches):\n\n`;
        const footer = `\n\nTracked live at World Cup 2026 Dashboard!`;
        
        let body = '';
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            const isPlayed = 'score' in m;
            const scoreStr = isPlayed ? `${m.score.ft[0]} - ${m.score.ft[1]}` : 'vs';
            const item = `• [${m.group || 'Playoffs'}] ${m.team1} ${scoreStr} ${m.team2}`;
            
            const testText = `${header}${body}${item}\n${footer}`;
            if (testText.length > 275) {
                body += `+ more match updates!`;
                break;
            } else {
                body += `${item}\n`;
            }
        }
        
        return `${header}${body}${footer}`;
    }
}

function updateCharCount() {
    if (!elements.tweetTextarea) return;
    const len = elements.tweetTextarea.value.length;
    if (elements.charCounter) elements.charCounter.textContent = `${len} / 280`;
    
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
    elements.charCounter?.classList.remove('near-limit', 'over-limit');
    elements.warningMsg?.classList.add('hidden');
    
    if (len > 280) {
        elements.charCounter?.classList.add('over-limit');
        elements.warningMsg?.classList.remove('hidden');
    } else if (len > 250) {
        elements.charCounter?.classList.add('near-limit');
    }
}

function copyTweetText() {
    if (!elements.tweetTextarea) return;
    const text = elements.tweetTextarea.value;
    navigator.clipboard.writeText(text).then(() => {
        if (elements.copyTweetBtn) {
            const origText = elements.copyTweetBtn.textContent;
            elements.copyTweetBtn.textContent = 'Copied!';
            elements.copyTweetBtn.classList.add('btn-success');
            elements.copyTweetBtn.classList.remove('btn-secondary');
            
            setTimeout(() => {
                elements.copyTweetBtn.textContent = origText;
                elements.copyTweetBtn.classList.remove('btn-success');
                elements.copyTweetBtn.classList.add('btn-secondary');
            }, 2000);
        }
    }).catch(err => {
        console.error('Clipboard copy failed: ', err);
    });
}

function publishTweet() {
    if (!elements.tweetTextarea) return;
    const text = elements.tweetTextarea.value;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}

function publishTelegram() {
    if (!elements.tweetTextarea) return;
    const text = elements.tweetTextarea.value;
    const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}

function publishLinkedin() {
    if (!elements.tweetTextarea) return;
    const text = elements.tweetTextarea.value;
    
    // Copy full text to clipboard for convenient pasting into the LinkedIn post creator
    navigator.clipboard.writeText(text);
    
    const firstLink = 'https://www.fifa.com/en/tournaments/mens/worldcup/2026';
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(firstLink)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}

// --- Copy Card & Export CSV Helpers ---
function copyCardText(match, btnElement) {
    const isPlayed = 'score' in match;
    const scoreStr = isPlayed ? `${match.score.ft[0]} - ${match.score.ft[1]}` : 'vs';
    
    let goalsStr = '';
    if (isPlayed) {
        const events = [];
        if (match.goals1) match.goals1.forEach(g => events.push(`${match.team1}: ${g.name} (${g.minute}')`));
        if (match.goals2) match.goals2.forEach(g => events.push(`${match.team2}: ${g.name} (${g.minute}')`));
        if (events.length > 0) {
            goalsStr = `\nScorers:\n${events.map(e => `• ${e}`).join('\n')}`;
        }
    }
    
    const formattedText = `🏆 World Cup 2026 [${match.group || 'Playoffs'}] [${match.round}]:\n${match.team1} ${scoreStr} ${match.team2}${goalsStr}\n📍 Stadium: ${match.ground}\n📅 Date: ${match.date} | Time: ${match.time}`;
    
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
    const matches = state.filteredMatches || state.rawMatches;
    if (matches.length === 0) {
        alert("No matches to export!");
        return;
    }
    
    // Build CSV content
    let csv = "Date,Time,Round,Group,Team 1,Score 1,Score 2,Team 2,Stadium\n";
    matches.forEach(m => {
        const date = m.date.replace(/"/g, '""');
        const timeVal = m.time.replace(/"/g, '""');
        const round = m.round.replace(/"/g, '""');
        const group = (m.group || 'Playoffs').replace(/"/g, '""');
        const team1 = m.team1.replace(/"/g, '""');
        
        const isPlayed = 'score' in m;
        const score1 = isPlayed ? m.score.ft[0] : '-';
        const score2 = isPlayed ? m.score.ft[1] : '-';
        
        const team2 = m.team2.replace(/"/g, '""');
        const ground = m.ground.replace(/"/g, '""');
        
        csv += `"${date}","${timeVal}","${round}","${group}","${team1}","${score1}","${score2}","${team2}","${ground}"\n`;
    });
    
    // Create blob download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `world_cup_2026_schedule_${new Date().toISOString().slice(0,10)}.csv`);
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

// --- Standings Table Calculation ---
function renderStandings(groupName) {
    const tbody = elements.standingsTbody;
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // 1. Get all matches in this group
    const groupMatches = state.rawMatches.filter(m => m.group === groupName);
    
    // 2. Extract unique teams in this group
    const uniqueTeams = new Set();
    groupMatches.forEach(m => {
        uniqueTeams.add(m.team1);
        uniqueTeams.add(m.team2);
    });
    
    // 3. Initialize stats for each team
    const stats = {};
    uniqueTeams.forEach(team => {
        stats[team] = {
            name: team,
            p: 0,   // Played
            w: 0,   // Wins
            d: 0,   // Draws
            l: 0,   // Losses
            gd: 0,  // Goal Difference
            pts: 0  // Points
        };
    });
    
    // 4. Calculate stats from completed matches
    groupMatches.forEach(m => {
        const isPlayed = 'score' in m;
        if (isPlayed && stats[m.team1] && stats[m.team2]) {
            const g1 = m.score.ft[0];
            const g2 = m.score.ft[1];
            
            stats[m.team1].p++;
            stats[m.team2].p++;
            stats[m.team1].gd += (g1 - g2);
            stats[m.team2].gd += (g2 - g1);
            
            if (g1 > g2) {
                stats[m.team1].w++;
                stats[m.team1].pts += 3;
                stats[m.team2].l++;
            } else if (g1 < g2) {
                stats[m.team2].w++;
                stats[m.team2].pts += 3;
                stats[m.team1].l++;
            } else {
                stats[m.team1].d++;
                stats[m.team1].pts += 1;
                stats[m.team2].d++;
                stats[m.team2].pts += 1;
            }
        }
    });
    
    // 5. Convert to array and sort
    const standingsArray = Object.values(stats);
    standingsArray.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts; // Sort by points
        if (b.gd !== a.gd) return b.gd - a.gd;     // Sort by goal difference
        return a.name.localeCompare(b.name);        // Sort alphabetically
    });
    
    // 6. Generate rows
    standingsArray.forEach((team, index) => {
        const row = document.createElement('tr');
        const flag = getFlagUrl(team.name);
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <img src="${flag}" alt="${team.name} flag" style="width: 18px; height: 18px; object-fit: cover; border-radius: 50%; border: 1px solid var(--border-color);">
                    <span>${team.name}</span>
                </div>
            </td>
            <td>${team.p}</td>
            <td>${team.w}</td>
            <td>${team.d}</td>
            <td>${team.l}</td>
            <td>${team.gd > 0 ? '+' + team.gd : team.gd}</td>
            <td style="font-weight: 700;">${team.pts}</td>
        `;
        tbody.appendChild(row);
    });
}

// --- Playoff Views & Bracket ---
function switchView(viewName) {
    if (viewName === 'feed') {
        elements.viewFeedBtn?.classList.add('active');
        elements.viewBracketBtn?.classList.remove('active');
        elements.feedGrid?.classList.remove('hidden');
        elements.bracketView?.classList.add('hidden');
        elements.mainLayoutWrapper?.classList.remove('show-bracket');
        // Show other filter controls
        document.querySelector('.search-box')?.classList.remove('hidden');
        document.querySelector('.filter-groups')?.classList.remove('hidden');
    } else {
        elements.viewFeedBtn?.classList.remove('active');
        elements.viewBracketBtn?.classList.add('active');
        elements.feedGrid?.classList.add('hidden');
        elements.bracketView?.classList.remove('hidden');
        elements.mainLayoutWrapper?.classList.add('show-bracket');
        // Hide other filter controls to focus on the bracket
        document.querySelector('.search-box')?.classList.add('hidden');
        document.querySelector('.filter-groups')?.classList.add('hidden');
        renderBracket();
    }
}

function resolveTeamName(rawName, matchesMap) {
    if (!rawName) return "TBD";
    
    const wMatch = rawName.match(/^W(\d+)$/);
    if (wMatch) {
        const sourceIndex = parseInt(wMatch[1]) - 1;
        const sourceMatchId = `match_${sourceIndex}`;
        const sourceMatch = matchesMap[sourceMatchId];
        if (sourceMatch) {
            const winner = getMatchWinner(sourceMatch);
            return winner || `Winner of Match ${wMatch[1]}`;
        }
    }
    
    const lMatch = rawName.match(/^L(\d+)$/);
    if (lMatch) {
        const sourceIndex = parseInt(lMatch[1]) - 1;
        const sourceMatchId = `match_${sourceIndex}`;
        const sourceMatch = matchesMap[sourceMatchId];
        if (sourceMatch) {
            const loser = getMatchLoser(sourceMatch);
            return loser || `Loser of Match ${lMatch[1]}`;
        }
    }
    
    return rawName;
}

function getMatchWinner(match) {
    if (!match || !match.score) return null;
    const s = match.score;
    const t1 = match.team1_resolved || match.team1;
    const t2 = match.team2_resolved || match.team2;

    if (s.p) {
        if (s.p[0] > s.p[1]) return t1;
        if (s.p[0] < s.p[1]) return t2;
    }
    if (s.et) {
        if (s.et[0] > s.et[1]) return t1;
        if (s.et[0] < s.et[1]) return t2;
    }
    if (s.ft) {
        if (s.ft[0] > s.ft[1]) return t1;
        if (s.ft[0] < s.ft[1]) return t2;
    }
    return null;
}

function getMatchLoser(match) {
    if (!match || !match.score) return null;
    const winner = getMatchWinner(match);
    if (!winner) return null;
    
    const t1 = match.team1_resolved || match.team1;
    const t2 = match.team2_resolved || match.team2;
    return winner === t1 ? t2 : t1;
}

function getResolvedPlayoffMatches() {
    const matchesMap = {};
    state.rawMatches.forEach(m => {
        matchesMap[m.id] = { ...m };
    });

    const resolvedPlayoffMatches = [];
    // Playoff matches are indices 72 to 103 (matches #73 to #104)
    for (let idx = 72; idx < 104; idx++) {
        const matchId = `match_${idx}`;
        const match = matchesMap[matchId];
        if (!match) continue;

        match.team1_resolved = resolveTeamName(match.team1, matchesMap);
        match.team2_resolved = resolveTeamName(match.team2, matchesMap);

        resolvedPlayoffMatches.push(match);
    }
    return resolvedPlayoffMatches;
}

function renderBracket() {
    const container = elements.bracketScrollContainer;
    if (!container) return;
    container.innerHTML = '';

    const resolvedPlayoffs = getResolvedPlayoffMatches();
    const roundNames = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
    
    const roundsData = {
        'Round of 32': resolvedPlayoffs.filter(m => m.round === 'Round of 32'),
        'Round of 16': resolvedPlayoffs.filter(m => m.round === 'Round of 16'),
        'Quarter-final': resolvedPlayoffs.filter(m => m.round === 'Quarter-final'),
        'Semi-final': resolvedPlayoffs.filter(m => m.round === 'Semi-final'),
        'Final': resolvedPlayoffs.filter(m => m.round === 'Final' || m.round === 'Match for third place')
    };

    roundNames.forEach(roundName => {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'bracket-round';
        
        const header = document.createElement('div');
        header.className = 'bracket-round-header';
        header.textContent = roundName;
        roundDiv.appendChild(header);

        const matches = roundsData[roundName] || [];
        matches.forEach(match => {
            const matchCard = document.createElement('div');
            matchCard.className = 'bracket-match';
            matchCard.dataset.id = match.id;

            const isPlayed = 'score' in match;
            const score1 = isPlayed ? match.score.ft[0] : '-';
            const score2 = isPlayed ? match.score.ft[1] : '-';

            const t1 = match.team1_resolved;
            const t2 = match.team2_resolved;

            const flag1 = getFlagUrl(t1);
            const flag2 = getFlagUrl(t2);

            const isTbd1 = t1.startsWith('Winner') || t1.startsWith('Loser') || t1 === 'TBD';
            const isTbd2 = t2.startsWith('Winner') || t2.startsWith('Loser') || t2 === 'TBD';

            const winnerName = getMatchWinner(match);

            let row1Class = 'bracket-team-row';
            let row2Class = 'bracket-team-row';

            if (isTbd1) row1Class += ' tbd';
            if (isTbd2) row2Class += ' tbd';

            if (winnerName) {
                if (winnerName === t1) {
                    row1Class += ' winner';
                    row2Class += ' loser';
                } else if (winnerName === t2) {
                    row2Class += ' winner';
                    row1Class += ' loser';
                }
            }

            let formattedDate = match.date;
            try {
                const d = new Date(match.date);
                formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } catch (e) {}

            const matchLabel = match.round === 'Match for third place' ? '3rd Place Match' : `Match ${match.id.split('_')[1] * 1 + 1}`;

            matchCard.innerHTML = `
                <div class="bracket-match-header">
                    <span>${matchLabel}</span>
                    <span>${formattedDate}</span>
                </div>
                <div class="bracket-match-body">
                    <div class="${row1Class}">
                        <div class="bracket-team-info">
                            <img class="bracket-team-flag" src="${flag1}" alt="${t1} flag">
                            <span class="bracket-team-name" title="${t1}">${t1}</span>
                        </div>
                        <span class="bracket-team-score">${score1}</span>
                    </div>
                    <div class="${row2Class}">
                        <div class="bracket-team-info">
                            <img class="bracket-team-flag" src="${flag2}" alt="${t2} flag">
                            <span class="bracket-team-name" title="${t2}">${t2}</span>
                        </div>
                        <span class="bracket-team-score">${score2}</span>
                    </div>
                </div>
            `;

            matchCard.addEventListener('click', () => {
                openTweetModal([match]);
            });

            roundDiv.appendChild(matchCard);
        });

        container.appendChild(roundDiv);
    });
}
