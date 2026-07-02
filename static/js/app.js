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
        // Add artificial ID for mapping and convert date/time to Lisbon timezone
        state.rawMatches = wcData.data.matches.map((m, index) => {
            const converted = convertToLisbonTime(m.date, m.time);
            return {
                id: `match_${index}`,
                ...m,
                date: converted.date,
                time: converted.time
            };
        });
        
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

// --- Lisbon Timezone Helpers ---
function convertToLisbonTime(dateStr, timeStr) {
    if (!timeStr) return { date: dateStr, time: '' };
    
    const match = timeStr.match(/^(\d{2}):(\d{2})\s+UTC([+-]\d+)?$/);
    if (!match) {
        return { date: dateStr, time: timeStr };
    }
    
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const offset = match[3] ? parseInt(match[3]) : 0;
    
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    
    const dateUtc = new Date(Date.UTC(year, month, day, hours - offset, minutes));
    
    try {
        const optionsDate = { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' };
        const optionsTime = { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false };
        
        const formatterDate = new Intl.DateTimeFormat('en-US', optionsDate);
        const formatterTime = new Intl.DateTimeFormat('en-US', optionsTime);
        
        const dateParts = formatterDate.format(dateUtc).split('/');
        const lisbonDateStr = `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`;
        
        const tempString = dateUtc.toLocaleString('en-US', { timeZone: 'Europe/Lisbon', timeZoneName: 'short' });
        const tzLabel = tempString.split(' ').pop();
        
        const lisbonTimeStr = formatterTime.format(dateUtc) + ` ${tzLabel}`;
        
        return { date: lisbonDateStr, time: lisbonTimeStr };
    } catch (e) {
        return { date: dateStr, time: timeStr };
    }
}

function getLisbonTodayStr() {
    const localDate = new Date();
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Lisbon',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.format(localDate).split('/');
        return `${parts[2]}-${parts[0]}-${parts[1]}`;
    } catch (e) {
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
    
    const todayStr = getLisbonTodayStr();

    // 4. Generate Cards
    filtered.forEach((match) => {
        const isToday = match.date === todayStr;
        const card = document.createElement('div');
        card.className = `update-card ${state.selectedIds.has(match.id) ? 'selected' : ''} ${isToday ? 'today' : ''}`;
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
                ${isToday ? '<span class="badge badge-today">⚡ TODAY</span>' : ''}
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

function getAngleStats(t1, t2) {
    let diff = t2 - t1;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    
    const thetaMid = (t1 + diff / 2 + 360) % 360;
    const sweep = diff >= 0 ? 1 : 0;
    const largeArc = Math.abs(diff) > 180 ? 1 : 0;
    
    return { thetaMid, sweep, largeArc };
}

function getCircularConnectionPath(rParent, rChild, theta1, theta2, rArc, thetaMid, sweep, largeArc) {
    const rad1 = (theta1 * Math.PI) / 180;
    const rad2 = (theta2 * Math.PI) / 180;
    const radMid = (thetaMid * Math.PI) / 180;

    const p1_start_x = 600 + rParent * Math.cos(rad1);
    const p1_start_y = 600 + rParent * Math.sin(rad1);
    const p1_arc_x = 600 + rArc * Math.cos(rad1);
    const p1_arc_y = 600 + rArc * Math.sin(rad1);

    const p2_start_x = 600 + rParent * Math.cos(rad2);
    const p2_start_y = 600 + rParent * Math.sin(rad2);
    const p2_arc_x = 600 + rArc * Math.cos(rad2);
    const p2_arc_y = 600 + rArc * Math.sin(rad2);

    const pm_arc_x = 600 + rArc * Math.cos(radMid);
    const pm_arc_y = 600 + rArc * Math.sin(radMid);

    const p_child_x = 600 + rChild * Math.cos(radMid);
    const p_child_y = 600 + rChild * Math.sin(radMid);

    return `M ${p1_start_x} ${p1_start_y} L ${p1_arc_x} ${p1_arc_y} A ${rArc} ${rArc} 0 ${largeArc} ${sweep} ${p2_arc_x} ${p2_arc_y} L ${p2_start_x} ${p2_start_y} M ${pm_arc_x} ${pm_arc_y} L ${p_child_x} ${p_child_y}`;
}

function renderBracket() {
    const container = elements.bracketScrollContainer;
    if (!container) return;
    container.innerHTML = '';
    container.className = 'radial-bracket-container';

    const resolvedPlayoffs = getResolvedPlayoffMatches();
    const matchesMap = {};
    resolvedPlayoffs.forEach(m => {
        matchesMap[m.id] = m;
    });

    const todayStr = getLisbonTodayStr();

    // 1. Build coordinate tree nodes in polar format mapped to cartesian (scaled by 1.5x)
    const treeNodes = {};
    const r32Order = [73, 76, 72, 74, 82, 83, 80, 81, 75, 77, 78, 79, 85, 87, 84, 86];

    // Outermost level: Round of 32 (16 junctions at radius 405)
    r32Order.forEach((matchNum, idx) => {
        const matchId = `match_${matchNum}`;
        const angle = (idx * 360) / 16;
        treeNodes[matchId] = {
            id: matchId,
            matchNum: matchNum,
            level: 4,
            angle: angle,
            r: 405,
            x: 600 + 405 * Math.cos((angle * Math.PI) / 180),
            y: 600 + 405 * Math.sin((angle * Math.PI) / 180)
        };
    });

    // Level 3: Round of 16 (8 junctions at radius 300)
    const r16Mapping = [
        { id: 'match_88', children: ['match_73', 'match_76'] },
        { id: 'match_89', children: ['match_72', 'match_74'] },
        { id: 'match_92', children: ['match_82', 'match_83'] },
        { id: 'match_93', children: ['match_80', 'match_81'] },
        { id: 'match_90', children: ['match_75', 'match_77'] },
        { id: 'match_91', children: ['match_78', 'match_79'] },
        { id: 'match_94', children: ['match_85', 'match_87'] },
        { id: 'match_95', children: ['match_84', 'match_86'] }
    ];
    r16Mapping.forEach(item => {
        const c1 = treeNodes[item.children[0]];
        const c2 = treeNodes[item.children[1]];
        let diff = Math.abs(c1.angle - c2.angle);
        if (diff > 180) diff = 360 - diff;
        const angle = c1.angle + (c2.angle > c1.angle ? diff / 2 : -diff / 2);
        
        treeNodes[item.id] = {
            id: item.id,
            level: 3,
            angle: angle,
            r: 300,
            x: 600 + 300 * Math.cos((angle * Math.PI) / 180),
            y: 600 + 300 * Math.sin((angle * Math.PI) / 180),
            children: item.children
        };
    });

    // Level 2: Quarter-finals (4 junctions at radius 202.5)
    const qfMapping = [
        { id: 'match_96', children: ['match_88', 'match_89'] },
        { id: 'match_97', children: ['match_92', 'match_93'] },
        { id: 'match_98', children: ['match_90', 'match_91'] },
        { id: 'match_99', children: ['match_94', 'match_95'] }
    ];
    qfMapping.forEach(item => {
        const c1 = treeNodes[item.children[0]];
        const c2 = treeNodes[item.children[1]];
        let diff = Math.abs(c1.angle - c2.angle);
        if (diff > 180) diff = 360 - diff;
        const angle = c1.angle + (c2.angle > c1.angle ? diff / 2 : -diff / 2);

        treeNodes[item.id] = {
            id: item.id,
            level: 2,
            angle: angle,
            r: 202.5,
            x: 600 + 202.5 * Math.cos((angle * Math.PI) / 180),
            y: 600 + 202.5 * Math.sin((angle * Math.PI) / 180),
            children: item.children
        };
    });

    // Level 1: Semi-finals (2 junctions at radius 112.5)
    const sfMapping = [
        { id: 'match_100', children: ['match_96', 'match_97'] },
        { id: 'match_101', children: ['match_98', 'match_99'] }
    ];
    sfMapping.forEach(item => {
        const c1 = treeNodes[item.children[0]];
        const c2 = treeNodes[item.children[1]];
        let diff = Math.abs(c1.angle - c2.angle);
        if (diff > 180) diff = 360 - diff;
        const angle = c1.angle + (c2.angle > c1.angle ? diff / 2 : -diff / 2);

        treeNodes[item.id] = {
            id: item.id,
            level: 1,
            angle: angle,
            r: 112.5,
            x: 600 + 112.5 * Math.cos((angle * Math.PI) / 180),
            y: 600 + 112.5 * Math.sin((angle * Math.PI) / 180),
            children: item.children
        };
    });

    const finalMatchId = 'match_103';

    // Start SVG string (viewBox updated to 1200x1200)
    let svgHtml = `
    <svg viewBox="0 0 1200 1200" width="100%" height="100%" class="radial-bracket-svg" style="max-width:1150px; aspect-ratio:1/1;">
        <defs>
            <clipPath id="flag-clip" clipPathUnits="objectBoundingBox">
                <circle r="0.5" cx="0.5" cy="0.5" />
            </clipPath>
        </defs>
    `;

    // 2. Draw lines between junctions (with circular arcs)
    Object.values(treeNodes).forEach(node => {
        if (node.children) {
            const parent1 = treeNodes[node.children[0]];
            const parent2 = treeNodes[node.children[1]];
            
            const mNode = matchesMap[node.id];
            const isCompleted = mNode && 'score' in mNode;
            const isToday = mNode && mNode.date === todayStr;
            
            const rParent = parent1.r;
            const rChild = node.r;
            const rArc = rParent - (rParent - rChild) * 0.45;
            
            const { thetaMid, sweep, largeArc } = getAngleStats(parent1.angle, parent2.angle);
            const pathStr = getCircularConnectionPath(rParent, rChild, parent1.angle, parent2.angle, rArc, thetaMid, sweep, largeArc);
            
            svgHtml += `
                <path d="${pathStr}" class="bracket-line ${isCompleted ? 'active' : ''} ${isToday ? 'today' : ''}" />
            `;
        }
    });

    // Draw lines from Semi-Finals to the Final circle
    const sf1 = treeNodes['match_100'];
    const sf2 = treeNodes['match_101'];
    const finalMatch = matchesMap[finalMatchId];
    const finalCompleted = finalMatch && 'score' in finalMatch;
    const finalToday = finalMatch && finalMatch.date === todayStr;
    
    const { thetaMid: finalThetaMid, sweep: finalSweep, largeArc: finalLargeArc } = getAngleStats(sf1.angle, sf2.angle);
    const finalPathStr = getCircularConnectionPath(112.5, 45, sf1.angle, sf2.angle, 75, finalThetaMid, finalSweep, finalLargeArc);
    svgHtml += `
        <path d="${finalPathStr}" class="bracket-line ${finalCompleted ? 'active' : ''} ${finalToday ? 'today' : ''}" />
    `;

    // 3. Draw outermost flag circles and lines connecting to Round of 32 junctions
    r32Order.forEach((matchNum, idx) => {
        const matchId = `match_${matchNum}`;
        const match = matchesMap[matchId];
        if (!match) return;

        const node = treeNodes[matchId];
        const angle = node.angle;

        const rFlag = 498;
        const angleOffset = 4.8;
        
        const a1 = angle - angleOffset;
        const a2 = angle + angleOffset;

        const f1x = 600 + rFlag * Math.cos((a1 * Math.PI) / 180);
        const f1y = 600 + rFlag * Math.sin((a1 * Math.PI) / 180);
        const f2x = 600 + rFlag * Math.cos((a2 * Math.PI) / 180);
        const f2y = 600 + rFlag * Math.sin((a2 * Math.PI) / 180);

        const flag1 = getFlagUrl(match.team1_resolved);
        const flag2 = getFlagUrl(match.team2_resolved);

        const isCompleted = 'score' in match;
        const isToday = match.date === todayStr;
        const rParent = rFlag;
        const rChild = node.r;
        const rArc = rParent - (rParent - rChild) * 0.4;
        
        const { thetaMid, sweep, largeArc } = getAngleStats(a1, a2);
        const pathStr = getCircularConnectionPath(rParent, rChild, a1, a2, rArc, thetaMid, sweep, largeArc);

        svgHtml += `
            <path d="${pathStr}" class="bracket-line ${isCompleted ? 'active' : ''} ${isToday ? 'today' : ''}" />
        `;

        const team1Winner = getMatchWinner(match) === match.team1_resolved;
        const team2Winner = getMatchWinner(match) === match.team2_resolved;
        const hasWinner = team1Winner || team2Winner;

        svgHtml += `
            <g class="bracket-flag-wrapper ${isToday ? 'today' : ''}" style="--flag-cx: ${f1x}px; --flag-cy: ${f1y}px;" data-match-id="${match.id}">
                <circle cx="${f1x}" cy="${f1y}" r="21" fill="var(--bg-card)" stroke="${team1Winner ? 'var(--primary)' : 'var(--border-color)'}" stroke-width="${team1Winner ? '2' : '1.5'}" style="opacity: ${hasWinner && !team1Winner ? '0.45' : '1'}" />
                <image href="${flag1}" x="${f1x - 16.5}" y="${f1y - 16.5}" width="33" height="33" clip-path="url(#flag-clip)" style="opacity: ${hasWinner && !team1Winner ? '0.45' : '1'}" />
            </g>
            <g class="bracket-flag-wrapper ${isToday ? 'today' : ''}" style="--flag-cx: ${f2x}px; --flag-cy: ${f2y}px;" data-match-id="${match.id}">
                <circle cx="${f2x}" cy="${f2y}" r="21" fill="var(--bg-card)" stroke="${team2Winner ? 'var(--primary)' : 'var(--border-color)'}" stroke-width="${team2Winner ? '2' : '1.5'}" style="opacity: ${hasWinner && !team2Winner ? '0.45' : '1'}" />
                <image href="${flag2}" x="${f2x - 16.5}" y="${f2y - 16.5}" width="33" height="33" clip-path="url(#flag-clip)" style="opacity: ${hasWinner && !team2Winner ? '0.45' : '1'}" />
            </g>
        `;
    });

    // 4. Draw junction dots or winner flags for rounds (larger dimensions)
    Object.values(treeNodes).forEach(node => {
        const match = matchesMap[node.id];
        const winnerName = match ? getMatchWinner(match) : null;
        const isToday = match && match.date === todayStr;
        
        if (winnerName) {
            const flagUrl = getFlagUrl(winnerName);
            svgHtml += `
                <g class="bracket-flag-wrapper ${isToday ? 'today' : ''}" style="--flag-cx: ${node.x}px; --flag-cy: ${node.y}px;" data-match-id="${node.id}">
                    <circle cx="${node.x}" cy="${node.y}" r="17" fill="var(--bg-card)" stroke="var(--primary)" stroke-width="1.8" />
                    <image href="${flagUrl}" x="${node.x - 13.5}" y="${node.y - 13.5}" width="27" height="27" clip-path="url(#flag-clip)" />
                </g>
            `;
        } else {
            const isCompleted = match && 'score' in match;
            svgHtml += `
                <circle cx="${node.x}" cy="${node.y}" r="${node.level === 4 ? '8' : '6.5'}" class="bracket-dot ${isCompleted ? 'completed' : ''} ${isToday ? 'today' : ''}" data-match-id="${node.id}" />
            `;
        }
    });

    // 5. Draw Central Trophy (scaled by 1.5x)
    svgHtml += `
        <!-- Central FIFA Trophy Circle -->
        <circle cx="600" cy="600" r="45" fill="var(--bg-main)" stroke="var(--primary)" stroke-width="2.5" />
        <g transform="translate(600, 600) scale(1.35)" style="cursor:pointer;" id="trophy-center-btn">
            <!-- Vector Trophy -->
            <path d="M-10,-15 L10,-15 C10,-15 12,-5 10,5 C8,12 3,15 0,15 C-3,15 -8,12 -10,5 C-12,-5 -10,-15 -10,-15 Z" fill="#fbbf24" />
            <path d="M-5,15 L5,15 L3,22 L-3,22 Z" fill="#d97706" />
            <path d="M-8,22 L8,22 L8,25 L-8,25 Z" fill="#fbbf24" />
            <path d="M-10,-5 C-15,-5 -17,-10 -15,-15 C-13,-18 -10,-15 -10,-15" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" />
            <path d="M10,-5 C15,-5 17,-10 15,-15 C13,-18 10,-15 10,-15" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" />
        </g>
    `;

    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;

    const tooltip = document.getElementById('bracket-tooltip');
    
    // Bind Hover & Click Events
    const interactiveElements = container.querySelectorAll('.bracket-flag-wrapper, .bracket-dot');
    interactiveElements.forEach(el => {
        const matchId = el.dataset.matchId;
        const match = matchesMap[matchId];
        if (!match) return;

        el.addEventListener('mouseenter', (e) => {
            showTooltip(e, match, tooltip);
        });
        
        el.addEventListener('mousemove', (e) => {
            positionTooltip(e, tooltip);
        });

        el.addEventListener('mouseleave', () => {
            hideTooltip(tooltip);
        });

        el.addEventListener('click', () => {
            openTweetModal([match]);
        });
    });

    const trophyBtn = container.querySelector('#trophy-center-btn');
    if (trophyBtn && finalMatch) {
        trophyBtn.addEventListener('mouseenter', (e) => {
            showTooltip(e, finalMatch, tooltip);
        });
        trophyBtn.addEventListener('mousemove', (e) => {
            positionTooltip(e, tooltip);
        });
        trophyBtn.addEventListener('mouseleave', () => {
            hideTooltip(tooltip);
        });
        trophyBtn.addEventListener('click', () => {
            openTweetModal([finalMatch]);
        });
    }

    // 6. Draw Third Place match card below the circle
    const thirdPlaceMatch = resolvedPlayoffs.find(m => m.round === 'Match for third place');
    if (thirdPlaceMatch) {
        const thirdPlaceDiv = document.createElement('div');
        thirdPlaceDiv.className = 'third-place-card-wrapper';
        thirdPlaceDiv.style.width = '100%';
        thirdPlaceDiv.style.display = 'flex';
        thirdPlaceDiv.style.justifyContent = 'center';
        
        const isPlayed = 'score' in thirdPlaceMatch;
        const score1 = isPlayed ? thirdPlaceMatch.score.ft[0] : '-';
        const score2 = isPlayed ? thirdPlaceMatch.score.ft[1] : '-';
        const flag1 = getFlagUrl(thirdPlaceMatch.team1_resolved);
        const flag2 = getFlagUrl(thirdPlaceMatch.team2_resolved);

        const winnerName = getMatchWinner(thirdPlaceMatch);
        const t1 = thirdPlaceMatch.team1_resolved;
        const t2 = thirdPlaceMatch.team2_resolved;

        let row1Class = 'bracket-team-row';
        let row2Class = 'bracket-team-row';
        if (winnerName) {
            if (winnerName === t1) {
                row1Class += ' winner';
                row2Class += ' loser';
            } else if (winnerName === t2) {
                row2Class += ' winner';
                row1Class += ' loser';
            }
        }

        thirdPlaceDiv.innerHTML = `
            <div class="bracket-match" style="max-width: 250px; margin: 1.5rem auto 0 auto; display: flex; flex-direction: column;">
                <div class="bracket-match-header" style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-bottom: 0.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.04); padding-bottom: 0.25rem;">
                    <span>3rd Place Match</span>
                    <span>📍 ${thirdPlaceMatch.ground}</span>
                </div>
                <div class="bracket-match-body" style="display: flex; flex-direction: column; gap: 0.4rem;">
                    <div class="${row1Class}">
                        <div class="bracket-team-info">
                            <img class="bracket-team-flag" src="${flag1}" alt="${t1} flag" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;">
                            <span class="bracket-team-name" title="${t1}">${t1}</span>
                        </div>
                        <span class="bracket-team-score">${score1}</span>
                    </div>
                    <div class="${row2Class}">
                        <div class="bracket-team-info">
                            <img class="bracket-team-flag" src="${flag2}" alt="${t2} flag" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;">
                            <span class="bracket-team-name" title="${t2}">${t2}</span>
                        </div>
                        <span class="bracket-team-score">${score2}</span>
                    </div>
                </div>
            </div>
        `;
        thirdPlaceDiv.addEventListener('click', () => {
            openTweetModal([thirdPlaceMatch]);
        });
        container.appendChild(thirdPlaceDiv);
    }

    // 7. Populating the Today's Playoff Matches Sidebar
    const todayPlayoffMatches = resolvedPlayoffs.filter(m => m.date === todayStr);
    const sidebar = document.getElementById('playoffs-today-sidebar');
    if (sidebar) {
        if (todayPlayoffMatches.length > 0) {
            sidebar.classList.remove('hidden');
            let sidebarHtml = `
                <div class="playoffs-today-title">
                    <span class="pulse-today-dot"></span>
                    <span>TODAY'S PLAYOFF MATCHES</span>
                </div>
                <div class="playoffs-today-cards">
            `;
            
            todayPlayoffMatches.forEach(match => {
                const isPlayed = 'score' in match;
                const score1 = isPlayed ? match.score.ft[0] : '-';
                const score2 = isPlayed ? match.score.ft[1] : '-';
                const flag1 = getFlagUrl(match.team1_resolved);
                const flag2 = getFlagUrl(match.team2_resolved);
                
                sidebarHtml += `
                    <div class="sidebar-match-card" data-match-id="${match.id}">
                        <div class="sidebar-match-header">
                            <span class="badge ${isPlayed ? 'badge-feature' : 'badge-change'}">${isPlayed ? 'FT Result' : 'Today'}</span>
                            <span class="card-date">${match.time || ''}</span>
                        </div>
                        <div class="sidebar-match-body">
                            <div class="sidebar-team-row">
                                <div class="sidebar-team-info">
                                    <img class="sidebar-team-flag" src="${flag1}" alt="${match.team1_resolved} flag">
                                    <span class="sidebar-team-name">${match.team1_resolved}</span>
                                </div>
                                <span class="sidebar-team-score">${score1}</span>
                            </div>
                            <div class="sidebar-team-row">
                                <div class="sidebar-team-info">
                                    <img class="sidebar-team-flag" src="${flag2}" alt="${match.team2_resolved} flag">
                                    <span class="sidebar-team-name">${match.team2_resolved}</span>
                                </div>
                                <span class="sidebar-team-score">${score2}</span>
                            </div>
                        </div>
                        <div class="sidebar-match-footer">
                            📍 ${match.ground}
                        </div>
                    </div>
                `;
            });
            
            sidebarHtml += `</div>`;
            sidebar.innerHTML = sidebarHtml;
            
            // Add click events to open Tweet Modal
            sidebar.querySelectorAll('.sidebar-match-card').forEach(card => {
                card.addEventListener('click', () => {
                    const m = resolvedPlayoffs.find(x => x.id === card.dataset.matchId);
                    if (m) openTweetModal([m]);
                });
            });
        } else {
            sidebar.classList.add('hidden');
            sidebar.innerHTML = '';
        }
    }
}

// Tooltip Helpers
function showTooltip(e, match, tooltipEl) {
    if (!tooltipEl) return;
    
    const isPlayed = 'score' in match;
    const score1 = isPlayed ? match.score.ft[0] : '-';
    const score2 = isPlayed ? match.score.ft[1] : '-';
    const t1 = match.team1_resolved || match.team1;
    const t2 = match.team2_resolved || match.team2;
    const flag1 = getFlagUrl(t1);
    const flag2 = getFlagUrl(t2);

    const winnerName = getMatchWinner(match);

    let row1Style = '';
    let row2Style = '';
    if (winnerName) {
        if (winnerName === t1) {
            row1Style = 'color: var(--primary); font-weight: 600;';
            row2Style = 'opacity: 0.5;';
        } else if (winnerName === t2) {
            row2Style = 'color: var(--primary); font-weight: 600;';
            row1Style = 'opacity: 0.5;';
        }
    }

    const matchLabel = match.round === 'Match for third place' ? '3rd Place Match' : `Match ${match.id.split('_')[1] * 1 + 1}`;

    tooltipEl.innerHTML = `
        <div class="bracket-tooltip-header">${match.round} - ${matchLabel}</div>
        <div class="bracket-tooltip-team" style="${row1Style}">
            <div style="display:flex; align-items:center; gap:0.4rem;">
                <img src="${flag1}" style="width:14px; height:14px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);" />
                <span>${t1}</span>
            </div>
            <strong>${score1}</strong>
        </div>
        <div class="bracket-tooltip-team" style="${row2Style}">
            <div style="display:flex; align-items:center; gap:0.4rem;">
                <img src="${flag2}" style="width:14px; height:14px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);" />
                <span>${t2}</span>
            </div>
            <strong>${score2}</strong>
        </div>
        <div style="font-size:0.6rem; color:var(--text-muted); margin-top:0.4rem; border-top:1px solid rgba(255,255,255,0.06); padding-top:0.3rem;">
            📍 ${match.ground}<br>📅 ${match.date} ${match.time || ''}
        </div>
    `;
    
    tooltipEl.classList.remove('hidden');
    tooltipEl.style.opacity = '1';
    positionTooltip(e, tooltipEl);
}

function positionTooltip(e, tooltipEl) {
    if (!tooltipEl) return;
    const x = e.pageX + 15;
    const y = e.pageY + 15;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
}

function hideTooltip(tooltipEl) {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = '0';
    tooltipEl.classList.add('hidden');
}
