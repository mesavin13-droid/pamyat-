import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ПАМЯТЬ — уход за местами памяти',
  description: 'Уход за местом памяти, когда вы не можете приехать сами.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
