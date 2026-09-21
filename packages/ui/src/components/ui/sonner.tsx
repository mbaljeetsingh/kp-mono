/**
 * Toaster.
 *
 * The upstream shadcn file reads the theme from `next-themes`; these are Vite
 * apps with no Next in them. Dark mode here follows a `.dark` class on <html>
 * — the same custom variant the token file defines — so read that instead.
 */
import { Toaster as Sonner, type ToasterProps } from "sonner"
import type * as React from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = document.documentElement.classList.contains("dark") ? "dark" : "light"

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
