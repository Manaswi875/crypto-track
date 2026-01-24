'use client'

import { useEffect, useState } from 'react'
import { useSocket } from '@/context/SocketContext'
import { PriceCard } from '@/components/dashboard/PriceCard'
import { VolatilityFeed } from '@/components/dashboard/VolatilityFeed'
import { WhaleFeed } from '@/components/dashboard/WhaleFeed'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Dashboard() {
  const { socket, isConnected } = useSocket()
  const [prices, setPrices] = useState<Record<string, any>>({})
  const [volatilityEvents, setVolatilityEvents] = useState<any[]>([])
  const [whaleEvents, setWhaleEvents] = useState<any[]>([])

  useEffect(() => {
    if (!socket) return

    socket.emit('subscribe', 'all-prices')

    socket.on('price-update', (data) => {
      setPrices((prev) => ({
        ...prev,
        [data.coinId]: data
      }))
    })

    socket.on('whale-event', (data) => {
      setWhaleEvents((prev) => [data, ...prev].slice(0, 10))
    })

    socket.on('notification', (data) => {
      // In a real app, you'd show a toast or browser notification here
      if (data.data?.type === 'volatility') {
        setVolatilityEvents((prev) => [data.data, ...prev].slice(0, 10))
      }
    })

    return () => {
      socket.off('price-update')
      socket.off('whale-event')
      socket.off('notification')
    }
  }, [socket])

  const initialCoins = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple']

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Market Overview</h2>
          <p className="text-muted-foreground">Real-time monitoring across 5 major assets.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="text-muted-foreground uppercase tracking-widest">Status:</span>
          <span className={isConnected ? "text-green-500" : "text-red-500"}>
            {isConnected ? "CONNECTED" : "DISCONNECTED"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {initialCoins.map((coinId) => {
          const data = prices[coinId] || {
            coinId,
            symbol: coinId === 'bitcoin' ? 'btc' : coinId === 'ethereum' ? 'eth' : coinId.slice(0, 3),
            price: 0,
            change24h: 0,
            volume24h: 0
          }
          return <PriceCard key={coinId} {...data} />
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="bg-card/50 border-none shadow-xl min-h-[400px]">
            <Tabs defaultValue="chart" className="w-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <TabsList className="bg-background/50">
                  <TabsTrigger value="chart">Price Chart</TabsTrigger>
                  <TabsTrigger value="depth">Market Depth</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                  {['1H', '24H', '7D', '1M'].map((t) => (
                    <button key={t} className="text-[10px] px-2 py-1 rounded hover:bg-primary/10 transition-colors uppercase font-bold text-muted-foreground hover:text-primary">
                      {t}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <TabsContent value="chart" className="mt-0">
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted/20 rounded-xl">
                    [Chart Component Integration: Recharts]
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-8">
          <VolatilityFeed events={volatilityEvents} />
          <WhaleFeed events={whaleEvents} />
        </div>
      </div>
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={`rounded-xl border bg-card text-card-foreground shadow ${className}`}>{children}</div>
}

function CardHeader({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>{children}</div>
}

function CardContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={`p-6 pt-0 ${className}`}>{children}</div>
}
