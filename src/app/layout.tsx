import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DatabaseProvider } from "@/context/database-context";
import { ThemeProvider } from "@/context/theme-context";
import { AuthProvider } from "@/context/auth-context";
import PWARegister from "@/components/pwa-register";
import BrowserProtocolGuard from "@/components/browser-protocol-guard";
import { CompanyThemeSync } from "@/components/company-theme-sync";

export const metadata: Metadata = {
  title: "PrintFlowPRO - ERP SaaS para Gráficas e Comunicação Visual",
  description: "O ERP definitivo para controle de custos, precificação m², ordens de produção Kanban e gestão financeira de gráficas, brindes, sublimação e comunicação visual.",
  icons: {
    icon: "/printflowpro-mark.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#5b3df4",
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
    <html lang="pt-BR" className="light" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {/* <PWARegister /> */}
        <BrowserProtocolGuard />
        <ThemeProvider>
          <AuthProvider>
            <DatabaseProvider>
              <CompanyThemeSync />
              {children}
            </DatabaseProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
