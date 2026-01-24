'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Bell, BellRing } from "lucide-react"
import { registerServiceWorker, subscribeToNotifications } from "@/lib/push"

export function NotificationBell() {
    const [isSubscribed, setIsSubscribed] = useState(false)

    const handleSubscribe = async () => {
        const reg = await registerServiceWorker()
        if (reg) {
            await subscribeToNotifications(reg)
            setIsSubscribed(true)
        }
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleSubscribe}
            className={isSubscribed ? "text-primary" : "text-muted-foreground"}
        >
            {isSubscribed ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </Button>
    )
}
