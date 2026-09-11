import { getContext } from '../../../script.js';
import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import { ALLOWED_EXTENSIONS, checkImageExists, detectImageExtension } from '../stj_editor/stj-common.js';

function initImageDisplay() {
    console.log("Image Display: 初期化を開始します。");
    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'imageDisplayState';

    // --- デフォルト値とグローバル変数の定義 ---
    const DEFAULT_WIDTH = 300, DEFAULT_HEIGHT = 200, DEFAULT_LEFT = 100, DEFAULT_TOP = 100, DEFAULT_BG_COLOR = '#000000';
    const defaultImageMap = { "default": "addchara/default" };
    let currentCharacter = null, currentImageMap = defaultImageMap, currentImageUrl = currentImageMap.default;
    let currentMode = 'normal', preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let isDragging = false, isResizing = false, offsetX, offsetY, isCustomWindowOpen = false;
    const imageMapCache = new Map();
    let isDefaultImageFailed = false;
    let currentTextMode = 'user'; // 'user' または 'ai'
    let streamingTimer = null;
    let lastStreamingText = '';
    const STREAMING_DELAY = 1000;

    // 画像描画/更新用コア処理
    async function updateDisplayedImage(imagePath) {
        const imgElement = document.getElementById('stj-display-image');
        if (!imgElement) return;

        let finalPath = imagePath;
        // パス拡張子の判定と自動判定（共通ユーティリティ経由）
        if (!imagePath.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i)) {
            const charName = currentCharacter || '';
            const detected = await detectImageExtension(charName, imagePath);
            if (detected) {
                finalPath = `addchara/${charName}/${imagePath}.${detected}`;
            }
        }

        const exists = await checkImageExists(finalPath);
        if (exists) {
            imgElement.src = finalPath;
            currentImageUrl = finalPath;
        } else {
            imgElement.src = 'addchara/default.png';
        }
    }

    // チャットログの最新メッセージ評価関数
    function processLatestMessage() {
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) return;

        const lastMes = chatContainer.querySelector('.mes:last-child');
        if (!lastMes) return;

        const text = lastMes.textContent || '';
        // 設定されたキーワードに基づいて画像を更新
        for (const [keyword, path] of Object.entries(currentImageMap)) {
            if (keyword !== 'default' && keyword !== 'thumbnail' && text.includes(keyword)) {
                const targetPath = Array.isArray(path) ? path[0] : path;
                updateDisplayedImage(targetPath);
                return;
            }
        }
        // マッチしない場合はデフォルト画像
        if (currentImageMap.default) {
            const defPath = Array.isArray(currentImageMap.default) ? currentImageMap.default[0] : currentImageMap.default;
            updateDisplayedImage(defPath);
        }
    }

    // イベントリスナー設定
    try {
        const context = getContext();
        const eventSource = context.eventSource;
        const eventTypes = context.eventTypes;

        if (eventSource && eventTypes) {
            eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, processLatestMessage);
            eventSource.on(eventTypes.USER_MESSAGE_RENDERED, processLatestMessage);
            eventSource.on(eventTypes.CHAT_CHANGED, processLatestMessage);
        }
    } catch (e) {
        console.error("Image Display: イベント登録に失敗しました", e);
    }

    processLatestMessage();
}

// モジュール読み込み時に自動初期化
initImageDisplay();
