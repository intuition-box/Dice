"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseEther, formatEther, decodeEventLog } from "viem";
import { useScaffoldWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { toast } from "react-hot-toast";
import { usePublicClient, useAccount } from "wagmi";
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
  | { phase: "preparing"; startedAt: number }
  | { phase: "getting-gas"; startedAt: number }
  | { phase: "estimating-gas"; startedAt: number }
  | { phase: "building-tx"; startedAt: number }
  | { phase: "waiting-approval"; startedAt: number }
  | { phase: "submitting"; startedAt: number }
  | { phase: "sent"; startedAt: number; txHash: string }
  | { phase: "mined"; latencyMs: number; rolled: string; rollDecimal: number; win: boolean; txHash: string }
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
  const [count, setCount] = useState<number>(3); // nombre de dés (transactions)
  const [burstSize, setBurstSize] = useState<number>(50); // parallélisme
  const [tiles, setTiles] = useState<Tile[]>(() => Array.from({ length: 100 }, (_, i) => ({ id: i, status: { phase: "idle" } })));
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(false);
  const [nextRunIn, setNextRunIn] = useState<number | null>(null);
  const [isSequential, setIsSequential] = useState(false);
  const [hideNotifications, setHideNotifications] = useState(false);
  
  // Cache gas estimation to avoid repeated RPC calls
  const [cachedGasEstimate, setCachedGasEstimate] = useState<{
    gas: bigint;
    gasPrice: bigint;
    timestamp: number;
  } | null>(null);
  
  // Gas estimation status for UI
  const [gasEstimationStatus, setGasEstimationStatus] = useState<'idle' | 'estimating' | 'ready' | 'error'>('idle');
  

  
  // Contract hooks
  const { writeContractAsync: writeDiceGameAsync } = useScaffoldWriteContract({
    contractName: "DiceGame",
  });
  
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
  
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

  // Initialize with static gas values - no background estimation
  useEffect(() => {
    if (!userAddress) {
      setGasEstimationStatus('idle');
      return;
    }
    
    // Set static gas values immediately
    const staticGasEstimate = {
      gas: 180000n, // High gas limit for reliability
      gasPrice: parseEther("0.000000150"), // Competitive gas price
      timestamp: nowMs(),
    };
    
    setCachedGasEstimate(staticGasEstimate);
    setGasEstimationStatus('ready');
    console.log("🎯 Using static gas values - no background RPC calls");
    
  }, [userAddress]);

  const minedCount = useMemo(() => tiles.filter(t => t.status.phase === "mined").length, [tiles]);

  function updateTile(id: number, status: TileStatus) {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }



  // Get cached gas estimate (should always be available from background estimation)
  function getCachedGasEstimate() {
    if (cachedGasEstimate) {
      console.log("🔄 Using cached gas estimate:", cachedGasEstimate.gas.toString());
      return cachedGasEstimate;
    }

    // Fallback if somehow no cache exists
    console.warn("⚠️ No cached gas estimate available, using emergency fallback");
    const fallback = {
      gas: 250000n, // Very high emergency gas limit
      gasPrice: parseEther("0.000000300"), // High gas price for emergency priority
      timestamp: nowMs(),
    };
    return fallback;
  }

  // Real dice transaction
  async function runOne(id: number, explicitNonce?: number) {
    try {
      console.log("🚀 Starting transaction for tile:", id);
      
      // Step 1: Preparing
      const startedAt = nowMs();
      updateTile(id, { phase: "queued" });
      await delay(10 + Math.random() * 20); // Small delay to simulate queue processing
      
      // Step 2: Getting gas estimate
      console.log("⛽ Getting gas estimate for tile:", id);
      updateTile(id, { phase: "getting-gas", startedAt });
      const gasEstimate = getCachedGasEstimate();
      
      // Step 3: Building transaction
      console.log("🔧 Building transaction for tile:", id);
      updateTile(id, { phase: "building-tx", startedAt });
      await delay(50); // Small delay to show building step
      
      // Step 4: Waiting for approval (this is where it might get stuck)
      console.log("⏳ Waiting for wallet approval for tile:", id);
      updateTile(id, { phase: "waiting-approval", startedAt });
      
      // Step 5: Submitting to blockchain
      console.log("📤 Submitting to blockchain for tile:", id, "timestamp:", nowMs());
      updateTile(id, { phase: "submitting", startedAt });
      const contractCallStart = nowMs();
      
      const txHash = await writeDiceGameAsync({ 
        functionName: "rollTheDice", 
        value: parseEther(ROLL_ETH_VALUE),
        gas: gasEstimate.gas,
        gasPrice: gasEstimate.gasPrice,
        type: "legacy", // Legacy transactions are often faster to process
        ...(explicitNonce !== undefined && { nonce: explicitNonce }), // Use explicit nonce if provided
      });
      
      const contractCallEnd = nowMs();
      const contractCallDuration = contractCallEnd - contractCallStart;
      console.log("📡 Transaction sent for tile:", id, "txHash:", txHash, "contract call took:", contractCallDuration + "ms");
      // Show "sent" state - transaction is submitted but not yet mined
      // Start measuring blockchain execution time from when transaction is submitted
      const blockchainStartTime = nowMs();
      updateTile(id, { phase: "sent", startedAt: blockchainStartTime, txHash: txHash || "unknown" });
      
      // Now wait for transaction to be mined and get the roll result
      console.log("⏳ Waiting for transaction to be mined:", txHash);
      
      if (!publicClient || !txHash) {
        throw new Error("Missing publicClient or txHash");
      }

      // Poll for transaction receipt more aggressively
      let receipt: any = null;
      const maxAttempts = 60; // 60 attempts = ~30 seconds with 500ms intervals
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`📡 Polling attempt ${attempt}/${maxAttempts} for tx:`, txHash.slice(0, 10) + "...");
          receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
          
          if (receipt) {
            console.log("✅ Transaction receipt found on attempt", attempt);
            break;
          }
        } catch (error) {
          // Transaction not yet mined, continue polling
          console.log(`⏳ Attempt ${attempt}: Transaction not yet mined`);
        }
        
        // Wait 500ms before next poll
        await delay(500);
      }
      
      if (!receipt) {
        throw new Error(`Transaction ${txHash} not mined after ${maxAttempts} attempts`);
      }
      
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
          
                const blockchainLatencyMs = nowMs() - blockchainStartTime;
          console.log("🎲 Extracted roll from receipt:", rollHex, "win:", win, "blockchain latency:", blockchainLatencyMs + "ms");
          
          updateTile(id, { 
            phase: "mined", 
            latencyMs: blockchainLatencyMs, 
            rolled: rollHex, 
            rollDecimal, 
            win, 
            txHash: txHash || "unknown"
          });
        return;
        }
      }
      
      // Fallback if we can't extract roll data
      const blockchainLatencyMs = nowMs() - blockchainStartTime;
      updateTile(id, { 
        phase: "mined", 
        latencyMs: blockchainLatencyMs, 
        rolled: "?", 
        rollDecimal: 0, 
        win: false, 
        txHash: txHash || "unknown"
      });
      
    } catch (e: any) {
      console.error("❌ Transaction failed for tile:", id, e);
      
      // Check if it's a nonce error and retry after delay
      if (e?.message?.includes("nonce too low") || e?.message?.includes("nonce")) {
        console.log("🔄 Nonce error detected, retrying tile", id, "after delay...");
        await delay(200 + Math.random() * 300); // Random delay to avoid collision
        const retryStartTime = nowMs();
        try {
          // Get cached gas for retry (no RPC call needed)
          const retryGasEstimate = getCachedGasEstimate();
          
          // Retry the transaction (let viem handle nonce automatically for retries)
          const retryTxHash = await writeDiceGameAsync({ 
            functionName: "rollTheDice", 
            value: parseEther(ROLL_ETH_VALUE),
            gas: retryGasEstimate.gas,
            gasPrice: retryGasEstimate.gasPrice,
            type: "legacy",
          });
          
          console.log("📡 Retry transaction sent for tile:", id, "txHash:", retryTxHash);
          updateTile(id, { phase: "sent", startedAt: retryStartTime, txHash: retryTxHash || "unknown" });
          
          const retryLatencyMs = nowMs() - retryStartTime + 500; // Add penalty for retry
          
          // Extract roll result from retry transaction (simplified fallback)
          updateTile(id, { 
            phase: "mined", 
            latencyMs: retryLatencyMs, 
            rolled: "R", // Mark as retry
            rollDecimal: -1, 
            win: false, 
            txHash: retryTxHash || "unknown"
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
    console.log("🔴 runAll called - current running state:", running);
    console.log("🔴 Current tiles phases:", tiles.map(t => t.status.phase));
    
    if (running) {
      console.log("🔴 Already running, skipping");
      return;
    }
    
    setRunning(true);
    console.log("🔴 Set running to true");

    // Only process idle tiles up to burstSize
    const activeTiles = tiles.filter(t => t.status.phase === "idle").slice(0, burstSize);
    console.log("🔴 Found", activeTiles.length, "idle tiles out of", tiles.length, "total");
    
    if (activeTiles.length === 0) {
      console.log("🔴 No idle tiles found");
      
      // Check if all tiles are mined - if so, auto-reset them
      const allMined = tiles.every(t => t.status.phase === "mined");
      if (allMined && tiles.length > 0) {
        console.log("🔄 All tiles are mined, auto-resetting to idle for new batch");
        setTiles((prev) => prev.map((t) => ({ ...t, status: { phase: "idle" } })));
        
        // Now get the reset tiles for processing
        const resetTiles = Array.from({ length: Math.min(burstSize, tiles.length) }, (_, i) => ({ id: i }));
        const queue = resetTiles.map(t => t.id);
        console.log(`🚀 Processing ${queue.length} reset tiles (max: ${burstSize})`);
        
        // Continue with the processing logic...
        if (isSequential) {
          // Sequential mode - one transaction at a time
          console.log("🔄 Running in sequential mode");
          for (const id of queue) {
            await runOne(id);
            await delay(100); // Small delay between sequential transactions
          }
        } else {
          // Batch mode - get current nonce and manage it explicitly for each transaction
          console.log("🚀 Running in batch mode with explicit nonce management");
          
          try {
            // Get current nonce from the network
            let currentNonce: number;
            
            if (publicClient && userAddress) {
              currentNonce = await publicClient.getTransactionCount({ address: userAddress });
              console.log("📊 Current nonce from network:", currentNonce, "for address:", userAddress);
            } else {
              console.warn("⚠️ Cannot get nonce, using sequential submission instead");
              // Fallback to sequential submission
              for (const id of queue) {
                runOne(id);
                await delay(150); // Longer delay for safety
              }
              setRunning(false);
              return;
            }
            
            // Submit transactions with explicit incremental nonces
            const promises: Promise<void>[] = [];
            
            for (let i = 0; i < queue.length; i++) {
              const id = queue[i];
              const explicitNonce = currentNonce + i;
              
              console.log(`📤 Starting transaction ${i + 1}/${queue.length} for tile ${id} with nonce ${explicitNonce}`);
              
              // Start the transaction and collect promise
              const promise = runOne(id, explicitNonce).catch(error => {
                console.error(`Transaction failed for tile ${id} with nonce ${explicitNonce}:`, error);
              });
              promises.push(promise);
              
              // Small delay between transaction submissions to ensure nonce ordering
              if (i < queue.length - 1) {
                await delay(50);
              }
            }
            
            // Wait for all transactions to complete
            await Promise.all(promises);
          } catch (error) {
            console.error("❌ Failed to get nonce for batch mode:", error);
            // Fallback to sequential mode
            for (const id of queue) {
              await runOne(id);
              await delay(100);
            }
          }
        }
        
        console.log("🔴 Auto-reset batch completed, setting running to false");
        setRunning(false);
        console.log("🔴 Running state after auto-reset completion:", false);
        return;
      }
      
      console.log("🔴 No tiles to process, setting running to false");
      setRunning(false);
      return;
    }
    
    const queue = activeTiles.map(t => t.id);
    console.log(`🚀 Processing ${queue.length} tiles (max: ${burstSize}) - gas status: ${gasEstimationStatus}`);
    
    if (isSequential) {
      // Sequential mode - one transaction at a time
      console.log("🔄 Running in sequential mode");
      for (const id of queue) {
        await runOne(id);
        await delay(100); // Small delay between sequential transactions
      }
    } else {
      // Batch mode - get current nonce and manage it explicitly for each transaction
      console.log("🚀 Running in batch mode with explicit nonce management");
      
      try {
        // Get current nonce from the network
        let currentNonce: number;
        
        if (publicClient && userAddress) {
          currentNonce = await publicClient.getTransactionCount({ address: userAddress });
          console.log("📊 Current nonce from network:", currentNonce, "for address:", userAddress);
        } else {
          console.warn("⚠️ Cannot get nonce, using sequential submission instead");
          // Fallback to sequential submission
          for (const id of queue) {
            runOne(id);
            await delay(150); // Longer delay for safety
          }
          setRunning(false);
          return;
        }
        
        // Submit transactions with explicit incremental nonces
        const promises: Promise<void>[] = [];
        
        for (let i = 0; i < queue.length; i++) {
          const id = queue[i];
          const explicitNonce = currentNonce + i;
          
          console.log(`📤 Starting transaction ${i + 1}/${queue.length} for tile ${id} with nonce ${explicitNonce}`);
          
          // Start the transaction and collect promise
          const promise = runOne(id, explicitNonce).catch(error => {
            console.error(`Transaction failed for tile ${id} with nonce ${explicitNonce}:`, error);
          });
          promises.push(promise);
          
          // Small delay between transaction submissions to ensure nonce ordering
          if (i < queue.length - 1) {
            await delay(50);
          }
        }
        
        // Wait for all transactions to complete
        await Promise.all(promises);
      } catch (error) {
        console.error("❌ Failed to get nonce for batch mode:", error);
        // Fallback to sequential mode
        for (const id of queue) {
          await runOne(id);
          await delay(100);
        }
      }
    }
    
    console.log("🔴 Batch completed, setting running to false");
    setRunning(false);
    console.log("🔴 Running state after completion:", false);
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
    console.log("🔄 Resetting all tiles to idle state");
    setTiles((prev) => prev.map((t) => ({ ...t, status: { phase: "idle" } })));
    setRunning(false); // Ensure running state is reset
    console.log("✅ Reset complete");
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
            <div className="px-4 py-2 rounded-xl bg-white/10 border border-neutral-700 flex items-center gap-2">
              <span>Gas:</span>
              {!userAddress && <span className="text-orange-500" title="Connect wallet to estimate gas">🔌</span>}
              {userAddress && gasEstimationStatus === 'estimating' && <span className="animate-pulse text-yellow-500">🔄</span>}
              {userAddress && gasEstimationStatus === 'ready' && <span className="text-green-500">✅</span>}
              {userAddress && gasEstimationStatus === 'error' && <span className="text-red-500">❌</span>}
              {userAddress && gasEstimationStatus === 'idle' && <span className="text-gray-500">⏸️</span>}
              <span className="text-xs">
                {cachedGasEstimate ? 
                  `${Number(cachedGasEstimate.gas).toLocaleString()} (${formatEther(cachedGasEstimate.gasPrice * 1000000000n).slice(0,8)} gwei)` 
                  : userAddress ? "—" : "Connect wallet"
                }
              </span>
            </div>
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

  // Animated digit 0..9 while in sending state only
  const [animDigit, setAnimDigit] = useState<number>(Math.floor(Math.random() * 10));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const activePhases = ["preparing", "getting-gas", "estimating-gas", "building-tx", "waiting-approval", "submitting"];
    if (activePhases.includes(phase)) {
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

  const rolled = phase === "mined" ? st.rolled : phase === "sent" ? "📡" : animDigit.toString();
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
              : phase === "preparing"
              ? "bg-yellow-700"
              : phase === "getting-gas"
              ? "bg-yellow-600"
              : phase === "estimating-gas"
              ? "bg-yellow-500"
              : phase === "building-tx"
              ? "bg-orange-600"
              : phase === "waiting-approval"
              ? "bg-amber-600 animate-pulse"
              : phase === "submitting"
              ? "bg-blue-700 animate-pulse"
              : phase === "sent"
              ? "bg-blue-600 animate-pulse"
              : phase === "mined"
              ? win
                ? "bg-emerald-700"
                : "bg-rose-700"
              : "bg-rose-700")
          }
        >
          {phase === "getting-gas" ? "gas" 
           : phase === "estimating-gas" ? "estimate"
           : phase === "building-tx" ? "building"
           : phase === "waiting-approval" ? "approval"
           : phase === "submitting" ? "submit"
           : phase}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-lg bg-neutral-800 grid place-items-center text-2xl font-semibold ${
          phase === "sent" ? 'animate-pulse bg-blue-800' : 
          isWaitingForRealResult ? 'animate-pulse bg-yellow-800' : ''
        }`}>
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
      
      {/* Explorer button for transactions with txHash (shows as soon as transaction is sent) */}
      {"txHash" in st && st.txHash && st.txHash !== "unknown" && (phase === "sent" || phase === "mined" || phase === "failed") && (
        <div className="pt-2 border-t border-neutral-800">
          <a
            href={`https://testnet.explorer.intuition.systems/tx/${st.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded text-blue-300 transition-colors w-full justify-center"
            title={`View transaction ${st.txHash} in block explorer`}
          >
            🔍 Explorer
          </a>
        </div>
      )}
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
