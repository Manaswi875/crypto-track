'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"

interface PriceCardProps {
    coinId: string
    symbol: string
    price: number
    change24h: number
    volume24h: number
}

export function PriceCard({ coinId, symbol, price, change24h, volume24h }: PriceCardProps) {
    const isPositive = change24h >= 0

    return (
        <Card className="overflow-hidden border-none bg-gradient-to-br from-card to-card/50 shadow-lg hover:shadow-primary/5 transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-medium uppercase tracking-wider">{symbol}</CardTitle>
                </div>
                <Badge variant={isPositive ? "default" : "destructive"} className="font-mono">
                    {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {Math.abs(change24h).toFixed(2)}%
                </Badge>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold font-mono">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-tighter">
                        Vol: ${(volume24h / 1e6).toFixed(1)}M
                    </p>
                </div>
                {/* Simple mini-sparkline representation could go here */}
                <div className="mt-4 h-[2px] w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className={`h-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(change24h) * 10)}%` }}
                    />
                </div>
            </CardContent>
        </Card>
    )
}
