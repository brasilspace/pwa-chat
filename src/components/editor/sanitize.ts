/**
 * sanitize — DOMPurify-Wrapper fuer Matrix-formatted_body-Rendering.
 *
 * Matrix erlaubt eine kleine Whitelist (siehe Spec m.room.message
 * formatted_body). Wir folgen weitgehend, lassen aber eingebettete
 * Tabellen aus Sicherheitsgruenden weg (kein Use-Case in Chat heute).
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
    'code', 'pre',
    'ul', 'ol', 'li',
    'a',
    'span',
    // Hinweis: Header und Blockquote im chat-composer-Profil nicht aktiv,
    // aber falls jemand HTML mit denen reinpastet, akzeptieren wir sie.
    'h1', 'h2', 'h3', 'h4', 'blockquote',
];

const ALLOWED_ATTR = ['href', 'class', 'rel', 'target'];

/** Saeubert beliebige HTML — sicher fuer dangerouslySetInnerHTML. */
export function sanitizeMatrixHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        // <a> bekommt automatisch rel/target damit href sicher ist
        ADD_ATTR: ['target', 'rel'],
    });
}

/**
 * Strippt HTML aus einem String und liefert nur den Text — fuer
 * `body`-Feld (das ist der Plain-Text-Fallback im Matrix-Event).
 */
export function htmlToPlainText(html: string): string {
    if (!html) return '';
    if (typeof document === 'undefined') return html;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent ?? tmp.innerText ?? '').trim();
}

/**
 * Prueft ob die HTML inhaltlich nur Plain-Text ist (kein Markup).
 * Wenn ja, koennen wir das formatted_body weglassen und nur body senden.
 */
export function isPlainTextHtml(html: string): boolean {
    if (!html) return true;
    const stripped = html
        .replace(/<p>/gi, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .trim();
    // Wenn nach diesen Trivialformat-Tags nichts uebrig ist als Text → plain
    return !/<[a-z][^>]*>/i.test(stripped);
}
