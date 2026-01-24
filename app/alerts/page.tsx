'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Bell, BellOff, Plus } from "lucide-react"

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<any[]>([])

    useEffect(() => {
        fetch('/api/alerts')
            .then(res => res.json())
            .then(data => setAlerts(Array.isArray(data) ? data : []))
    }, [])

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Price Alerts</h2>
                    <p className="text-muted-foreground">Manage your custom price notifications.</p>
                </div>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Alert
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Active Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Asset</TableHead>
                                <TableHead>Condition</TableHead>
                                <TableHead>Threshold</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {alerts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No alerts created yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                alerts.map((alert) => (
                                    <TableRow key={alert.id}>
                                        <TableCell className="font-medium uppercase">{alert.coinId}</TableCell>
                                        <TableCell className="capitalize">{alert.type.replace('_', ' ')}</TableCell>
                                        <TableCell>${alert.threshold.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={alert.active ? "default" : "secondary"}>
                                                {alert.active ? "Active" : "Paused"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon">
                                                {alert.active ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
