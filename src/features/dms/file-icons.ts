/**
 * file-icons — Mapping mimeType + Datei-Endung -> SVG/PNG-Icon-URL.
 *
 * Icons liegen in `/public/file-icons/`. Quelle: prilog-infra/docs/icons.
 * Fallback: null (Aufrufer rendert dann ein generisches Lucide-Icon).
 *
 * Erweiterungs-Lookup hat Vorrang vor MIME-Match, weil viele Browser
 * generische mimeTypes liefern (z.B. application/octet-stream fuer .docx).
 */

const ICON_BASE = '/file-icons';

interface IconDef { file: string; label: string }

// Endung → Icon
const EXT_MAP: Record<string, IconDef> = {
    pdf:  { file: 'icon-pdf.svg', label: 'PDF' },

    // Office
    doc:  { file: 'icon-doc.svg', label: 'Word' },
    docx: { file: 'icon-doc.svg', label: 'Word' },
    odt:  { file: 'icon-doc.svg', label: 'Writer' },
    rtf:  { file: 'icon-doc.svg', label: 'RTF' },
    xls:  { file: 'icon-xls.svg', label: 'Excel' },
    xlsx: { file: 'icon-xls.svg', label: 'Excel' },
    ods:  { file: 'icon-xls.svg', label: 'Calc' },
    ppt:  { file: 'icon-ppt.svg', label: 'PowerPoint' },
    pptx: { file: 'icon-ppt.svg', label: 'PowerPoint' },
    odp:  { file: 'icon-ppt.svg', label: 'Impress' },

    // Daten/Text
    csv:  { file: 'icon-csv.svg', label: 'CSV' },
    txt:  { file: 'icon-txt.svg', label: 'Text' },
    md:   { file: 'icon-md.svg',  label: 'Markdown' },
    markdown: { file: 'icon-md.svg', label: 'Markdown' },
    json: { file: 'icon-json.svg', label: 'JSON' },
    html: { file: 'icon-html.svg', label: 'HTML' },
    htm:  { file: 'icon-html.svg', label: 'HTML' },
    css:  { file: 'icon-css.svg',  label: 'CSS' },
    js:   { file: 'icon-js.svg',   label: 'JavaScript' },
    mjs:  { file: 'icon-js.svg',   label: 'JavaScript' },
    ts:   { file: 'icon-js.svg',   label: 'TypeScript' },
    tsx:  { file: 'icon-js.svg',   label: 'TypeScript' },

    // Bilder
    jpg:  { file: 'icon-img.svg', label: 'JPEG' },
    jpeg: { file: 'icon-img.svg', label: 'JPEG' },
    png:  { file: 'icon-img.svg', label: 'PNG' },
    gif:  { file: 'icon-img.svg', label: 'GIF' },
    webp: { file: 'icon-img.svg', label: 'WebP' },
    bmp:  { file: 'icon-img.svg', label: 'Bitmap' },
    tif:  { file: 'icon-img.svg', label: 'TIFF' },
    tiff: { file: 'icon-img.svg', label: 'TIFF' },
    svg:  { file: 'icon-svg.svg', label: 'SVG' },

    // Video
    mp4:  { file: 'icon-vid.svg', label: 'MP4' },
    mov:  { file: 'icon-vid.svg', label: 'MOV' },
    avi:  { file: 'icon-vid.svg', label: 'AVI' },
    mkv:  { file: 'icon-vid.svg', label: 'MKV' },
    webm: { file: 'icon-vid.svg', label: 'WebM' },
    m4v:  { file: 'icon-vid.svg', label: 'M4V' },

    // Audio
    mp3:  { file: 'icon-audio.png', label: 'MP3' },
    wav:  { file: 'icon-audio.png', label: 'WAV' },
    ogg:  { file: 'icon-audio.png', label: 'OGG' },
    m4a:  { file: 'icon-audio.png', label: 'M4A' },
    flac: { file: 'icon-audio.png', label: 'FLAC' },
    aac:  { file: 'icon-audio.png', label: 'AAC' },

    // Archive
    zip:  { file: 'icon-zip.svg', label: 'ZIP' },
    rar:  { file: 'icon-zip.svg', label: 'RAR' },
    '7z': { file: 'icon-zip.svg', label: '7-Zip' },
    tar:  { file: 'icon-zip.svg', label: 'TAR' },
    gz:   { file: 'icon-zip.svg', label: 'GZip' },
    bz2:  { file: 'icon-zip.svg', label: 'BZip2' },

    // Executable
    exe:  { file: 'icon-exe.svg', label: 'Executable' },
    msi:  { file: 'icon-exe.svg', label: 'Installer' },
    bin:  { file: 'icon-exe.svg', label: 'Binary' },
    app:  { file: 'icon-exe.svg', label: 'App' },
    dmg:  { file: 'icon-exe.svg', label: 'DiskImage' },
    deb:  { file: 'icon-exe.svg', label: 'Debian-Package' },
    rpm:  { file: 'icon-exe.svg', label: 'RPM-Package' },
};

// MIME-Fallback wenn Endung unbekannt
const MIME_PATTERNS: Array<[RegExp, IconDef]> = [
    [/^application\/pdf/, EXT_MAP.pdf],
    [/^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml)/, EXT_MAP.doc],
    [/^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml)/, EXT_MAP.xls],
    [/^application\/(vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml)/, EXT_MAP.ppt],
    [/^application\/json/, EXT_MAP.json],
    [/^application\/(zip|x-zip|x-rar|x-7z|x-tar|gzip|x-bzip2)/, EXT_MAP.zip],
    [/^application\/(x-msdownload|x-executable|octet-stream)/, EXT_MAP.exe],
    [/^image\/svg/, EXT_MAP.svg],
    [/^image\//, EXT_MAP.png],
    [/^video\//, EXT_MAP.mp4],
    [/^audio\//, EXT_MAP.mp3],
    [/^text\/csv/, EXT_MAP.csv],
    [/^text\/markdown/, EXT_MAP.md],
    [/^text\/html/, EXT_MAP.html],
    [/^text\/css/, EXT_MAP.css],
    [/^text\/(javascript|ecmascript)/, EXT_MAP.js],
    [/^text\/plain/, EXT_MAP.txt],
];

export interface FileIcon {
    /** absolute URL fuer <img src=...>, z.B. /file-icons/icon-pdf.svg */
    url: string;
    /** kurzer menschenlesbarer Label (z.B. "PDF", "Excel") */
    label: string;
}

/**
 * Erkennt das passende File-Icon. Endung hat Vorrang vor MIME, weil Browser
 * oft application/octet-stream liefern. Returns null wenn nichts passt —
 * Aufrufer rendert dann ein generisches Lucide-Icon.
 */
export function getFileIcon(fileName: string | null | undefined, mimeType: string | null | undefined): FileIcon | null {
    if (fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        if (ext && EXT_MAP[ext]) {
            const def = EXT_MAP[ext];
            return { url: `${ICON_BASE}/${def.file}`, label: def.label };
        }
    }
    if (mimeType) {
        for (const [re, def] of MIME_PATTERNS) {
            if (re.test(mimeType)) {
                return { url: `${ICON_BASE}/${def.file}`, label: def.label };
            }
        }
    }
    return null;
}
