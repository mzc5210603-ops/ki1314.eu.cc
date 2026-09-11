/* =========================================
   NewsHub - 纯前端资讯聚合站点
   原生 JavaScript 实现，无第三方依赖
   ========================================= */

(function () {
    'use strict';

    // ================= 配置 =================
    const CONFIG = {
        PAGE_SIZE: 12,
        MAX_TAGS: 30,
        STORAGE_KEYS: {
            THEME: 'newshub_theme',
            SEARCH: 'newshub_search',
            CATEGORY: 'newshub_category',
            TAGS: 'newshub_tags',
            SORT: 'newshub_sort',
            PAGE: 'newshub_page'
        },
        CATEGORY_NAMES: {
            all: '全部',
            tech: '科技',
            business: '财经',
            sports: '体育',
            entertainment: '娱乐',
            health: '健康',
            science: '科学',
            world: '国际'
        },
        DATA_URL: 'data.json'
    };

    // ================= 状态 =================
    const state = {
        allNews: [],
        filteredNews: [],
        searchKeyword: '',
        category: 'all',
        activeTags: [],
        sort: 'newest',
        currentPage: 1,
        lastUpdate: null
    };

    // ================= DOM 元素 =================
    const dom = {};

    function cacheDOM() {
        dom.searchInput = document.getElementById('searchInput');
        dom.clearSearch = document.getElementById('clearSearch');
        dom.themeToggle = document.getElementById('themeToggle');
        dom.menuToggle = document.getElementById('menuToggle');
        dom.sidebar = document.getElementById('sidebar');
        dom.categoryList = document.getElementById('categoryList');
        dom.tagCloud = document.getElementById('tagCloud');
        dom.totalCount = document.getElementById('totalCount');
        dom.updateTime = document.getElementById('updateTime');
        dom.resultHint = document.getElementById('resultHint');
        dom.sortSelect = document.getElementById('sortSelect');
        dom.activeFilters = document.getElementById('activeFilters');
        dom.activeFilterChips = document.getElementById('activeFilterChips');
        dom.clearAllFilters = document.getElementById('clearAllFilters');
        dom.newsGrid = document.getElementById('newsGrid');
        dom.loadingState = document.getElementById('loadingState');
        dom.emptyState = document.getElementById('emptyState');
        dom.resetFilters = document.getElementById('resetFilters');
        dom.pagination = document.getElementById('pagination');
        dom.prevPage = document.getElementById('prevPage');
        dom.nextPage = document.getElementById('nextPage');
        dom.pageNumbers = document.getElementById('pageNumbers');
        dom.backToTop = document.getElementById('backToTop');
    }

    // ================= 工具函数 =================
    function $(selector, parent = document) {
        return parent.querySelector(selector);
    }

    function $all(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins} 分钟前`;
        if (diffHours < 24) return `${diffHours} 小时前`;
        if (diffDays < 7) return `${diffDays} 天前`;

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}`;
    }

    function storageGet(key, defaultValue = null) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? defaultValue : JSON.parse(v);
        } catch {
            return defaultValue;
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {}
    }

    // ================= 主题 =================
    function initTheme() {
        const savedTheme = storageGet(CONFIG.STORAGE_KEYS.THEME);
        let theme = savedTheme;

        if (!theme) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            theme = prefersDark ? 'dark' : 'light';
        }

        applyTheme(theme);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        storageSet(CONFIG.STORAGE_KEYS.THEME, theme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'light' ? 'dark' : 'light');
    }

    // ================= 数据加载 =================
    async function loadData() {
        try {
            showLoading(true);
            const response = await fetch(CONFIG.DATA_URL + '?t=' + Date.now(), {
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const rawData = await response.json();
            processRawData(rawData);
        } catch (err) {
            console.error('加载数据失败:', err);
            state.allNews = [];
            state.lastUpdate = null;
            updateDataInfo();
        } finally {
            showLoading(false);
        }
    }

    function processRawData(rawData) {
        state.allNews = [];

        if (Array.isArray(rawData)) {
            state.allNews = rawData.map(normalizeNewsItem);
        } else if (rawData && Array.isArray(rawData.articles)) {
            state.allNews = rawData.articles.map(normalizeNewsItem);
            state.lastUpdate = rawData.updatedAt || rawData.lastUpdate || null;
        } else if (rawData && Array.isArray(rawData.news)) {
            state.allNews = rawData.news.map(normalizeNewsItem);
            state.lastUpdate = rawData.updatedAt || rawData.lastUpdate || null;
        }

        // 过滤无效数据
        state.allNews = state.allNews.filter(item => item && item.title);

        // 按日期降序初始化排序
        state.allNews.sort((a, b) => {
            const ta = new Date(a.publishedAt || 0).getTime();
            const tb = new Date(b.publishedAt || 0).getTime();
            return tb - ta;
        });

        updateDataInfo();
    }

    function normalizeNewsItem(item, index) {
        return {
            id: item.id || `news_${index}_${Date.now()}`,
            title: item.title || '',
            summary: item.summary || item.description || item.content || '',
            url: item.url || item.link || '#',
            image: item.urlToImage || item.image || item.thumbnail || '',
            category: normalizeCategory(item.category || item.category_name || 'other'),
            source: item.source || item.sourceName || (item.author && typeof item.author === 'string' ? item.author : 'NewsHub'),
            author: item.author || '',
            publishedAt: item.publishedAt || item.pub_date || item.date || new Date(Date.now() - index * 3600000).toISOString(),
            tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : extractTags(item),
            popularity: item.popularity || item.views || Math.floor(Math.random() * 10000) + 100
        };
    }

    function normalizeCategory(cat) {
        if (!cat) return 'other';
        const c = String(cat).toLowerCase().trim();
        const map = {
            'tech': 'tech', 'technology': 'tech', '科技': 'tech', 'it': 'tech',
            'business': 'business', 'finance': 'business', '财经': 'business', '经济': 'business',
            'sports': 'sports', 'sport': 'sports', '体育': 'sports',
            'entertainment': 'entertainment', 'ent': 'entertainment', '娱乐': 'entertainment', 'movie': 'entertainment', 'music': 'entertainment',
            'health': 'health', '健康': 'health', 'medical': 'health', '医疗': 'health',
            'science': 'science', 'sci': 'science', '科学': 'science',
            'world': 'world', 'international': 'world', '国际': 'world', 'global': 'world',
            'general': 'all', 'all': 'all', '全部': 'all'
        };
        return map[c] || 'other';
    }

    function extractTags(item) {
        const tags = new Set();
        const text = [item.title, item.description, item.content, item.summary]
            .filter(Boolean)
            .join(' ');

        const commonTags = [
            'AI', '人工智能', '机器学习', '深度学习', '大模型', 'GPT', '开源',
            '5G', '芯片', '半导体', '元宇宙', 'VR', 'AR', '区块链', 'Web3',
            '新能源', '电动车', '电动汽车', '自动驾驶', '手机', '苹果', '华为',
            '小米', '腾讯', '阿里', '百度', '字节', '谷歌', '微软', '特斯拉',
            '经济', '股市', '投资', '房地产', '通胀', '降息', '加息', 'GDP',
            '世界杯', '奥运会', 'NBA', '欧冠', '英超', '西甲', '中超',
            '电影', '电视剧', '音乐', '游戏', '综艺', '明星',
            '疫情', '疫苗', '健康', '养生', '医疗', '医保',
            '太空', 'NASA', '火星', '量子', '基因', '生物',
            '中美', '俄乌', '欧盟', '联合国', '外交', '政策'
        ];

        commonTags.forEach(tag => {
            if (text.includes(tag)) tags.add(tag);
        });

        return Array.from(tags).slice(0, 5);
    }

    // ================= 筛选与排序 =================
    function applyFilters() {
        let result = [...state.allNews];

        // 关键词搜索
        if (state.searchKeyword) {
            const kw = state.searchKeyword.toLowerCase();
            result = result.filter(item => {
                const haystack = [
                    item.title,
                    item.summary,
                    item.source,
                    item.author,
                    (item.tags || []).join(' ')
                ].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(kw);
            });
        }

        // 分类筛选
        if (state.category !== 'all') {
            result = result.filter(item => item.category === state.category);
        }

        // 标签筛选（AND 逻辑）
        if (state.activeTags.length > 0) {
            result = result.filter(item => {
                const itemTags = (item.tags || []).map(t => t.toLowerCase());
                return state.activeTags.every(tag =>
                    itemTags.includes(tag.toLowerCase())
                );
            });
        }

        // 排序
        sortNews(result);

        state.filteredNews = result;
        state.currentPage = 1;
    }

    function sortNews(arr) {
        switch (state.sort) {
            case 'oldest':
                arr.sort((a, b) => {
                    const ta = new Date(a.publishedAt || 0).getTime();
                    const tb = new Date(b.publishedAt || 0).getTime();
                    return ta - tb;
                });
                break;
            case 'popular':
                arr.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                break;
            case 'newest':
            default:
                arr.sort((a, b) => {
                    const ta = new Date(a.publishedAt || 0).getTime();
                    const tb = new Date(b.publishedAt || 0).getTime();
                    return tb - ta;
                });
        }
    }

    // ================= 渲染 =================
    function renderNews() {
        const { filteredNews, currentPage } = state;
        const total = filteredNews.length;
        const pageSize = CONFIG.PAGE_SIZE;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        if (currentPage > totalPages) state.currentPage = totalPages;

        const start = (state.currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageNews = filteredNews.slice(start, end);

        // 渲染卡片
        dom.newsGrid.innerHTML = pageNews.map(renderNewsCard).join('');

        // 结果提示
        if (total === 0) {
            dom.resultHint.textContent = '没有找到匹配的资讯';
        } else {
            dom.resultHint.innerHTML = `共找到 <strong>${total}</strong> 条资讯，当前显示第 <strong>${start + 1}-${Math.min(end, total)}</strong> 条`;
        }

        // 空状态
        if (total === 0) {
            dom.emptyState.style.display = 'flex';
            dom.newsGrid.style.display = 'none';
        } else {
            dom.emptyState.style.display = 'none';
            dom.newsGrid.style.display = 'grid';
        }

        // 分页
        renderPagination(totalPages);

        // 绑定卡片事件
        bindNewsCardEvents();
    }

    function renderNewsCard(item) {
        const catName = CONFIG.CATEGORY_NAMES[item.category] || '资讯';
        const tagsHTML = (item.tags || []).slice(0, 4).map(tag =>
            `<span class="news-tag" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</span>`
        ).join('');

        let imageHTML = '';
        if (item.image) {
            imageHTML = `
                <div class="news-image">
                    <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" loading="lazy"
                         onerror="this.parentElement.innerHTML='<div class=\\'news-image-placeholder\\'><svg width=\\'48\\' height=\\'48\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg></div>'" />
                    <span class="news-category-badge">${catName}</span>
                </div>
            `;
        } else {
            imageHTML = `
                <div class="news-image">
                    <div class="news-image-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
                            <path d="M18 14h-8"/>
                            <path d="M15 18h-5"/>
                        </svg>
                    </div>
                    <span class="news-category-badge">${catName}</span>
                </div>
            `;
        }

        return `
            <article class="news-card" data-id="${item.id}" data-category="${item.category}">
                ${imageHTML}
                <div class="news-content">
                    <h2 class="news-title" title="${escapeHTML(item.title)}">
                        <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer">
                            ${escapeHTML(item.title)}
                        </a>
                    </h2>
                    <p class="news-summary" title="${escapeHTML(item.summary)}">${escapeHTML(item.summary) || '暂无摘要'}</p>
                    <div class="news-tags">${tagsHTML}</div>
                    <div class="news-meta">
                        <div class="news-source" title="${escapeHTML(item.source)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                            </svg>
                            <span>${escapeHTML(item.source)}</span>
                        </div>
                        <span class="news-date">${formatDate(item.publishedAt)}</span>
                    </div>
                </div>
            </article>
        `;
    }

    function renderPagination(totalPages) {
        if (totalPages <= 1) {
            dom.pagination.style.display = 'none';
            return;
        }

        dom.pagination.style.display = 'flex';

        // 上/下一页按钮
        dom.prevPage.disabled = state.currentPage <= 1;
        dom.nextPage.disabled = state.currentPage >= totalPages;

        // 页码
        const pages = buildPageNumbers(state.currentPage, totalPages);
        dom.pageNumbers.innerHTML = pages.map(p => {
            if (p === '...') {
                return `<span class="page-ellipsis">...</span>`;
            }
            const active = p === state.currentPage ? 'active' : '';
            return `<button class="page-number ${active}" data-page="${p}">${p}</button>`;
        }).join('');
    }

    function buildPageNumbers(current, total) {
        const pages = [];
        const delta = 1;

        pages.push(1);

        const left = Math.max(2, current - delta);
        const right = Math.min(total - 1, current + delta);

        if (left > 2) pages.push('...');
        for (let i = left; i <= right; i++) pages.push(i);
        if (right < total - 1) pages.push('...');

        if (total > 1) pages.push(total);

        return pages;
    }

    function renderTags() {
        const tagCount = new Map();

        state.allNews.forEach(item => {
            (item.tags || []).forEach(tag => {
                if (tag && tag.length <= 20) {
                    tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
                }
            });
        });

        // 按频率排序取前 N
        const topTags = Array.from(tagCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, CONFIG.MAX_TAGS)
            .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));

        dom.tagCloud.innerHTML = topTags.map(([tag]) => {
            const active = state.activeTags.includes(tag) ? 'active' : '';
            return `<span class="tag-chip ${active}" data-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</span>`;
        }).join('');
    }

    function renderCategoryCounts() {
        const counts = { all: state.allNews.length };

        state.allNews.forEach(item => {
            const cat = item.category || 'other';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        Object.entries(counts).forEach(([cat, count]) => {
            const el = document.getElementById('count-' + cat);
            if (el) el.textContent = count;
        });
    }

    function updateActiveCategory() {
        $all('.category-item', dom.categoryList).forEach(btn => {
            const cat = btn.dataset.category;
            btn.classList.toggle('active', cat === state.category);
        });
    }

    function updateActiveFiltersBar() {
        const chips = [];

        if (state.searchKeyword) {
            chips.push(`
                <span class="filter-chip">
                    搜索: ${escapeHTML(state.searchKeyword)}
                    <button data-action="clear-search" title="移除">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                    </button>
                </span>
            `);
        }

        if (state.category !== 'all') {
            const catName = CONFIG.CATEGORY_NAMES[state.category] || state.category;
            chips.push(`
                <span class="filter-chip">
                    分类: ${escapeHTML(catName)}
                    <button data-action="clear-category" title="移除">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                    </button>
                </span>
            `);
        }

        state.activeTags.forEach(tag => {
            chips.push(`
                <span class="filter-chip">
                    #${escapeHTML(tag)}
                    <button data-action="remove-tag" data-tag="${escapeHTML(tag)}" title="移除">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                    </button>
                </span>
            `);
        });

        if (chips.length === 0) {
            dom.activeFilters.style.display = 'none';
        } else {
            dom.activeFilters.style.display = 'flex';
            dom.activeFilterChips.innerHTML = chips.join('');
        }
    }

    function updateDataInfo() {
        dom.totalCount.textContent = state.allNews.length;
        dom.updateTime.textContent = state.lastUpdate ? formatDateTime(state.lastUpdate) : '-';
    }

    function showLoading(show) {
        dom.loadingState.style.display = show ? 'flex' : 'none';
    }

    // ================= 事件绑定 =================
    function bindEvents() {
        // 主题切换
        dom.themeToggle.addEventListener('click', toggleTheme);

        // 搜索
        dom.searchInput.addEventListener('input', debounce(handleSearchInput, 250));
        dom.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
            }
        });
        dom.clearSearch.addEventListener('click', clearSearch);

        // 分类点击
        dom.categoryList.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-item');
            if (!btn) return;
            state.category = btn.dataset.category;
            storageSet(CONFIG.STORAGE_KEYS.CATEGORY, state.category);
            updateActiveCategory();
            updateAll();
        });

        // 标签云点击
        dom.tagCloud.addEventListener('click', (e) => {
            const chip = e.target.closest('.tag-chip');
            if (!chip) return;
            const tag = chip.dataset.tag;
            if (!tag) return;
            toggleTag(tag);
        });

        // 排序
        dom.sortSelect.addEventListener('change', (e) => {
            state.sort = e.target.value;
            storageSet(CONFIG.STORAGE_KEYS.SORT, state.sort);
            updateAll();
        });

        // 清除全部筛选
        dom.clearAllFilters.addEventListener('click', clearAllFilters);
        dom.resetFilters.addEventListener('click', clearAllFilters);

        // 筛选芯片事件
        dom.activeFilters.addEventListener('click', handleFilterChipClick);

        // 分页
        dom.prevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
        dom.nextPage.addEventListener('click', () => goToPage(state.currentPage + 1));
        dom.pageNumbers.addEventListener('click', (e) => {
            const btn = e.target.closest('.page-number');
            if (!btn) return;
            goToPage(parseInt(btn.dataset.page, 10));
        });

        // 返回顶部
        window.addEventListener('scroll', debounce(updateBackToTop, 100));
        dom.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // 移动端菜单
        dom.menuToggle.addEventListener('click', toggleSidebar);

        // 点击遮罩关闭侧栏
        document.addEventListener('click', (e) => {
            if (dom.sidebar.classList.contains('open')
                && !dom.sidebar.contains(e.target)
                && !e.target.closest('#menuToggle')) {
                closeSidebar();
            }
        });
    }

    function bindNewsCardEvents() {
        // 资讯卡片内标签点击
        $all('.news-tag', dom.newsGrid).forEach(tagEl => {
            tagEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tag = tagEl.dataset.tag;
                if (tag) {
                    if (!state.activeTags.includes(tag)) {
                        state.activeTags.push(tag);
                        storageSet(CONFIG.STORAGE_KEYS.TAGS, state.activeTags);
                    }
                    renderTags();
                    updateAll();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    }

    function handleSearchInput(e) {
        state.searchKeyword = e.target.value.trim();
        storageSet(CONFIG.STORAGE_KEYS.SEARCH, state.searchKeyword);
        updateAll();
    }

    function clearSearch() {
        state.searchKeyword = '';
        dom.searchInput.value = '';
        storageSet(CONFIG.STORAGE_KEYS.SEARCH, '');
        updateAll();
    }

    function toggleTag(tag) {
        const idx = state.activeTags.indexOf(tag);
        if (idx >= 0) {
            state.activeTags.splice(idx, 1);
        } else {
            state.activeTags.push(tag);
        }
        storageSet(CONFIG.STORAGE_KEYS.TAGS, state.activeTags);
        renderTags();
        updateAll();
    }

    function clearAllFilters() {
        state.searchKeyword = '';
        state.category = 'all';
        state.activeTags = [];
        dom.searchInput.value = '';

        storageSet(CONFIG.STORAGE_KEYS.SEARCH, '');
        storageSet(CONFIG.STORAGE_KEYS.CATEGORY, 'all');
        storageSet(CONFIG.STORAGE_KEYS.TAGS, []);

        updateActiveCategory();
        renderTags();
        updateAll();
    }

    function handleFilterChipClick(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        switch (action) {
            case 'clear-search':
                clearSearch();
                break;
            case 'clear-category':
                state.category = 'all';
                storageSet(CONFIG.STORAGE_KEYS.CATEGORY, 'all');
                updateActiveCategory();
                updateAll();
                break;
            case 'remove-tag': {
                const tag = btn.dataset.tag;
                if (tag) toggleTag(tag);
                break;
            }
        }
    }

    function goToPage(page) {
        const totalPages = Math.max(1, Math.ceil(state.filteredNews.length / CONFIG.PAGE_SIZE));
        if (page < 1 || page > totalPages) return;
        state.currentPage = page;
        storageSet(CONFIG.STORAGE_KEYS.PAGE, page);
        renderNews();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateBackToTop() {
        dom.backToTop.style.display = window.scrollY > 400 ? 'flex' : 'none';
    }

    function toggleSidebar() {
        if (dom.sidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    function openSidebar() {
        dom.sidebar.classList.add('open');
        ensureOverlay().classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        dom.sidebar.classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function ensureOverlay() {
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', closeSidebar);
        }
        return overlay;
    }

    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ================= 恢复用户状态 =================
    function restoreUserState() {
        const search = storageGet(CONFIG.STORAGE_KEYS.SEARCH);
        const cat = storageGet(CONFIG.STORAGE_KEYS.CATEGORY);
        const tags = storageGet(CONFIG.STORAGE_KEYS.TAGS);
        const sort = storageGet(CONFIG.STORAGE_KEYS.SORT);
        const page = storageGet(CONFIG.STORAGE_KEYS.PAGE);

        if (typeof search === 'string' && search) {
            state.searchKeyword = search;
            dom.searchInput.value = search;
        }
        if (typeof cat === 'string' && cat) {
            state.category = cat;
        }
        if (Array.isArray(tags)) {
            state.activeTags = tags.filter(t => typeof t === 'string');
        }
        if (typeof sort === 'string' && sort) {
            state.sort = sort;
            dom.sortSelect.value = sort;
        }
        if (typeof page === 'number' && page > 0) {
            state.currentPage = page;
        }

        updateActiveCategory();
    }

    // ================= 更新全流程 =================
    function updateAll() {
        applyFilters();
        renderTags();
        renderCategoryCounts();
        renderNews();
        updateActiveFiltersBar();
    }

    // ================= 初始化 =================
    async function init() {
        cacheDOM();
        initTheme();
        restoreUserState();
        bindEvents();
        await loadData();
        updateAll();
    }

    // DOM 就绪后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
