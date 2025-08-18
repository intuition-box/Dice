"use client";

import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldContract } from "~~/hooks/scaffold-eth";

const ContractInfo: NextPage = () => {
  const [animatedBalance, setAnimatedBalance] = useState(0);
  const [animatedTxCount, setAnimatedTxCount] = useState(0);
  const [actualBalance, setActualBalance] = useState(0n);
  const [actualTxCount, setActualTxCount] = useState(0);

  const publicClient = usePublicClient();
  
  // Get contract info
  const { data: diceGameContract } = useScaffoldContract({ 
    contractName: "DiceGame" 
  });

  // Get contract nonce (transaction count)
  const { data: nonce } = useScaffoldReadContract({
    contractName: "DiceGame",
    functionName: "nonce",
  });

  // Fetch contract balance via RPC
  useEffect(() => {
    if (!publicClient || !diceGameContract?.address) return;

    const fetchBalance = async () => {
      try {
        const balance = await publicClient.getBalance({ 
          address: diceGameContract.address 
        });
        setActualBalance(balance);
      } catch (error) {
        console.error("Error fetching balance:", error);
      }
    };

    // Initial fetch
    fetchBalance();

    // Poll every 2 seconds for real-time updates
    const interval = setInterval(fetchBalance, 2000);
    return () => clearInterval(interval);
  }, [publicClient, diceGameContract?.address]);

  // Update transaction count when nonce changes
  useEffect(() => {
    if (nonce !== undefined) {
      setActualTxCount(Number(nonce));
    }
  }, [nonce]);

  // Animate balance changes
  useEffect(() => {
    if (actualBalance !== undefined) {
      const targetBalance = Number(formatEther(actualBalance));
      const startBalance = animatedBalance;
      const diff = targetBalance - startBalance;
      
      if (Math.abs(diff) > 0.001) { // Only animate if difference is significant
        const steps = 5; // Faster animation
        const stepSize = diff / steps;
        let currentStep = 0;
        
        const interval = setInterval(() => {
          currentStep++;
          if (currentStep >= steps) {
            setAnimatedBalance(targetBalance);
            clearInterval(interval);
          } else {
            setAnimatedBalance(startBalance + stepSize * currentStep);
          }
        }, 20); // Much faster intervals
        
        return () => clearInterval(interval);
      } else {
        setAnimatedBalance(targetBalance);
      }
    }
  }, [actualBalance]);

  // Animate transaction count changes
  useEffect(() => {
    if (actualTxCount !== animatedTxCount) {
      const diff = actualTxCount - animatedTxCount;
      const steps = Math.min(5, Math.abs(diff)); // Faster steps
      const stepSize = diff / steps;
      let currentStep = 0;
      
      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setAnimatedTxCount(actualTxCount);
          clearInterval(interval);
        } else {
          setAnimatedTxCount(Math.round(animatedTxCount + stepSize * currentStep));
        }
      }, 25); // Much faster intervals
      
      return () => clearInterval(interval);
    }
  }, [actualTxCount, animatedTxCount]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Animated background particles (simplified version) */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(1200px 600px at 50% -10%, rgba(139, 92, 246, 0.15), transparent), radial-gradient(800px 400px at 60% 110%, rgba(236, 72, 153, 0.12), transparent)",
          }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
            Contract Info
          </h1>
          <p className="text-xl text-purple-200/80">
            Real-time DiceGame contract statistics
          </p>
        </div>

        {/* Contract Address */}
        <div className="bg-black/40 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4 text-purple-300">Contract Address</h2>
          <Address address={diceGameContract?.address} size="xl" />
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contract Balance */}
          <div className="bg-black/40 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-8 text-center relative overflow-hidden">
            {/* Animated background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 animate-pulse rounded-3xl" />
            
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-6 text-emerald-400">Contract Balance</h2>
              
              {/* Big animated number */}
              <div className="mb-4">
                <span className="text-8xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent block leading-none">
                  {animatedBalance.toFixed(4)}
                </span>
                <span className="text-2xl text-purple-200/80 mt-2 block">TTRUST</span>
              </div>
              
              {/* Sparkle effect */}
              <div className="flex justify-center space-x-2 text-2xl">
                <span className="animate-bounce delay-0">✨</span>
                <span className="animate-bounce delay-100">💎</span>
                <span className="animate-bounce delay-200">✨</span>
              </div>
            </div>
          </div>

          {/* Transaction Count */}
          <div className="bg-black/40 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-8 text-center relative overflow-hidden">
            {/* Animated background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 animate-pulse rounded-3xl" />
            
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-6 text-purple-400">Total Transactions</h2>
              
              {/* Big animated number */}
              <div className="mb-4">
                <span className="text-8xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent block leading-none">
                  {animatedTxCount.toLocaleString()}
                </span>
                <span className="text-2xl text-purple-200/80 mt-2 block">dice rolls</span>
              </div>
              
              {/* Dice animation */}
              <div className="flex justify-center space-x-2 text-2xl">
                <span className="animate-bounce delay-0">🎲</span>
                <span className="animate-bounce delay-150">🎮</span>
                <span className="animate-bounce delay-300">🎲</span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 text-center">
            <h3 className="text-lg font-bold text-purple-300 mb-2">Avg per Roll</h3>
            <p className="text-2xl font-bold text-white">
              {actualTxCount > 0 ? (animatedBalance / actualTxCount).toFixed(6) : "0.000000"}
            </p>
            <p className="text-sm text-purple-200/60">TTRUST</p>
          </div>
          
          <div className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 text-center">
            <h3 className="text-lg font-bold text-purple-300 mb-2">Win Rate</h3>
            <p className="text-2xl font-bold text-yellow-400">16.67%</p>
            <p className="text-sm text-purple-200/60">1 in 6 chance</p>
          </div>
          
          <div className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 text-center">
            <h3 className="text-lg font-bold text-purple-300 mb-2">Payout Ratio</h3>
            <p className="text-2xl font-bold text-emerald-400">6:1</p>
            <p className="text-sm text-purple-200/60">6x multiplier</p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-sm border border-green-500/30 rounded-full px-6 py-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-400 font-medium">Live updates every 2 seconds</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractInfo;
