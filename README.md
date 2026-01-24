# Crypto Pulse 📈

Crypto Pulse is a production-quality, real-time cryptocurrency monitoring application. It features statistical anomaly detection, whale transaction tracking, and AI-driven insights to explain market volatility.

## 🚀 Features

- **Real-Time Data**: Live price streaming via WebSockets and Redis.
- **Statistical Anomaly Detection**: Uses rolling windows to detect abnormal volatility (based on standard deviation).
- **Whale Watcher**: Monitors large transactions and correlates them with price movements.
- **AI Insights**: Automatically generates explanations for price anomalies using LLMs (GPT-4).
- **Interactive Dashboards**: Clean, professional UI with real-time charts and movement feeds.
- **Alert System**: User-defined price and movement alerts with browser push notifications.

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts.
- **Backend**: Custom Node.js server (server.ts), Socket.io, Redis (caching & rolling stats).
- **Persistence**: PostgreSQL with Prisma ORM.
- **AI/External**: OpenAI GPT-4, CoinGecko API, Web Push API.
- **Infrastructure**: Docker & GitHub Actions (CI).

## 🏗 Architecture

Crypto Pulse follows a service-oriented architecture:

- **PriceTracker**: Fetches data and updates the reactive cache.
- **VolatilityDetector**: Runs statistical analysis on incoming streams.
- **WhaleWatcher**: Monitors on-chain activity.
- **AIAnalyzer**: Contextualizes events with natural language.
- **NotificationService**: Manages real-time and background alerts.

## 📦 Setup Instructions

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Configure Environment Variables**: Copy `.env.example` to `.env` and fill in your keys.
4. **Database Setup**:
   ```bash
   npx prisma db push
   npx prisma db seed # Once seed script is created
   ```
5. **Run Development Server**:
   ```bash
   npm run dev:server
   ```
6. **Docker Implementation**:
   ```bash
   docker-compose up --build
   ```

## 📜 License

MIT
