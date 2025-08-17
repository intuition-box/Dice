"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseEther, formatEther, decodeEventLog } from "viem";
import { useScaffoldWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { toast } from "react-hot-toast";
import { usePublicClient } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";

// Intuition Stress‑Grid — Version "Dice‑Only Minimal"
// - Enlève l'en-tête et la config réseau/burner
// - Garde seulement : Nombre de dés (transactions) & Parallélisme (burst)
// - Boutons : Lancer / Réinitialiser / Auto (relance toutes les 5s)
// - Animation des dés : chiffre 0–9 qui oscille; gagnants = 1..5

// ---------- Types ----------

type TileStatus =
  | { phase: "idle" }
  | { phase: "queued" }
  | { phase: "sending"; startedAt: number }
  | { phase: "pending"; startedAt: number; txHash?: string }
  | { phase: "mined"; latencyMs: number; rolled: string; rollDecimal: number; win: boolean; txHash?: string }
  | { phase: "failed"; error: string };

interface Tile {
  id: number;
  status: TileStatus;
}

// ---------- Utils ----------

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function formatMs(ms?: number) {
  if (ms == null || !isFinite(ms)) return "-";
  return `${ms.toFixed(0)} ms`;
}

// ---------- Component ----------

const ROLL_ETH_VALUE = "0.002";

export default function App() {
  const [count, setCount] = useState<number>(100); // nombre de dés (transactions)
  const [burstSize, setBurstSize] = useState<number>(50); // parallélisme
  const [tiles, setTiles] = useState<Tile[]>(() => Array.from({ length: 100 }, (_, i) => ({ id: i, status: { phase: "idle" } })));
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(false);
  const [nextRunIn, setNextRunIn] = useState<number | null>(null);
  const [isSequential, setIsSequential] = useState(false);
  const [hideNotifications, setHideNotifications] = useState(false);
  
  // Contract hooks
  const { writeContractAsync: writeDiceGameAsync } = useScaffoldWriteContract({
    contractName: "DiceGame",
  });
  
  const publicClient = usePublicClient();
  
  // Only read prize occasionally (no constant polling)
  const { data: prize } = useScaffoldReadContract({ 
    contractName: "DiceGame", 
    functionName: "prize"
  });

  // Recreate tiles when count changes
  useEffect(() => {
    setTiles(Array.from({ length: count }, (_, i) => ({ id: i, status: { phase: "idle" } })));
  }, [count]);

  // Hide notifications when toggle is on
  useEffect(() => {
    if (hideNotifications) {
      toast.dismiss(); // Dismiss all existing toasts
      
      // Override toast methods to prevent new toasts
      const originalMethods = {
        success: toast.success,
        error: toast.error,
        loading: toast.loading,
        custom: toast.custom,
      };
      
      toast.success = () => "";
      toast.error = () => "";
      toast.loading = () => "";
      toast.custom = () => "";
      
      return () => {
        // Restore original methods when component unmounts or toggle changes
        toast.success = originalMethods.success;
        toast.error = originalMethods.error;
        toast.loading = originalMethods.loading;
        toast.custom = originalMethods.custom;
      };
    }
  }, [hideNotifications]);

  const minedCount = useMemo(() => tiles.filter(t => t.status.phase === "mined").length, [tiles]);

  function updateTile(id: number, status: TileStatus) {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  // Real dice transaction
  async function runOne(id: number) {
    try {
      console.log("🚀 Starting transaction for tile:", id);
      updateTile(id, { phase: "queued" });
      await delay(10 + Math.random() * 20); // Small delay to simulate queue processing
      
      const startedAt = nowMs();
      updateTile(id, { phase: "sending", startedAt });
      
      // Call the actual contract (this will wait for user confirmation first)
      console.log("📤 Calling contract for tile:", id);
      
      const txHash = await writeDiceGameAsync({ 
        functionName: "rollTheDice", 
        value: parseEther(ROLL_ETH_VALUE) 
      });
      

      console.log("🎉 Transaction confirmed for tile:", id, "txHash:", txHash);
      const latencyMs = nowMs() - startedAt;
      
      // Get the transaction receipt to extract events
      try {
        if (publicClient && txHash) {
          const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
          const chainId = await publicClient.getChainId();
          const contractConfig = deployedContracts[chainId as keyof typeof deployedContracts]?.DiceGame;
          
          if (receipt?.logs && contractConfig?.abi) {
            // Find the Roll event in the logs
            const rollLog = receipt.logs.find((log: any) => {
              try {
                const decoded = decodeEventLog({
                  abi: contractConfig.abi,
                  data: log.data,
                  topics: log.topics,
                });
                return decoded.eventName === 'Roll';
              } catch {
                return false;
              }
            });
            
            if (rollLog) {
              const decoded = decodeEventLog({
                abi: contractConfig.abi,
                data: rollLog.data,
                topics: rollLog.topics,
              });
              
              const rollDecimal = Number((decoded.args as any).roll);
              const rollHex = rollDecimal.toString(16).toUpperCase();
              const win = rollDecimal <= 5;
              
              console.log("🎲 Extracted roll from receipt:", rollHex, "win:", win);
              
              updateTile(id, { 
                phase: "mined", 
                latencyMs, 
                rolled: rollHex, 
                rollDecimal, 
                win, 
                txHash: txHash
              });
              return; // Success, we got the real result
            }
          }
        }
        
        // Fallback if we couldn't extract the roll
        console.log("⚠️ Couldn't extract roll from receipt, using placeholder");
        updateTile(id, { 
          phase: "mined", 
          latencyMs, 
          rolled: "?", 
          rollDecimal: -1, 
          win: false, 
          txHash: txHash
        });
        
      } catch (e) {
        console.error("❌ Error extracting roll from receipt:", e);
        // Show placeholder on error
        updateTile(id, { 
          phase: "mined", 
          latencyMs, 
          rolled: "?", 
          rollDecimal: -1, 
          win: false, 
          txHash: txHash
        });
      }
      
    } catch (e: any) {
      console.error("❌ Transaction failed for tile:", id, e);
      
      // Check if it's a nonce error and retry after delay
      if (e?.message?.includes("nonce too low") || e?.message?.includes("nonce")) {
        console.log("🔄 Nonce error detected, retrying tile", id, "after delay...");
        await delay(200 + Math.random() * 300); // Random delay to avoid collision
        const retryStartTime = nowMs();
        try {
          // Retry the transaction
          const retryTxHash = await writeDiceGameAsync({ 
            functionName: "rollTheDice", 
            value: parseEther(ROLL_ETH_VALUE) 
          });
          
          console.log("🎉 Retry confirmed for tile:", id, "txHash:", retryTxHash);
          const retryLatencyMs = nowMs() - retryStartTime + 500; // Add penalty for retry
          
          // Extract roll result from retry transaction (simplified fallback)
          updateTile(id, { 
            phase: "mined", 
            latencyMs: retryLatencyMs, 
            rolled: "R", // Mark as retry
            rollDecimal: -1, 
            win: false, 
            txHash: retryTxHash
          });
          
          return; // Success, don't mark as failed
        } catch (retryError: any) {
          console.error("❌ Retry also failed for tile:", id, retryError);
          updateTile(id, { phase: "failed", error: `Retry failed: ${retryError?.message ?? String(retryError)}` });
          return;
        }
      }
      
      updateTile(id, { phase: "failed", error: e?.message ?? String(e) });
    }
  }

  async function runAll() {
    if (running) return;
    setRunning(true);

    const queue = [...tiles.map((t) => t.id)];
    
    if (isSequential) {
      // Sequential mode - one transaction at a time
      console.log("🔄 Running in sequential mode");
      for (const id of queue) {
        await runOne(id);
        await delay(100); // Small delay between sequential transactions
      }
    } else {
      // Batch mode - submit transactions rapidly one after another to get incremental nonces
      console.log("🚀 Running in batch mode with rapid sequential submission");
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        // Small delay between transaction submissions to ensure nonce increment
        const promise = delay(i * 50).then(() => runOne(id));
        promises.push(promise);
        
        // Limit concurrent promises to burstSize
        if (promises.length >= burstSize || i === queue.length - 1) {
          await Promise.all(promises.splice(0, promises.length));
        }
      }
      
      // Wait for any remaining promises
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    }
    
    setRunning(false);
  }

  // Auto mode: rerun every 5s after a run completes
  useEffect(() => {
    if (!auto) {
      setNextRunIn(null);
      return;
    }
    if (running) return; // wait finish

    let seconds = 5;
    setNextRunIn(seconds);

    const timer = setInterval(() => {
      seconds -= 1;
      setNextRunIn(seconds);
      if (seconds <= 0) {
        clearInterval(timer);
        runAll();
      }
    }, 1000);

    return () => clearInterval(timer);
    // rearm when a run finishes or auto toggles
  }, [auto, running]);

  function resetTiles() {
    setTiles((prev) => prev.map((t) => ({ ...t, status: { phase: "idle" } })));
  }

  // ---------- UI ----------

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Controls (minimal) */}
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm">Nombre de dés (transactions)</label>
              <input
                type="number"
                min={1}
                max={2000}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm">Parallélisme (burst)</label>
              <input
                type="number"
                min={1}
                max={400}
                value={burstSize}
                onChange={(e) => setBurstSize(Math.max(1, Math.min(400, Number(e.target.value) || 1)))}
                disabled={isSequential}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 disabled:opacity-50"
              />
              <div className="text-xs text-neutral-500 mt-1">
                {isSequential ? "Désactivé en mode séquentiel" : "Taille des groupes de transactions (50ms entre chaque)"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end pt-1">
            <button
              onClick={() => setIsSequential(v => !v)}
              className={"px-4 py-2 rounded-xl border " + (isSequential ? "bg-blue-600 border-blue-500" : "bg-white/10 border-neutral-700 hover:bg-white/15")}
            >
              {isSequential ? "Séquentiel" : "Batch"}
            </button>
            <button
              onClick={() => setHideNotifications(v => !v)}
              className={"px-4 py-2 rounded-xl border " + (hideNotifications ? "bg-red-600 border-red-500" : "bg-white/10 border-neutral-700 hover:bg-white/15")}
            >
              {hideNotifications ? "Notifications OFF" : "Notifications ON"}
            </button>
            <button
              disabled={running}
              onClick={runAll}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700"
            >
              Lancer
            </button>
            <button
              onClick={resetTiles}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-neutral-700"
            >
              Réinitialiser
            </button>
            <button
              onClick={() => setAuto(v => !v)}
              className={"px-4 py-2 rounded-xl border " + (auto ? "bg-indigo-600 border-indigo-500" : "bg-white/10 border-neutral-700 hover:bg-white/15")}
            >
              Auto {auto && (nextRunIn != null ? `(${nextRunIn}s)` : "")}
            </button>
          </div>

          <div className="text-sm text-neutral-400 space-y-1">
            <div>
              {running ? (
                <span>Exécution en cours ({isSequential ? "séquentiel" : "batch"})… {minedCount}/{tiles.length} minées</span>
              ) : auto ? (
                <span>Auto activé : relance dans {nextRunIn ?? 5}s</span>
              ) : (
                <span>Prêt ({isSequential ? "mode séquentiel" : "mode batch"}){hideNotifications ? " - Notifications masquées" : ""}.</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span>Prix actuel: {prize ? formatEther(prize) : "0"} ETH</span>
              <span>Coût par lancer: {ROLL_ETH_VALUE} ETH</span>
              <span>Gagnants: 0-5 (hex), Perdants: 6-F (hex)</span>
            </div>
          </div>
        </section>

        {/* Grid */}
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Dés en temps réel</h2>
            <div className="text-sm text-neutral-400">{minedCount}/{tiles.length} minées</div>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}
          >
            {tiles.map((t) => (
              <TileCard key={t.id} tile={t} />
            ))}
          </div>
        </section>

        <footer className="text-xs text-neutral-500 pb-8">
          Les numéros gagnants sont 0,1,2,3,4,5 (hex). Coût: 0.002 ETH par lancer. 
          Mode séquentiel: 100ms entre transactions. Mode batch: 50ms entre soumissions, groupes de {burstSize}. 
          En mode Auto, une nouvelle salve démarre 5s après la fin.
        </footer>
      </div>
    </div>
  );
}

function TileCard({ tile }: { tile: Tile }) {
  const st = tile.status;
  const phase = st.phase;

  // Animated digit 0..9 while in sending/pending
  const [animDigit, setAnimDigit] = useState<number>(Math.floor(Math.random() * 10));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase === "sending" || phase === "pending") {
      const loop = () => {
        setAnimDigit((d) => (d + 1) % 10);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }
    // stop animation when not active
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, [phase]);

  const rolled = phase === "mined" ? st.rolled : animDigit.toString();
  const win = phase === "mined" ? st.win : false;
  const isWaitingForRealResult = phase === "mined" && st.rolled === "?" && st.rollDecimal === -1;

  return (
    <div
      className={
        "rounded-xl border bg-neutral-950 p-3 space-y-2 transition-colors " +
        (phase === "mined" ? (win ? "border-emerald-600" : "border-rose-600") : "border-neutral-800")
      }
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-400">#{tile.id}</div>
        <span
          className={
            "text-[10px] px-2 py-0.5 rounded-full " +
            (phase === "idle"
              ? "bg-neutral-800"
              : phase === "queued"
              ? "bg-neutral-700"
              : phase === "sending"
              ? "bg-amber-600"
              : phase === "pending"
              ? "bg-indigo-700"
              : phase === "mined"
              ? win
                ? "bg-emerald-700"
                : "bg-rose-700"
              : "bg-rose-700")
          }
        >
          {phase}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-lg bg-neutral-800 grid place-items-center text-2xl font-semibold ${isWaitingForRealResult ? 'animate-pulse bg-yellow-800' : ''}`}>
          {isWaitingForRealResult ? '✓' : rolled}
        </div>
        <div className="text-xs space-y-1 min-w-0">
          {phase === "mined" && (
            <div className={isWaitingForRealResult ? "text-yellow-400" : win ? "text-emerald-400" : "text-rose-300"}>
              {isWaitingForRealResult ? "Confirmé - En attente du résultat..." : win ? "Gagné" : "Perdu"}
            </div>
          )}
          {("latencyMs" in st) && (
            <div className="text-neutral-400">Latence: {formatMs(st.latencyMs)}</div>
          )}
          {phase === "failed" && "error" in st && (
            <div className="text-rose-300 line-clamp-2" title={st.error}>
              {st.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Small helpers ----------

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

async function waitUntil(cond: () => boolean, tickMs = 50) {
  while (!cond()) {
    await delay(tickMs);
  }
}
