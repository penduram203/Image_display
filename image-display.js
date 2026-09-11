import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const MODULE_NAME = 'image_display';
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'webm'];

// 動画・画像のプリロード用キャッシュマップ（高速化用）
const mediaCache = new Map();

// 動画ファイルかどうか判定
function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return !!url.match(/\.(mp4|webm)$/i);
}

// メディアの高速存在確認 & キャッシュ化
function checkMediaExists(mediaUrl) {
    if (mediaCache.has(mediaUrl)) {
        return Promise.resolve(mediaCache.get(mediaUrl));
    }

    return new Promise((resolve) => {
        if (isVideoUrl(mediaUrl)) {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                mediaCache.set(mediaUrl, true);
                resolve(true);
            };
            video.onerror = () => {
                mediaCache.set(mediaUrl, false);
                resolve(false);
            };
            video.src = mediaUrl;
        } else {
            const img = new Image();
            img.onload = () => {
                mediaCache.set(mediaUrl, true);
                resolve(true);
            };
            img.onerror = () => {
                mediaCache.set(mediaUrl, false);
                resolve(false);
            };
            img.src = mediaUrl;
        }
    });
}

// メディアを表示するメイン関数（高速再生最適化）
async function displayMedia(container, mediaPath) {
    if (!container || !mediaPath) return;

    // 既に同じメディアを表示中の場合は再描画をスキップしてチラつき・再読み込みを防止
    const currentMedia = container.querySelector('img, video');
    if (currentMedia && currentMedia.getAttribute('data-src') === mediaPath) {
        return;
    }

    container.innerHTML = '';

    if (isVideoUrl(mediaPath)) {
        const video = document.createElement('video');
        video.src = mediaPath;
        video.setAttribute('data-src', mediaPath);
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto'; // 高速読み込み設定
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.display = 'block';

        container.appendChild(video);

        // 即時再生トリガー
        video.play().catch(() => {});
    } else {
        const img = document.createElement('img');
        img.src = mediaPath;
        img.setAttribute('data-src', mediaPath);
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.display = 'block';

        container.appendChild(img);
    }
}

// 拡張子を含まないファイル名から実際のメディアパスを特定
async function resolveMediaPath(charName, fileName) {
    if (!charName || !fileName) return null;

    if (fileName.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
        const fullPath = `addchara/${charName}/${fileName}`;
        const exists = await checkMediaExists(fullPath);
        return exists ? fullPath : null;
    }

    for (const ext of ALLOWED_EXTENSIONS) {
        const testPath = `addchara/${charName}/${fileName}.${ext}`;
        const exists = await checkMediaExists(testPath);
        if (exists) {
            return testPath;
        }
    }
    return null;
}

// 初期化処理
jQuery(async () => {
    console.log('[Image Display] 高速化版が読み込まれました。');
});

export { displayMedia, resolveMediaPath };
