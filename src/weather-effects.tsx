import { useEffect, useRef } from "react";
import "./weather-effects.css";

export type WeatherTheme = "none" | "winter" | "rain" | "autumn";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  sway: number;
  swaySpeed: number;
  color: string;
};

const LEAF_COLORS = ["#e8ad64", "#d97742", "#c0533a", "#e6b94e", "#b85c2e", "#d4883f"];

function particleCount(theme: WeatherTheme): number {
  if (theme === "winter") return 90;
  if (theme === "rain") return 160;
  if (theme === "autumn") return 45;
  return 0;
}

function makeParticle(theme: WeatherTheme, width: number, height: number, randomY: boolean): Particle {
  const x = Math.random() * width;
  const y = randomY ? Math.random() * height : -10;
  if (theme === "rain") {
    return { x, y, vx: -2.2 - Math.random() * 1.4, vy: 12 + Math.random() * 8, size: 8 + Math.random() * 10, angle: 0, spin: 0, sway: 0, swaySpeed: 0, color: "#9db8c9" };
  }
  if (theme === "autumn") {
    return { x, y, vx: -1 - Math.random() * 1.5, vy: 1.4 + Math.random() * 1.6, size: 6 + Math.random() * 6, angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.06, sway: 20 + Math.random() * 30, swaySpeed: 0.008 + Math.random() * 0.01, color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)] };
  }
  return { x, y, vx: -0.4 - Math.random() * 0.5, vy: 0.7 + Math.random() * 1.1, size: 1.5 + Math.random() * 2.5, angle: 0, spin: 0, sway: 15 + Math.random() * 25, swaySpeed: 0.01 + Math.random() * 0.012, color: "#ffffff" };
}

function drawLeaf(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = p.color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -p.size);
  ctx.quadraticCurveTo(p.size * 0.9, -p.size * 0.2, 0, p.size);
  ctx.quadraticCurveTo(-p.size * 0.9, -p.size * 0.2, 0, -p.size);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -p.size * 0.7);
  ctx.lineTo(0, p.size * 0.7);
  ctx.stroke();
  ctx.restore();
}

export function WeatherEffects({ theme }: { theme: WeatherTheme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theme === "none") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    const particles: Particle[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const desired = particleCount(theme);
    for (let i = 0; i < desired; i++) particles.push(makeParticle(theme, width || window.innerWidth, height || window.innerHeight, true));

    const step = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        frame++;
        p.x += p.vx + (p.sway ? Math.sin(frame * p.swaySpeed + i) * (p.sway / 60) : 0);
        p.y += p.vy;
        p.angle += p.spin;
        if (p.y > height + 20 || p.x < -30) {
          particles[i] = makeParticle(theme, width, height, false);
          particles[i].x = Math.random() * width + 10;
          continue;
        }
        if (theme === "rain") {
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.9, p.y - p.vy * 0.55);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (theme === "autumn") {
          drawLeaf(ctx, p);
        } else {
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      requestAnimationFrame(step);
    };

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(step);
    return () => {
      running = false;
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, width, height);
    };
  }, [theme]);

  if (theme === "none") return null;
  return <canvas ref={canvasRef} className={`weather-canvas weather-${theme}`} aria-hidden="true" />;
}
