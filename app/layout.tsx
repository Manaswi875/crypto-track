import { SocketProvider } from '@/context/SocketContext'
import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

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
      <body className={`${inter.className} bg-background text-foreground`}>
        <SocketProvider>
          <div className="min-h-screen flex flex-col">
            <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
              <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <a href="/" className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-primary-foreground">
                    CP
                  </div>
                  <h1 className="text-xl font-bold tracking-tight">Crypto<span className="text-primary">Pulse</span></h1>
                </a>
                <nav className="hidden md:flex items-center gap-6">
                  <a href="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">My Portfolio</a>
                  <a href="/sell-check" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Before you sell</a>
                  <a href="/markets" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Markets</a>
                </nav>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-secondary rounded-full text-xs font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Live
                  </div>
                </div>
              </div>
            </header>
            <main className="flex-1 container mx-auto px-4 py-8">
              {children}
            </main>
          </div>
        </SocketProvider>
      </body>
    </html>
  )
}
