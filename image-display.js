(function () {
    'use strict';

    // --- 定数定義 ---
    const MODULE_NAME = 'image_display_extension';
    const OLD_STORAGE_KEY = 'imageDisplay_customState';
    const DEFAULT_WIDTH = 300;
    const DEFAULT_HEIGHT = 400;
    const DEFAULT_LEFT = 20;
    const DEFAULT_TOP = 20;
    const DEFAULT_BG_COLOR = '#ffffff00';
    const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

    const defaultImageMap = {
        "デフォルト": "default.png"
    };

    // --- 状態変数 ---
    let currentImageMap = defaultImageMap;
    let currentCharacter = null;
    let imageMapCache = new Map();
    let imageExistenceCache = new Map();
    let currentMode = 'normal';
    let currentTextMode = 'ai'; // 'ai' または 'user'
    let isDragging = false;
    let isResizing = false;
    let isCustomWindowOpen = false;
    let offsetX, offsetY;
    let preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let activeObjectUrl = null;

    // ストリーミング処理用変数
    let lastProcessedText = "";
    let streamThrottleTimer = null;

    // --- UI要素の生成 ---
    const imageContainer = document.createElement('div');
    imageContainer.id = 'image-display-container';

    const header = document.createElement('div');
    header.id = 'image-display-header';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = 'image-display-color-picker';

    const textModeButton = document.createElement('button');
    textModeButton.id = 'image-display-textmode-btn';
    textModeButton.textContent = 'AI';
    textModeButton.title = 'クリックでテキストモード切り替え（現在: AI）';

    const customButton = document.createElement('button');
    customButton.id = 'image-display-custom-btn';
    customButton.textContent = '⚙';
    customButton.title = 'サイズ・位置の詳細設定';

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.id = 'image-display-half-max-btn';
    halfMaximizeButton.textContent = '◧';
    halfMaximizeButton.title = '画面左半分表示 (50vw x 100vh)';
    halfMaximizeButton.classList.add('enabled');

    const maximizeButton = document.createElement('button');
    maximizeButton.id = 'image-display-max-btn';
    maximizeButton.textContent = '□';
    maximizeButton.title = '全画面表示 (100% x 100%)';
    maximizeButton.classList.add('enabled');

    header.appendChild(colorPicker);
    header.appendChild(textModeButton);
    header.appendChild(customButton);
    header.appendChild(halfMaximizeButton);
    header.appendChild(maximizeButton);

    const imageElement = document.createElement('img');
    imageElement.id = 'image-display-element';

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'image-display-resize-handle';

    // カスタムサイズ調整ウィンドウ
    const customWindow = document.createElement('div');
    customWindow.id = 'image-display-custom-window';
    customWindow.innerHTML = `
        <div class="custom-window-header">
            <span>サイズ・位置指定</span>
            <button id="close-custom-window">×</button>
        </div>
        <div class="custom-window-body">
            <label>幅 (px): <input type="number" id="custom-width"></label>
            <label>高さ (px): <input type="number" id="custom-height"></label>
            <label>Left (px): <input type="number" id="custom-left"></label>
            <label>Top (px): <input type="number" id="custom-top"></label>
        </div>
    `;

    imageContainer.appendChild(header);
    imageContainer.appendChild(imageElement);
    imageContainer.appendChild(resizeHandle);
    document.body.appendChild(imageContainer);
    document.body.appendChild(customWindow);

    // --- CSSスタイルの注入 ---
    const style = document.createElement('style');
    style.textContent = `
        #image-display-container {
            position: absolute;
            z-index: 9999;
            box-sizing: border-box;
            border: 2px solid #ccc;
            background-color: ${DEFAULT_BG_COLOR};
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        #image-display-container.dragging, #image-display-container.resizing {
            border-color: #007bff;
            box-shadow: 0 6px 15px rgba(0,123,255,0.4);
        }
        #image-display-header {
            height: 28px;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            cursor: grab;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding: 0 6px;
            gap: 6px;
            user-select: none;
            z-index: 10;
        }
        #image-display-header button {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 11px;
            font-weight: bold;
            height: 20px;
            min-width: 20px;
            padding: 0 4px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        #image-display-header button:hover {
            background: rgba(255, 255, 255, 0.4);
        }
        #image-display-header button.disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        #image-display-color-picker {
            -webkit-appearance: none;
            border: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            cursor: pointer;
            background: transparent;
            margin-right: auto;
        }
        #image-display-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
        #image-display-color-picker::-webkit-color-swatch { border: 1px solid #fff; border-radius: 50%; }
        #image-display-element {
            width: 100%;
            height: calc(100% - 28px);
            object-fit: contain;
            pointer-events: none;
            display: block;
        }
        #image-display-resize-handle {
            width: 14px;
            height: 14px;
            position: absolute;
            right: 0;
            bottom: 0;
            cursor: se-resize;
            background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.6) 50%);
            z-index: 11;
        }
        #image-display-custom-window {
            position: fixed;
            top: 50px;
            right: 50px;
            width: 200px;
            background: rgba(20, 20, 20, 0.9);
            color: white;
            border: 1px solid #555;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 10000;
            display: none;
            font-size: 12px;
            backdrop-filter: blur(5px);
        }
        .custom-window-header {
            padding: 6px 10px;
            background: rgba(255,255,255,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
        }
        .custom-window-header button {
            background: none;
            border: none;
            color: #ccc;
            cursor: pointer;
            font-size: 14px;
        }
        .custom-window-header button:hover { color: white; }
        .custom-window-body {
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .custom-window-body label {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .custom-window-body input {
            width: 70px;
            background: #333;
            border: 1px solid #555;
            color: white;
            border-radius: 3px;
            padding: 2px 4px;
            text-align: right;
        }
        #image-display-container.half-maximized {
            border-radius: 0;
            border: none;
        }
    `;
    document.head.appendChild(style);

    // --- テキストモード切り替え ---
    textModeButton.addEventListener('click', () => {
        currentTextMode = currentTextMode === 'ai' ? 'user' : 'ai';
        textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
        textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
        saveDisplayState();
        safeUpdateImage();
    });

    // --- 条件式パーサー＆評価エンジン ---
    function tokenize(pattern) {
        const tokens = [];
        let i = 0;
        while (i < pattern.length) {
            const char = pattern[i];
            if (/\s/.test(char)) { i++; continue; }
            if (char === '(' || char === ')') {
                tokens.push({ type: char, val: char });
                i++; continue;
            }
            if (char === '"' || char === "'") {
                const quote = char;
                let str = '';
                i++;
                while (i < pattern.length && pattern[i] !== quote) {
                    if (pattern[i] === '\\' && i + 1 < pattern.length) i++;
                    str += pattern[i];
                    i++;
                }
                i++;
                tokens.push({ type: 'TERM', val: str });
                continue;
            }
            if (char === '+' || char === '|' || char === ',') {
                tokens.push({ type: 'OP', val: char === '+' ? 'AND' : 'OR' });
                i++; continue;
            }
            if (pattern.substr(i, 3).toUpperCase() === 'AND' && (i + 3 >= pattern.length || /\s|\(/.test(pattern[i + 3]))) {
                tokens.push({ type: 'OP', val: 'AND' }); i += 3; continue;
            }
            if (pattern.substr(i, 2).toUpperCase() === 'OR' && (i + 2 >= pattern.length || /\s|\(/.test(pattern[i + 2]))) {
                tokens.push({ type: 'OP', val: 'OR' }); i += 2; continue;
            }
            if (pattern.substr(i, 3).toUpperCase() === 'NOT' && (i + 3 >= pattern.length || /\s|\(/.test(pattern[i + 3]))) {
                tokens.push({ type: 'OP', val: 'NOT' }); i += 3; continue;
            }
            if (char === '!') {
                tokens.push({ type: 'OP', val: 'NOT' }); i++; continue;
            }
            let term = '';
            while (i < pattern.length && !/[\s()+|,"']/.test(pattern[i])) {
                term += pattern[i];
                i++;
            }
            if (term.toUpperCase() === 'AND') tokens.push({ type: 'OP', val: 'AND' });
            else if (term.toUpperCase() === 'OR') tokens.push({ type: 'OP', val: 'OR' });
            else if (term.toUpperCase() === 'NOT') tokens.push({ type: 'OP', val: 'NOT' });
            else if (term) tokens.push({ type: 'TERM', val: term });
        }
        return tokens;
    }

    function parseTokensToAST(tokens) {
        let pos = 0;
        function parseExpression() { return parseOr(); }
        function parseOr() {
            let left = parseAnd();
            while (pos < tokens.length && tokens[pos].type === 'OP' && tokens[pos].val === 'OR') {
                pos++;
                let right = parseAnd();
                left = { type: 'OR', left, right };
            }
            return left;
        }
        function parseAnd() {
            let left = parseNot();
            while (pos < tokens.length) {
                if (tokens[pos].type === 'OP' && tokens[pos].val === 'AND') {
                    pos++;
                    let right = parseNot();
                    left = { type: 'AND', left, right };
                } else if (tokens[pos].type === 'TERM' || tokens[pos].type === '(' || (tokens[pos].type === 'OP' && tokens[pos].val === 'NOT')) {
                    let right = parseNot();
                    left = { type: 'AND', left, right };
                } else break;
            }
            return left;
        }
        function parseNot() {
            if (pos < tokens.length && tokens[pos].type === 'OP' && tokens[pos].val === 'NOT') {
                pos++;
                let operand = parseNot();
                return { type: 'NOT', operand };
            }
            return parsePrimary();
        }
        function parsePrimary() {
            if (pos >= tokens.length) return { type: 'EMPTY' };
            const token = tokens[pos];
            if (token.type === '(') {
                pos++;
                let expr = parseExpression();
                if (pos < tokens.length && tokens[pos].type === ')') pos++;
                return expr;
            }
            if (token.type === 'TERM') {
                pos++;
                return { type: 'TERM', val: token.val };
            }
            pos++;
            return { type: 'EMPTY' };
        }
        return parseExpression();
    }

    function evaluateAST(ast, targetText, matchedTerms) {
        if (!ast || ast.type === 'EMPTY') return false;
        if (ast.type === 'TERM') {
            const termLower = ast.val.toLowerCase();
            const textLower = targetText.toLowerCase();
            const isMatched = textLower.includes(termLower);
            if (isMatched && matchedTerms) matchedTerms.add(ast.val);
            return isMatched;
        }
        if (ast.type === 'NOT') return !evaluateAST(ast.operand, targetText, matchedTerms);
        if (ast.type === 'AND') {
            const leftRes = evaluateAST(ast.left, targetText, matchedTerms);
            if (!leftRes) return false;
            const rightRes = evaluateAST(ast.right, targetText, matchedTerms);
            return leftRes && rightRes;
        }
        if (ast.type === 'OR') {
            const leftRes = evaluateAST(ast.left, targetText, matchedTerms);
            const rightRes = evaluateAST(ast.right, targetText, matchedTerms);
            return leftRes || rightRes;
        }
        return false;
    }

    // --- 画像探索・評価処理 ---
    function findMatchingImageUrl(text) {
        if (!text || !currentImageMap) return null;

        let bestMatchUrl = null;
        let maxMatchedLength = -1;
        let defaultUrl = null;

        for (const [pattern, fileName] of Object.entries(currentImageMap)) {
            if (pattern === 'デフォルト' || pattern === 'default') {
                defaultUrl = fileName;
                continue;
            }

            const tokens = tokenize(pattern);
            if (tokens.length === 0) continue;

            const ast = parseTokensToAST(tokens);
            const matchedTerms = new Set();
            const isMatch = evaluateAST(ast, text, matchedTerms);

            if (isMatch) {
                let totalLength = 0;
                matchedTerms.forEach(term => totalLength += term.length);
                if (totalLength > maxMatchedLength) {
                    maxMatchedLength = totalLength;
                    bestMatchUrl = fileName;
                }
            }
        }

        return bestMatchUrl || defaultUrl;
    }

    async function checkImageExists(url) {
        if (imageExistenceCache.has(url)) {
            return imageExistenceCache.get(url);
        }
        try {
            const resp = await fetch(url, { method: 'HEAD' });
            const exists = resp.ok;
            imageExistenceCache.set(url, exists);
            return exists;
        } catch (e) {
            imageExistenceCache.set(url, false);
            return false;
        }
    }

    async function detectImageMapExtensions(map) {
        const resolvedMap = {};
        for (const [key, val] of Object.entries(map)) {
            if (typeof val !== 'string') continue;

            const hasExt = SUPPORTED_EXTENSIONS.some(ext => val.toLowerCase().endsWith('.' + ext));
            if (hasExt) {
                resolvedMap[key] = val;
                continue;
            }

            let foundUrl = val;
            if (currentCharacter) {
                for (const ext of SUPPORTED_EXTENSIONS) {
                    const testUrl = `addchara/${currentCharacter}/${val}.${ext}`;
                    if (await checkImageExists(testUrl)) {
                        foundUrl = testUrl;
                        break;
                    }
                }
            }
            resolvedMap[key] = foundUrl;
        }
        return resolvedMap;
    }

    function updateImageWithUrl(url) {
        if (!url) return;

        let finalUrl = url;
        if (currentCharacter && !url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('addchara/')) {
            finalUrl = `addchara/${currentCharacter}/${url}`;
        }

        if (imageElement.src !== finalUrl && imageElement.getAttribute('data-raw-src') !== finalUrl) {
            imageElement.setAttribute('data-raw-src', finalUrl);

            fetch(finalUrl)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    return res.blob();
                })
                .then(blob => {
                    const newObjectUrl = URL.createObjectURL(blob);
                    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
                    activeObjectUrl = newObjectUrl;
                    imageElement.src = newObjectUrl;
                })
                .catch(err => {
                    console.warn(`[Image Display] 画像のBlob取得に失敗したため直参照にフォールバックします: ${finalUrl}`, err);
                    imageElement.src = finalUrl;
                });
        }
    }

    function safeUpdateImage() {
        const targetText = getLatestTargetText();
        const matchedUrl = findMatchingImageUrl(targetText);
        if (matchedUrl) {
            updateImageWithUrl(matchedUrl);
        }
    }

    function getLatestTargetText() {
        if (currentTextMode === 'user') {
            const userMsgs = document.querySelectorAll('.mes[is_user="true"] .mes_text');
            if (userMsgs.length > 0) {
                return userMsgs[userMsgs.length - 1].textContent || "";
            }
            const inputEl = document.querySelector('#send_textarea');
            if (inputEl && inputEl.value) return inputEl.value;
        } else {
            const aiMsgs = document.querySelectorAll('.mes[is_user="false"] .mes_text');
            if (aiMsgs.length > 0) {
                return aiMsgs[aiMsgs.length - 1].textContent || "";
            }
        }
        return "";
    }

    function handleStreamingUpdate(data) {
        if (currentTextMode !== 'ai') return;

        let fullText = "";
        if (typeof data === 'string') fullText = data;
        else if (data && typeof data.text === 'string') fullText = data.text;
        else fullText = getLatestTargetText();

        if (!fullText || fullText === lastProcessedText) return;
        lastProcessedText = fullText;

        if (streamThrottleTimer) return;
        streamThrottleTimer = setTimeout(() => {
            streamThrottleTimer = null;
            safeUpdateImage();
        }, 100);
    }

    function setupChatDomObserver() {
        const chatContainer = document.querySelector('#chat');
        if (!chatContainer) {
            setTimeout(setupChatDomObserver, 1000);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) {
                safeUpdateImage();
            }
        });

        observer.observe(chatContainer, { childList: true, subtree: true, characterData: true });
    }

    // --- キャラクターデータの読み込み ---
    function findImageMapInData(data) {
        if (data === null || typeof data !== 'object') return null;
        if (data.hasOwnProperty('image_display_extension')) {
            const potentialMap = data.image_display_extension;
            if (typeof potentialMap === 'object' && potentialMap !== null) {
                return potentialMap;
            }
        }
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                const result = findImageMapInData(data[key]);
                if (result !== null) return result;
            }
        }
        return null;
    }

    function getCharacterNameFromDOM() {
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        const userName = (context && (context.name1 || context.user_name)) || 'ユーザー';

        if (context && context.character && context.character.name && context.character.name !== userName) {
            return context.character.name;
        }

        if (context && context.characters && typeof context.characterId !== 'undefined' && context.characters[context.characterId]) {
            const cName = context.characters[context.characterId].name;
            if (cName && cName !== userName) return cName;
        }

        const selectedOption = document.querySelector('#character_select option:checked, select[name="character"] option:checked');
        if (selectedOption && selectedOption.textContent.trim()) {
            const val = selectedOption.textContent.trim();
            if (val !== userName) return val;
        }

        const nameEl = document.querySelector('#character_name_holder, #character_name_id, .character_name, .ch_name');
        if (nameEl && nameEl.textContent.trim()) {
            const val = nameEl.textContent.trim();
            if (val !== userName) return val;
        }

        const navBlock = document.querySelector('.right-nav-char-block[data-name]');
        if (navBlock && navBlock.dataset && navBlock.dataset.name) {
            const val = navBlock.dataset.name;
            if (val !== userName) return val;
        }

        return null;
    }

    async function loadCharacterData(forceRefresh = false) {
        const charName = getCharacterNameFromDOM();

        if (!charName) {
            if (currentImageMap === defaultImageMap) {
                currentImageMap = await detectImageMapExtensions(defaultImageMap);
                safeUpdateImage();
            }
            return;
        }

        if (!forceRefresh && currentCharacter === charName && currentImageMap !== defaultImageMap) {
            return;
        }

        currentCharacter = charName;
        console.log(`👤 キャラクター検出: ${charName}`);

        if (!forceRefresh && imageMapCache.has(charName)) {
            currentImageMap = imageMapCache.get(charName);
            safeUpdateImage();
            return;
        }

        let loadedMap = null;
        try {
            const extPath = `addchara/${charName}/${charName}_ext.json`;
            const resp = await fetch(extPath);
            if (resp.ok) {
                const data = await resp.json();
                loadedMap = findImageMapInData(data);
            }
        } catch (e) {
            console.warn(`[Image Display] ${charName}_ext.json の読み込みをスキップ:`, e);
        }

        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        if (!loadedMap && context && context.character && context.character.data) {
            loadedMap = findImageMapInData(context.character.data);
        }

        if (loadedMap) {
            const detectedMap = await detectImageMapExtensions(loadedMap);
            currentImageMap = detectedMap;
            imageMapCache.set(charName, detectedMap);
            console.log(`✅ キャラクター設定マップをロードしました (${charName}):`, currentImageMap);
        } else {
            console.warn(`⚠ ${charName} の拡張設定が見つかりませんでした。デフォルト画像を使用します。`);
            currentImageMap = await detectImageMapExtensions(defaultImageMap);
        }
        safeUpdateImage();
    }

    // --- カスタムウィンドウの制御 ---
    function toggleCustomWindow() {
        if (isCustomWindowOpen) {
            closeCustomWindow();
        } else {
            openCustomWindow();
        }
    }

    function openCustomWindow() {
        if (currentMode !== 'normal') return;
        document.getElementById('custom-width').value = imageContainer.offsetWidth;
        document.getElementById('custom-height').value = imageContainer.offsetHeight;
        document.getElementById('custom-left').value = parseInt(imageContainer.style.left) || DEFAULT_LEFT;
        document.getElementById('custom-top').value = parseInt(imageContainer.style.top) || DEFAULT_TOP;
        customWindow.style.display = 'block';
        isCustomWindowOpen = true;
    }

    function closeCustomWindow() {
        customWindow.style.display = 'none';
        isCustomWindowOpen = false;
    }

    function updateCustomWindow() {
        if (!isCustomWindowOpen) return;
        document.getElementById('custom-width').value = imageContainer.offsetWidth;
        document.getElementById('custom-height').value = imageContainer.offsetHeight;
        document.getElementById('custom-left').value = parseInt(imageContainer.style.left) || 0;
        document.getElementById('custom-top').value = parseInt(imageContainer.style.top) || 0;
    }

    customButton.addEventListener('click', toggleCustomWindow);
    document.getElementById('close-custom-window').addEventListener('click', closeCustomWindow);

    ['custom-width', 'custom-height', 'custom-left', 'custom-top'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            if (currentMode !== 'normal') return;
            const w = parseInt(document.getElementById('custom-width').value) || DEFAULT_WIDTH;
            const h = parseInt(document.getElementById('custom-height').value) || DEFAULT_HEIGHT;
            const l = parseInt(document.getElementById('custom-left').value) || DEFAULT_LEFT;
            const t = parseInt(document.getElementById('custom-top').value) || DEFAULT_TOP;

            imageContainer.style.width = `${w}px`;
            imageContainer.style.height = `${h}px`;
            imageContainer.style.left = `${l}px`;
            imageContainer.style.top = `${t}px`;
            preNormalState = { width: w, height: h, left: l, top: t };
            saveDisplayState();
        });
    });

    // --- 状態の永続化・復元 ---
    function saveDisplayState() {
        const state = {
            preNormalState,
            bgColor: colorPicker.value,
            currentMode,
            textMode: currentTextMode
        };
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        if (context && context.extensionSettings) {
            context.extensionSettings[MODULE_NAME] = state;
            if (typeof context.saveSettingsDebounced === 'function') {
                context.saveSettingsDebounced();
            }
        }
    }

    function restoreDisplayState() {
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        let state = context && context.extensionSettings ? context.extensionSettings[MODULE_NAME] : null;

        if (!state) {
            const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);
            if (oldSaved) {
                try {
                    state = JSON.parse(oldSaved);
                    if (context && context.extensionSettings) {
                        context.extensionSettings[MODULE_NAME] = state;
                        if (typeof context.saveSettingsDebounced === 'function') {
                            context.saveSettingsDebounced();
                        }
                        localStorage.removeItem(OLD_STORAGE_KEY);
                    }
                } catch (e) {
                    console.error('[Image Display] 旧データの移行に失敗しました:', e);
                }
            }
        }

        if (state) {
            try {
                if (state.preNormalState) preNormalState = state.preNormalState;
                if (state.bgColor) {
                    imageContainer.style.backgroundColor = state.bgColor;
                    colorPicker.value = state.bgColor;
                }
                currentMode = state.currentMode || 'normal';
                if (state.textMode) {
                    currentTextMode = state.textMode;
                    textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
                    textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
                }
                switch (currentMode) {
                    case 'maximized':
                        applyMaximizeMode();
                        break;
                    case 'halfMaximized':
                        applyHalfMaximizeMode();
                        break;
                    default:
                        applyNormalMode();
                        break;
                }
            } catch (e) {
                console.error('状態復元エラー:', e);
                setDefaultDisplayState();
            }
        } else {
            setDefaultDisplayState();
        }
    }

    function setDefaultDisplayState() {
        preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
        imageContainer.style.backgroundColor = DEFAULT_BG_COLOR;
        colorPicker.value = DEFAULT_BG_COLOR;
        applyNormalMode();
    }

    function applyNormalMode() {
        imageContainer.style.width = `${preNormalState.width}px`;
        imageContainer.style.height = `${preNormalState.height}px`;
        imageContainer.style.left = `${preNormalState.left}px`;
        imageContainer.style.top = `${preNormalState.top}px`;
        imageContainer.style.position = 'absolute';
        resizeHandle.style.display = 'block';
        header.style.cursor = 'grab';
        imageContainer.classList.remove('half-maximized');
        maximizeButton.classList.remove('disabled');
        maximizeButton.classList.add('enabled');
        halfMaximizeButton.classList.remove('disabled');
        halfMaximizeButton.classList.add('enabled');
        currentMode = 'normal';
    }

    function applyMaximizeMode() {
        if (currentMode === 'normal') {
            preNormalState = {
                width: imageContainer.offsetWidth,
                height: imageContainer.offsetHeight,
                left: parseInt(imageContainer.style.left) || DEFAULT_LEFT,
                top: parseInt(imageContainer.style.top) || DEFAULT_TOP
            };
        }
        imageContainer.style.width = '100%';
        imageContainer.style.height = '100%';
        imageContainer.style.left = '0';
        imageContainer.style.top = '0';
        imageContainer.style.position = 'fixed';
        resizeHandle.style.display = 'none';
        header.style.cursor = 'default';
        imageContainer.classList.remove('half-maximized');
        maximizeButton.classList.remove('enabled');
        maximizeButton.classList.add('disabled');
        halfMaximizeButton.classList.remove('disabled');
        halfMaximizeButton.classList.add('enabled');
        currentMode = 'maximized';
    }

    function applyHalfMaximizeMode() {
        if (currentMode === 'normal') {
            preNormalState = {
                width: imageContainer.offsetWidth,
                height: imageContainer.offsetHeight,
                left: parseInt(imageContainer.style.left) || DEFAULT_LEFT,
                top: parseInt(imageContainer.style.top) || DEFAULT_TOP
            };
        }
        imageContainer.style.width = '50vw';
        imageContainer.style.height = '100vh';
        imageContainer.style.left = '0';
        imageContainer.style.top = '0';
        imageContainer.style.position = 'fixed';
        resizeHandle.style.display = 'none';
        header.style.cursor = 'default';
        imageContainer.classList.add('half-maximized');
        maximizeButton.classList.remove('enabled');
        maximizeButton.classList.add('enabled');
        halfMaximizeButton.classList.remove('disabled');
        halfMaximizeButton.classList.add('disabled');
        currentMode = 'halfMaximized';
    }

    restoreDisplayState();

    // --- イベントリスナー設定 ---
    colorPicker.addEventListener('input', () => {
        imageContainer.style.backgroundColor = colorPicker.value;
        saveDisplayState();
    });

    maximizeButton.addEventListener('click', () => {
        if (currentMode === 'maximized') return;
        closeCustomWindow();
        applyMaximizeMode();
        saveDisplayState();
    });

    halfMaximizeButton.addEventListener('click', () => {
        if (currentMode === 'halfMaximized') return;
        closeCustomWindow();
        applyHalfMaximizeMode();
        saveDisplayState();
    });

    header.addEventListener('mousedown', (e) => {
        if (e.target === colorPicker || currentMode !== 'normal') return;
        isDragging = true;
        offsetX = e.clientX - imageContainer.getBoundingClientRect().left;
        offsetY = e.clientY - imageContainer.getBoundingClientRect().top;
        imageContainer.classList.add('dragging');
        header.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging && currentMode === 'normal') {
            imageContainer.style.left = `${e.clientX - offsetX}px`;
            imageContainer.style.top = `${e.clientY - offsetY}px`;
            if (isCustomWindowOpen) updateCustomWindow();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            imageContainer.classList.remove('dragging');
            if (currentMode === 'normal') header.style.cursor = 'grab';
            saveDisplayState();
        }
    });

    resizeHandle.addEventListener('mousedown', (e) => {
        if (currentMode !== 'normal') return;
        e.stopPropagation();
        isResizing = true;
        imageContainer.classList.add('resizing');
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = imageContainer.offsetWidth;
        const startHeight = imageContainer.offsetHeight;

        function handleResize(e) {
            if (isResizing) {
                const newWidth = Math.max(100, startWidth + (e.clientX - startX));
                const newHeight = Math.max(100, startHeight + (e.clientY - startY));
                imageContainer.style.width = `${newWidth}px`;
                imageContainer.style.height = `${newHeight}px`;
                if (isCustomWindowOpen) updateCustomWindow();
            }
        }

        function stopResize() {
            if (isResizing) {
                isResizing = false;
                imageContainer.classList.remove('resizing');
                saveDisplayState();
                document.removeEventListener('mousemove', handleResize);
                document.removeEventListener('mouseup', stopResize);
            }
        }

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });

    window.addEventListener('resize', () => {
        if (currentMode === 'maximized') {
            imageContainer.style.width = '100%';
            imageContainer.style.height = '100%';
        } else if (currentMode === 'halfMaximized') {
            imageContainer.style.width = '50vw';
            imageContainer.style.height = '100vh';
        }
    });

    // --- EventSource 安全監視 ---
    function setupEventSourceListeners() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            if (context && context.eventSource && context.eventTypes) {
                const { eventSource, eventTypes } = context;

                const safeOn = (eventType, handler) => {
                    if (eventType && typeof eventSource.on === 'function') {
                        eventSource.on(eventType, handler);
                    }
                };

                safeOn(eventTypes.STREAM_TOKEN_RECEIVED, handleStreamingUpdate);
                safeOn(eventTypes.CHARACTER_MESSAGE_RENDERED, safeUpdateImage);
                safeOn(eventTypes.USER_MESSAGE_RENDERED, safeUpdateImage);

                // メッセージ削除・編集時の画像更新対応
                if (eventTypes.MESSAGE_DELETED) safeOn(eventTypes.MESSAGE_DELETED, safeUpdateImage);
                if (eventTypes.MESSAGE_EDITED) safeOn(eventTypes.MESSAGE_EDITED, safeUpdateImage);
                if (eventTypes.CHAT_LOADED) safeOn(eventTypes.CHAT_LOADED, safeUpdateImage);

                // MESSAGE_SENT / GENERATION_STARTED 時に入力文を取得して即時判定
                const handleImmediateTextMatch = (data) => {
                    if (currentTextMode !== 'user') return;

                    let sentText = "";
                    if (typeof data === 'string') {
                        sentText = data;
                    } else if (data && typeof data.text === 'string') {
                        sentText = data.text;
                    } else if (data && typeof data.message === 'string') {
                        sentText = data.message;
                    } else {
                        const inputEl = document.querySelector('#send_textarea');
                        if (inputEl && inputEl.value) {
                            sentText = inputEl.value;
                        } else {
                            // DOMから直前に追加されたユーザーメッセージ要素を取得
                            const lastUserMsg = document.querySelector('.mes[is_user="true"]:last-child .mes_text');
                            if (lastUserMsg) sentText = lastUserMsg.textContent || "";
                        }
                    }

                    if (sentText) {
                        const matchedUrl = findMatchingImageUrl(sentText);
                        if (matchedUrl) {
                            updateImageWithUrl(matchedUrl);
                            return;
                        }
                    }
                    safeUpdateImage();
                };

                safeOn(eventTypes.MESSAGE_SENT, handleImmediateTextMatch);
                if (eventTypes.GENERATION_STARTED) safeOn(eventTypes.GENERATION_STARTED, handleImmediateTextMatch);

                const onCharacterOrChatChanged = () => {
                    loadCharacterData(true);
                };

                safeOn(eventTypes.CHAT_CHANGED, onCharacterOrChatChanged);
                safeOn(eventTypes.CHARACTER_SELECTED, onCharacterOrChatChanged);

                console.log("✅ SillyTavern EventSource による監視を開始しました。");
            }
        }
    }

    // --- 初期ロードとポーリング ---
    setupEventSourceListeners();
    loadCharacterData(true);
    setupChatDomObserver();

    let pollCount = 0;
    const initialPoll = setInterval(() => {
        loadCharacterData();
        pollCount++;
        if (pollCount > 10) clearInterval(initialPoll);
    }, 1000);
})();
