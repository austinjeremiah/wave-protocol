import type { ReactNode } from 'react'

export const metadata = {
  title: 'Wave Protocol',
  description: 'Multi-agent coordination on ERC-7710 delegation chains',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
