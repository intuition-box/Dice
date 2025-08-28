# 🎲 Intuition Testnet Speed Demo - Dice Game

![Dice Game Hero](https://raw.githubusercontent.com/scaffold-eth/se-2-challenges/challenge-dice-game/extension/packages/nextjs/public/hero.png)

## 🚀 Project Overview

This project showcases the **blazing fast speed of the Intuition testnet** through an interactive dice game that allows community members to perform a serious number of transactions in a short amount of time.

### 🎯 Main Goals

- **Demonstrate Intuition Testnet Speed**: Experience near-instant transaction confirmations
- **High-Volume Transaction Testing**: Enable users to quickly execute multiple transactions
- **Seamless User Experience**: Embedded burner wallet allows the browser to sign transactions without external wallet popups
- **Community Engagement**: Provide an easy and fun way for community members to test the network

### 🔥 Key Features

- **Embedded Burner Wallet**: No need for MetaMask or external wallets - transactions are signed directly in the browser
- **Instant Transactions**: Experience the speed of Intuition testnet with sub-second confirmations
- **Simple Dice Game Mechanics**: Roll the dice, win prizes, and see how fast transactions can be
- **Real-time Balance Updates**: Watch your balance change in real-time as transactions confirm instantly

---

## 🛠 Built with Scaffold-ETH 2

This project is built using [Scaffold-ETH 2](https://scaffoldeth.io), providing:

⚙️ **Tech Stack**: NextJS, RainbowKit, Hardhat, Wagmi, Viem, and Typescript
- ✅ **Contract Hot Reload**: Frontend auto-adapts to smart contract changes
- 🪝 **Custom Hooks**: React hooks for easy smart contract interactions
- 🧱 **Web3 Components**: Pre-built components for common blockchain interactions
- 🔥 **Burner Wallet**: Quick testing without external wallet setup

## 🚀 Quick Start

### Requirements

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

### Running the Project

1. **Start the local blockchain**:
```sh
yarn chain
```

2. **Deploy the contracts** (in a new terminal):
```sh
yarn deploy
```

3. **Start the frontend** (in a third terminal):
```sh
yarn start
```

4. **Open the app**: Visit http://localhost:3000

🎲 **Start Rolling!** The embedded burner wallet will automatically handle transaction signing - no external wallet needed!

---

## 🎮 How the Dice Game Works

The dice game demonstrates Intuition testnet's speed through a simple but engaging mechanism:

- **Roll Cost**: Each roll costs 0.002 ETH
- **Winning Numbers**: Roll 0, 1, 2, 3, 4, or 5 to win (6/7 chance!)
- **Prize Pool**: Win the current prize (starts at 10% of contract balance)
- **Instant Results**: See your transaction confirm and balance update in real-time

### 🎯 Perfect for Speed Testing

- **High Win Rate**: 6/7 chance means lots of successful transactions
- **Continuous Action**: Quick successive rolls to test transaction throughput
- **Real-time Feedback**: Watch the Intuition testnet handle rapid transactions

## 🔧 Technical Details

### Smart Contract Architecture

The project uses a simple but effective dice game contract (`DiceGame.sol`) that demonstrates:

- **Blockchain Randomness**: Uses block hash for random number generation
- **Economic Incentives**: 0.002 ETH per roll, with 40% going to prize pool
- **Immediate Payouts**: Winners receive prizes instantly

### Frontend Features

- **Embedded Burner Wallet**: Seamless transaction signing without external wallet prompts
- **Real-time Updates**: Live balance and transaction status updates
- **Responsive UI**: Clean, modern interface optimized for rapid interactions
- **Debug Tools**: Built-in contract interaction tools for developers

---

## 🚀 Deploying to Intuition Testnet

To deploy this project to the Intuition testnet:

1. **Configure Network**: Edit `packages/hardhat/hardhat.config.ts` to include Intuition testnet configuration
2. **Generate Deployer**: Run `yarn generate` to create a deployer account
3. **Fund Account**: Send testnet ETH to your deployer address
4. **Deploy Contracts**: Run `yarn deploy --network intuition`
5. **Update Frontend**: Configure `packages/nextjs/scaffold.config.ts` to point to Intuition testnet
6. **Deploy Frontend**: Use `yarn vercel` to deploy the frontend

### Production Configuration

For production deployment:
- Set `onlyLocalBurnerWallet: false` in `scaffold.config.ts` to enable burner wallets on all networks
- Configure API keys for Alchemy and block explorers
- Verify contracts on the appropriate block explorer

---

## 📚 Learn More

### About This Project
- **Purpose**: Showcase Intuition testnet's transaction speed and throughput capabilities
- **Target Audience**: Community members, developers, and blockchain enthusiasts
- **Use Cases**: Network stress testing, transaction speed demonstrations, community engagement

### About Scaffold-ETH 2
- **Documentation**: [docs.scaffoldeth.io](https://docs.scaffoldeth.io)
- **Website**: [scaffoldeth.io](https://scaffoldeth.io)
- **Community**: [Scaffold-ETH Developers Chat](https://t.me/joinchat/F7nCRK3kI93PoCOk)

### Contributing

Contributions are welcome! This project demonstrates how to build fast, user-friendly dApps on high-performance networks like Intuition testnet.

---

**Ready to experience blazing-fast blockchain transactions? Start rolling! 🎲⚡**