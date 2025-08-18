"use client";

import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";

const Info: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(1200px 600px at 50% -10%, rgba(139, 92, 246, 0.15), transparent), radial-gradient(800px 400px at 60% 110%, rgba(236, 72, 153, 0.12), transparent)",
          }}
        />
        
        {/* Floating particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full opacity-20"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                animation: `float-base ${15 + Math.random() * 10}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto p-8 space-y-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-6">
            3,3 Dice
          </h1>
          <p className="text-2xl text-purple-200/80 mb-4">
            Fair dice game on blockchain
          </p>
          <div className="flex justify-center items-center space-x-2 flex-col">
            <p className="text-purple-300/70 mb-2">Your connected address:</p>
            <Address address={connectedAddress} size="lg" />
          </div>
        </div>

        {/* Game explanation */}
        <div className="bg-black/40 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-10 space-y-8">
          <h2 className="text-4xl font-bold text-center bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent mb-8">
            How does it work?
          </h2>
          
          <div className="space-y-6 text-lg text-purple-100/90">
            <div className="flex items-start gap-4">
              <span className="text-3xl">🎲</span>
              <div>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">Game Rules</h3>
                <p>Each roll costs <span className="font-bold text-yellow-300">0.002 TTRUST</span>. The dice shows a number between 1 and 6. Only <span className="font-bold text-emerald-400">number 3</span> is a winner!</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">💰</span>
              <div>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">Fair Rewards</h3>
                <p>If you roll a 3, you win <span className="font-bold text-yellow-300">6x your bet</span> (0.012 TTRUST). Probability: 1/6 = 16.67%. Mathematically, <span className="font-bold text-emerald-400">the house takes nothing</span>!</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">⚖️</span>
              <div>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">100% Fair</h3>
                <p>Unlike traditional casinos, there is <span className="font-bold text-red-400">no house edge</span>. The expected return is exactly equal to your bet (6 × 1/6 = 1). It's pure chance!</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">🚀</span>
              <div>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">Testnet Celebration</h3>
                <p>This little game was <span className="font-bold text-purple-300">vibe coded for fun</span> to celebrate the launch of Intuition testnet and Test it!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Guide */}
        <div className="bg-black/40 backdrop-blur-sm border border-yellow-500/30 rounded-3xl p-10">
          <h2 className="text-3xl font-bold text-center bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent mb-8">
            💡 Quick Start Guide
          </h2>
          
          <div className="space-y-6 text-lg text-purple-100/90">
            <div className="flex items-start gap-4">
              <span className="text-3xl">🔗</span>
              <div>
                <h3 className="text-xl font-bold text-yellow-400 mb-2">Wallet Connection Options</h3>
                <p>If you connect your wallet directly, you would need to approve each transaction manually. This can be tedious for multiple dice rolls!</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">⚡</span>
              <div>
                <h3 className="text-xl font-bold text-yellow-400 mb-2">Recommended: Use Burner Wallet</h3>
                <p>We recommend you choose the <span className="font-bold text-emerald-400">burner wallet option</span> and send funds from another wallet to it. This allows for seamless, automated gameplay without manual approvals!</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-xl font-bold text-red-400 mb-2">Important: Save Your Private Key</h3>
                <p>Once done, <span className="font-bold text-red-300">don't forget to copy your private key</span>! This new wallet private key is only stored in the browser. If you reset the cache, it's lost forever.</p>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎯</span>
                <span className="font-bold text-yellow-300">Pro Tip:</span>
              </div>
              <p className="text-yellow-100/90">Start with a small amount (like 0.1 TTRUST) to test the game before sending more funds to your burner wallet!</p>
            </div>
          </div>
        </div>

        {/* Technical details */}
        <div className="bg-black/40 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-10">
          <h2 className="text-3xl font-bold text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-8">
            Technology & Transparency
          </h2>
          
          <div className="space-y-6 text-lg text-purple-100/90">
            <div className="flex items-start gap-4">
              <span className="text-3xl">🔗</span>
              <div>
                <h3 className="text-xl font-bold text-blue-400 mb-2">Blockchain</h3>
                <p>All dice rolls are executed on-chain on the Intuition testnet. Every result is <span className="font-bold text-emerald-400">verifiable</span> and <span className="font-bold text-emerald-400">immutable</span>.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">🔓</span>
              <div>
                <h3 className="text-xl font-bold text-blue-400 mb-2">Open Source</h3>
                <p>The complete source code is <span className="font-bold text-emerald-400">free and open</span> on GitHub:</p>
                <a 
                  href="https://github.com/intuition-box/33" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-block mt-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full hover:from-purple-400 hover:to-pink-400 transition-all duration-200 font-medium"
                >
                  github.com/intuition-box/33
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-3xl">🤝</span>
              <div>
                <h3 className="text-xl font-bold text-blue-400 mb-2">Contributions Welcome</h3>
                <p><span className="font-bold text-yellow-300">Pull requests are welcome</span>! Whether it's for:</p>
                <ul className="list-disc list-inside mt-2 ml-4 space-y-1">
                  <li>Design improvements</li>
                  <li>New game ideas</li>
                  <li>Technical optimizations</li>
                  <li>Bug fixes</li>
                  <li>Anything else!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Fun stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">🎯</div>
            <h3 className="text-lg font-bold text-purple-300 mb-1">Probability</h3>
            <p className="text-2xl font-bold text-emerald-400">16.67%</p>
            <p className="text-sm text-purple-200/60">1 in 6 chance</p>
          </div>
          
          <div className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">💎</div>
            <h3 className="text-lg font-bold text-purple-300 mb-1">Multiplier</h3>
            <p className="text-2xl font-bold text-yellow-400">6x</p>
            <p className="text-sm text-purple-200/60">0.002 → 0.012 TTRUST</p>
          </div>
          
          <div className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">⚖️</div>
            <h3 className="text-lg font-bold text-purple-300 mb-1">House Edge</h3>
            <p className="text-2xl font-bold text-emerald-400">0%</p>
            <p className="text-sm text-purple-200/60">Fair game</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-8">
          <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-sm border border-purple-500/30 rounded-full px-8 py-4">
            <span className="text-2xl">🎉</span>
            <span className="text-purple-200 font-medium">Have fun on the Intuition testnet!</span>
            <span className="text-2xl">🚀</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info;
