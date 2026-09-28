import { SocketProvider } from '@/context/SocketContext'
import { AskDrawer } from '@/components/AskDrawer'
import { ProfileBrand, ProfileNav } from '@/components/ProfileNav'
import './globals.css'
import { Manrope } from 'next/font/google'
import { Suspense } from 'react'

const manrope = Manrope({ subsets: ['latin'] })

export const metadata = {
  title: 'Crypto Pulse',
  description: 'What a crypto crash means for your money and your goals',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${manrope.className} min-h-screen bg-background text-foreground antialiased`}>
        <SocketProvider>
          <div className="relative min-h-screen flex flex-col overflow-x-hidden">
            <div className="day-canvas pointer-events-none fixed inset-0 -z-10" />
            <header className="sticky top-0 z-50 px-3 pt-3">
              <div className="day-nav mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border px-3 backdrop-blur-xl sm:px-5">
                <Suspense fallback={<div className="h-8 w-40" />}><ProfileBrand /></Suspense>
                <Suspense fallback={<nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation" />}>
                  <ProfileNav />
                </Suspense>
                <div className="flex items-center gap-4">
                  <div className="agent-pill flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"></span>
                    <span className="hidden sm:inline">Agent monitoring</span><span className="sm:hidden">Live</span>
                  </div>
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
              {children}
            </main>
            <AskDrawer />
          </div>
        </SocketProvider>
      </body>
    </html>
  )
}
