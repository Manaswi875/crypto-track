'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Zap, Info } from "lucide-react"

interface Event {
    id: string
    coinId: string
    changePct: number
    severity: string
    aiExplanation?: string
    timestamp: string
}

export function VolatilityFeed({ events }: { events: Event[] }) {
    return (
        <Card className="h-full bg-card/30 backdrop-blur-sm border-muted/20">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        Anomaly Feed
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] uppercase">Live</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {events.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground italic text-sm">
                        Watching for abnormal movements...
                    </div>
                ) : (
                    events.map((event) => (
                        <div key={event.id} className="p-3 rounded-lg bg-muted/20 border border-muted/50 space-y-2 group hover:bg-muted/30 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className={`h-4 w-4 ${event.severity === 'high' ? 'text-red-500' : 'text-yellow-500'}`} />
                                    <span className="font-bold text-sm uppercase">{event.coinId}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className="text-sm font-medium">
                                Detected {event.changePct.toFixed(2)}% deviation
                            </div>
                            {event.aiExplanation && (
                                <div className="text-xs text-muted-foreground bg-primary/5 p-2 rounded border border-primary/10 flex gap-2">
                                    <Info className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                    <p>{event.aiExplanation}</p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    )
}
