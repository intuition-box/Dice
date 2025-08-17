"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseEther, formatEther, decodeEventLog } from "viem";
import { useScaffoldWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useWatchBalance } from "~~/hooks/scaffold-eth/useWatchBalance";
import { toast } from "react-hot-toast";
import { usePublicClient, useAccount } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";

// Intuition Stress‑Grid — Version "Dice‑Only Minimal"
// - Removes header and network/burner config
// - Keeps only: Number of dice (transactions) & Parallelism (burst)
// - Buttons: Launch / Reset / Auto (restart every 5s)
// - Dice animation: digit 0–9 oscillating; winners = 1..5

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
  const [count, setCount] = useState<number>(10); // number of dice (transactions)
  const [tiles, setTiles] = useState<Tile[]>(() => Array.from({ length: 100 }, (_, i) => ({ id: i, status: { phase: "idle" } })));
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(false);
  const [nextRunIn, setNextRunIn] = useState<number | null>(null);
  const [hideNotifications, setHideNotifications] = useState(true); // off by default
  
  // Dashboard metrics
  const [totalPlays, setTotalPlays] = useState(0);
  const [totalBets, setTotalBets] = useState(0n);
  const [totalWinnings, setTotalWinnings] = useState(0n);
  const [balance, setBalance] = useState(0n);
  
  // Animation states for addictive effects
  const [animatedBalance, setAnimatedBalance] = useState(0n);
  const [animatedWalletBalance, setAnimatedWalletBalance] = useState(0);
  const [flyingCoins, setFlyingCoins] = useState<Array<{id: string, fromTile: number, amount: bigint, isWin: boolean}>>([]);
  const [balanceAnimation, setBalanceAnimation] = useState<'idle' | 'gaining' | 'losing'>('idle');
  const [recentGain, setRecentGain] = useState<{amount: bigint, isWin: boolean} | null>(null);
  const [winStreak, setWinStreak] = useState(0);
  const [totalWins, setTotalWins] = useState(0);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  
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
  
  // Get user's actual wallet balance (same as navbar)
  const { data: walletBalance } = useWatchBalance({
    address: userAddress,
  });
  
  // Update animated wallet balance when actual balance changes
  useEffect(() => {
    if (walletBalance?.value) {
      const targetBalance = Number(formatEther(walletBalance.value));
      
      // Animate from current to target
      const startBalance = animatedWalletBalance;
      const diff = targetBalance - startBalance;
      const steps = 8;
      const stepSize = diff / steps;
      
      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setAnimatedWalletBalance(targetBalance);
          clearInterval(interval);
        } else {
          setAnimatedWalletBalance(startBalance + stepSize * currentStep);
        }
      }, 25);
      
      return () => clearInterval(interval);
    }
  }, [walletBalance?.value]);
  
  // Initialize animated wallet balance
  useEffect(() => {
    if (walletBalance?.value && animatedWalletBalance === 0) {
      setAnimatedWalletBalance(Number(formatEther(walletBalance.value)));
    }
  }, [walletBalance?.value, animatedWalletBalance]);

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

  // Animated balance counting effect - MUCH faster
  useEffect(() => {
    if (animatedBalance !== balance) {
      const diff = balance - animatedBalance;
      const steps = 8; // Reduced from 20 to 8
      const stepSize = diff / BigInt(steps);
      
      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setAnimatedBalance(balance);
          clearInterval(interval);
        } else {
          setAnimatedBalance(prev => prev + stepSize);
        }
      }, 25); // Reduced from 50ms to 25ms
      
      return () => clearInterval(interval);
    }
  }, [balance, animatedBalance]);

  // Clear recent gain after animation
  useEffect(() => {
    if (recentGain) {
      const timer = setTimeout(() => setRecentGain(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [recentGain]);

  // Trigger flying coin animation
  const triggerFlyingCoin = (tileId: number, amount: bigint, isWin: boolean) => {
    const coinId = `coin-${Date.now()}-${tileId}`;
    setFlyingCoins(prev => [...prev, { id: coinId, fromTile: tileId, amount, isWin }]);
    
    // Remove flying coin after animation
    setTimeout(() => {
      setFlyingCoins(prev => prev.filter(coin => coin.id !== coinId));
    }, 1500);
  };

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
          
          // Update dashboard metrics with addictive animations
          setTotalPlays(prev => prev + 1);
          setTotalBets(prev => prev + parseEther(ROLL_ETH_VALUE));
          
          if (win) {
            const winAmount = parseEther("0.004"); // 2x the bet
            const netGain = winAmount - parseEther(ROLL_ETH_VALUE);
            
            setTotalWinnings(prev => prev + winAmount);
            setTotalWins(prev => prev + 1);
            setBalance(prev => prev + netGain);
            
            // Update win streak
            setWinStreak(prev => {
              const newStreak = prev + 1;
              if (newStreak >= 3) {
                setShowStreakCelebration(true);
                setTimeout(() => setShowStreakCelebration(false), 3000);
              }
              return newStreak;
            });
            
            // Trigger addictive win animations
            triggerFlyingCoin(id, netGain, true);
            setBalanceAnimation('gaining');
            setRecentGain({ amount: netGain, isWin: true });
            
            setTimeout(() => setBalanceAnimation('idle'), 1000);
          } else {
            const loss = parseEther(ROLL_ETH_VALUE);
            setBalance(prev => prev - loss);
            
            // Reset win streak on loss
            setWinStreak(0);
            
            // Trigger loss animation (less dramatic)
            triggerFlyingCoin(id, loss, false);
            setBalanceAnimation('losing');
            setRecentGain({ amount: loss, isWin: false });
            
            setTimeout(() => setBalanceAnimation('idle'), 800);
          }
          
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

    // Only process idle tiles up to count
    const activeTiles = tiles.filter(t => t.status.phase === "idle").slice(0, count);
    console.log("🔴 Found", activeTiles.length, "idle tiles out of", tiles.length, "total");
    
    if (activeTiles.length === 0) {
      console.log("🔴 No idle tiles found");
      
      // Check if all tiles are mined - if so, auto-reset them
      const allMined = tiles.every(t => t.status.phase === "mined");
      if (allMined && tiles.length > 0) {
        console.log("🔄 All tiles are mined, auto-resetting to idle for new batch");
        setTiles((prev) => prev.map((t) => ({ ...t, status: { phase: "idle" } })));
        
        // Now get the reset tiles for processing
        const resetTiles = Array.from({ length: Math.min(count, tiles.length) }, (_, i) => ({ id: i }));
        const queue = resetTiles.map(t => t.id);
        console.log(`🚀 Processing ${queue.length} reset tiles (max: ${count})`);
        
        // Continue with batch processing logic...
        {
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
    console.log(`🚀 Processing ${queue.length} tiles (max: ${count}) - gas status: ${gasEstimationStatus}`);
    
    {
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

  // Auto mode: rerun every 2s after a run completes
  useEffect(() => {
    if (!auto) {
      setNextRunIn(null);
      return;
    }
    if (running) return; // wait finish

    let seconds = 2;
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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, rgba(236, 72, 153, 0.1) 0%, transparent 50%)`
        }}></div>
      </div>
      
      <div className="relative max-w-6xl mx-auto p-4 space-y-4">
        {/* Flying Coins Animation */}
        {flyingCoins.map((coin) => (
          <FlyingCoin key={coin.id} coin={coin} />
        ))}
        
        {/* Streak Celebration */}
        {showStreakCelebration && (
          <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            <div className="text-6xl font-bold text-yellow-300 animate-bounce flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">I</div>
              <span>{winStreak} Wins</span>
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">I</div>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent mb-2">
            Intuition Dice
          </h1>
          <p className="text-sm text-purple-200/80 font-light">
            Provably fair on-chain dice rolls with instant rewards
          </p>
        </div>

        {/* Dashboard */}
        <section className="bg-black/20 backdrop-blur-sm border border-purple-500/20 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Dashboard
          </h2>
          
          <div className="grid grid-cols-4 gap-4 h-32">
            {/* Balance - Super Addictive Version */}
            <div className={`text-center rounded-2xl p-4 border transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-center ${
              balanceAnimation === 'gaining' 
                ? 'bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border-emerald-400/70 shadow-lg shadow-emerald-500/40 scale-105' 
                : balanceAnimation === 'losing'
                ? 'bg-gradient-to-br from-rose-500/30 to-red-500/30 border-rose-400/70 shadow-lg shadow-rose-500/40'
                : 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20'
            }`}>
              {/* Sparkle effect for wins */}
              {balanceAnimation === 'gaining' && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-2 left-2 text-yellow-300 animate-ping">✨</div>
                  <div className="absolute top-4 right-3 text-yellow-300 animate-ping" style={{animationDelay: '0.2s'}}>⭐</div>
                  <div className="absolute bottom-3 left-4 text-yellow-300 animate-ping" style={{animationDelay: '0.4s'}}>💫</div>
                  <div className="absolute bottom-2 right-2 text-yellow-300 animate-ping" style={{animationDelay: '0.6s'}}>✨</div>
                </div>
              )}
              
              <div className={`text-3xl font-bold mb-1 transition-all duration-300 ${
                balanceAnimation === 'gaining' ? 'animate-bounce' : ''
              }`}>
                <span className={animatedBalance >= 0n ? "text-emerald-400" : "text-rose-400"}>
                  {animatedBalance >= 0n ? "+" : ""}{formatEther(animatedBalance)}
                </span>
              </div>
              
              {/* Recent gain/loss indicator - Fixed height */}
              <div className="h-8 flex items-center justify-center">
                {recentGain && (
                  <div className={`text-xl font-bold animate-bounce ${
                    recentGain.isWin ? 'text-emerald-300' : 'text-rose-300'
                  }`}>
                    {recentGain.isWin ? '+' : '-'}{formatEther(recentGain.amount)} TTRUST
                    {recentGain.isWin ? ' 🎉' : ' 💸'}
                  </div>
                )}
              </div>
              
              <div className="text-sm text-purple-200/70 font-medium">PNL (TTRUST)</div>
              
              {/* Multiplier hint for wins - Fixed height */}
              <div className="h-6 flex items-center justify-center">
                {balanceAnimation === 'gaining' && (
                  <div className="text-xs text-emerald-300 animate-pulse">
                    🚀 2x WIN! Keep rolling! 🚀
                  </div>
                )}
              </div>
            </div>
            
            {/* Total Plays */}
            <div className="text-center bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-2xl p-4 border border-blue-500/20">
              <div className="text-3xl font-bold mb-1 text-cyan-400">
                {totalPlays.toLocaleString()}
              </div>
              <div className="text-sm text-blue-200/70 font-medium">Total Plays</div>
            </div>
            
            {/* Total Bets */}
            <div className="text-center bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl p-4 border border-amber-500/20">
              <div className="text-3xl font-bold mb-1 text-amber-400">
                {formatEther(totalBets)}
              </div>
              <div className="text-sm text-amber-200/70 font-medium">Total Bets (TTRUST)</div>
            </div>
            
            {/* Wallet Balance */}
            <div className="text-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-2xl p-4 border border-indigo-500/20">
              <div className="text-3xl font-bold mb-1 text-indigo-400">
                {animatedWalletBalance.toFixed(4)}
              </div>
              <div className="text-sm text-indigo-200/70 font-medium">Wallet Balance (TTRUST)</div>
            </div>
          </div>
          
          {/* Controls integrated in dashboard */}
          <div className="mt-6 pt-6 border-t border-purple-500/20">
            <div className="flex items-center gap-6">
              {/* Compact Slider */}
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2 text-purple-200">
                  {count} dice {count === 1 ? 'roll' : 'rolls'}
                </label>
                <input
                  type="range"
                  min={1}
                  max={33}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full h-2 bg-gradient-to-r from-purple-800/50 to-pink-800/50 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${((count - 1) / 32) * 100}%, #374151 ${((count - 1) / 32) * 100}%, #374151 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-purple-300/50 mt-1">
                  <span>1</span>
                  <span>33</span>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  disabled={running}
                  onClick={runAll}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed font-bold text-white shadow-lg transform transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
                >
                  🚀 Launch
                </button>
                <button
                  onClick={() => setAuto(v => !v)}
                  className={`px-4 py-2 rounded-xl border font-medium transition-all duration-200 hover:scale-105 ${
                    auto 
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 border-indigo-400" 
                      : "bg-gradient-to-r from-slate-600/30 to-slate-700/30 border-slate-500/50 hover:from-slate-500/30 hover:to-slate-600/30"
                  }`}
                >
                  ⚡ Auto {auto && (nextRunIn != null ? `(${nextRunIn}s)` : "")}
                </button>
              </div>
            </div>
            
            {/* Status and Info */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-purple-100/90 font-medium">
                {running ? (
                  <span className="text-cyan-400">🎲 Rolling dice… {minedCount}/{count} completed</span>
                ) : auto ? (
                  <span className="text-indigo-400 animate-pulse">⚡ Auto mode: next batch in {nextRunIn ?? 2}s</span>
                ) : winStreak >= 5 ? (
                  <span className="text-yellow-300 animate-pulse">🚀 UNSTOPPABLE! You're on fire!</span>
                ) : winStreak >= 3 ? (
                  <span className="text-emerald-400">🔥 HOT STREAK! Keep it going!</span>
                ) : totalPlays > 0 && animatedBalance > 0n ? (
                  <span className="text-emerald-400">💰 Winning! Roll again for bigger gains!</span>
                ) : totalPlays > 0 && animatedBalance < 0n ? (
                  <span className="text-amber-400">💪 Your big win is coming - keep rolling!</span>
                ) : (
                  <span>✨ Ready to win big with {count} dice</span>
                )}
              </div>
              
              <div className="text-xs text-purple-200/60 flex items-center gap-4">
                <span>💰 Cost: {ROLL_ETH_VALUE} TTRUST per roll</span>
                <span>🏆 Prize: {prize ? formatEther(prize) : "0"} TTRUST</span>
              </div>
            </div>
          </div>
        </section>



        {/* Grid */}
        <section className="bg-black/20 backdrop-blur-sm border border-purple-500/20 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              🎲 Live Dice Rolls
            </h2>
            <div className="text-lg text-purple-200/80 font-medium">
              {minedCount}/{count} completed
            </div>
          </div>

          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))" }}
          >
            {tiles.slice(0, count).map((t) => (
              <TileCard key={t.id} tile={t} />
            ))}
          </div>
        </section>

        <footer className="text-center text-sm text-purple-300/50 pb-8 pt-4">
          <div className="max-w-2xl mx-auto space-y-2">
            <p>🎯 Winning numbers: 0-5 (hex) • 💰 Cost: 0.002 TTRUST per roll</p>
            <p>⚡ Batch mode with 50ms intervals • 🔄 Auto mode restarts every 2s</p>
            <p className="text-xs text-purple-400/40">Powered by Intuition Protocol • Provably Fair On-Chain</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FlyingCoin({ coin }: { coin: {id: string, fromTile: number, amount: bigint, isWin: boolean} }) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`fixed pointer-events-none z-50 transition-all duration-1500 ease-out ${
        coin.isWin ? 'text-emerald-400' : 'text-rose-400'
      }`}
      style={{
        left: `${20 + (coin.fromTile % 10) * 8}%`,
        top: '60%',
        transform: mounted ? 'translate(-50%, -800px) scale(0.5)' : 'translate(-50%, 0) scale(1)',
        opacity: mounted ? 0 : 1,
      }}
    >
      <div className={`text-4xl ${coin.isWin ? 'animate-spin' : 'animate-pulse'}`}>
        {coin.isWin ? '🪙' : '💸'}
      </div>
      <div className="text-xs font-bold text-center mt-1">
        {coin.isWin ? '+' : '-'}{formatEther(coin.amount)}
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
        "rounded-xl border p-2 transition-all duration-300 backdrop-blur-sm h-20 flex flex-col " +
        (phase === "mined" 
          ? (win 
            ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-400/50 shadow-lg shadow-emerald-500/20" 
            : "bg-gradient-to-br from-rose-500/20 to-red-500/20 border-rose-400/50 shadow-lg shadow-rose-500/20"
          ) 
          : "bg-black/30 border-purple-500/30 hover:border-purple-400/50 hover:bg-black/40"
        )
      }
    >
      <div className="flex items-center justify-end mb-1">
        <span
          className={
            "text-[9px] px-2 py-0.5 rounded-full font-semibold " +
            (phase === "idle"
              ? "bg-slate-700/50 text-slate-300"
              : phase === "queued"
              ? "bg-slate-600/50 text-slate-200"
              : phase === "preparing"
              ? "bg-yellow-500/30 text-yellow-200"
              : phase === "getting-gas"
              ? "bg-yellow-400/30 text-yellow-100"
              : phase === "estimating-gas"
              ? "bg-yellow-300/30 text-yellow-100"
              : phase === "building-tx"
              ? "bg-orange-500/30 text-orange-200"
              : phase === "waiting-approval"
              ? "bg-amber-500/30 text-amber-200 animate-pulse"
              : phase === "submitting"
              ? "bg-blue-500/30 text-blue-200 animate-pulse"
              : phase === "sent"
              ? "bg-cyan-500/30 text-cyan-200 animate-pulse"
              : phase === "mined"
              ? win
                ? "bg-emerald-500/30 text-emerald-200"
                : "bg-rose-500/30 text-rose-200"
              : "bg-rose-500/30 text-rose-200")
          }
        >
          {phase === "getting-gas" ? "gas" 
           : phase === "estimating-gas" ? "estimate"
           : phase === "building-tx" ? "building"
           : phase === "waiting-approval" ? "approval"
           : phase === "submitting" ? "submit"
           : phase === "mined" && "txHash" in st && st.txHash && st.txHash !== "unknown" ? (
             <a
               href={`https://testnet.explorer.intuition.systems/tx/${st.txHash}`}
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-1 hover:underline"
               title={`View transaction ${st.txHash} in block explorer`}
             >
               {"latencyMs" in st ? `${formatMs(st.latencyMs)} 🔍` : "mined 🔍"}
             </a>
           )
           : phase === "mined" && "latencyMs" in st ? `${formatMs(st.latencyMs)}`
           : phase}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className={`w-10 h-10 rounded-lg grid place-items-center text-xl font-bold transition-all duration-300 ${
          phase === "sent" ? 'animate-pulse bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-400/50' : 
          isWaitingForRealResult ? 'animate-pulse bg-gradient-to-br from-yellow-500/30 to-amber-500/30 border border-yellow-400/50' :
          phase === "mined" && win ? 'bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/50' :
          phase === "mined" && !win ? 'bg-gradient-to-br from-rose-500/30 to-red-500/30 border border-rose-400/50' :
          'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/30'
        }`}>
          {isWaitingForRealResult ? '✨' : rolled}
        </div>
        
        {/* Fixed height space for error info only */}
        <div className="h-4 flex items-center justify-center mt-1">
          {phase === "failed" && "error" in st && (
            <div className="text-rose-300 text-[10px]" title={st.error}>
              ❌ Error
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
