import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DatabaseProvider } from "@/context/database-context";
import { ThemeProvider } from "@/context/theme-context";
import { AuthProvider } from "@/context/auth-context";
import PWARegister from "@/components/pwa-register";
import BrowserProtocolGuard from "@/components/browser-protocol-guard";

export const metadata: Metadata = {
  title: "PrintFlowPRO - ERP SaaS para Gráficas e Comunicação Visual",
  description: "O ERP definitivo para controle de custos, precificação m², ordens de produção Kanban e gestão financeira de gráficas, brindes, sublimação e comunicação visual.",
  icons: {
    icon: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f19",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <PWARegister />
        <BrowserProtocolGuard />
        <ThemeProvider>
          <AuthProvider>
            <DatabaseProvider>
              {children}
            </DatabaseProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
