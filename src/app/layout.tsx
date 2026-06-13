import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DatabaseProvider } from "@/context/database-context";
import { ThemeProvider } from "@/context/theme-context";
import { AuthProvider } from "@/context/auth-context";
import PWARegister from "@/components/pwa-register";
import BrowserProtocolGuard from "@/components/browser-protocol-guard";
import { CompanyThemeSync } from "@/components/company-theme-sync";

const companyHeadBootScript = `
(function () {
  try {
    var raw = window.localStorage && window.localStorage.getItem('printflow_company');
    var company = raw ? JSON.parse(raw) : null;
    var host = window.location.hostname.replace(/^www\\./, '').toLowerCase();
    var hostParts = host.split('.').filter(Boolean);
    var hostBrand = '';

    if (hostParts.length >= 2 && (hostParts[0] === 'admin' || hostParts[0] === 'store')) {
      hostBrand = hostParts[1].replace(/-/g, ' ').toUpperCase();
    }

    var companyName = company && typeof company.name === 'string' && company.name.trim()
      ? company.name.trim()
      : hostBrand;
    var suffix = window.location.pathname === '/store' || hostParts[0] === 'store'
      ? 'Catálogo Online'
      : 'ERP';

    if (companyName) {
      document.title = companyName + ' - ' + suffix;
    }

    var favicon = company && typeof company.favicon === 'string' ? company.favicon.trim() : '';
    if (!favicon) return;

    var lower = favicon.toLowerCase();
    var supported = !lower.endsWith('.cdr') && (
      lower.indexOf('http') === 0 ||
      lower.indexOf('data:image/') === 0 ||
      /\\.(png|ico|svg|jpg|jpeg|webp)(\\?|#|$)/.test(lower)
    );

    if (!supported) return;

    var absoluteFavicon = new URL(favicon, window.location.href).href;
    var links = document.querySelectorAll("link[rel*='icon']");

    if (!links.length) {
      var link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      links = [link];
    }

    Array.prototype.forEach.call(links, function (link) {
      if (link.href !== absoluteFavicon) link.href = absoluteFavicon;
    });
  } catch (error) {
    // Keep the default metadata if browser storage is unavailable.
  }
})();
`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: companyHeadBootScript }} />
      </head>
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
