/**
 * confetti.ts — Mini-Confetti ohne externe Dependency (~2 KB).
 *
 * Wird einmal beim Wizard-Abschluss ausgeloest. Kein Audio, keine
 * dauerhaften DOM-Knoten.
 *
 * Nur fuer Browser-Umgebungen — sicher gegen SSR.
 */

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7', '#ef4444'];

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angularVel: number;
    size: number;
    color: string;
    shape: 'rect' | 'circle';
}

export function fireConfetti(durationMs = 2500, particleCount = 140): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.remove();
        return;
    }

    const cx = window.innerWidth / 2;
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
        const speed = 4 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        particles.push({
            x: cx + (Math.random() - 0.5) * 80,
            y: window.innerHeight / 3,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 4, // initial upward bias
            angle: Math.random() * Math.PI * 2,
            angularVel: (Math.random() - 0.5) * 0.3,
            size: 6 + Math.random() * 6,
            color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
            shape: Math.random() > 0.5 ? 'rect' : 'circle',
        });
    }

    const start = performance.now();
    function frame(now: number) {
        const elapsed = now - start;
        if (elapsed > durationMs) {
            canvas.remove();
            return;
        }
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of particles) {
            p.vy += 0.25; // gravity
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.99;
            p.angle += p.angularVel;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
            if (p.shape === 'rect') {
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
