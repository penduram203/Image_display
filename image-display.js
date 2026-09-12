(function() {
    console.log("Image Display: 初期化を開始します。");

    const MODULE_NAME = 'image_display';
    const mediaCache = new Map();

    function isVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return !!url.trim().match(/\.(mp4|webm)$/i);
    }

    // パスの正規化・エンコード処理
    function sanitizePath(path) {
        if (!path) return '';
        const cleaned = path.trim().replace(/[\r\n\t]/g, '');
        // すでにエンコードされている場合を考慮しつつ正規化
        return encodeURI(decodeURIComponent(cleaned));
    }

    function checkMediaExists(mediaUrl) {
        const cleanUrl = sanitizePath(mediaUrl);
        if (mediaCache.has(cleanUrl)) {
            return Promise.resolve(mediaCache.get(cleanUrl));
        }

        return new Promise((resolve) => {
            if (isVideoUrl(cleanUrl)) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => {
                    mediaCache.set(cleanUrl, true);
                    resolve(true);
                };
                video.onerror = () => {
                    mediaCache.set(cleanUrl, false);
                    resolve(false);
                };
                video.src = cleanUrl;
            } else {
                const img = new Image();
                img.onload = () => {
                    mediaCache.set(cleanUrl, true);
                    resolve(true);
                };
                img.onerror = () => {
                    mediaCache.set(cleanUrl, false);
                    resolve(false);
                };
                img.src = cleanUrl;
            }
        });
    }

    async function detectImageExtension(charName, imageName) {
        if (!charName || !imageName) return null;
        
        const cleanChar = charName.trim();
        const cleanImage = imageName.trim();

        const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'webm'];

        // すでに拡張子が含まれている場合
        if (cleanImage.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            const path = `addchara/${cleanChar}/${cleanImage}`;
            const exists = await checkMediaExists(path);
            if (exists) return ''; 
        }

        for (const ext of ALLOWED_EXTENSIONS) {
            const imagePath = `addchara/${cleanChar}/${cleanImage}.${ext}`;
            const exists = await checkMediaExists(imagePath);
            if (exists) {
                return ext;
            }
        }
        return null;
    }

    async function displayMedia(container, charName, imageName) {
        if (!container || !charName || !imageName) return;

        const cleanChar = charName.trim();
        const cleanImage = imageName.trim();

        const ext = await detectImageExtension(cleanChar, cleanImage);
        if (ext === null) {
            console.warn(`[Image Display] メディアが見つかりません: ${cleanChar} / ${cleanImage}`);
            return;
        }

        const rawPath = ext ? `addchara/${cleanChar}/${cleanImage}.${ext}` : `addchara/${cleanChar}/${cleanImage}`;
        const fullPath = sanitizePath(rawPath);

        container.innerHTML = ''; // クリア

        if (isVideoUrl(fullPath)) {
            const video = document.createElement('video');
            video.src = fullPath;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.style.maxWidth = '100%';
            video.style.height = 'auto';
            container.appendChild(video);
            video.play().catch(e => console.warn('Video play error:', e));
        } else {
            const img = document.createElement('img');
            img.src = fullPath;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            container.appendChild(img);
        }
    }

    window.STJ_ImageDisplay = {
        displayMedia,
        detectImageExtension,
        sanitizePath
    };
})();
```[cite: 1]

---

### 2. 対策A反映済み完全版コード[cite: 1]

```javascript
// image-display.js - 対策A反映済み完全版コード

(function () {
    'use strict';

    console.log("Image Display: 初期化を開始します。");

    // ==========================================
    // 1. 定数・キャッシュ構造の定義
    // ==========================================
    const EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.mp4', '.webm'];
    
    // 検索済みパスのメモリキャッシュ（404の再試行防止・対策Bの要素も含む）
    const pathCache = new Map();

    // ==========================================
    // 2. 拡張子判定・ファイル存在確認関数
    // ==========================================

    /**
     * パスに既に拡張子が含まれているか判定する
     */
    function hasExtension(path) {
        if (!path) return false;
        const lastDot = path.lastIndexOf('.');
        const lastSlash = path.lastIndexOf('/');
        return lastDot > lastSlash && lastDot !== -1;
    }

    /**
     * ファイルの存在を確認する（単一URL用）
     */
    async function checkFileExists(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * 拡張子を自動検出または直接解決する関数 (対策A反映箇所)
     */
    async function resolveMediaPath(basePath) {
        if (!basePath) return null;

        // キャッシュに存在する場合は即座に返す
        if (pathCache.has(basePath)) {
            return pathCache.get(basePath);
        }

        // 対策A: 既に拡張子 (.mp4, .png 等) が指定されている場合は自動検出を通さず直接確定
        if (hasExtension(basePath)) {
            console.log(`✅ 拡張子明示指定（自動検出スキップ）: ${basePath}`);
            pathCache.set(basePath, basePath);
            return basePath;
        }

        // 拡張子が含まれていない場合のみ、順番に404チェックを行う（フォールバック）
        for (const ext of EXTENSIONS) {
            const testUrl = `${basePath}${ext}`;
            const exists = await checkFileExists(testUrl);
            if (exists) {
                console.log(`✅ 拡張子自動検出成功: ${testUrl}`);
                pathCache.set(basePath, testUrl);
                return testUrl;
            }
        }

        console.warn(`⚠️ メディアが見つかりませんでした: ${basePath}`);
        pathCache.set(basePath, null);
        return null;
    }

    // ==========================================
    // 3. メディア（画像/動画）描画処理
    // ==========================================

    /**
     * DOM上の表示要素を更新する関数
     */
    async function updateMediaDisplay(rawPath) {
        if (!rawPath) return;

        // パスの解決（明示指定なら404リクエスト0件で即完了）
        const resolvedPath = await resolveMediaPath(rawPath);
        if (!resolvedPath) return;

        console.log(`🖼 メディアを更新: ${resolvedPath}`);

        const container = document.getElementById('image-display-container') || createDisplayContainer();
        const isVideo = resolvedPath.toLowerCase().endsWith('.mp4') || resolvedPath.toLowerCase().endsWith('.webm');

        // DOMの効率的な張り替え
        if (isVideo) {
            container.innerHTML = `
                <video src="${resolvedPath}" autoplay loop muted playsinline style="max-width: 100%; max-height: 100%; object-fit: contain;">
                </video>
            `;
        } else {
            container.innerHTML = `
                <img src="${resolvedPath}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
            `;
        }
    }

    /**
     * 表示用コンテナの作成（存在しない場合）
     */
    function createDisplayContainer() {
        let container = document.getElementById('image-display-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'image-display-container';
            container.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 1000; pointer-events: none;';
            document.body.appendChild(container);
        }
        return container;
    }

    // ==========================================
    // 4. キャラクター設定マップの読み込みと適用
    // ==========================================

    let characterMap = {};

    function loadCharacterMap(charName, mapData) {
        characterMap = mapData || {};
        console.log(`✅ キャラクター設定マップをロードしました (${charName}):`, characterMap);
    }

    /**
     * キーワードに応じたメディアの更新
     */
    async function triggerMediaByKeyword(keyword) {
        let targetPath = characterMap[keyword] || characterMap['default'];
        if (targetPath) {
            await updateMediaDisplay(targetPath);
        }
    }

    // ==========================================
    // 5. SillyTavern イベント監視
    // ==========================================

    function initEventListeners() {
        if (typeof eventSource === 'undefined') {
            console.warn("SillyTavern eventSource が見つかりません。再試行します...");
            setTimeout(initEventListeners, 1000);
            return;
        }

        console.log("✅ SillyTavern EventSource による監視を開始しました。");

        // メッセージ受信・生成完了時のイベントハンドラ
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            // チャット欄からキーワード検出・マッチング処理を行う
            const lastMessage = document.querySelector('.chat-message:last-child .message-body');
            if (lastMessage) {
                const text = lastMessage.textContent;
                // マッピングキーの検索
                for (const key of Object.keys(characterMap)) {
                    if (key !== 'default' && key !== 'thumbnail' && text.includes(key)) {
                        await triggerMediaByKeyword(key);
                        return;
                    }
                }
                // 見つからなければデフォルト
                await triggerMediaByKeyword('default');
            }
        });

        // キャラクター変更時
        eventSource.on(event_types.CHAT_CHANGED, () => {
            pathCache.clear(); // チャット変更時にキャッシュをクリア
        });
    }

    // 起動処理
    initEventListeners();

})();
```[cite: 1]

---

### 3. 並列化・即時応答版コード[cite: 2]

```javascript
(function () {
    console.log("Image Display: 初期化を開始します。");
    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'imageDisplayState';

    // メディアの存在確認・読み込み用キャッシュマップ (対策②)
    const mediaExistsCache = new Map();

    // --- デフォルト値とグローバル変数の定義 ---
    const DEFAULT_WIDTH = 300, DEFAULT_HEIGHT = 200, DEFAULT_LEFT = 100, DEFAULT_TOP = 100, DEFAULT_BG_COLOR = '#000000';
    const defaultImageMap = { "default": "addchara/default" };
    let currentCharacter = null;
    let currentImageMap = defaultImageMap;
    let currentImageUrl = null;
    let currentMode = 'normal';
    let preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let isDragging = false, isResizing = false, offsetX, offsetY, isCustomWindowOpen = false;
    const imageMapCache = new Map();
    let isDefaultImageFailed = false;

    // --- デバウンス処理 ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    // --- 拡張子自動検出関数（対策②：完全指定スキップ＋Promise.anyによる並列化） ---
    const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'webm'];

    function isVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return !!url.match(/\.(mp4|webm)$/i);
    }

    // メディアの存在確認関数（キャッシュ対応）
    async function checkMediaExists(url) {
        if (!url) return false;
        if (mediaExistsCache.has(url)) {
            return mediaExistsCache.get(url);
        }

        return new Promise((resolve) => {
            const isVideo = isVideoUrl(url);
            if (isVideo) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => {
                    mediaExistsCache.set(url, true);
                    resolve(true);
                };
                video.onerror = () => {
                    mediaExistsCache.set(url, false);
                    resolve(false);
                };
                video.src = url;
            } else {
                const img = new Image();
                img.onload = () => {
                    mediaExistsCache.set(url, true);
                    resolve(true);
                };
                img.onerror = () => {
                    mediaExistsCache.set(url, false);
                    resolve(false);
                };
                img.src = url;
            }
        });
    }

    // 拡張子自動検出（並列処理・即時即答版）
    async function detectImageExtension(imagePath) {
        if (!imagePath || typeof imagePath !== 'string' || !imagePath.trim()) return null;
        const cleanPath = imagePath.trim();

        // 1. 対策A: 既に拡張子が含まれている場合は通信せず即返却（0ms）
        if (cleanPath.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            return cleanPath;
        }

        // 2. キャッシュチェック
        if (mediaExistsCache.has(cleanPath)) {
            return mediaExistsCache.get(cleanPath);
        }

        // 3. 対策②: Promise.any を使用した並列リクエスト（順次ではなく同時試行）
        const promises = ALLOWED_EXTENSIONS.map(ext => {
            const fullPath = `${cleanPath}.${ext}`;
            return checkMediaExists(fullPath).then(exists => {
                if (exists) return fullPath;
                throw new Error('Not found');
            });
        });

        try {
            const result = await Promise.any(promises);
            console.log(`✅ 拡張子自動検出 (並列解決): ${result}`);
            mediaExistsCache.set(cleanPath, result);
            return result;
        } catch {
            console.warn(`⚠ メディアが見つかりません: ${cleanPath}`);
            mediaExistsCache.set(cleanPath, null);
            return null;
        }
    }

    // --- メディア表示用DOM構造とコンテナの構築 ---
    function getOrCreateDisplayContainer() {
        let container = document.getElementById('image_display_extension_container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'image_display_extension_container';
            container.style.position = 'fixed';
            container.style.top = `${DEFAULT_TOP}px`;
            container.style.left = `${DEFAULT_LEFT}px`;
            container.style.width = `${DEFAULT_WIDTH}px`;
            container.style.height = `${DEFAULT_HEIGHT}px`;
            container.style.zIndex = '9999';
            container.style.backgroundColor = DEFAULT_BG_COLOR;
            container.style.display = 'none'; // 初期状態は非表示
            container.style.overflow = 'hidden';
            container.style.borderRadius = '8px';
            container.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';

            const mediaWrapper = document.createElement('div');
            mediaWrapper.id = 'image_display_media_wrapper';
            mediaWrapper.style.width = '100%';
            mediaWrapper.style.height = '100%';
            mediaWrapper.style.display = 'flex';
            mediaWrapper.style.justifyContent = 'center';
            mediaWrapper.style.alignItems = 'center';

            container.appendChild(mediaWrapper);
            document.body.appendChild(container);
        }
        return container;
    }

    // --- メディア表示更新関数（対策③：<video> タグ最適化・即時再生） ---
    async function updateMediaDisplay(rawPath) {
        if (!rawPath) return;

        const resolvedPath = await detectImageExtension(rawPath);
        if (!resolvedPath) {
            if (!isDefaultImageFailed && rawPath !== 'addchara/default') {
                console.warn("指定メディアが読み込めないため、デフォルト画像を表示します。");
                isDefaultImageFailed = true;
                updateMediaDisplay('addchara/default');
            }
            return;
        }

        isDefaultImageFailed = false;
        if (currentImageUrl === resolvedPath) return; // 既に同じメディアが表示中ならスキップ
        currentImageUrl = resolvedPath;

        const container = getOrCreateDisplayContainer();
        const wrapper = document.getElementById('image_display_media_wrapper');
        if (!wrapper) return;

        wrapper.innerHTML = ''; // クリア

        const isVideo = isVideoUrl(resolvedPath);
        console.log(`🖼 メディアを更新: ${resolvedPath}`);

        if (isVideo) {
            const video = document.createElement('video');
            video.src = encodeURI(resolvedPath);
            // 対策③: 再生負荷削減と爆速起動用の属性セット
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('preload', 'auto');
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'contain';

            video.onerror = () => {
                console.error(`動画読み込みエラー: ${resolvedPath}`);
                if (resolvedPath !== 'addchara/default') updateMediaDisplay('addchara/default');
            };

            wrapper.appendChild(video);
            // 非同期で即時再生開始をトリガー
            video.play().catch(e => console.warn("動画自動再生が制限されました:", e));
        } else {
            const img = document.createElement('img');
            img.src = encodeURI(resolvedPath);
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';

            img.onerror = () => {
                console.error(`画像読み込みエラー: ${resolvedPath}`);
                if (resolvedPath !== 'addchara/default') updateMediaDisplay('addchara/default');
            };

            wrapper.appendChild(img);
        }

        container.style.display = 'block';
    }

    // --- メッセージ評価とキーワード照合 ---
    function evaluateTextAndTrigger(text) {
        if (!text || typeof text !== 'string' || !currentImageMap) return;

        const cleanText = text.trim();
        if (!cleanText) return;

        // キャラクター設定マップからキーワード判定
        for (const [keywords, mediaPath] of Object.entries(currentImageMap)) {
            if (keywords === 'default' || keywords === 'thumbnail') continue;

            const list = keywords.split(',').map(k => k.trim());
            const matched = list.some(kw => kw && cleanText.includes(kw));

            if (matched) {
                updateMediaDisplay(mediaPath);
                return;
            }
        }
    }

    // --- キャラクター設定の初期化・更新 ---
    function loadCharacterSettings(charName, mapData) {
        currentCharacter = charName;
        currentImageMap = mapData || defaultImageMap;
        console.log(`✅ キャラクター設定マップをロードしました (${charName}):`, currentImageMap);

        if (currentImageMap.default) {
            updateMediaDisplay(currentImageMap.default);
        }
    }

    // --- イベントリスナー登録 (対策①：送信直後トリガー) ---
    function setupEventListeners() {
        if (typeof eventSource === 'undefined') {
            console.error("SillyTavern の eventSource が読み込まれていません。");
            return;
        }

        // 1. キャラクター切り替え時
        eventSource.on(event_types.CHARACTER_LOADED || 'character_loaded', (data) => {
            const charName = data?.name || '';
            console.log(`👤 キャラクター検出: ${charName}`);
            if (data?.image_display_config) {
                loadCharacterSettings(charName, data.image_display_config);
            }
        });

        // 2. 対策①: ユーザーがメッセージを送信した瞬間に評価（AI生成待ちを前倒し）
        eventSource.on(event_types.USER_MESSAGE_RENDERED || 'user_message_rendered', (messageId) => {
            setTimeout(() => {
                const context = SillyTavern.getContext();
                const message = context.chat?.[messageId];
                if (message && message.mes) {
                    evaluateTextAndTrigger(message.mes);
                }
            }, 0); // スレッド非同期化で描画をブロックしない
        });

        // 3. AIが応答メッセージを描画した瞬間
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED || 'character_message_rendered', (messageId) => {
            setTimeout(() => {
                const context = SillyTavern.getContext();
                const message = context.chat?.[messageId];
                if (message && message.mes) {
                    evaluateTextAndTrigger(message.mes);
                }
            }, 0);
        });

        console.log("✅ SillyTavern EventSource による監視を開始しました。");
    }

    // --- 初期化エントリーポイント ---
    function init() {
        getOrCreateDisplayContainer();
        setupEventListeners();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```[cite: 2]

---

### 4. Optimized & Instant Trigger Edition[cite: 2]

```javascript
// image-display.js - Optimized & Instant Trigger Edition
console.log("Image Display: 初期化を開始します。");

(function () {
    'use strict';

    // ==========================================
    // 設定 & 定数定義
    // ==========================================
    const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.avif', '.bmp'];
    const MEDIA_CACHE = new Map(); // 存在するURLのキャッシュ
    const CHARA_MAP_CACHE = new Map(); // キャラクターごとのマップキャッシュ

    let currentCharaName = "";
    let currentCharaMap = {};
    let activeMediaElement = null;

    // DOM要素の生成または取得
    function getOrCreateDisplayContainer() {
        let container = document.getElementById("custom_image_display_container");
        if (!container) {
            container = document.createElement("div");
            container.id = "custom_image_display_container";
            container.style.position = "fixed";
            container.style.bottom = "20px";
            container.style.right = "20px";
            container.style.zIndex = "1000";
            container.style.pointerEvents = "none";
            document.body.appendChild(container);
        }
        return container;
    }

    // ==========================================
    // 並列拡張子検出 (並列非同期処理)
    // ==========================================
    async function checkUrlExists(url) {
        if (MEDIA_CACHE.has(url)) {
            return MEDIA_CACHE.get(url) ? url : null;
        }
        try {
            const response = await fetch(url, { method: 'HEAD' });
            const exists = response.ok;
            MEDIA_CACHE.set(url, exists);
            return exists ? url : null;
        } catch (e) {
            MEDIA_CACHE.set(url, false);
            return null;
        }
    }

    async function detectValidMediaUrl(basePathWithoutExt) {
        // 既に拡張子が含まれている場合
        if (SUPPORTED_EXTENSIONS.some(ext => basePathWithoutExt.toLowerCase().endsWith(ext))) {
            return basePathWithoutExt;
        }

        // 全拡張子を並列チェック
        const promises = SUPPORTED_EXTENSIONS.map(ext => {
            const testUrl = basePathWithoutExt + ext;
            return checkUrlExists(testUrl).then(validUrl => {
                if (validUrl) return validUrl;
                throw new Error("404");
            });
        });

        try {
            // 最初に見つかった(200 OKの)拡張子を返却
            const foundUrl = await Promise.any(promises);
            console.log(`✅ 拡張子自動検出(並列): ${foundUrl}`);
            return foundUrl;
        } catch (err) {
            // 全て404だった場合
            return null;
        }
    }

    // ==========================================
    // キャラクター設定マップの読み込み
    // ==========================================
    async function loadCharacterMap(charaName) {
        if (!charaName) return {};
        if (CHARA_MAP_CACHE.has(charaName)) {
            return CHARA_MAP_CACHE.get(charaName);
        }

        const mapPath = `addchara/${charaName}/_ext.json`;
        try {
            const response = await fetch(mapPath);
            if (response.ok) {
                const mapData = await response.json();
                CHARA_MAP_CACHE.set(charaName, mapData);
                console.log(`✅ キャラクター設定マップをロードしました (${charaName}):`, mapData);
                return mapData;
            }
        } catch (e) {
            // jsonが存在しない場合はデフォルト構造を作成
        }

        const defaultMap = { default: `addchara/${charaName}/defa.mp4` };
        CHARA_MAP_CACHE.set(charaName, defaultMap);
        return defaultMap;
    }

    // ==========================================
    // メディアの表示・更新 (ダブルバッファリング最適化)
    // ==========================================
    async function updateMediaDisplay(mediaPath) {
        if (!mediaPath) return;

        const container = getOrCreateDisplayContainer();
        const fullUrl = mediaPath.startsWith('http') ? mediaPath : `/${mediaPath}`;
        const isVideo = fullUrl.endsWith('.mp4') || fullUrl.endsWith('.webm');

        console.log(`🖼 メディアを更新: ${mediaPath}`);

        if (isVideo) {
            const video = document.createElement("video");
            video.src = fullUrl;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.setAttribute("preload", "auto");
            video.style.maxWidth = "300px";
            video.style.maxHeight = "400px";
            video.style.objectFit = "contain";

            video.oncanplaythrough = () => {
                container.innerHTML = "";
                container.appendChild(video);
                activeMediaElement = video;
            };
        } else {
            const img = new Image();
            img.src = fullUrl;
            img.style.maxWidth = "300px";
            img.style.maxHeight = "400px";
            img.style.objectFit = "contain";

            img.onload = () => {
                container.innerHTML = "";
                container.appendChild(img);
                activeMediaElement = img;
            };
        }
    }

    // ==========================================
    // 入力テキスト解析 & 最速メディア選択
    // ==========================================
    async function evaluateAndSwitchMedia(inputText) {
        if (!currentCharaName) {
            currentCharaName = getCurrentCharacterName();
            if (currentCharaName) {
                currentCharaMap = await loadCharacterMap(currentCharaName);
            }
        }

        let targetPath = null;
        const text = (inputText || "").trim().toLowerCase();

        // キーワードマッチング判定
        if (text && currentCharaMap) {
            for (const [keywords, path] of Object.entries(currentCharaMap)) {
                if (keywords === 'default' || keywords === 'thumbnail') continue;
                
                const kwList = keywords.split(',').map(k => k.trim().toLowerCase());
                if (kwList.some(kw => kw && text.includes(kw))) {
                    targetPath = path;
                    break;
                }
            }
        }

        // マッチしない場合はデフォルト
        if (!targetPath && currentCharaMap) {
            targetPath = currentCharaMap.default || `addchara/${currentCharaName}/defa.mp4`;
        }

        if (targetPath) {
            // 拡張子が含まれていない場合は高速並列補正
            const resolvedPath = await detectValidMediaUrl(targetPath) || targetPath;
            updateMediaDisplay(resolvedPath);
        }
    }

    function getCurrentCharacterName() {
        if (window.SillyTavern && window.SillyTavern.getContext) {
            const ctx = window.SillyTavern.getContext();
            if (ctx.characterId && ctx.characters && ctx.characters[ctx.characterId]) {
                return ctx.characters[ctx.characterId].name;
            }
        }
        const charaEl = document.querySelector(".character_select .selected, #chat_character_name");
        return charaEl ? charaEl.textContent.trim() : "";
    }

    // ==========================================
    // イベント監視・送信直後フック (最重要)
    // ==========================================
    function setupEventHooks() {
        if (!window.eventSource) {
            setTimeout(setupEventHooks, 500);
            return;
        }

        console.log("✅ SillyTavern EventSource による最速監視を開始しました。");

        // 1. ユーザーメッセージ送信直後 (テキストレンダリング時)
        window.eventSource.on("user_message_rendered", () => {
            // DOM更新を阻害しないよう非同期スレッドへ即座に投げる
            setTimeout(() => {
                const textarea = document.getElementById("send_textarea");
                const lastUserInput = textarea ? textarea.value : "";
                
                // チャット履歴から最後のユーザー発言を取得 (フォールバック)
                const lastUserMsgEl = document.querySelector(".chat_msg_user:last-child .msg_text");
                const textToEvaluate = lastUserInput || (lastUserMsgEl ? lastUserMsgEl.textContent : "");

                evaluateAndSwitchMedia(textToEvaluate);
            }, 0);
        });

        // 2. 送信ボタン押下時/生成開始コマンド時 (補完用フック)
        window.eventSource.on("generation_started", () => {
            const textarea = document.getElementById("send_textarea");
            if (textarea && textarea.value) {
                evaluateAndSwitchMedia(textarea.value);
            }
        });

        // 3. キャラクター変更時
        window.eventSource.on("chat_id_changed", async () => {
            currentCharaName = getCurrentCharacterName();
            if (currentCharaName) {
                console.log(`👤 キャラクター検出: ${currentCharaName}`);
                currentCharaMap = await loadCharacterMap(currentCharaName);
                evaluateAndSwitchMedia(""); // デフォルト表示
            }
        });
    }

    // 初期化実行
    setupEventHooks();
})();
```[cite: 2]
