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
    <html lang="en" className="dark">
      <body className={`${manrope.className} min-h-screen bg-background text-foreground antialiased`}>
        <SocketProvider>
          <div className="relative min-h-screen flex flex-col overflow-x-hidden">
            <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_0%,rgba(124,58,237,0.10),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.06),transparent_24%)]" />
            <header className="sticky top-0 z-50 px-3 pt-3">
              <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border border-white/10 bg-background/75 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-5">
                <Suspense fallback={<div className="h-8 w-40" />}><ProfileBrand /></Suspense>
                <Suspense fallback={<nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation" />}>
                  <ProfileNav />
                </Suspense>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
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
