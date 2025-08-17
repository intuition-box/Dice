import React, {useEffect, useRef, useImperativeHandle, forwardRef, useState} from "react";

/**
 * NeonDiceD6 – reusable canvas-based D6 with neon styling.
 *
 * Behavior:
 *  - Rolls on ALL axes by default.
 *  - If the result is 3, final animation transitions to a pure Z-axis spin; edges glow neon cyan-green with pulsing.
 *  - Any other result glows red with a soft red face opacity.
 *  - Numbers are printed on each face with a FIXED size.
 */

const defaultLabels: [number, number, number, number, number, number] = [1,3,5,2,4,6];

export type NeonDiceD6Handle = { roll: () => void };

type Props = {
  size?: number;
  winFace?: number;
  labels?: [number, number, number, number, number, number];
  idleSpin?: boolean;
  showControls?: boolean;
  className?: string;
  onResult?: (r:{faceIndex:number,label:number,isWin:boolean}) => void;
};

const NeonDiceD6 = forwardRef<NeonDiceD6Handle, Props>(function NeonDiceD6({
  size = 460,
  winFace = 3,
  labels = defaultLabels,
  idleSpin = true,
  showControls = true,
  className = "",
  onResult,
}, ref){
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const axRef = useRef(0); const ayRef = useRef(0); const azRef = useRef(0);
  const rollingRef = useRef(false);
  const edgeColorRef = useRef<string>("#00e5ff");
  const [btnState, setBtnState] = useState<{glow:"win"|"lose"|"", text:string}>({glow:"", text:"Launch"});

  // geometry
  const V = useRef<[number,number,number][]>([
    [-1,-1,-1],[ 1,-1,-1],[ 1, 1,-1],[-1, 1,-1],
    [-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1],
  ]);
  const FACES = useRef<number[][]>([
    [0,1,2,3],
    [4,5,6,7],
    [0,1,5,4],
    [3,2,6,7],
    [1,2,6,5],
    [0,3,7,4],
  ]);

  function rotate([x,y,z]: [number,number,number], ax:number, ay:number, az:number): [number,number,number]{
    let s=Math.sin, c=Math.cos;
    let X=x, Y=y, Z=z;
    let sy=s(ax), cy=c(ax); [Y,Z] = [Y*cy - Z*sy, Y*sy + Z*cy];
    let sz=s(ay), cz=c(ay); [X,Z] = [X*cz + Z*sz, -X*sz + Z*cz];
    let sx=s(az), cx=c(az); [X,Y] = [X*cx - Y*sx, X*sx + Y*cx];
    return [X,Y,Z];
  }
  function project([x,y,z]: [number,number,number], w:number, h:number){
    const f = 300; // Further reduced focal length for more space
    const d = 6 - z; // Even more distance for better perspective
    const s = f / d; 
    const cx = w/2, cy = h/2;
    return [cx + x*s, cy + y*s, d] as [number, number, number];
  }

  function render(){
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext("2d"); if(!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // Transparent background for branding dice
    // No background gradient to ensure dice are fully visible

    const P = V.current.map(v => project(rotate(v as any, axRef.current, ayRef.current, azRef.current), w, h));
    const faceDepth = (f:number[]) => f.reduce((s,ix)=> s + P[ix][2], 0) / f.length;
    const order = FACES.current.map((f,i)=>({i, z: faceDepth(f)})).sort((a,b)=> b.z - a.z);

    const pulse = (Math.sin(performance.now()/300)+1)/2; // 0–1 pulsing

    order.forEach(({i}) => {
      const f = FACES.current[i];
      ctx.beginPath();
      ctx.moveTo(P[f[0]][0],P[f[0]][1]); for(let k=1;k<4;k++) ctx.lineTo(P[f[k]][0],P[f[k]][1]); ctx.closePath();

      const label = labels[i];
      const isFront = (i === order[order.length-1].i);
      const isWinFace = label === winFace;

      if(isWinFace){
        ctx.fillStyle = `rgba(0,255,204,${0.35+0.25*pulse})`; // neon cyan pulsing fill
        ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = `hsl(${170+10*pulse},100%,60%)`;
        ctx.shadowColor = `hsl(${170+10*pulse},100%,65%)`; ctx.shadowBlur = 50 + 30*pulse;
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255,59,92,0.15)"; // faint red tint on losing faces
        ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#ff3b5c";
        ctx.shadowColor = "#ff3b5c"; ctx.shadowBlur = 15;
        ctx.stroke();
      }

      const [cx, cy] = f.reduce(([sx,sy], ix)=>[sx + P[ix][0]/4, sy + P[ix][1]/4], [0,0] as [number,number]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${isWinFace?52:38}px 'Orbitron', 'system-ui', -apple-system, Segoe UI, Roboto, Arial`;
      if(isWinFace){
        const neonGrad = ctx.createLinearGradient(cx-40, cy-40, cx+40, cy+40);
        neonGrad.addColorStop(0, '#00ffe0');
        neonGrad.addColorStop(0.5, '#00ffcc');
        neonGrad.addColorStop(1, '#00ffa3');
        ctx.fillStyle = neonGrad;
        ctx.shadowColor = '#00fff0';
        ctx.shadowBlur = isFront ? 90+40*pulse : 40;
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = '#ff3b5c';
        ctx.shadowColor = '#ff3b5c';
        ctx.shadowBlur = isFront ? 32 : 8;
        ctx.globalAlpha = isFront ? 0.9 : 0.4;
      }
      ctx.fillText(String(label), cx, cy);
      ctx.globalAlpha = 1.0;
    });
  }

  useEffect(()=>{
    const canvas = canvasRef.current!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    let raf: number;
    const loop = () => { if(!rollingRef.current && idleSpin){ axRef.current+=0.003; ayRef.current+=0.004; azRef.current+=0.002; } render(); raf=requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, idleSpin, labels.join(","), winFace]);

  const roll = () => {
    if(rollingRef.current) return;
    rollingRef.current = true;
    setBtnState({glow:"", text:"Rolling..."});
    edgeColorRef.current = '#00e5ff';
    const faceIndex = Math.floor(Math.random()*6);
    const label = labels[faceIndex];
    const isWin = label === winFace;
    const spins = 2 + Math.floor(Math.random()*3);
    const startAx = axRef.current, startAy = ayRef.current, startAz = azRef.current;
    const rand = () => (Math.random()*2-1);
    const goalAx = isWin ? startAx : startAx + spins*Math.PI*2*(0.6+0.4*Math.random())*Math.sign(rand());
    const goalAy = isWin ? startAy : startAy + spins*Math.PI*2*(0.6+0.4*Math.random())*Math.sign(rand());
    const goalAz = startAz + spins*Math.PI*2*(0.6+0.4*Math.random())*Math.sign(rand());
    const start = performance.now(); const dur = 1400; const ease = (t:number)=>1-Math.pow(1-t,3);
    const step = () => {
      const t = Math.min((performance.now()-start)/dur, 1);
      if(isWin){ azRef.current = startAz + (goalAz - startAz)*ease(t); }
      else { axRef.current = startAx + (goalAx-startAx)*ease(t); ayRef.current = startAy + (goalAy-startAy)*ease(t); azRef.current = startAz + (goalAz-startAz)*ease(t); }
      render();
      if(t<1){ requestAnimationFrame(step); } else { edgeColorRef.current = isWin? '#00ffcc':'#ff3b5c'; setBtnState({glow:isWin?"win":"lose", text:isWin?`Win! (${label})`:`Lose (${label})`}); rollingRef.current=false; onResult?.({faceIndex,label,isWin}); }
    };
    requestAnimationFrame(step);
  };

  useImperativeHandle(ref, ()=>({ roll }), [roll]);

  return (
    <div className={`${className}`}>
      <canvas ref={canvasRef} aria-label="Neon D6" style={{ background: 'transparent' }} />
      {showControls && (
        <button
          onClick={roll}
          className={`px-5 py-3 rounded-2xl font-extrabold tracking-[0.14em] uppercase transition will-change-transform active:translate-y-px border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,.35)] bg-gradient-to-b from-white/10 to-white/0 ${btnState.glow==='win' ? 'ring-2 ring-[--neon-green] shadow-[0_0_40px_rgba(0,255,200,.65),0_0_110px_rgba(0,255,200,.55)]' : btnState.glow==='lose' ? 'ring-2 ring-[--neon-red] shadow-[0_0_24px_rgba(255,59,92,.4),0_0_80px_rgba(255,59,92,.3)]' : ''}`}
        >
          {btnState.text}
        </button>
      )}
    </div>
  );
});

export default NeonDiceD6;
